import { Hono } from 'hono';

export function createApp(): Hono {
  const app = new Hono();

  // Liveness: no dependency checks, so a slow database never gets the pod killed.
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  return app;
}
