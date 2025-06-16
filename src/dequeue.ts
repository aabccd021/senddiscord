import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";
import { type SyncResponse, parseRateLimitHeader } from "./util.ts";

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

function splitMessage(content: string): {
  readonly send: string;
  readonly remaining: string;
} {
  const maxLength = 2000;
  if (content.length <= maxLength) {
    return { send: content, remaining: "" };
  }

  const lines = content.split("\n");
  let send = "";
  while (true) {
    const line = lines.shift();
    if (line === undefined) {
      break;
    }
    if (send.length + line.length + 1 > maxLength) {
      lines.unshift(line);
      break;
    }
    send = send.length > 0 ? `${send}\n${line}` : line;
  }

  const remaining = lines.join("\n");
  return { send, remaining };
}

async function sendMessage(
  db: sqlite.Database,
  message: Message,
): Promise<void> {
  const { uuid, webhookUrl, content } = message;
  const { send, remaining } = splitMessage(content);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: send,
    }),
  });

  const jsonBody = await response.json();

  setRateLimit({
    db,
    message,
    webhookUrl,
    response: {
      status: response.status,
      headers: response.headers,
      jsonBody,
    },
  });

  if (response.ok) {
    if (remaining === "") {
      db.query("DELETE FROM message WHERE uuid = $uuid").run({ uuid: uuid });
    } else {
      db.query(
        "UPDATE message SET content = $remaining WHERE uuid = $uuid",
      ).run({
        remaining: remaining,
        uuid: uuid,
      });
    }
  } else {
    db.query(
      "UPDATE message SET error_count = error_count + 1 WHERE uuid = $uuid",
    );
    console.error(
      [
        "Failed to process message",
        `UUID: ${uuid}`,
        `Status: ${response.status}`,
        `Headers: ${JSON.stringify(response.headers)}`,
        `Body: ${JSON.stringify(jsonBody)}`,
      ].join(" "),
    );
  }
}

export async function dequeue(db: sqlite.Database): Promise<void> {
  const selectMessage = db.query(`
    SELECT 
      message.uuid,
      message.webhook_url AS webhookUrl,
      message.content,
      message.created_time AS createdTime,
      ratelimit.bucket AS ratelimitBucket
    FROM message
    JOIN webhook ON message.webhook_url = webhook.url
    LEFT JOIN ratelimit ON webhook.ratelimit_bucket = ratelimit.bucket
    WHERE ratelimit.is_processing = 0
      AND ratelimit.reset_time < $now
      AND message.error_count < 10
    ORDER BY message.error_count ASC, message.created_time ASC
  `);

  const updateRatelimit = db.query(`
    UPDATE ratelimit
    SET is_processing = 1
    WHERE bucket = $bucket
  `);

  const now = Date.now();

  const transaction = db.transaction(() => {
    const message = selectMessage.get({ now });
    t.assert(message, MessageNullable);
    if (message != null) {
      updateRatelimit.run({ bucket: message.ratelimitBucket });
    }
    return message;
  });

  const message = transaction();
  t.assert(message, MessageNullable);

  if (message === null) {
    await Bun.sleep(1000);
    return;
  }

  try {
    await sendMessage(db, message);
  } finally {
    db.query(
      "UPDATE ratelimit SET is_processing = 0 WHERE bucket = $bucket",
    ).run({
      bucket: message.ratelimitBucket,
    });
  }
}
