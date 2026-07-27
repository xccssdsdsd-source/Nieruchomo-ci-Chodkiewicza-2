# PRODUCTION SETUP PROMPT

Copy the prompt below into Codex or Claude Code opened in a fresh copy of this
folder. Fill only the non-secret inputs. Never paste credentials into the chat.

---

You are preparing a production deployment of the Admin Panel Starter Kit in
this folder. It uses Cloudflare Workers, Hono, Drizzle, Better Auth, Neon
Postgres, R2, and locally compiled Tailwind CSS.

Read `README.md`, `CLAUDE.md`, and every file in `docs/` before changing code.
Treat `docs/07-SECURITY.md` and `docs/08-ENTERPRISE-OPERATIONS.md` as mandatory
release gates.

## Non-secret inputs

- **PROJECT_NAME**: `` (lowercase letters, numbers and dashes only)
- **MODULES**: `properties, posts, reviews, chatbot`
- **ENABLE_CHATBOT_AI**: `yes | no`
- **PUBLIC_SITE_ORIGIN**: `` (exact HTTPS origin allowed to call the public API)
- **PANEL_ORIGIN**: `` (exact HTTPS custom-domain origin for the panel)
- **HYPERDRIVE_ID**: `` (non-secret Cloudflare resource ID)

Ask only for blank non-secret inputs. Do not ask for or accept a database
connection string, password, auth secret, API token, recovery code, private
document, or cookie in chat.

## Non-negotiable safety rules

1. Never print, echo, log, summarize, or paste secret values. Never place them
   in a command line, source file, patch, prompt, issue, commit, or tool call.
2. The user enters secrets locally and interactively. If `.env` or `.dev.vars`
   is missing, pause and ask the user to copy the corresponding `.example`
   file and fill it in their editor. Do not ask them to send its contents.
3. You may check that required variables exist and meet length/format rules,
   but output only variable names and pass/fail status.
4. Before every operation that writes to Cloudflare, Neon, R2, GitHub, DNS, or
   a production database, state the exact non-secret target and ask for
   explicit confirmation immediately before running it.
5. `wrangler secret put` creates and deploys a Worker version. Treat it as a
   deployment, not as a harmless configuration command.
6. Never weaken authentication, authorization, CSRF, CSP, upload validation,
   rate limiting, input bounds, or security tests to make setup pass.
7. Do not deploy from a dirty or unreviewed worktree. Do not bypass failing
   security checks.

## Required workflow

1. Inspect the repository and run `npm ci`. Confirm `.env`, `.dev.vars`,
   `.wrangler/`, `dist/`, and `node_modules/` are ignored. Search tracked files
   and history for accidental secrets without displaying candidate values.
   Stop and request rotation if exposure is suspected.

2. Remove omitted modules using `docs/05-ADD-MODULE.md` in reverse: module
   route, schema, migration, UI and tests must all remain consistent. Do not
   remove `reviews` unless MODULES explicitly omits it.

3. Customize branding only through `src/styles.css` and safe static assets.
   Do not add runtime CSS/JavaScript CDNs, remote fonts, inline event handlers,
   `eval`, or a broader CSP. Run `npm run build:css` after UI changes.

4. Configure only non-secret deployment identifiers:
   - Worker name = PROJECT_NAME
   - R2 bucket = `PROJECT_NAME-images`
   - Hyperdrive binding ID = HYPERDRIVE_ID
   - keep both rate-limiting bindings enabled
   - enable the Workers AI binding only when ENABLE_CHATBOT_AI is `yes`
   - restrict `/api/public/*` CORS to PUBLIC_SITE_ORIGIN

5. Require the user to create a dedicated Neon branch/database role,
   Hyperdrive configuration and private R2 bucket outside the chat. Each
   client must have separate credentials and resources. The supplied
   HYPERDRIVE_ID is not a secret; database credentials are.

6. Require the user to set these Worker secrets interactively without sending
   their values:
   - `BETTER_AUTH_SECRET` — unique random 32+ byte value
   - `APP_ORIGIN` — exact PANEL_ORIGIN
   - `ADMIN_EMAIL` — exact seeded administrator email
   - `PUBLIC_SITE_ORIGIN` — exact PUBLIC_SITE_ORIGIN input

   Never add `ADMIN_PASSWORD` or `DATABASE_URL` to Worker runtime secrets.
   They belong only in the local, ignored `.env` used for migration/seeding.

7. Run, in this order:
   - `npm run security:audit`
   - `npx wrangler types`
   - `npm run typecheck`
   - `npx wrangler deploy --dry-run --outdir=dist`

   Re-run the relevant checks after every correction. Report failures without
   exposing request bodies, environment values, headers, or tokens.

8. Ask for confirmation before database writes. Only after confirmation run
   `npm run db:migrate`, then `npm run seed:admin`. The seed script reads the
   local `.env`; never put credentials in command arguments.

9. Stop for the enterprise perimeter gate. Production approval requires:
   - a custom panel domain with HTTPS,
   - Cloudflare Access in front of admin UI and non-public admin APIs,
   - an identity-provider policy requiring MFA,
   - explicit bypass/public handling only for `/api/public/*`,
     `/api/images/*` and `/api/health`,
   - `workers.dev` disabled after the custom domain is verified,
   - WAF/bot controls and alerting appropriate to the client's risk,
   - tested Neon backup/restore and named owners for incident response.

10. Show a deployment summary containing no secrets. Ask for final explicit
    production deployment approval. Only then run `npm run deploy`.

11. After deployment, run the non-destructive smoke/DAST checklist from
    `docs/07-SECURITY.md`: public health, 401 without session, 403 for a
    non-allowlisted account in a controlled test, cross-origin CSRF rejection,
    cookie flags, CSP, active-upload rejection, CORS allowlist, 429 behavior,
    and deletion of replaced R2 objects. Do not claim success for checks that
    were not actually executed.

## Completion report

Report:

- deployed commit and Worker version ID,
- custom panel URL,
- enabled modules and AI status,
- checks executed and their results,
- Access/MFA, WAF, logging, backup and restore-test status,
- remaining risks and manual actions.

Never include credentials, secret values, cookies, private URLs containing
tokens, or client data in the report.

---

This prompt reduces avoidable deployment risk; it does not create a guarantee
of perfect security. A high-value deployment still needs independent review,
continuous monitoring, patching, incident response and periodic penetration
testing.
