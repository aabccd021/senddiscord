import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

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
  const rateLimitBucket = response.headers.get("X-RateLimit-Bucket");
  if (rateLimitBucket === null) {
    throw new Error(
      `Missing X-RateLimit-Bucket header in response from ${webhookUrl}`,
    );
  }

  const rateLimit = db
    .query("SELECT bucket FROM ratelimit WHERE bucket = $bucket")
    .get({ bucket: rateLimitBucket });

  if (rateLimit === null) {
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    if (rateLimitRemaining === null) {
      throw new Error(
        `Missing X-RateLimit-Remaining header in response from ${webhookUrl}`,
      );
    }
    const rateLimitResetTime = response.headers.get("X-RateLimit-Reset");
    if (rateLimitResetTime === null) {
      throw new Error(
        `Missing X-RateLimit-Reset header in response from ${webhookUrl}`,
      );
    }
    const resetTime = Number.parseInt(rateLimitResetTime, 10);
    const remaining = Number.parseInt(rateLimitRemaining, 10);
    db.query(
      `
        INSERT INTO ratelimit 
          (bucket, reset_time, remaining) 
        VALUES 
          ($bucket, $resetTime, $remaining)
      `,
    ).run({
      bucket: rateLimitBucket,
      resetTime: resetTime,
      remaining: remaining,
    });
  }

  db.query(
    "INSERT INTO webhook (url, ratelimit_bucket) VALUES ($url, $bucket)",
  ).run({
    url: webhookUrl,
    bucket: rateLimitBucket,
  });
}

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  console.log("Received request to enqueue message");
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
    INSERT INTO queue (
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
    createdTime: Math.floor(Date.now() / 1000),
  });

  console.log(
    `Enqueued message for webhook ${webhookUrl} with content: ${message.content}`,
  );
  return new Response(undefined, { status: 200 });
}
