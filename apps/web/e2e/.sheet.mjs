import { chromium } from '@playwright/test';
const [html, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 600 } });
await p.goto('file://' + html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
