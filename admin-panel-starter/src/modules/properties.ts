import { Hono } from 'hono';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { properties } from '../db/schema';
import { createCrudRouter } from '../lib/crud';
import type { AppEnv } from '../lib/context';
import { scheduleStoredObjectDeletion } from '../lib/storage';

const statusValues = ['dostepna', 'zarezerwowana', 'sprzedana'] as const;

const parseJsonArray = (value: unknown): string[] => {
	if (typeof value !== 'string' || !value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
	} catch {
		return [];
	}
};
const serialize = (row: Record<string, unknown>) => ({
	...row,
	imageUrls: parseJsonArray(row.imageUrls),
	videoUrls: parseJsonArray(row.videoUrls),
	highlights: parseJsonArray(row.highlights),
});

const createSchema = z.object({
	title: z.string().trim().min(1, 'Tytuł jest wymagany.').max(200),
	price: z.number().int().positive('Cena musi być liczbą dodatnią.').max(2_147_483_647),
	description: z.string().max(20_000).optional(),
	status: z.enum(statusValues).optional(),
	imageUrls: z.array(z.string().regex(/^\/api\/images\/[a-zA-Z0-9_./-]+$/).max(500)).max(50).optional(),
	videoUrls: z.array(z.url().refine((url) => url.startsWith('https://'), 'Wymagany HTTPS.')).max(20).optional(),
	highlights: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
});
const updateSchema = createSchema.partial();
type Create = z.infer<typeof createSchema>;
type Update = z.infer<typeof updateSchema>;

export const propertiesAdmin = createCrudRouter<Create, Update>({
	table: properties,
	createSchema,
	updateSchema,
	orderBy: properties.createdAt,
	serialize,
	toInsert: (input) => ({
		title: input.title,
		price: input.price,
		description: input.description,
		status: input.status ?? 'dostepna',
		imageUrls: input.imageUrls ? JSON.stringify(input.imageUrls) : undefined,
		videoUrls: input.videoUrls ? JSON.stringify(input.videoUrls) : undefined,
		highlights: input.highlights ? JSON.stringify(input.highlights) : undefined,
	}),
	toUpdate: (input) => {
		const { imageUrls, videoUrls, highlights, ...rest } = input;
		return {
			...rest,
			...(imageUrls !== undefined ? { imageUrls: JSON.stringify(imageUrls) } : {}),
			...(videoUrls !== undefined ? { videoUrls: JSON.stringify(videoUrls) } : {}),
			...(highlights !== undefined ? { highlights: JSON.stringify(highlights) } : {}),
		};
	},
	afterUpdate: (c, previous, updated) => {
		const next = new Set(parseJsonArray(updated.imageUrls));
		scheduleStoredObjectDeletion(
			c,
			parseJsonArray(previous.imageUrls).filter((url) => !next.has(url)),
		);
	},
	afterDelete: (c, deleted) => {
		scheduleStoredObjectDeletion(c, parseJsonArray(deleted.imageUrls));
	},
	notFound: 'Nie znaleziono nieruchomości.',
});

// Public, unauthenticated read endpoint for the live website.
export const propertiesPublic = new Hono<AppEnv>();
propertiesPublic.get('/', async (c) => {
	const db = c.get('db');
	const rows = await db.select().from(properties).orderBy(desc(properties.createdAt));
	return c.json(rows.map(serialize));
});
