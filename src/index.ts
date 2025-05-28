import * as sqlite from "bun:sqlite";
import { handleQueueRequest } from "./queue.ts";

const db = new sqlite.Database(
  "/var/lib/discord-webhook-dispatcher/queue_db/db.sqlite",
  {
    strict: true,
    safeIntegers: true,
    create: true,
  },
);

Bun.serve({
  fetch: (request: Request): Promise<Response> =>
    handleQueueRequest(db, request),
});
