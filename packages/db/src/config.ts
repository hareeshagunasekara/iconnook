import { z } from 'zod';

const DbConfigSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
});

export type DbConfig = z.infer<typeof DbConfigSchema>;

export function loadDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const result = DbConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid database configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
