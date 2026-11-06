# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:
**Security → Report a vulnerability** on this repository ([direct link](https://github.com/hareeshagunasekara/iconnook/security/advisories/new)).

Include what you found, steps to reproduce, and the impact you expect. We aim to acknowledge reports within 3 days and to share a fix timeline within 10 days.

Areas we especially care about: SVG sanitization bypasses (XSS via icons), injection in search or API parameters, rate-limit bypasses, and anything exposing secrets or infrastructure.

## Supported versions

Only the live site (iconnook.com) and the latest `main` are supported.

## Our practices

See [docs/standards/security.md](docs/standards/security.md) (OWASP Top 10:2025, ASVS 5.0).
