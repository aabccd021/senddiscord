import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

const Message = t.object({
  uuid: t.string(),
  content: t.string(),
  webhookUrl: t.string(),
  createdTime: t.bigint(),
  ratelimitBucket: t.string(),
});

const MessageNullable = t.nullable(Message);

type Message = t.Infer<typeof Message>;

function setRateLimit({
  db,
  message,
  webhookUrl,
  response,
}: {
  db: sqlite.Database;
  message: Message;
  webhookUrl: string;
  response: Response;
}): void {
  const headerRateLimitBucket = response.headers.get("X-RateLimit-Bucket");
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  const rateLimitResetTime = response.headers.get("X-RateLimit-Reset");
  if (
    headerRateLimitBucket === null ||
    rateLimitRemaining === null ||
    rateLimitResetTime === null
  ) {
    console.warn(
      `Anomaly: Missing rate limit headers: ${JSON.stringify({
        rateLimitBucket: headerRateLimitBucket,
        rateLimitRemaining,
        rateLimitResetTime,
      })}`,
    );
    return;
  }

  const resetTime = Number.parseInt(rateLimitResetTime, 10);
  const remaining = Number.parseInt(rateLimitRemaining, 10);

  if (message.ratelimitBucket === headerRateLimitBucket) {
    db.query(
      `
      UPDATE ratelimit
      SET 
        reset_time = $resetTime, 
        remaining = $remaining
      WHERE bucket = $bucket
      `,
    ).run({
      resetTime: resetTime,
      remaining: remaining,
      bucket: headerRateLimitBucket,
    });
    return;
  }

  db.query(
    `
    INSERT INTO ratelimit (bucket, reset_time, remaining)
    VALUES ($bucket, $resetTime, $remaining)
    ON CONFLICT(bucket) DO UPDATE SET 
    reset_time = $resetTime, 
      remaining = $remaining
    `,
  ).run({
    bucket: headerRateLimitBucket,
    resetTime: resetTime,
    remaining: remaining,
  });

  db.query(
    `
    UPDATE webhook
    SET ratelimit_bucket = $bucket
    WHERE url = $webhookUrl
    `,
  ).run({
    bucket: headerRateLimitBucket,
    webhookUrl: webhookUrl,
  });

  db.query(
    `
    DELETE FROM ratelimit
    WHERE bucket = $bucket
    AND NOT EXISTS (
      SELECT 1 FROM webhook WHERE ratelimit_bucket = $bucket
    )
    `,
  ).run({ bucket: message.ratelimitBucket });
}

async function processDequeue(
  db: sqlite.Database,
  message: Message,
): Promise<void> {
  const { uuid, webhookUrl, content } = message;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: content,
    }),
  });

  setRateLimit({ db, message, webhookUrl, response });

  db.query("DELETE FROM queue WHERE uuid = $uuid").run({ uuid: uuid });
}

export async function dequeue(db: sqlite.Database): Promise<void> {
  const selectQueue = db.query(`
    SELECT 
      queue.uuid,
      queue.webhook_url AS webhookUrl,
      queue.content,
      queue.created_time AS createdTime,
      ratelimit.bucket AS ratelimitBucket
    FROM queue
    JOIN webhook ON queue.webhook_url = webhook.url
    LEFT JOIN ratelimit ON webhook.ratelimit_bucket = ratelimit.bucket
    WHERE webhook.is_processing = 0
      AND (ratelimit.bucket IS NULL OR ratelimit.is_processing = 0)
  `);

  const updateWebhook = db.query(`
    UPDATE webhook
    SET is_processing = 1
    WHERE url = $webhookUrl
  `);

  const updateRatelimit = db.query(`
    UPDATE ratelimit
    SET is_processing = 1
    WHERE bucket = $bucket
  `);

  const transaction = db.transaction(() => {
    const message = selectQueue.get();
    t.assert(message, MessageNullable);
    if (message != null) {
      updateWebhook.run({ webhookUrl: message.webhookUrl });
      updateRatelimit.run({ bucket: message.ratelimitBucket });
    }
    return message;
  });

  const message = transaction();

  if (message === null) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return;
  }

  try {
    await processDequeue(db, message);
  } finally {
    db.query(
      "UPDATE webhook SET is_processing = 0 WHERE url = $webhookUrl",
    ).run({
      webhookUrl: message.webhookUrl,
    });
    db.query(
      "UPDATE ratelimit SET is_processing = 0 WHERE bucket = $bucket",
    ).run({
      bucket: message.ratelimitBucket,
    });
  }
}
