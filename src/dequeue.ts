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
  const rateLimitBucket = response.headers.get("X-RateLimit-Bucket");
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  const rateLimitResetTime = response.headers.get("X-RateLimit-Reset");
  if (
    rateLimitBucket === null ||
    rateLimitRemaining === null ||
    rateLimitResetTime === null
  ) {
    console.error(
      `Anomaly: Missing rate limit headers: ${JSON.stringify({
        rateLimitBucket,
        rateLimitRemaining,
        rateLimitResetTime,
      })}`,
    );
    return;
  }

  const resetTime = Number.parseInt(rateLimitResetTime, 10);
  const remaining = Number.parseInt(rateLimitRemaining, 10);

  if (message.ratelimitBucket === rateLimitBucket) {
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
      bucket: rateLimitBucket,
    });
  } else {
    db.query(
      `
      INSERT INTO ratelimit (bucket, reset_time, remaining)
      VALUES ($bucket, $resetTime, $remaining)
      `,
    ).run({
      bucket: rateLimitBucket,
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
      bucket: rateLimitBucket,
      webhookUrl: webhookUrl,
    });
  }
}

async function processDequeue(
  db: sqlite.Database,
  message: Message,
): Promise<void> {
  console.log(`Dequeuing message with UUID: ${message.uuid}`);
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
    console.log("Message not found, sleeping for 1 second...");
    console.log(db.query("SELECT * FROM queue").all());
    console.log(db.query("SELECT * FROM webhook").all());
    console.log(db.query("SELECT * FROM ratelimit").all());
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return;
  }

  try {
    await processDequeue(db, message);
  } finally {
    console.log({
      webhookUrl: message.webhookUrl,
      ratelimitBucket: message.ratelimitBucket,
    });
    db.query(
      "UPDATE webhook SET is_processing = 0 WHERE url = $webhookUrl",
    ).run({
      webhookUrl: message.webhookUrl,
    });
    console.log(db.query("SELECT * FROM webhook").all());
    db.query(
      "UPDATE ratelimit SET is_processing = 0 WHERE bucket = $bucket",
    ).run({
      bucket: message.ratelimitBucket,
    });
    console.log(db.query("SELECT * FROM webhook").all());
    console.log(
      `Finally finished processing message with UUID: ${message.uuid}`,
    );
  }
}
