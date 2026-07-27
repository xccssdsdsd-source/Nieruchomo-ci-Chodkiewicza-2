# 01 · Architecture

One Cloudflare Worker serves both the admin UI (static HTML) and the JSON API. The API talks to
Neon Postgres through Hyperdrive and stores files in R2.

```
Browser (admin.html)                         Live website (Next.js / HTML)
        │  fetch /api/* (cookie session)             │  fetch /api/public/*
        ▼                                            ▼
┌─────────────────────────── Cloudflare Worker (src/index.ts) ───────────────────────────┐
│  static assets  ·  /api/login · /api/logout · /api/me · /api/uploads · /api/images/*    │
│  admin modules (auth):        /api/properties  /api/posts  /api/chatbot                  │
│  public modules (no auth):    /api/public/properties  /api/public/posts  /api/public/... │
└─────────────┬───────────────────────────────────────────────────────┬───────────────────┘
              │ Hyperdrive binding                                      │ R2 binding
              ▼                                                         ▼
        Neon Postgres (one branch per client)                    R2 bucket (images/files)
```

## Request lifecycle

Every `/api/*` request passes through two parent middlewares in `src/index.ts`:

1. **Cache control** — adds `Cache-Control: no-store` to all API responses except images.
2. **Attach** — creates a per-request Drizzle client (`createDb`) and Better Auth instance
   (`createAuth`) and stores them on the context (`c.get('db')`, `c.get('auth')`).

Then routing dispatches to a handler or a mounted sub-app.

## Auth model

- Better Auth, email + password, **sign-up disabled** (`src/auth.ts`). The single admin is created
  out-of-band by `scripts/seed-admin.ts`.
- `requireAuth` (`src/lib/context.ts`) reads the session cookie and 401s if absent. It is applied as
  the **first middleware inside every protected sub-app**, so it guards every route in that app
  regardless of mount path — including list endpoints (which would otherwise leak drafts).
- Public routers (`*Public`) have no guard and only ever return safe, published data.

## Modules

A module = a table (in `src/db/schema.ts`) + a file in `src/modules/` that exports an **admin**
router and (optionally) a **public** router, both registered in `src/index.ts`.

- `src/lib/crud.ts` — `createCrudRouter()` turns a table + two Zod schemas + small mappers into a
  full authenticated REST router (`GET / · GET /:id · POST / · PATCH /:id · DELETE /:id`). Most
  modules are just a call to this factory. See `properties.ts` / `posts.ts`.
- `chatbot.ts` shows a non-CRUD module: a singleton config row, a CRUD sub-router for the knowledge
  base, and a chat endpoint backed by Workers AI.

## Why these choices

- **Hyperdrive, not a direct Neon URL at runtime** — Workers can't hold a normal TCP pool; Hyperdrive
  pools and caches connections at the edge. The raw Neon URL is only used by tooling (migrations,
  seeding) that runs on your machine.
- **One Neon branch per client** — isolation and zero cross-talk; branches are cheap.
- **Static frontend** — `admin.html` uses locally compiled `admin.css`; run `npm run build:css`
  after UI/style changes.

## Files you edit most

| Task | File(s) |
|------|---------|
| Add/remove a content type | `src/db/schema.ts`, `src/modules/*.ts`, `src/index.ts`, `public/admin.html` |
| Change auth/session rules | `src/auth.ts`, `src/lib/context.ts` |
| Change the panel UI | `public/admin.html` |
| Bindings (DB, R2, AI) | `wrangler.jsonc` (+ `wrangler types`) |
