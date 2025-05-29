import type * as sqlite from "bun:sqlite";

type QueueRequest = {
  readonly content: string;
};

function parseQueueRequest(body: unknown): QueueRequest {
  if (body === null) {
    throw new Error("Request body cannot be null");
  }
  if (typeof body !== "object") {
    throw new Error("Request body must be an object");
  }
  if (!("content" in body)) {
    throw new Error('Request body must contain "content"');
  }
  if (typeof body.content !== "string") {
    throw new Error('Request body "content" must be a string');
  }
  return {
    content: body.content,
  };
}

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  const requestBody = await request.json();
  const webhookUrl = request.headers.get("X-Discord-Webhook-Url");
  const { content } = parseQueueRequest(requestBody);

  db.query(
    `
    INSERT INTO queue (webhook_url, content, created_time_ms)
    VALUES ($webhookUrl, $content, $createdTimeMs)
  `,
  ).run({ webhookUrl, content, createdTimeMs: Date.now() });

  return new Response(undefined, { status: 200 });
}
