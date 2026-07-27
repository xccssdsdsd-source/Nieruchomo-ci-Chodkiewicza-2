import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { eq, desc, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { requireAuth, type AppEnv } from './context';

// Generic admin CRUD router factory.
//
// Every content module (properties, posts, ...) is just a table + two Zod
// schemas + a few small mappers. This factory turns that into a fully
// authenticated REST router: GET / , GET /:id , POST / , PATCH /:id , DELETE /:id.
//
// To add a new module you almost never touch this file — see docs/05-ADD-MODULE.md.
type IdTable = PgTable & { id: PgColumn };
const idSchema = z.string().uuid();

export type CrudConfig<TCreate, TUpdate> = {
	table: IdTable;
	createSchema: z.ZodType<TCreate>;
	updateSchema: z.ZodType<TUpdate>;
	// Column the list is ordered by (defaults to descending). Usually createdAt.
	orderBy?: PgColumn;
	// DB row -> JSON shape returned to the client (e.g. parse a JSON column).
	serialize?: (row: Record<string, unknown>) => unknown;
	// Validated create input -> values passed to `.insert()`.
	toInsert?: (input: TCreate) => Record<string, unknown>;
	// Validated update input -> values passed to `.update().set()`.
	toUpdate?: (input: TUpdate) => Record<string, unknown>;
	// Message returned on a missing row.
	notFound?: string;
	// Resource lifecycle hooks. Use these to clean up R2 objects after a
	// database row no longer references them.
	afterUpdate?: (
		c: Context<AppEnv>,
		previous: Record<string, unknown>,
		updated: Record<string, unknown>,
	) => void | Promise<void>;
	afterDelete?: (c: Context<AppEnv>, deleted: Record<string, unknown>) => void | Promise<void>;
};

export const createCrudRouter = <TCreate, TUpdate>(config: CrudConfig<TCreate, TUpdate>) => {
	const {
		table,
		createSchema,
		updateSchema,
		orderBy,
		serialize = (row) => row,
		toInsert = (input) => input as Record<string, unknown>,
		toUpdate = (input) => input as Record<string, unknown>,
		notFound = 'Nie znaleziono elementu.',
		afterUpdate,
		afterDelete,
	} = config;

	const router = new Hono<AppEnv>();
	router.use('*', requireAuth);
	router.use(
		'*',
		bodyLimit({
			maxSize: 256 * 1024,
			onError: (c) => c.json({ error: 'Żądanie przekracza dozwolony rozmiar.' }, 413),
		}),
	);

	const order: SQL = orderBy ? desc(orderBy) : desc(table.id);

	router.get('/', async (c) => {
		const db = c.get('db');
		const rows = await db.select().from(table).orderBy(order);
		return c.json(rows.map(serialize));
	});

	router.get('/:id', async (c) => {
		const id = idSchema.safeParse(c.req.param('id'));
		if (!id.success) return c.json({ error: 'Nieprawidłowy identyfikator.' }, 400);
		const db = c.get('db');
		const [row] = await db.select().from(table).where(eq(table.id, id.data));
		if (!row) return c.json({ error: notFound }, 404);
		return c.json(serialize(row));
	});

	router.post('/', async (c) => {
		const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
		const db = c.get('db');
		const [row] = await db.insert(table).values(toInsert(parsed.data)).returning();
		return c.json(serialize(row), 201);
	});

	router.patch('/:id', async (c) => {
		const id = idSchema.safeParse(c.req.param('id'));
		if (!id.success) return c.json({ error: 'Nieprawidłowy identyfikator.' }, 400);
		const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
		const values = toUpdate(parsed.data);
		if (Object.keys(values).length === 0) return c.json({ error: 'Brak pól do aktualizacji.' }, 400);
		const db = c.get('db');
		const [previous] = afterUpdate
			? await db.select().from(table).where(eq(table.id, id.data))
			: [undefined];
		if (afterUpdate && !previous) return c.json({ error: notFound }, 404);
		const [row] = await db.update(table).set(values).where(eq(table.id, id.data)).returning();
		if (!row) return c.json({ error: notFound }, 404);
		if (afterUpdate && previous) {
			await afterUpdate(c, previous as Record<string, unknown>, row as Record<string, unknown>);
		}
		return c.json(serialize(row));
	});

	router.delete('/:id', async (c) => {
		const id = idSchema.safeParse(c.req.param('id'));
		if (!id.success) return c.json({ error: 'Nieprawidłowy identyfikator.' }, 400);
		const db = c.get('db');
		const [row] = await db.delete(table).where(eq(table.id, id.data)).returning();
		if (!row) return c.json({ error: notFound }, 404);
		if (afterDelete) await afterDelete(c, row as Record<string, unknown>);
		return c.json({ ok: true });
	});

	return router;
};

// Shared slug helper — used by any module with a URL slug (posts, pages, ...).
export const slugify = (value: string): string =>
	value
		.toLowerCase()
		.normalize('NFD')
		.replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '') || crypto.randomUUID();
