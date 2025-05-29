import type * as sqlite from "bun:sqlite";
import * as t from "superstruct";

const Message = t.nullable(
  t.object({
    uuid: t.string(),
    content: t.string(),
    webhookUrl: t.string(),
    createdTimeMs: t.bigint(),
  }),
);

export async function dequeue(db: sqlite.Database): Promise<void> {
  const message = db
    .query(
      `
      SELECT 
        uuid,
        webhook_url AS webhookUrl,
        content,
        created_time_ms AS createdTimeMs
      FROM queue
      ORDER BY created_time_ms ASC
      `,
    )
    .get();
  t.assert(message, Message);

  if (message === null) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
