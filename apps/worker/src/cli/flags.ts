import { FEATURE_FLAGS, readFlags, setFlag, type FeatureFlag } from '@iconnook/jobs';
import { Redis } from 'ioredis';
import { z } from 'zod';

/**
 * pnpm flags                 → show flags
 * pnpm flags set packs off   → disable ZIP/sprite packs everywhere within ~5 s
 * pnpm flags set png on      → re-enable PNG rendering
 */
const url = z.url({ protocol: /^rediss?$/ }).parse(process.env['VALKEY_URL']);
const redis = new Redis(url, { maxRetriesPerRequest: 1 });
const [command, flag, state] = process.argv.slice(2);

try {
  if (command === 'set') {
    if (!FEATURE_FLAGS.includes(flag as FeatureFlag) || (state !== 'on' && state !== 'off')) {
      throw new Error(`Usage: pnpm flags set <${FEATURE_FLAGS.join('|')}> <on|off>`);
    }
    await setFlag(redis, flag as FeatureFlag, state === 'on');
  } else if (command !== undefined) {
    throw new Error('Usage: pnpm flags [set <flag> <on|off>]');
  }
  for (const [name, enabled] of Object.entries(await readFlags(redis))) {
    console.log(`${name.padEnd(8)} ${enabled ? 'on' : 'OFF'}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await redis.quit();
}
