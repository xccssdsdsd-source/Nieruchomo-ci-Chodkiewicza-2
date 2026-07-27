import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { posts } from '../db/schema';
import { createCrudRouter, slugify } from '../lib/crud';
import type { AppEnv } from '../lib/context';
import { scheduleStoredObjectDeletion } from '../lib/storage';

const createSchema = z.object({
	title: z.string().trim().min(1, 'Tytuł jest wymagany.').max(200),
	slug: z.string().trim().min(1).max(200).optional(),
	excerpt: z.string().max(500).optional(),
	content: z.string().min(1, 'Treść jest wymagana.').max(100_000),
	coverImageUrl: z.string().regex(/^\/api\/images\/[a-zA-Z0-9_./-]+$/).max(500).optional(),
	published: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
type Create = z.infer<typeof createSchema>;
type Update = z.infer<typeof updateSchema>;

export const postsAdmin = createCrudRouter<Create, Update>({
	table: posts,
	createSchema,
	updateSchema,
	orderBy: posts.createdAt,
	toInsert: (input) => ({
		title: input.title,
		slug: input.slug ? slugify(input.slug) : slugify(input.title),
		excerpt: input.excerpt,
		content: input.content,
		coverImageUrl: input.coverImageUrl,
		published: input.published ?? true,
		updatedAt: new Date(),
	}),
	toUpdate: (input) => {
		const { slug, ...rest } = input;
		return { ...rest, ...(slug !== undefined ? { slug: slugify(slug) } : {}), updatedAt: new Date() };
	},
	afterUpdate: (c, previous, updated) => {
		if (previous.coverImageUrl !== updated.coverImageUrl) {
			scheduleStoredObjectDeletion(c, [previous.coverImageUrl]);
		}
	},
	afterDelete: (c, deleted) => {
		scheduleStoredObjectDeletion(c, [deleted.coverImageUrl]);
	},
	notFound: 'Nie znaleziono wpisu.',
});

// Public endpoint — only published posts, safe to expose to the live website.
export const postsPublic = new Hono<AppEnv>();
postsPublic.get('/', async (c) => {
	const db = c.get('db');
	const rows = await db.select().from(posts).where(eq(posts.published, true)).orderBy(desc(posts.createdAt));
	return c.json(rows);
});
