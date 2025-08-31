let counter = -1;

let responseList: any[] | null = null;

async function getResponseList(): Promise<any[]> {
  if (responseList !== null) {
    return responseList;
  }
  const responseFile = Bun.file("response.json");
  if (!(await responseFile.exists())) {
    return [];
  }

  const responseListJson = await responseFile.json();

  if (!Array.isArray(responseListJson)) {
    throw new Error("response.json must be an array");
  }

  responseList = responseListJson;

  return responseListJson;
}

async function createResponse(): Promise<Response> {
  const resps = await getResponseList();
  const response = resps.pop() ?? {
    status: 200,
    headers: {},
    body: {},
  };
  const init = {
    status: response.status,
    headers: {
      ...response.headers,
      "Content-Type": "application/json",
      "X-RateLimit-Bucket": "default",
    },
  };
  return new Response(JSON.stringify(response.body), init);
}

async function main(): Promise<void> {
  Bun.serve({
    port: 3001,
    fetch: async (request: Request): Promise<Response> => {
      if (request.body === null) {
        return createResponse();
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

      return createResponse();
    },
  });

  await new Promise((resolve) => {
    process.on("SIGTERM", () => {
      resolve(undefined);
    });
  });

  if (responseList !== null && responseList.length > 0) {
    console.error(
      `<3> Not all headers were used, ${responseList.length} headers left:`,
      responseList,
    );
    process.exit(1);
  }

  process.exit(0);
}

main();
