import { pgTable, uuid, text, integer, real, timestamp, boolean } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Content modules. Each module owns its own table(s). Add or remove modules
// freely — see docs/05-ADD-MODULE.md. Keep the Better Auth tables at the bottom.
// ---------------------------------------------------------------------------

// Module: properties (real estate listings)
export const properties = pgTable('properties', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	price: integer('price').notNull(),
	description: text('description'),
	status: text('status').notNull().default('dostepna'),
	imageUrls: text('image_urls'),
	videoUrls: text('video_urls'),
	highlights: text('highlights'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

// Module: reviews (client testimonials / opinie)
export const reviews = pgTable('reviews', {
	id: uuid('id').primaryKey().defaultRandom(),
	authorName: text('author_name').notNull(),
	rating: integer('rating').notNull(),
	content: text('content').notNull(),
	published: boolean('published').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

// Module: posts (blog)
export const posts = pgTable('posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	slug: text('slug').notNull().unique(),
	excerpt: text('excerpt'),
	content: text('content').notNull(),
	coverImageUrl: text('cover_image_url'),
	published: boolean('published').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

// Module: chatbot — a single config row + a knowledge base the client can edit.
// The public site reads the config/knowledge to power an AI assistant; the panel
// lets the client tune the prompt, personality and knowledge without a developer.
export const chatbotConfig = pgTable('chatbot_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().default('Asystent'),
	systemPrompt: text('system_prompt').notNull().default(''),
	greeting: text('greeting').notNull().default('Cześć! W czym mogę pomóc?'),
	model: text('model').notNull().default('@cf/meta/llama-3.1-8b-instruct'),
	temperature: real('temperature').notNull().default(0.7),
	enabled: boolean('enabled').notNull().default(false),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChatbotConfig = typeof chatbotConfig.$inferSelect;

export const chatbotDocuments = pgTable('chatbot_documents', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	content: text('content'),
	fileUrl: text('file_url'),
	fileName: text('file_name'),
	enabled: boolean('enabled').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChatbotDocument = typeof chatbotDocuments.$inferSelect;
export type NewChatbotDocument = typeof chatbotDocuments.$inferInsert;

// ---------------------------------------------------------------------------
// Better Auth tables (standard schema — https://www.better-auth.com/docs/adapters/drizzle)
// Do not rename these — Better Auth expects these exact table/column names.
// ---------------------------------------------------------------------------
export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
