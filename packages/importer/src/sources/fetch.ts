import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { unzipSync } from 'fflate';

/**
 * Downloads for sources outside @iconify/json. Every download is pinned (a git commit or a
 * SHA-256) and verified, so an upstream change can never slip into an import unreviewed.
 * Verified files are cached in .data/sources/ (gitignored) so re-runs work offline.
 */
const CACHE_DIR = new URL('../../../../.data/sources/', import.meta.url).pathname;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Git's object id for a file: sha1("blob <size>\0" + content). */
export const gitBlobSha = (bytes: Uint8Array) =>
  createHash('sha1')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');

async function cached(
  key: string,
  verify: (bytes: Uint8Array) => boolean,
  download: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const path = join(CACHE_DIR, key);
  try {
    const bytes = new Uint8Array(await readFile(path));
    if (verify(bytes)) return bytes;
  } catch {
    // not cached yet
  }
  const bytes = await download();
  if (!verify(bytes)) throw new Error(`Integrity check failed for ${key}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}

async function get(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url} failed: ${String(res.status)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A file pinned by its SHA-256, e.g. a release zip. */
export function fetchPinned(url: string, expectedSha256: string): Promise<Uint8Array> {
  return cached(
    `pinned/${expectedSha256}`,
    (b) => sha256(b) === expectedSha256,
    () => get(url),
  );
}

export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)));
}

export interface GithubFile {
  path: string;
  bytes: Uint8Array;
}

/**
 * Files of a public GitHub repo at a pinned commit whose path passes `include`. Each file is
 * checked against the blob id in the commit's tree, so content can't differ from the commit.
 */
export async function fetchGithubFiles(
  repo: string,
  commit: string,
  include: (path: string) => boolean,
): Promise<GithubFile[]> {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Pin ${repo} to a full commit sha`);
  const treeBytes = await cached(
    `github/${repo}@${commit}/tree.json`,
    () => true, // the tree is addressed by the commit; its entries verify the files
    () => get(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`),
  );
  const tree = JSON.parse(new TextDecoder().decode(treeBytes)) as {
    truncated: boolean;
    tree: { path: string; type: string; sha: string }[];
  };
  if (tree.truncated) throw new Error(`Tree of ${repo}@${commit} is truncated`);

  const entries = tree.tree.filter((e) => e.type === 'blob' && include(e.path));
  const files: GithubFile[] = [];
  // A few parallel downloads: polite to GitHub, still quick for a few thousand small files.
  for (let i = 0; i < entries.length; i += 16) {
    const batch = entries.slice(i, i + 16);
    files.push(
      ...(await Promise.all(
        batch.map(async (e) => ({
          path: e.path,
          bytes: await cached(
            `github/${repo}@${commit}/files/${e.path}`,
            (b) => gitBlobSha(b) === e.sha,
            () =>
              get(
                `https://raw.githubusercontent.com/${repo}/${commit}/${e.path.split('/').map(encodeURIComponent).join('/')}`,
              ),
          ),
        })),
      )),
    );
  }
  return files;
}
