import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

const Message = t.object({
  content: t.string(),
});

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  console.log("Received request to enqueue message");
  const webhookUrl = request.headers.get("X-Discord-Webhook-Url");
  if (!webhookUrl) {
    return new Response("Missing X-Discord-Webhook-Url header", {
      status: 400,
    });
  }

  const message = await request.json();
  t.assert(message, Message);

  const insertWebhook = db.query(
    "INSERT OR IGNORE INTO webhook (url) VALUES ($url)",
  );

  const insertQueue = db.query(
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
  );

  const transaction = db.transaction((webhookUrl, content) => {
    insertWebhook.run({ url: webhookUrl });
    insertQueue.run({
      uuid: crypto.randomUUID(),
      webhookUrl,
      content,
      createdTime: Math.floor(Date.now() / 1000),
    });
  });

  transaction(webhookUrl, message.content);
  console.log(
    `Enqueued message for webhook ${webhookUrl} with content: ${message.content}`,
  );
  return new Response(undefined, { status: 200 });
}
