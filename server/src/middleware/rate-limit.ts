import type { MiddlewareHandler } from 'hono';

type Bucket = { count: number; resetAt: number };

export function rateLimit(options: {
  max: number;
  windowMs: number;
  prefix?: string;
}): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  let requests = 0;

  return async (context, next) => {
    const forwarded = context.req
      .header('x-forwarded-for')
      ?.split(',')
      .at(-1)
      ?.trim();
    const key = `${options.prefix ?? 'public'}:${forwarded ?? 'local'}`;
    const now = Date.now();
    const existing = buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + options.windowMs }
        : existing;
    bucket.count += 1;
    buckets.set(key, bucket);
    requests += 1;
    if (requests % 500 === 0) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    context.header('RateLimit-Limit', String(options.max));
    context.header(
      'RateLimit-Remaining',
      String(Math.max(0, options.max - bucket.count)),
    );
    context.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.max) {
      context.header(
        'Retry-After',
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      return context.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            requestId: context.get('requestId'),
          },
        },
        429,
      );
    }
    await next();
  };
}
