import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

const Message = t.object({
  content: t.string(),
});

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  const webhookUrl = request.headers.get("X-Discord-Webhook-Url");
  if (!webhookUrl) {
    return new Response("Missing X-Discord-Webhook-Url header", {
      status: 400,
    });
  }

  const message = await request.json();
  t.assert(message, Message);

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

  return new Response(undefined, { status: 200 });
}
