export function parseRateLimitHeader(
  headers: Headers,
  webhookUrl: string,
): {
  bucket: string;
  remaining: number;
  resetTime: number;
} {
  const bucket = headers.get("X-RateLimit-Bucket");
  if (bucket === null) {
    throw new Error(
      `Missing X-RateLimit-Bucket header in response from ${webhookUrl}`,
    );
  }

  const remaining = headers.get("X-RateLimit-Remaining");
  if (remaining === null) {
    throw new Error(
      `Missing X-RateLimit-Remaining header in response from ${webhookUrl}`,
    );
  }

  const resetTime = headers.get("X-RateLimit-Reset");
  if (resetTime === null) {
    throw new Error(
      `Missing X-RateLimit-Reset header in response from ${webhookUrl}`,
    );
  }

  return {
    bucket,
    remaining: Number.parseInt(remaining, 10),
    resetTime: Number.parseInt(resetTime, 10),
  };
}

export function logSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
