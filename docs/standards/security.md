# Security Practices

Baseline: **OWASP Top 10:2025** and **OWASP ASVS 5.0** (Level 1 at launch, Level 2 once accounts or uploads exist). Use the [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org) for implementation detail.

## OWASP Top 10:2025 → what we do

| Risk                                          | Our controls                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken Access Control** (incl. SSRF)    | Deny by default. Admin/moderation routes require auth + role check in middleware, tested. No user-supplied URLs are fetched server-side; importer fetches only from an allowlist of source hosts.                                                                                                                                                                                       |
| **A02 Security Misconfiguration**             | Security headers on every response (below). No debug output or stack traces in prod. Default credentials never used; services not exposed outside the cluster except via ingress.                                                                                                                                                                                                       |
| **A03 Software Supply Chain Failures**        | Lockfile committed, `pnpm install --frozen-lockfile` in CI. Renovate for updates (npm + GitHub Actions, 3-day minimum release age); Dependabot alerts only. `pnpm audit` + OSV scanning in CI. Base images pinned by digest. Image scan (Trivy) in CI. SBOM + provenance attached to images (SLSA Build L2). Review new dependencies: maintenance, downloads, license, install scripts. |
| **A04 Cryptographic Failures**                | TLS everywhere (Cloudflare → origin too). HSTS. Secrets never in code or images. If accounts exist: no passwords (OAuth/passkeys), session cookies `HttpOnly; Secure; SameSite=Lax`.                                                                                                                                                                                                    |
| **A05 Injection**                             | Drizzle query builder / parameterized SQL only, never string-built SQL. Meilisearch filters built from validated enums, never raw user strings. Zod on all inputs. Output encoding by framework; no `set:html` / `dangerouslySetInnerHTML` with untrusted data.                                                                                                                         |
| **A06 Insecure Design**                       | Threat-model new features (what can be abused? what's the worst input?). Limits by design: max icons per pack, max PNG size, max query length.                                                                                                                                                                                                                                          |
| **A07 Authentication Failures**               | Use a vetted library (Better Auth) — never hand-roll. Rate-limit auth endpoints. Accessible authentication (WCAG 3.3.8): no cognitive tests.                                                                                                                                                                                                                                            |
| **A08 Software or Data Integrity Failures**   | Imported icon data verified (pinned package versions, checksums). CI artifacts signed; only CI-built images deployed. No deserializing untrusted data into code.                                                                                                                                                                                                                        |
| **A09 Logging & Alerting Failures**           | Log auth events, admin actions, rate-limit hits, sanitizer rejections — without personal data. Alerts on error spikes.                                                                                                                                                                                                                                                                  |
| **A10 Mishandling of Exceptional Conditions** | Fail closed (if the sanitizer errors, reject the SVG). Timeouts on every outbound call. Central error handler; no partial writes (use transactions).                                                                                                                                                                                                                                    |

## SVG security (our biggest specific risk)

SVG is XML that can carry `<script>`, `on*` handlers, `javascript:` URLs, `<foreignObject>` HTML, external `href`s, and CSS that loads remote resources.

1. **Sanitize on ingest, server-side, with an allowlist** — every SVG (imported or uploaded) passes through SVGO (cleanup) **and** DOMPurify (via jsdom/linkedom) with the SVG profile. Strip: `script`, `foreignObject`, all `on*` attributes, `href`/`xlink:href` not starting with `#`, external `url()` in styles, `<style>` with `@import`. Fail closed on parse errors.
2. **Never trust stored SVG twice** — store only the sanitized output; never re-modify after sanitizing without sanitizing again.
3. **Serve SVG safely** — raw `.svg` responses get `Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. Downloads also get `Content-Disposition: attachment`.
4. **User-uploaded SVGs** (future) are displayed via `<img>` (scripts can't run there) and served from a separate cookieless origin, never inlined, until moderated.
5. Parameter-driven transforms (color, stroke, size) are applied from validated values only: colors match `^#[0-9a-f]{3,8}$` or `currentColor`; numbers are clamped.
6. Guard against XML bombs: cap input size (e.g. 512 KB), disable entity expansion, cap element count.

## HTTP security headers (web + api)

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
                         script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

Tighten `style-src` with nonces/hashes if feasible. Public API: CORS `*` for GET asset endpoints only; everything else same-origin.

## Abuse & availability

- Rate limits in Valkey per IP (and per API key later), stricter on expensive endpoints (PNG render, ZIP packs). Return `429` with `Retry-After`.
- Cloudflare WAF + bot management in front. Expensive work is queued, not done inline.
- Request body limits on every route; query length limits on search.

## Secrets

- Env vars only, injected from Kubernetes Secrets (encrypted with SOPS or Sealed Secrets in git). Never commit `.env`; `gitleaks` runs in CI and as a pre-commit hook.
- Least-privilege credentials: the API's DB user can't run DDL; the importer's can. Separate Meilisearch keys for search (public, read-only) and admin.
- Rotate on any suspected leak.

## Containers (Docker)

- Multi-stage builds; final stage minimal (`node:24-alpine` or distroless), no build tools, no package manager caches.
- Run as non-root (`USER node` / uid ≥ 10000), read-only root filesystem, no shell where possible.
- Pin base images by digest; rebuild weekly for patches. `.dockerignore` excludes `.git`, `.env`, `node_modules`, tests.
- `HEALTHCHECK` defined; `tini` or `--init` for signal handling.

## Kubernetes (k3s)

- Namespaces labeled `pod-security.kubernetes.io/enforce: restricted`.
- Every pod: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`.
- Resource `requests` and `limits` on every container. Liveness/readiness probes on every Deployment.
- NetworkPolicies: default deny; only ingress → web/api; only api/worker/importer → postgres/meili/valkey.
- `automountServiceAccountToken: false` unless needed. RBAC minimal. No `latest` tags.
- Keep k3s and the host OS patched; SSH by key only, firewall allows 80/443 (+ SSH from known IPs).

## Privacy

- Collect the minimum: aggregated download counts, privacy-friendly analytics (no cookies, no cross-site tracking). No third-party trackers or ad scripts.
- No personal data in logs. If accounts exist: data export and deletion on request (GDPR).
