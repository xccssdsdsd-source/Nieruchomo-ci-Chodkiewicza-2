# 02 · Cloudflare + Neon setup

Every client uses isolated Cloudflare and Neon resources. Do not reuse a
database role, auth secret, bucket or Worker between clients.

## Secret-safe rule

Never paste the Neon connection string, administrator password, auth secret,
Cloudflare token, cookie or recovery code into an AI chat. Never put a
connection string in a copied command, issue or commit.

The user creates resources and enters credentials locally through the Neon and
Cloudflare dashboards or interactive trusted CLI prompts. Coding agents receive
only non-secret resource names/IDs.

## Bootstrap

1. Create a dedicated Neon branch or project and a least-privilege database
   role. Store the direct connection string in a password manager.
2. Create a Hyperdrive configuration from that connection in a trusted local
   session or dashboard. Give the coding agent only its non-secret ID.
3. Create a private R2 bucket named `PROJECT-images`. Do not enable `r2.dev`
   public access.
4. Replace the Worker, Hyperdrive and R2 placeholders in `wrangler.jsonc`.
   Give each rate-limiter binding a namespace ID unique within the Cloudflare
   account.
5. Copy `.env.example` to `.env` in the editor and fill it locally. Do not send
   its contents to an agent. It contains `DATABASE_URL`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` and `BETTER_AUTH_SECRET`.
6. Copy `.dev.vars.example` to `.dev.vars` for local Worker development.

## Required Worker values

Set these interactively for the target Worker:

- `BETTER_AUTH_SECRET`: unique random value with at least 32 bytes of entropy.
- `APP_ORIGIN`: exact HTTPS custom-domain panel origin.
- `ADMIN_EMAIL`: exact email used by the seed script.
- `PUBLIC_SITE_ORIGIN`: exact HTTPS origin of the client website.

`ADMIN_PASSWORD` and `DATABASE_URL` must not exist in Worker runtime secrets.
Be aware that `wrangler secret put` creates/deploys a Worker version; obtain
production approval first.

## Validate before writes

```bash
npm ci
npm run security:audit
npx wrangler types
npx wrangler deploy --dry-run --outdir=dist
```

Review the dry-run bindings. Placeholder IDs/names are a release blocker.

## Database write gate

After explicit approval for the named Neon branch:

```bash
npm run db:migrate
npm run seed:admin
```

Both commands read ignored local `.env`; credentials must not be added as
command arguments. Record the migration version and verify the backup/restore
procedure before production.

## Production perimeter

Use a custom panel domain and Cloudflare Access with IdP MFA in front of the
admin UI and admin APIs. Keep `/api/public/*`, `/api/images/*` and
`/api/health` deliberately outside that Access application when required by
the public site. Disable `workers.dev` only after the custom domain and Access
policy are verified.

Complete `docs/07-SECURITY.md` and `docs/08-ENTERPRISE-OPERATIONS.md`, obtain
final approval, then deploy:

```bash
npm run deploy
```

Run post-deploy smoke/DAST checks and record the Worker version ID. Do not call
the deployment ready if any required check was skipped.
