# 07 · Security model

These are **production sites for real clients**, so this document is written to be read, not skimmed.
It states plainly what is protected, what is not, and what you must configure before go-live.

## Threat model in one paragraph

The admin panel holds credentials for exactly one trusted user (the client / site owner). The main
risks are: (1) someone else guessing or stealing that login, (2) an attacker using the public,
unauthenticated endpoints (`/api/public/*`) to attack visitors, run up AI costs, or pivot into the
admin session via XSS, and (3) a compromised or careless upload turning into stored XSS on the panel's
own origin. Everything below is organized around those three.

## 1. Authentication

- Better Auth, email + password. **Sign-up is disabled** (`src/auth.ts`) — the only account is created
  out-of-band by `scripts/seed-admin.ts`, run once with credentials you choose. There is no
  self-registration endpoint to find or abuse.
- `minPasswordLength: 16`. Use a generated unique value stored in an approved password manager.
- **Two layers of rate limiting on login**: Better Auth's own limiter (`src/auth.ts`) plus the
  required Cloudflare Rate Limiting binding (`LOGIN_RATE_LIMITER` in `wrangler.jsonc`). The login
  handler fails closed with 503 if the binding is absent.
- Session cookies: `Secure` flag is forced whenever served over HTTPS (every real deployment;
  `wrangler dev` on plain `http://localhost` is the only exception, so local dev still works).
  `trustedOrigins` is pinned to the deployment's required `APP_ORIGIN` secret, never derived from the
  request Host header.
- Sessions last 8 hours and refresh after one hour of activity. Cloudflare Access applies an
  additional independently managed session at the perimeter.
- **Losing the password**: there is no self-service reset flow (this is intentional — it's one extra
  endpoint an attacker could target). To reset, delete the user's rows in `user`/`account` and re-run
  `npm run seed:admin`.

## 2. Authorization

- `requireAuth` (`src/lib/context.ts`) is applied as the **first middleware inside every protected
  router**, not bolted on per-route. That means it's structurally impossible to add a new admin route
  and forget the guard — see `docs/05-ADD-MODULE.md`. Verified in this repo: `properties`, `posts`,
  `reviews`, and `chatbot` (config + documents + test-chat) all require a session; only `*Public`
  routers don't.
- A valid Better Auth session is not sufficient by itself: `requireAuth` also compares the session
  email to the required `ADMIN_EMAIL` runtime allowlist. A stray account therefore receives 403.
- The only things exposed without auth are: published blog posts, published reviews only (the
  `reviews` public router filters on `published = true` server-side — hiding a review from the admin
  panel actually hides it, it never leaks through the public endpoint), all property listings (by
  design — these are meant to be public), the chatbot's name/greeting/enabled flag, and the chat
  endpoint itself. No draft content, no config internals (system prompt, model, temperature are **not**
  in the public config response), no admin data ever crosses that line.
- `reviews.rating` is validated server-side with `z.number().int().min(1).max(5)` in
  `src/modules/reviews.ts` — the star-picker UI is a convenience, not the enforcement point; a crafted
  request with `rating: 999` or `rating: 2.5` is rejected with 400 before it ever reaches the DB.

## 3. Uploads — the highest-risk surface, and why it's handled the way it is

Uploaded files are served back from the **same origin** as the admin panel (`/api/images/*`). If an
attacker could get a file served as `text/html` or `image/svg+xml` from that origin, it would run as a
same-origin page and could steal the admin's session cookie — a classic stored-XSS-via-upload. This
kit closes that specific hole:

- `src/lib/uploads.ts` **never trusts the client-declared `Content-Type` or filename extension.** It
  reads the file's actual bytes and matches them against known magic numbers for JPEG/PNG/GIF/WEBP/PDF.
  Anything else — including a `.png`-named file that is actually HTML/SVG/JS — is rejected with 415.
- Files are capped at 15 MB (`MAX_UPLOAD_BYTES`).
- Filenames are sanitized to a safe character set before being used in the storage key
  (`sanitizeFileName`).
- Served responses always send `X-Content-Type-Options: nosniff`; validated images may render
  publicly inline, while PDFs and unknown legacy types require the configured administrator session.
  PDFs use `Content-Disposition: attachment`. An additional sandboxed CSP is attached to file responses
  with the **server-assigned** content type — never the client's claim — so even a browser bug in MIME
  sniffing has nothing to seize on.
- Uploads require a session (`requireAuth` on `/api/uploads`); only the logged-in admin can upload.
- Replacing or deleting a property image, post cover or chatbot attachment schedules deletion of the
  old R2 object through `src/lib/storage.ts`. Because Postgres and R2 cannot share an atomic
  transaction, production operations must monitor cleanup errors and periodically reconcile
  unreferenced objects.

**If you need to accept more file kinds** (e.g. `.docx`), add a signature check to
`src/lib/uploads.ts` — do not just widen a MIME allowlist without one, since that's exactly the
bypass this defends against.

## 4. Cross-site request/response risks

- **CORS** on `/api/public/*` is fail-closed and reflects only the exact required
  `PUBLIC_SITE_ORIGIN`. Public data remains fetchable outside browsers, so CORS is not an
  authorization mechanism; it primarily prevents other websites from making browser-based chatbot
  requests against the client's quota.
- **CSRF**: Hono's CSRF middleware verifies `Origin`/Fetch Metadata on form-capable unsafe requests,
  Better Auth verifies its own origin, cookies are `SameSite=Lax`, and admin routes expose no CORS.
