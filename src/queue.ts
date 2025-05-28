import type * as sqlite from "bun:sqlite";

type QueueRequest = {
  readonly webhookUrl: string;
  readonly message: string;
};

function parseQueueRequest(body: unknown): QueueRequest {
  if (body === null) {
    throw new Error("Request body cannot be null");
  }
  if (typeof body !== "object") {
    throw new Error("Request body must be an object");
  }
  if (!("webhookUrl" in body)) {
    throw new Error('Request body must contain "webhookUrl"');
  }
  if (typeof body.webhookUrl !== "string") {
    throw new Error('Request body "webhookUrl" must be a string');
  }
  if (!("message" in body)) {
    throw new Error('Request body must contain "message"');
  }
  if (typeof body.message !== "string") {
    throw new Error('Request body "message" must be a string');
  }
  return {
    webhookUrl: body.webhookUrl,
    message: body.message,
  };
}

export async function handleQueueRequest(
  db: sqlite.Database,
  request: Request,
): Promise<Response> {
  const requestBody = await request.json();
  const { webhookUrl, message } = parseQueueRequest(requestBody);

  db.query(
    `
    INSERT INTO queue (webhook_url, message, created_time_ms)
    VALUES ($webhookUrl, $message, $createdTimeMs)
  `,
  ).run({ webhookUrl, message, createdTimeMs: Date.now() });

  return new Response(undefined, { status: 200 });
}
