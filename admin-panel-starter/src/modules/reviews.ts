import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { reviews } from '../db/schema';
import { createCrudRouter } from '../lib/crud';
import type { AppEnv } from '../lib/context';

const createSchema = z.object({
	authorName: z.string().trim().min(1, 'Imię i nazwisko jest wymagane.').max(200),
	rating: z.number().int('Ocena musi być liczbą całkowitą.').min(1, 'Ocena min. 1.').max(5, 'Ocena maks. 5.'),
	content: z.string().trim().min(1, 'Treść opinii jest wymagana.').max(5000),
	published: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
type Create = z.infer<typeof createSchema>;
type Update = z.infer<typeof updateSchema>;

export const reviewsAdmin = createCrudRouter<Create, Update>({
	table: reviews,
	createSchema,
	updateSchema,
	orderBy: reviews.createdAt,
	toInsert: (input) => ({
		authorName: input.authorName,
		rating: input.rating,
		content: input.content,
		published: input.published ?? true,
	}),
	toUpdate: (input) => ({ ...input }),
	notFound: 'Nie znaleziono opinii.',
});

// Public endpoint — only published reviews, safe to expose to the live website.
export const reviewsPublic = new Hono<AppEnv>();
reviewsPublic.get('/', async (c) => {
	const db = c.get('db');
	const rows = await db.select().from(reviews).where(eq(reviews.published, true)).orderBy(desc(reviews.createdAt));
	return c.json(rows);
});
