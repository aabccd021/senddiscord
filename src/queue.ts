import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";
import { parseRateLimitHeader } from "./util.ts";

const Message = t.object({
  content: t.string(),
});

async function insertWebhookIfAbsent(
  db: sqlite.Database,
  webhookUrl: string,
): Promise<void> {
  const webhook = db
    .query("SELECT url FROM webhook WHERE url = $url")
    .get({ url: webhookUrl });

  if (webhook !== null) {
    return;
  }

  const response = await fetch(webhookUrl, { method: "POST" });

  const { resetTime, bucket } = parseRateLimitHeader(
    {
      status: response.status,
      headers: response.headers,
      jsonBody: await response.json(),
    },
    webhookUrl,
  );

  db.query(
    `
    INSERT INTO ratelimit (bucket, reset_time)
    VALUES ($bucket, $resetTime)
    ON CONFLICT(bucket) DO UPDATE SET reset_time = $resetTime 
    `,
  ).run({
    bucket: bucket,
    resetTime: resetTime,
  });

  db.query(
    "INSERT INTO webhook (url, ratelimit_bucket) VALUES ($url, $bucket)",
  ).run({
    url: webhookUrl,
    bucket: bucket,
  });
}

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  const webhookUrl = request.headers.get("X-Discord-Webhook-Url");
  if (webhookUrl === null) {
    return new Response("Missing X-Discord-Webhook-Url header", {
      status: 400,
    });
  }

  const message = await request.json();
  t.assert(message, Message);

  await insertWebhookIfAbsent(db, webhookUrl);

  db.query(
    `
    INSERT INTO message (
      uuid,
      webhook_url, 
      content, 
      created_time
    )
    VALUES (
      $uuid,
      $webhookUrl, 
      $content, 
      $createdTime
    )
  `,
  ).run({
    uuid: crypto.randomUUID(),
    webhookUrl,
    content: message.content,
    createdTime: Date.now(),
  });
  return new Response(undefined, { status: 200 });
}
