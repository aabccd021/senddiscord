import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";
import { type SyncResponse, logSleep, parseRateLimitHeader } from "./util.ts";

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
  response: SyncResponse;
}): void {
  const { resetTime, bucket } = parseRateLimitHeader(response, webhookUrl);

  if (message.ratelimitBucket === bucket) {
    db.query(
      `
      UPDATE ratelimit
      SET 
        reset_time = $resetTime
      WHERE bucket = $bucket
      `,
    ).run({
      resetTime: resetTime,
      bucket: bucket,
    });
    return;
  }

  const insertNewRatelimit = db.query(
    `
    INSERT INTO ratelimit (bucket, reset_time
    VALUES ($bucket, $resetTime
    ON CONFLICT(bucket) DO UPDATE SET 
    reset_time = $resetTime, 
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

  setRateLimit({
    db,
    message,
    webhookUrl,
    response: {
      status: response.status,
      headers: response.headers,
      jsonBody: await response.json(),
    },
  });

  if (response.ok) {
    db.query("DELETE FROM queue WHERE uuid = $uuid").run({ uuid: uuid });
  } else {
    console.error(`Failed to process message: ${response.status}`);
  }
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
      AND ratelimit.reset_time < $now
  `);

  const updateRatelimit = db.query(`
    UPDATE ratelimit
    SET is_processing = 1
    WHERE bucket = $bucket
  `);

  const now = Date.now();

  const transaction = db.transaction(() => {
    const message = selectQueue.get({ now });
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
