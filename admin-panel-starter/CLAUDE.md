# CLAUDE.md — Admin Panel Starter Kit

Rules for any coding agent working in this repository. Read `README.md`,
`SETUP_PROMPT.md` and all files in `docs/` before acting.

## Architecture invariants

- One deployment and isolated Neon/Hyperdrive/R2 resources per client.
- Protected routers apply `requireAuth` first and also enforce `ADMIN_EMAIL`.
- Public sign-up stays disabled.
- Only deliberately public, published fields may cross `/api/public/*`.
- Browser CORS on public routes is restricted to `PUBLIC_SITE_ORIGIN`.
- Runtime database access uses only the `HYPERDRIVE` binding.
- Uploads always pass `validateUpload()` magic-byte validation.
- A module storing `/api/images/*` URLs must clean replaced/deleted objects
  through `src/lib/storage.ts`.
- User/DB text rendered with `innerHTML` must pass `escapeHtml()`. URLs must
  also pass `safeUrl()`.
- Do not introduce runtime JavaScript/CSS/font CDNs, inline event handlers,
  `eval`, raw interpolated SQL, broad CORS, or weaker CSP directives.

## Secret handling

- Never ask the user to paste credentials into chat.
- Never print, echo, patch, commit or put secrets in command arguments.
- The user edits ignored `.env`/`.dev.vars` files locally and sets production
  secrets interactively.
- `ADMIN_EMAIL` is a required runtime authorization allowlist.
  `ADMIN_PASSWORD` and `DATABASE_URL` are local migration/seed values only.
- `wrangler secret put` deploys a Worker version and therefore requires
  explicit approval immediately before execution.

## Commands

- `npm run build:css` after UI/style changes.
- `npm run typecheck` after `src/**` changes.
- `npm run db:generate` after schema changes.
- `npm run security:audit` before any deploy.
- `npx wrangler deploy --dry-run --outdir=dist` before production approval.

Database migrations, seeding, Cloudflare resource changes and deployments
require explicit confirmation naming the non-secret target.

## Code style

- TypeScript: tabs, single quotes, semicolons.
- Frontend script: arrow functions, single quotes, no semicolons.
- Keep animations limited to opacity/transform and preserve reduced-motion
  behavior.
- Reuse existing helpers and module patterns before adding abstractions.

## Definition of done

- Compiled CSS is current and no external runtime asset was added.
- Typecheck, unit tests, lint, dependency audit and dry-run all pass.
- Migrations exist for schema changes.
- Auth/upload/public endpoint/header changes include tests and matching
  documentation.
- No secret appears in source, patches, logs or reports.
- Production claims distinguish checks actually executed from manual gates.