- **Clickjacking**: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on both the Worker
  (`secureHeaders()` in `src/index.ts`) and the static files (`public/_headers`) — the login page
  cannot be framed.

## 5. Rate limiting — required before go-live

Two bindings are enabled in `wrangler.jsonc`:

```jsonc
"ratelimits": [
  { "name": "LOGIN_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 5, "period": 60 } },
  { "name": "CHAT_RATE_LIMITER", "namespace_id": "1002", "simple": { "limit": 20, "period": 60 } }
]
```

- `LOGIN_RATE_LIMITER` — edge-level brute-force protection on `/api/login`, in front of Better Auth's
  own limiter.
- `CHAT_RATE_LIMITER` — protects the public, unauthenticated `/api/public/chatbot/chat` endpoint. This
  matters because Workers AI is billed per request; without this, anyone can script requests against
  it and run up the client's bill.

Without these bindings the sensitive handlers return 503. This is intentionally fail-closed.

## 6. Headers & CSP — what's covered and what isn't

`secureHeaders()` in `src/index.ts` covers everything served **through the Worker** (`/api/*`).
`public/_headers` covers everything served **as a static asset** (`admin.html`, `index.html`) — these
are two different code paths in Cloudflare and the Worker middleware does not reach static files.
**Keep both in sync** if you change what `admin.html` loads.

The UI uses locally compiled `public/admin.css`; it has no runtime Tailwind CDN or remote fonts.
Inline scripts are permitted only by exact SHA-256 hashes in `public/_headers`, and
`script-src-attr 'none'` blocks injected event handlers. A regression test recomputes these hashes.
Neither `script-src` nor `style-src` allows `'unsafe-inline'`. Output encoding is still required:

- `escapeHtml()` — every piece of user/DB-sourced text rendered into the DOM in `admin.html` goes
  through this.
- `safeUrl()` — every image/file URL is restricted to this origin's `/api/images/` namespace and
  escaped; external, `javascript:` and `data:` URLs are stripped.

## 7. Data & secrets

- All DB access goes through Drizzle's query builder — no raw/interpolated SQL exists anywhere in this
  repo (verified: no `sql\`...\`` usage). SQL injection is not a realistic risk here as long as that
  stays true; if you ever add a raw query, parameterize it.
- Runtime configuration (`BETTER_AUTH_SECRET`, `APP_ORIGIN`, `ADMIN_EMAIL`, `PUBLIC_SITE_ORIGIN`) is set with
  `wrangler secret put`. `ADMIN_PASSWORD` exists only in local `.env` for the seed script and must
  never be added to the Worker.
- `.env`, `.dev.vars`, and any `*.env*` variant are gitignored (`.gitignore`). Never commit them. If
  one is ever committed, rotate `BETTER_AUTH_SECRET` and the admin password immediately — a leaked
  auth secret invalidates all session-signing guarantees.
- One Neon **branch per client** — a compromise or bug in one client's deployment cannot read another
  client's data, because there is no shared database.

## 8. Chatbot-specific risks

**A system prompt is not a secret or a security boundary.** A public user can use prompt injection to
try to reproduce the system prompt or any knowledge-base text supplied to the model. No instruction
inside the prompt can reliably prevent this. Therefore:

- The chatbot is disabled by default.
- Never put passwords, tokens, personal data, private contracts, internal instructions, or any other
  non-public material in the system prompt or knowledge documents.
- The public API accepts only `role: "user"` messages, with bounded message/count sizes, but this
  reduces role spoofing; it does not make prompt injection impossible.
- There is no tool/function calling or network/file access. Keep it that way unless a new security
  review introduces explicit authorization and output controls.
- See `docs/06-CHATBOT-MODULE.md` for the abuse-cost angle (rate limiting) and file-parsing caveats.

## Go-live checklist

- [ ] `BETTER_AUTH_SECRET` is a real random 32+ byte value, set via `wrangler secret put`, not reused
      across clients.
- [ ] `APP_ORIGIN`, `ADMIN_EMAIL` and `PUBLIC_SITE_ORIGIN` exactly match the approved production
      values and are configured on the Worker.
- [ ] Admin password is 16+ generated characters, stored in a password manager, not reused.
- [ ] `LOGIN_RATE_LIMITER` and `CHAT_RATE_LIMITER` are present and deployed.
- [ ] CORS permits the configured site and omits `Access-Control-Allow-Origin` for an untrusted site.
- [ ] `.env` / `.dev.vars` were never committed (`git status` / `git log -p -- .env` clean).
- [ ] You've read §8 and confirmed every chatbot prompt/document is safe to disclose publicly.
- [ ] `npm run security:audit` is clean and `npx wrangler deploy --dry-run` succeeds before every deploy.
- [ ] Custom panel domain, Cloudflare Access with IdP MFA, least-privilege roles, alerting and tested
      backup/restore satisfy `docs/08-ENTERPRISE-OPERATIONS.md`.
- [ ] Post-deploy negative tests verify unauthenticated 401, wrong-admin 403, CSRF rejection, cookie
      flags, CSP, active upload rejection, CORS rejection and rate-limit behavior.

## Reporting / extending

This is a starter kit, not a managed product — there's no vendor to report issues to. If you find a
gap, fix it in this file's corresponding source file and update this document in the same change, so
the threat model and the code never drift apart.
