import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadStorageConfig, S3Storage } from './index.js';

const config = loadStorageConfig({
  S3_ENDPOINT: 'http://s3.test',
  S3_BUCKET: 'iconnook-assets',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', (input: Request | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push({ url: req.url, method: req.method });
    return Promise.resolve(handler(req.url, { method: req.method }));
  });
  return calls;
}

describe('S3Storage', () => {
  it('uses signed path-style requests inside the bucket', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }));
    await new S3Storage(config).put('packs/abc.zip', new Uint8Array([1]), 'application/zip');
    expect(calls).toEqual([{ url: 'http://s3.test/iconnook-assets/packs/abc.zip', method: 'PUT' }]);
  });

  it.each(['../etc/passwd', 'packs/../../x', '/absolute', 'UPPER/case', ''])(
    'refuses object keys that could escape or misbehave: %s',
    async (key) => {
      stubFetch(() => new Response(null, { status: 200 }));
      await expect(new S3Storage(config).get(key)).rejects.toThrow(RangeError);
    },
  );

  it('returns null for missing objects and throws on other errors', async () => {
    stubFetch((url) => new Response(null, { status: url.endsWith('missing.zip') ? 404 : 500 }));
    const storage = new S3Storage(config);
    expect(await storage.get('packs/missing.zip')).toBeNull();
    await expect(storage.get('packs/broken.zip')).rejects.toThrow(/500/);
  });

  it('lists objects across paginated responses', async () => {
    const page1 = `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t2</NextContinuationToken>
      <Contents><Key>packs/a.zip</Key><LastModified>2026-11-01T00:00:00.000Z</LastModified></Contents></ListBucketResult>`;
    const page2 = `<ListBucketResult><IsTruncated>false</IsTruncated>
      <Contents><Key>packs/b&amp;c.svg</Key><LastModified>2026-11-02T00:00:00.000Z</LastModified></Contents></ListBucketResult>`;
    stubFetch((url) => new Response(url.includes('continuation-token=t2') ? page2 : page1));

    expect(await new S3Storage(config).list('packs/')).toEqual([
      { key: 'packs/a.zip', lastModified: new Date('2026-11-01T00:00:00.000Z') },
      { key: 'packs/b&c.svg', lastModified: new Date('2026-11-02T00:00:00.000Z') },
    ]);
  });

  it('validates its configuration', () => {
    expect(() =>
      loadStorageConfig({
        S3_ENDPOINT: 'ftp://x',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      }),
    ).toThrow(/Invalid storage configuration/);
  });
});
