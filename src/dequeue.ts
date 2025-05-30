import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

const Message = t.object({
  uuid: t.string(),
  content: t.string(),
  webhookUrl: t.string(),
  createdTime: t.bigint(),
  ratelimitBucket: t.nullable(t.string()),
});

const MessageNullable = t.nullable(Message);

type Message = t.Infer<typeof Message>;

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

  const rateLimitBucket = response.headers.get("X-RateLimit-Bucket");
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  const rateLimitResetTime = response.headers.get("X-RateLimit-Reset");

  if (
    rateLimitBucket !== null &&
    rateLimitRemaining !== null &&
    rateLimitResetTime !== null
  ) {
    const resetTime = Number.parseInt(rateLimitResetTime, 10);
    const remaining = Number.parseInt(rateLimitRemaining, 10);

    if (message.ratelimitBucket === rateLimitBucket) {
      db.query(
        `
      UPDATE ratelimit
      SET 
        reset_time_epoch = $resetTimeEpoch, 
        remaining = $remaining
      WHERE bucket = $bucket
      `,
      ).run({
        resetTimeEpoch: resetTime,
        remaining: remaining,
        bucket: rateLimitBucket,
      });
    } else {
      db.query(
        `
      INSERT INTO ratelimit (bucket, reset_time_epoch, remaining)
      VALUES ($bucket, $resetTimeEpoch, $remaining)
      `,
      ).run({
        bucket: rateLimitBucket,
        resetTimeEpoch: resetTime,
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
  } else {
    console.error(
      `Anomaly: Missing rate limit headers: ${JSON.stringify({
        rateLimitBucket,
        rateLimitRemaining,
        rateLimitResetTime,
      })}`,
    );
  }

  db.query("DELETE FROM queue WHERE uuid = $uuid").run({ uuid: uuid });

  console.log(response.headers);
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
    WHERE url IN (
      SELECT webhook.url
      FROM webhook
      LEFT JOIN ratelimit ON webhook.ratelimit_bucket = ratelimit.bucket
      WHERE webhook.is_processing = 0
        AND (ratelimit.bucket IS NULL OR ratelimit.is_processing = 0)
    )
  `);

  const updateRatelimit = db.query(`
    UPDATE ratelimit
    SET is_processing = 1
    WHERE bucket IN (
      SELECT DISTINCT webhook.ratelimit_bucket
      FROM webhook
      JOIN ratelimit ON webhook.ratelimit_bucket = ratelimit.bucket
      WHERE webhook.is_processing = 1
        AND ratelimit.bucket IS NOT NULL
    )
  `);

  const transaction = db.transaction(() => {
    const queueItems = selectQueue.get();
    if (queueItems !== null) {
      updateWebhook.run();
      updateRatelimit.run();
    }
    return queueItems;
  });

  const message = transaction();
  t.assert(message, MessageNullable);

  if (message === null) {
    console.log("Message not found, sleeping for 1 second...");
    console.log(db.query("SELECT * FROM queue").all());
    console.log(db.query("SELECT * FROM webhook").all());
    console.log(db.query("SELECT * FROM ratelimit").all());
    await new Promise((resolve) => setTimeout(resolve, 3000));
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
    if (message.ratelimitBucket === null) {
      db.query(
        "UPDATE ratelimit SET is_processing = 0 WHERE bucket = $bucket",
      ).run({
        bucket: message.ratelimitBucket,
      });
      console.log(db.query("SELECT * FROM webhook").all());
    }
    console.log(
      `Finally finished processing message with UUID: ${message.uuid}`,
    );
  }
}
