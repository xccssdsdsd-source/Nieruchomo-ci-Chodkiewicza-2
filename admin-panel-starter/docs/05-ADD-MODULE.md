# 05 · Add (or remove) a content module

A module is one table + one file in `src/modules/` + a tab in `admin.html`. Adding a simple CRUD
module takes ~4 edits. Worked example below adds a **Services** module (`services`: title, price,
description).

## 1. Add the table — `src/db/schema.ts`

```ts
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  price: integer('price'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
export type Service = typeof services.$inferSelect
```

## 2. Add the module — `src/modules/services.ts`

For anything that's a plain list of records, `createCrudRouter` is all you need:

```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { services } from '../db/schema'
import { createCrudRouter } from '../lib/crud'
import type { AppEnv } from '../lib/context'

const createSchema = z.object({
  title: z.string().min(1, 'Tytuł jest wymagany.'),
  price: z.number().int().positive().optional(),
  description: z.string().optional(),
})
const updateSchema = createSchema.partial()
type Create = z.infer<typeof createSchema>
type Update = z.infer<typeof updateSchema>

export const servicesAdmin = createCrudRouter<Create, Update>({
  table: services,
  createSchema,
  updateSchema,
  orderBy: services.createdAt,
  notFound: 'Nie znaleziono usługi.',
})

export const servicesPublic = new Hono<AppEnv>()
servicesPublic.get('/', async (c) => {
  const db = c.get('db')
  return c.json(await db.select().from(services).orderBy(desc(services.createdAt)))
})
```

`createCrudRouter` options: `table`, `createSchema`, `updateSchema`, and optionally `orderBy`,
`serialize` (row → JSON, e.g. parse a JSON column), `toInsert` (input → insert values),
`toUpdate` (input → update values), `notFound`. See `src/modules/properties.ts` for a version that
serializes a JSON `imageUrls` column.

## 3. Register it — `src/index.ts`

```ts
import { servicesAdmin, servicesPublic } from './modules/services'
// ...with the other public routes:
app.route('/api/public/services', servicesPublic)
// ...with the other admin routes:
app.route('/api/services', servicesAdmin)
```

## 4. Generate the migration + typecheck

```bash
npm run db:generate   # creates a new drizzle/NNNN_*.sql
npm run typecheck
npm run db:migrate    # apply to the branch
```

## 5. Add the panel UI — `public/admin.html`

Three small edits, mirroring the existing Blog module:

1. **Tab button** in the `<nav role="tablist">`:
   ```html
   <button data-tab="services" class="tab-btn px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150" role="tab">Usługi</button>
   ```
2. **Panel section** next to the others:
   ```html
   <section id="tab-services" class="tab-panel hidden"></section>
   ```
3. **State + wiring** in the `<script>`: add `services: []` to `state`, add
   `const loadServices = async () => { state.services = await api('/api/services') }` to
   `refreshAll()`'s `Promise.all`, add `if (activeTab === 'services') renderServices()` to `render()`,
   and write a `renderServices()` that lists `state.services` and posts to `/api/services`. Copy the
   Blog functions (`renderBlog`, `renderPostForm`, `renderPostCard`, `renderPostEditForm`) and rename.

That's it — the new tab is live after `npm run deploy`.

## Removing a module

Reverse of the above: delete `src/modules/X.ts`, its two `app.route(...)` lines in `src/index.ts`,
its table(s) in `src/db/schema.ts`, and its tab + section + render code in `public/admin.html`. Then
`npm run db:generate` (drops the table), `npm run typecheck`, `npm run db:migrate`.

## Non-CRUD modules

If a module isn't a flat list (singletons, nested resources, external calls), build the Hono router by
hand instead of `createCrudRouter` — see `src/modules/chatbot.ts` for a full example (singleton config
row + nested documents CRUD + an AI endpoint).
