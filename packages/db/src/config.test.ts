import { describe, expect, it } from 'vitest';

import { loadDbConfig } from './config.js';

describe('loadDbConfig', () => {
  it('accepts a postgres URL', () => {
    const url = 'postgres://user:pass@localhost:5432/iconnook';
    expect(loadDbConfig({ DATABASE_URL: url })).toEqual({ DATABASE_URL: url });
  });

  it('rejects a missing or non-postgres URL', () => {
    expect(() => loadDbConfig({})).toThrow(/Invalid database configuration/);
    expect(() => loadDbConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/postgres/);
  });
});
