import { renderAsync } from '@resvg/resvg-js';

import type { PngRenderer } from '../domain.js';
import { unavailable } from '../http/problem.js';

export interface RendererLimits {
  /** Renders running at once (off the event loop, in the libuv pool). */
  concurrency: number;
  /** Requests allowed to wait for a slot; beyond this we shed load with 503. */
  maxQueue?: number;
  /** Longest a request may wait for a slot before giving up with 503. */
  maxWaitMs?: number;
}

/**
 * SVG → PNG with bounded concurrency and a bounded, time-limited queue (docs/standards/scalability.md:
 * load shedding). A finished render hands its slot directly to the next waiter, so concurrency can
 * never be exceeded, and waiters that time out are removed instead of rendering for nobody.
 */
export class ResvgRenderer implements PngRenderer {
  private running = 0;
  private readonly queue: { grant: () => void }[] = [];
  private readonly maxQueue: number;
  private readonly maxWaitMs: number;

  constructor(private readonly limits: RendererLimits) {
    this.maxQueue = limits.maxQueue ?? limits.concurrency * 8;
    this.maxWaitMs = limits.maxWaitMs ?? 5_000;
  }

  private acquire(): Promise<void> {
    if (this.running < this.limits.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(unavailable('PNG rendering is busy, please retry shortly'));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        grant: () => {
          clearTimeout(timer);
          resolve(); // the slot is transferred to us: `running` is unchanged
        },
      };
      const timer = setTimeout(() => {
        const i = this.queue.indexOf(waiter);
        if (i !== -1) this.queue.splice(i, 1);
        reject(unavailable('PNG rendering is busy, please retry shortly'));
      }, this.maxWaitMs);
      this.queue.push(waiter);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next.grant();
    else this.running--;
  }

  async render(svg: string, width: number): Promise<Buffer> {
    await this.acquire();
    try {
      const image = await renderAsync(svg, {
        fitTo: { mode: 'width', value: width },
        font: { loadSystemFonts: false },
      });
      return image.asPng();
    } finally {
      this.release();
    }
  }

  /** For tests and metrics. */
  stats(): { running: number; queued: number } {
    return { running: this.running, queued: this.queue.length };
  }
}
