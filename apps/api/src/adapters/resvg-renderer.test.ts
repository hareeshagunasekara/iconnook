import { describe, expect, it } from 'vitest';

import { ProblemError } from '../http/problem.js';
import { ResvgRenderer } from './resvg-renderer.js';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>';

describe('ResvgRenderer', () => {
  it('renders a PNG', async () => {
    const png = await new ResvgRenderer({ concurrency: 1 }).render(svg, 32);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('never runs more renders than its concurrency, even under a burst', async () => {
    const renderer = new ResvgRenderer({ concurrency: 2, maxQueue: 100 });
    let maxRunning = 0;
    const sampler = setInterval(() => {
      maxRunning = Math.max(maxRunning, renderer.stats().running);
    }, 0);
    await Promise.all(Array.from({ length: 30 }, () => renderer.render(svg, 512)));
    clearInterval(sampler);

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(renderer.stats()).toEqual({ running: 0, queued: 0 });
  });

  it('sheds load with 503 when the queue is full', async () => {
    const renderer = new ResvgRenderer({ concurrency: 1, maxQueue: 1 });
    const results = await Promise.allSettled([1, 2, 3].map(() => renderer.render(svg, 1024)));

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    const rejected = results[2] as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ProblemError);
    expect((rejected.reason as ProblemError).status).toBe(503);
  });

  it('gives up waiting after maxWaitMs and leaves the queue', async () => {
    const renderer = new ResvgRenderer({ concurrency: 1, maxQueue: 10, maxWaitMs: 1 });
    const results = await Promise.allSettled([
      renderer.render(svg, 2048),
      renderer.render(svg, 16),
    ]);

    expect(results[1].status).toBe('rejected');
    expect(renderer.stats()).toEqual({ running: 0, queued: 0 });
  });
});
