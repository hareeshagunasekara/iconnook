# Engineering Standards

The rules this project is built to. Read the file for the area you're working in **before** writing code; when a rule here conflicts with a convenience, the rule wins unless an ADR (`docs/adr/`) says otherwise.

| File                                     | Read when                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| [code-principles.md](code-principles.md) | Writing or reviewing any code                                                    |
| [architecture.md](architecture.md)       | Adding a package/service, an endpoint, a table, or a dependency between modules  |
| [security.md](security.md)               | Touching input handling, SVG processing, auth, headers, Docker/k8s, dependencies |
| [ui-ux.md](ui-ux.md)                     | Building or changing anything a user sees                                        |
| [performance.md](performance.md)         | Adding pages, client JS, images, queries, or caching                             |
| [testing.md](testing.md)                 | Writing any code (tests ship with it), setting up CI, fixing a bug               |
| [scalability.md](scalability.md)         | Designing endpoints/jobs, caching, k8s manifests, capacity planning, incidents   |
| [workflow.md](workflow.md)               | Committing, opening PRs, testing, releasing                                      |

## Standards we follow (pinned versions)

| Area                  | Standard                                                                                                  | Version / status (checked 2026-11-07)                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web security risks    | [OWASP Top 10](https://owasp.org/Top10/2025/)                                                             | **2025** edition                                                                                       |
| Security requirements | [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)                   | **5.0.0** (May 2025). Target **Level 1** at launch, **Level 2** for anything handling accounts/uploads |
| Accessibility         | [WCAG](https://www.w3.org/TR/WCAG22/)                                                                     | **2.2 AA**. WCAG 3.0 is still a Working Draft — do not target it                                       |
| Accessibility law     | European Accessibility Act                                                                                | Applies since 2025-06-28; WCAG 2.2 AA keeps us aligned                                                 |
| Performance           | [Core Web Vitals](https://web.dev/articles/vitals)                                                        | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75 (our own targets are stricter, see performance.md)           |
| Containers            | [Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/) | **Restricted** profile                                                                                 |
| App config/ops        | [The Twelve-Factor App](https://12factor.net)                                                             | —                                                                                                      |
| API errors            | [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)                                        | —                                                                                                      |
| API description       | OpenAPI                                                                                                   | 3.1                                                                                                    |
| Commits / versions    | [Conventional Commits](https://www.conventionalcommits.org) 1.0, [SemVer](https://semver.org) 2.0         | —                                                                                                      |
| Supply chain          | [SLSA](https://slsa.dev)                                                                                  | Aim for Build L2 (provenance from CI)                                                                  |

When one of these publishes a new version, update this table and the affected file in the same PR.
