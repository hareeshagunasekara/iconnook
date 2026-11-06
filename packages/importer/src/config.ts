import { z } from 'zod';

const ImporterConfigSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  MEILI_URL: z.url({ protocol: /^https?$/ }),
  MEILI_MASTER_KEY: z.string().min(16, 'must be at least 16 characters'),
});

export type ImporterConfig = z.infer<typeof ImporterConfigSchema>;

export function loadImporterConfig(env: NodeJS.ProcessEnv = process.env): ImporterConfig {
  const result = ImporterConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid importer configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
