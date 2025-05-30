function getBodyRetryAfter(response: SyncResponse): number | undefined {
  if (
    response.status === 429 &&
    typeof response.jsonBody === "object" &&
    response.jsonBody !== null &&
    "retry_after" in response.jsonBody &&
    typeof response.jsonBody.retry_after === "number"
  ) {
    return response.jsonBody.retry_after;
  }

  return undefined;
}

function getHeaderRetryAfter(response: SyncResponse): number | undefined {
  if (response.status !== 429) {
    return undefined;
  }

  const retryAfterHeader = response.headers.get("Retry-After");
  if (retryAfterHeader === null) {
    return undefined;
  }

  return Number.parseInt(retryAfterHeader, 10);
}

function getRatelimitResetAfter(response: SyncResponse): number {
  const remaining = response.headers.get("X-RateLimit-Remaining") ?? "0";

  // there is remaining tries, so wait 0 seconds
  if (remaining !== "0") {
    return 0;
  }

  const ratelimitResetAfter =
    response.headers.get("X-RateLimit-Reset-After") ?? "0";

  return Number.parseInt(ratelimitResetAfter, 10);
}

export function parseRateLimitHeader(
  response: SyncResponse,
  webhookUrl: string,
): {
  bucket: string;
  resetTime: number;
} {
  const bucket = response.headers.get("X-RateLimit-Bucket");
  if (bucket === null) {
    throw new Error(
      `Missing X-RateLimit-Bucket header in response from ${webhookUrl}`,
    );
  }

  const bodyRetryAfter = getBodyRetryAfter(response);
  const headerRetryAfter = getHeaderRetryAfter(response);
  const ratelimitResetAfter = getRatelimitResetAfter(response);

  // Do not send to same bucket more than once per 2 seconds
  // This is a magic number based on experience
  const minimumRetryAfter = 2;

  const resetTimeAfter = Math.max(
    bodyRetryAfter ?? 0,
    headerRetryAfter ?? 0,
    ratelimitResetAfter,
    minimumRetryAfter,
  );

  return {
    bucket,
    resetTime: Math.ceil(Date.now() + resetTimeAfter * 1000),
  };
}

export type SyncResponse = {
  readonly status: number;
  readonly headers: Headers;
  readonly jsonBody: unknown;
};
