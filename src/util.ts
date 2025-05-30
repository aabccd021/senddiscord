function getBodyRetryAfter(response: ResponseWithBody): number | undefined {
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

function getHeaderRetryAfter(response: ResponseWithBody): number | undefined {
  if (response.status !== 429) {
    return undefined;
  }

  const retryAfterHeader = response.headers.get("Retry-After");
  if (retryAfterHeader === null) {
    return undefined;
  }

  return Number.parseInt(retryAfterHeader, 10);
}

function getRatelimitResetAfter(response: ResponseWithBody): number {
  const ratelimitResetAfter = response.headers.get("X-RateLimit-Reset-After");
  if (ratelimitResetAfter === null) {
    throw new Error("Missing X-RateLimit-Reset-After header in response");
  }

  return Number.parseInt(ratelimitResetAfter, 10);
}

function getResetTimeAfter(response: ResponseWithBody): {
  readonly resetTimeAfterSec: number;
  readonly remaining: number;
} {
  const bodyRetryAfter = getBodyRetryAfter(response);
  const headerRetryAfter = getHeaderRetryAfter(response);

  // Do not send to same bucket more than once per 2 seconds
  // This is a magic number based on experience
  const minimumRetryAfter = 2;

  const retryAfter = Math.max(
    bodyRetryAfter ?? 0,
    headerRetryAfter ?? 0,
    minimumRetryAfter,
  );

  const ratelimitResetAfter = getRatelimitResetAfter(response);

  if (retryAfter > ratelimitResetAfter) {
    return {
      resetTimeAfterSec: retryAfter,
      remaining: 0,
    };
  }

  const remaining = response.headers.get("X-RateLimit-Remaining");
  if (remaining === null) {
    throw new Error("Missing X-RateLimit-Remaining header in response");
  }

  return {
    resetTimeAfterSec: ratelimitResetAfter,
    remaining: Number.parseInt(remaining, 10),
  };
}

export function parseRateLimitHeader(
  response: ResponseWithBody,
  webhookUrl: string,
): {
  bucket: string;
  remaining: number;
  resetTime: number;
} {
  const bucket = response.headers.get("X-RateLimit-Bucket");
  if (bucket === null) {
    throw new Error(
      `Missing X-RateLimit-Bucket header in response from ${webhookUrl}`,
    );
  }

  const { resetTimeAfterSec, remaining } = getResetTimeAfter(response);

  return {
    bucket,
    remaining,
    resetTime: Math.ceil(Date.now() + resetTimeAfterSec * 1000),
  };
}

export function logSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ResponseWithBody = {
  readonly status: number;
  readonly headers: Headers;
  readonly jsonBody: unknown;
};
