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

const Mess = t.object({
  uuid: t.string(),
  content: t.string(),
});

const MessNullable = t.nullable(Mess);

type Mess = t.Infer<typeof Mess>;

function splitMessages(args: { accContent: string; next: Mess }): {
  readonly accContent: string;
  readonly remaining?: Mess;
} {
  let accContent = args.accContent;

  const lines = args.next.content.split("\n");
  while (true) {
    const line = lines.shift();

    // no more lines to process, no remaining, delete all sent messages
    if (line === undefined) {
      return {
        accContent: accContent,
      };
    }

    // line too long, but we already have some content to send
    if (line.length > 2000 && accContent !== "") {
      lines.unshift(line);
      return {
        accContent: accContent,
        remaining: { uuid: args.next.uuid, content: lines.join("\n") },
      };
    }

    // lines too long, but we don't have any content to send yet. Cut and send the line.
    if (line.length > 2000 && accContent === "") {
      const send = line.slice(0, 2000);
      const remainingLine = line.slice(2000);
      lines.unshift(remainingLine);
      return {
        accContent: send,
        remaining: { uuid: args.next.uuid, content: lines.join("\n") },
      };
    }

    // line is short enough, but in total we would exceed the limit
    const nextAcc = accContent + (accContent.length > 0 ? `\n${line}` : line);
    if (nextAcc.length > 2000) {
      lines.unshift(line);
      return {
        accContent,
        remaining: { uuid: args.next.uuid, content: lines.join("\n") },
      };
    }

    accContent = nextAcc;
  }
}

function setRateLimit({
  db,
  ratelimitBucket,
  webhookUrl,
  response,
}: {
  db: sqlite.Database;
  ratelimitBucket: string;
  webhookUrl: string;
  response: SyncResponse;
}): void {
  const { resetTime, bucket } = parseRateLimitHeader(response, webhookUrl);

  if (ratelimitBucket === bucket) {
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

    deleteUnusedRatelimit.run({ bucket: ratelimitBucket });
  });

  transaction();
}

async function sendMessage(
  db: sqlite.Database,
  uuids: readonly string[],
  ratelimitBucket: string,
  webhookUrl: string,
  content: string,
  remaining?: Mess,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const jsonBody = await response.json();

  setRateLimit({
    db,
    ratelimitBucket,
    webhookUrl,
    response: {
      status: response.status,
      headers: response.headers,
      jsonBody,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to send message to ${webhookUrl}: ${response.status} - ${JSON.stringify(jsonBody)}`,
    );
  }

  for (const uuid of new Set(uuids)) {
    if (uuid !== remaining?.uuid) {
      db.query("DELETE FROM message WHERE uuid = $uuid").run({ uuid });
    }
  }

  if (remaining === undefined) {
    return;
  }

  db.query(
    `
      UPDATE message 
      SET 
        content = $content,
        is_processing = 0
      WHERE uuid = $uuid
      `,
  ).run({
    content: remaining.content,
    uuid: remaining.uuid,
  });
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
JOIN ratelimit ON webhook.ratelimit_bucket = ratelimit.bucket
WHERE ratelimit.reset_time < $now
  AND message.error_count < 10
  AND NOT EXISTS (
    SELECT 1
    FROM message m
    JOIN webhook w ON m.webhook_url = w.url
    WHERE w.ratelimit_bucket = webhook.ratelimit_bucket
      AND m.is_processing = 1
  )
ORDER BY message.error_count ASC, message.created_time ASC
`);

  const setMessageIsProcessing = db.query(`
    UPDATE message
    SET is_processing = 1
    WHERE uuid = $uuid
  `);

  const now = Date.now();

  const transaction = db.transaction(() => {
    const message = selectMessage.get({ now });
    t.assert(message, MessageNullable);
    if (message != null) {
      setMessageIsProcessing.run({ uuid: message.uuid });
    }
    return message;
  });

  const message = transaction();
  t.assert(message, MessageNullable);

  if (message === null) {
    await Bun.sleep(1000);
    return;
  }

  let accContent = "";
  let next = {
    uuid: message.uuid,
    content: message.content,
  };
  const uuids: string[] = [message.uuid];
  let remaining: Mess | undefined;

  while (true) {
    const splitResult = splitMessages({ accContent, next });
    accContent = splitResult.accContent;

    // sopt fetching if we already have some remaining content
    if (splitResult.remaining !== undefined) {
      remaining = splitResult.remaining;
      break;
    }

    const getNextMessage = db.query(`
      SELECT uuid, content
      FROM message
      WHERE webhook_url = $webhookUrl
        AND is_processing = 0
      ORDER BY error_count ASC, created_time ASC
    `);

    const getNextTx = db.transaction(() => {
      const nextMessage = getNextMessage.get({
        webhookUrl: message.webhookUrl,
      });
      t.assert(nextMessage, MessNullable);
      if (nextMessage != null) {
        setMessageIsProcessing.run({ uuid: nextMessage.uuid });
      }
      return nextMessage;
    });

    const nextMessage = getNextTx();
    t.assert(nextMessage, MessNullable);

    if (nextMessage === null) {
      break;
    }

    next = {
      uuid: nextMessage.uuid,
      content: nextMessage.content,
    };
    uuids.push(nextMessage.uuid);
  }

  try {
    await sendMessage(
      db,
      uuids,
      message.ratelimitBucket,
      message.webhookUrl,
      accContent,
      remaining,
    );
  } finally {
    for (const uuid of uuids) {
      db.query(`
      UPDATE message 
      SET 
        error_count = error_count + 1,
        is_processing = 0
      WHERE uuid = $uuid
    `);
      console.error(`Failed to process message. UUID: ${uuid}`);
    }
  }
}
