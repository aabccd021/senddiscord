Bun.serve({
  port: 3000,
  fetch: async (request: Request): Promise<Response> => {
    if (request.body === null) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Bucket": "default",
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

    await Bun.write("request.json", JSON.stringify(body, null, 2));

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Bucket": "default",
      },
    });
  },
});
