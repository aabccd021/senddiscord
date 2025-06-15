let counter = -1;

async function initHeaderList(): Promise<Record<string, string>[]> {
  if (!(await Bun.file("headers.json").exists())) {
    return [];
  }
  const headersList = JSON.parse(await Bun.file("headers.json").text());

  if (!Array.isArray(headersList)) {
    throw new Error("headers.json must be an array");
  }

  const headers: Record<string, string>[] = [];
  for (const headersObj of headersList) {
    if (typeof headersObj !== "object") {
      throw new Error("Each header in headers.json must be an object");
    }
    if (headersObj === null) {
      throw new Error("Each header in headers.json must not be null");
    }

    const header: Record<string, string> = {};
    for (const [key, value] of Object.entries(headersObj)) {
      if (typeof value !== "string") {
        throw new Error(`Header value for ${key} must be a string`);
      }
      header[key] = value;
    }

    headers.push(header);
  }

  return headers;
}

async function main(): Promise<void> {
  const headersList = await initHeaderList();

  Bun.serve({
    port: 3000,
    fetch: async (request: Request): Promise<Response> => {
      if (request.body === null) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Bucket": "default",
            ...headersList.pop(),
          },
        });
      }

      const body = await request.json();

      if (body === null) {
        throw new Error("Request body is null");
      }

      if (typeof body !== "object") {
        throw new Error("Request body is not an object");
      }

      if (!("content" in body)) {
        throw new Error("Request body does not contain 'content' field");
      }

      if (typeof body.content !== "string") {
        throw new Error("'content' field is not a string");
      }

      counter += 1;
      await Bun.write(
        `requests/${counter}.json`,
        JSON.stringify(body, null, 2),
      );

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Bucket": "default",
          ...headersList.pop(),
        },
      });
    },
  });

  await new Promise((resolve) => {
    process.on("SIGTERM", () => {
      resolve(undefined);
    });
  });

  if (headersList.length > 0) {
    console.error(
      `Not all headers were used, ${headersList.length} headers left:`,
      headersList,
    );
    process.exit(1);
  }

  process.exit(0);
}

main();
