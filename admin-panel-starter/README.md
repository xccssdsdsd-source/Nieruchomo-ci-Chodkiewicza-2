# Admin Panel Starter Kit

A hardened, reusable admin panel and backend for isolated per-client
deployments on Cloudflare Workers, Neon Postgres and R2.

Start with [`SETUP_PROMPT.md`](SETUP_PROMPT.md), but fill only its non-secret
inputs. Credentials must never be pasted into an AI conversation.

## Included

- Better Auth login with public sign-up disabled.
- Server-side administrator allowlist.
- Properties, reviews, blog and optional Workers AI chatbot modules.
- Read-only public API restricted to a configured website origin.
- R2 uploads validated from real file signatures, with replacement/deletion
  cleanup.
- Locally compiled Tailwind CSS; no production CDN JavaScript or remote fonts.
- Strict CSP, CSRF protection, bounded validation and fail-closed rate limits.
- Security tests and GitHub security scanning workflow.

## Architecture

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers + Hono |
| Database | Isolated Neon branch via Hyperdrive |
| ORM/migrations | Drizzle |
| Authentication | Better Auth plus `ADMIN_EMAIL` authorization |
| Files | Private R2 bucket exposed only through validated Worker routes |
| Frontend | Static HTML + locally compiled Tailwind CSS |
| Optional AI | Workers AI with bounded input and required rate limiter |

Every client gets a separate Worker, database credentials, Hyperdrive config,
R2 bucket, auth secret and rate-limit namespaces.

## Local validation

```bash
npm ci
npm run security:audit
npx wrangler deploy --dry-run --outdir=dist
```

`npm run deploy` compiles CSS and type-checks before Wrangler runs.

## Documentation

- [`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md)
- [`docs/02-CLOUDFLARE-NEON-SETUP.md`](docs/02-CLOUDFLARE-NEON-SETUP.md)
- [`docs/03-CONNECT-NEXTJS.md`](docs/03-CONNECT-NEXTJS.md)
- [`docs/04-CONNECT-HTML.md`](docs/04-CONNECT-HTML.md)
- [`docs/05-ADD-MODULE.md`](docs/05-ADD-MODULE.md)
- [`docs/06-CHATBOT-MODULE.md`](docs/06-CHATBOT-MODULE.md)
- [`docs/07-SECURITY.md`](docs/07-SECURITY.md)
- [`docs/08-ENTERPRISE-OPERATIONS.md`](docs/08-ENTERPRISE-OPERATIONS.md)

## Production boundary

The code is one layer of the system. A high-value production deployment also
requires a custom domain, Cloudflare Access with MFA, least-privilege account
roles, WAF/bot controls, monitored logs, tested backups, incident response,
patch management and independent security testing. No starter kit can provide
a guarantee of perfect security.
