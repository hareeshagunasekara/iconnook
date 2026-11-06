import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await createApp().request('/healthz');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('return 404', async () => {
    const res = await createApp().request('/does-not-exist');

    expect(res.status).toBe(404);
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({ NODE_ENV: 'development', API_PORT: 8787 });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ API_PORT: '99999' })).toThrow(/Invalid environment configuration/);
  });
});
