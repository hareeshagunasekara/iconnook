import { renderAsync } from '@resvg/resvg-js';

import type { PngRenderer } from '../domain.js';

/**
 * Renders SVG → PNG off the event loop (libuv thread pool), with bounded concurrency so a burst of
 * PNG requests can't starve everything else. Excess requests wait in a queue.
 */
export class ResvgRenderer implements PngRenderer {
  private running = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly concurrency: number) {}

  async render(svg: string, width: number): Promise<Buffer> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      const image = await renderAsync(svg, {
        fitTo: { mode: 'width', value: width },
        font: { loadSystemFonts: false },
      });
      return image.asPng();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
