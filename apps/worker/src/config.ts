import { z } from 'zod';

const ConfigSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  DOWNLOADS_FLUSH_EVERY_MS: z.coerce.number().int().min(1_000).default(60_000),
  /** Liveness endpoint for Kubernetes probes (and E2E tests to know the worker is up). */
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8788),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
