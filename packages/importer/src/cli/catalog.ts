import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dir as iconifyDir } from '@iconify/json';

import { renderCatalog } from '../catalog.js';
import { iconifySource } from '../sources/iconify.js';

const pkg = JSON.parse(await readFile(join(iconifyDir, 'package.json'), 'utf8')) as {
  version: string;
};
const markdown = renderCatalog(await iconifySource.listSets(), {
  iconifyVersion: pkg.version,
  date: new Date().toISOString().slice(0, 10),
});
const target = new URL('../../../../SOURCES.md', import.meta.url);
await writeFile(target, markdown);
console.log(`Wrote ${target.pathname}`);
