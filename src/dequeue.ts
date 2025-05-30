import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";
import { logSleep, parseRateLimitHeader } from "./util.ts";

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
  const { remaining, resetTime, bucket } = parseRateLimitHeader(
    response.headers,
    webhookUrl,
  );

  if (message.ratelimitBucket === bucket) {
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
      bucket: bucket,
    });
    return;
  }

  const insertNewRatelimit = db.query(
    `
    INSERT INTO ratelimit (bucket, reset_time, remaining)
    VALUES ($bucket, $resetTime, $remaining)
    ON CONFLICT(bucket) DO UPDATE SET 
    reset_time = $resetTime, 
      remaining = $remaining
    `,
  );

  const updateWebhook = db.query(
    `
    UPDATE webhook
    SET ratelimit_bucket = $bucket
    WHERE url = $webhookUrl
    `,
  );

  const deleteUnusedRatelimit = db.query(
    `
    DELETE FROM ratelimit
    WHERE bucket = $bucket
    AND NOT EXISTS (
      SELECT 1 FROM webhook WHERE ratelimit_bucket = $bucket
    )
    `,
  );

  const transaction = db.transaction(() => {
    insertNewRatelimit.run({
      bucket: bucket,
      resetTime: resetTime,
      remaining: remaining,
    });

    updateWebhook.run({
      bucket: bucket,
      webhookUrl: webhookUrl,
    });

    deleteUnusedRatelimit.run({ bucket: message.ratelimitBucket });
  });

  transaction();
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
    WHERE ratelimit.is_processing = 0
      AND (
        ratelimit.remaining > 0 
        OR $now > ratelimit.reset_time
      )
  `);

  const updateRatelimit = db.query(`
    UPDATE ratelimit
    SET is_processing = 1
    WHERE bucket = $bucket
  `);

  const transaction = db.transaction(() => {
    const message = selectQueue.get({ now: Math.floor(Date.now() / 1000) });
    t.assert(message, MessageNullable);
    if (message != null) {
      updateRatelimit.run({ bucket: message.ratelimitBucket });
    }
    return message;
  });

  const message = transaction();
  t.assert(message, MessageNullable);

  if (message === null) {
    await logSleep(1000);
    return;
  }

  try {
    await processDequeue(db, message);
  } finally {
    db.query(
      "UPDATE ratelimit SET is_processing = 0 WHERE bucket = $bucket",
    ).run({
      bucket: message.ratelimitBucket,
    });
  }
}
