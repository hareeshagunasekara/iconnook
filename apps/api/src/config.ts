import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  PUBLIC_API_URL: z.url().default('http://localhost:8787'),
  PUBLIC_SITE_URL: z.url().default('https://iconnook.com'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  MEILI_URL: z.url({ protocol: /^https?$/ }),
  /** A search-only key in production; locally the master key is fine. */
  MEILI_API_KEY: z.string().min(16),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  /** Header carrying the real client IP, set only by a proxy we trust (e.g. cf-connecting-ip). */
  TRUST_PROXY_HEADER: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_RENDER_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  PNG_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Parse env once at startup; throws (and the process exits) on invalid config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
