import node from '@astrojs/node';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';

// The browser loads icons and code snippets straight from the public API, so CSP must allow its origin.
const env = loadEnv(process.env.NODE_ENV ?? 'development', '../..', '');
const apiOrigin = new URL(env.PUBLIC_API_URL ?? 'http://localhost:8787').origin;

export default defineConfig({
  site: 'https://iconnook.com',
  // Server-rendered (370k icon pages can't be prebuilt); every page is cached at the CDN.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    envDir: '../..',
  },
  env: {
    schema: {
      // Where the server reaches the API (in k8s: the internal Service URL).
      API_INTERNAL_URL: envField.string({
        context: 'server',
        access: 'secret',
        default: 'http://localhost:8787',
      }),
      // Where browsers reach the API (images, downloads, code snippets).
      PUBLIC_API_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:8787',
      }),
    },
  },
  security: {
    // Astro hashes every script it emits, so script-src needs no 'unsafe-inline'.
    // Styles allow 'unsafe-inline': some icons carry inline style attributes / <style> (security.md).
    csp: {
      directives: [
        "default-src 'self'",
        `img-src 'self' data: ${apiOrigin}`,
        `connect-src 'self' ${apiOrigin}`,
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
});
