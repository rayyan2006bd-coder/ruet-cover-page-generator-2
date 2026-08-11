import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'DATABASE_URL must use PostgreSQL',
    ),
  CORS_ORIGINS: z.string().min(1),
  ADMIN_TOKEN_HASH: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
});

export type AppEnv = z.infer<typeof envSchema> & { corsOrigins: string[] };

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.parse(input);
  const corsOrigins = parsed.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (parsed.NODE_ENV === 'production' && corsOrigins.includes('*')) {
    throw new Error('Wildcard CORS origins are forbidden in production');
  }
  if (corsOrigins.length === 0)
    throw new Error('At least one CORS origin is required');

  return { ...parsed, corsOrigins };
}

export function loadEnv(): AppEnv {
  return parseEnv(process.env);
}
