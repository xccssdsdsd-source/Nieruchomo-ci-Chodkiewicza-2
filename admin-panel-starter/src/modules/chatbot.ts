import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { chatbotConfig, chatbotDocuments, type ChatbotConfig } from '../db/schema';
import { createCrudRouter } from '../lib/crud';
import { requireAuth, type AppEnv } from '../lib/context';
import { checkRateLimit, rateLimitKey } from '../lib/rate-limit';
import type { Db } from '../db';
import { getAppOrigin } from '../lib/security';
import { scheduleStoredObjectDeletion } from '../lib/storage';

// The chatbot config is a singleton row. Read-or-create it so the panel always
// has something to edit, even on a brand-new database.
const getOrCreateConfig = async (db: Db): Promise<ChatbotConfig> => {
	const [existing] = await db.select().from(chatbotConfig).limit(1);
	if (existing) return existing;
	const [created] = await db.insert(chatbotConfig).values({}).returning();
	return created;
};

// Bounded string lengths everywhere the client (an authenticated admin, but
// still worth capping) writes to the DB — keeps rows small and, for
// systemPrompt/content, keeps the prompt sent to the model bounded so a
// single misconfigured client can't blow up per-request AI cost.
const supportedModels = ['@cf/meta/llama-3.1-8b-instruct'] as const;
const configSchema = z.object({
	name: z.string().min(1).max(80).optional(),
	systemPrompt: z.string().max(8000).optional(),
	greeting: z.string().max(500).optional(),
	model: z.enum(supportedModels).optional(),
	temperature: z.number().min(0).max(2).optional(),
	enabled: z.boolean().optional(),
});

const MAX_CHAT_MESSAGE_LENGTH = 2000;

const adminChatSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant', 'system']),
				content: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
			}),
		)
		.min(1)
		.max(30),
});

const publicChatSchema = z.object({
	messages: z
		.array(z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH) }))
		.min(1)
		.max(10),
});

// Builds the full prompt (system prompt + enabled knowledge base) and calls
// Workers AI. Requires the optional `AI` binding — see docs/06-CHATBOT-MODULE.md.
const runChat = async (c: { env: Env; get: (k: 'db') => Db }, userMessages: { role: string; content: string }[]) => {
	if (!c.env.AI) {
		return { ok: false as const, status: 501 as const, error: 'Workers AI nie jest skonfigurowane. Dodaj binding "AI" w wrangler.jsonc.' };
	}
	const db = c.get('db');
	const config = await getOrCreateConfig(db);
	if (!config.enabled) return { ok: false as const, status: 403 as const, error: 'Chatbot jest wyłączony.' };

	const docs = await db.select().from(chatbotDocuments).where(eq(chatbotDocuments.enabled, true));
	const knowledge = docs
		.map((d) => `# ${d.title}\n${d.content ?? ''}`)
		.join('\n\n')
		.slice(0, 12000);
	const system = `${config.systemPrompt || 'Jesteś pomocnym asystentem.'}${knowledge ? `\n\nBaza wiedzy (odpowiadaj na jej podstawie):\n${knowledge}` : ''}`;

	try {
		const result = (await c.env.AI.run(config.model, {
			messages: [{ role: 'system', content: system }, ...userMessages],
			temperature: config.temperature,
		})) as { response?: string } | string;
		const reply = typeof result === 'string' ? result : (result.response ?? '');
		return { ok: true as const, reply };
	} catch {
		return { ok: false as const, status: 502 as const, error: 'Nie udało się wygenerować odpowiedzi.' };
	}
};

// ---- Admin router (mounted at /api/chatbot, fully authenticated) ----
export const chatbotAdmin = new Hono<AppEnv>();
chatbotAdmin.use('*', requireAuth);
chatbotAdmin.use(
	'*',
	bodyLimit({
		maxSize: 256 * 1024,
		onError: (c) => c.json({ error: 'Żądanie przekracza dozwolony rozmiar.' }, 413),
	}),
);

chatbotAdmin.get('/config', async (c) => c.json(await getOrCreateConfig(c.get('db'))));

chatbotAdmin.put('/config', async (c) => {
	const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
	if (Object.keys(parsed.data).length === 0) return c.json({ error: 'Brak pól do aktualizacji.' }, 400);
	const db = c.get('db');
	const current = await getOrCreateConfig(db);
	const [row] = await db
		.update(chatbotConfig)
		.set({ ...parsed.data, updatedAt: new Date() })
		.where(eq(chatbotConfig.id, current.id))
		.returning();
	return c.json(row);
});

chatbotAdmin.post('/test-chat', async (c) => {
	const parsed = adminChatSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
	const result = await runChat(c, parsed.data.messages);
	if (!result.ok) return c.json({ error: result.error }, result.status);
	return c.json({ reply: result.reply });
});

// Knowledge base documents — standard CRUD via the shared factory.
const docCreate = z.object({
	title: z.string().min(1, 'Tytuł jest wymagany.').max(200),
	content: z.string().max(20000).optional(),
	fileUrl: z.string().regex(/^\/api\/images\/[a-zA-Z0-9_./-]+$/).max(500).optional(),
	fileName: z.string().max(200).optional(),
	enabled: z.boolean().optional(),
});
const docUpdate = docCreate.partial();
type DocCreate = z.infer<typeof docCreate>;
type DocUpdate = z.infer<typeof docUpdate>;

chatbotAdmin.route(
	'/documents',
	createCrudRouter<DocCreate, DocUpdate>({
		table: chatbotDocuments,
		createSchema: docCreate,
		updateSchema: docUpdate,
		orderBy: chatbotDocuments.createdAt,
		toInsert: (input) => ({ ...input, updatedAt: new Date() }),
		toUpdate: (input) => ({ ...input, updatedAt: new Date() }),
		afterUpdate: (c, previous, updated) => {
			if (previous.fileUrl !== updated.fileUrl) {
				scheduleStoredObjectDeletion(c, [previous.fileUrl]);
			}
		},
		afterDelete: (c, deleted) => {
			scheduleStoredObjectDeletion(c, [deleted.fileUrl]);
		},
		notFound: 'Nie znaleziono dokumentu.',
	}),
);

// ---- Public router (mounted at /api/public/chatbot, for the live website) ----
export const chatbotPublic = new Hono<AppEnv>();
chatbotPublic.use(
	'*',
	bodyLimit({
		maxSize: 32 * 1024,
		onError: (c) => c.json({ error: 'Żądanie przekracza dozwolony rozmiar.' }, 413),
	}),
);

chatbotPublic.get('/config', async (c) => {
	const config = await getOrCreateConfig(c.get('db'));
	return c.json({ name: config.name, greeting: config.greeting, enabled: config.enabled });
});

chatbotPublic.post('/chat', async (c) => {
	// Unauthenticated + backed by billable Workers AI — rate limit by IP.
	// Fails closed if CHAT_RATE_LIMITER isn't configured.
	if (!c.env.CHAT_RATE_LIMITER) {
		return c.json({ error: 'Chatbot jest niedostępny: brak wymaganego limitera.' }, 503);
	}
	const allowed = await checkRateLimit(
		c.env.CHAT_RATE_LIMITER,
		rateLimitKey(c, getAppOrigin(c.env, c.req.url)),
	);
	if (!allowed) return c.json({ error: 'Zbyt wiele wiadomości. Spróbuj ponownie za chwilę.' }, 429);

	const parsed = publicChatSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
	const result = await runChat(c, parsed.data.messages);
	if (!result.ok) return c.json({ error: result.error }, result.status);
	return c.json({ reply: result.reply });
});
