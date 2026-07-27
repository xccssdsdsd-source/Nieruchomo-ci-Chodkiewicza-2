import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { createDb } from './db';
import { createAuth } from './auth';
import { requireAuth, type AppEnv } from './lib/context';
import { validateUpload, sanitizeFileName, MAX_UPLOAD_BYTES, isPublicUploadContentType } from './lib/uploads';
import { checkRateLimit, rateLimitKey } from './lib/rate-limit';
import { getAppOrigin, getPublicSiteOrigin } from './lib/security';
import { propertiesAdmin, propertiesPublic } from './modules/properties';
import { postsAdmin, postsPublic } from './modules/posts';
import { chatbotAdmin, chatbotPublic } from './modules/chatbot';
import { reviewsAdmin, reviewsPublic } from './modules/reviews';
import { isConfiguredAdmin } from './lib/authorization';

const app = new Hono<AppEnv>();

// Baseline hardening headers on every response: no MIME sniffing, no framing
// (the login page can't be clickjacked into an invisible iframe), no referrer
// leakage across origins, a locked-down permissions policy, and a CSP that
// pins script/style/font sources to exactly what admin.html actually loads.
//
// Inline scripts in admin.html are allowed only by SHA-256 hashes in
// public/_headers; inline event handlers are blocked. The Worker CSP below is
// stricter still because API responses never need inline scripts.
app.use(
	'*',
	secureHeaders({
		xContentTypeOptions: 'nosniff',
		xFrameOptions: 'DENY',
		referrerPolicy: 'strict-origin-when-cross-origin',
		strictTransportSecurity: 'max-age=31536000',
		permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
		contentSecurityPolicy: {
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'"],
			scriptSrcAttr: ["'none'"],
			styleSrc: ["'self'"],
			fontSrc: ["'self'"],
			imgSrc: ["'self'"],
			connectSrc: ["'self'"],
			objectSrc: ["'none'"],
			baseUri: ["'none'"],
			formAction: ["'self'"],
			frameAncestors: ["'none'"],
		},
	}),
);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// These resources are intentionally embedded/fetched by the separately hosted
// client website. CORP is relaxed only on these public namespaces.
app.use('/api/public/*', async (c, next) => {
	c.header('Cross-Origin-Resource-Policy', 'cross-origin');
	await next();
});
app.use('/api/images/*', async (c, next) => {
	c.header('Cross-Origin-Resource-Policy', 'cross-origin');
	await next();
});

app.use(
	'/api/*',
	csrf({
		origin: (origin, c) => {
			try {
				return origin === getAppOrigin(c.env, c.req.url);
			} catch {
				return false;
			}
		},
	}),
);

// API responses always reflect the current DB state — never cache them.
// (Images are handled separately below with long-lived cache headers.)
app.use('/api/*', async (c, next) => {
	await next();
	if (!c.req.path.startsWith('/api/images/')) {
		c.header('Cache-Control', 'no-store');
	}
});

// Attach a per-request Drizzle client + Better Auth instance to every /api route.
app.use('/api/*', async (c, next) => {
	const db = createDb(c.env.HYPERDRIVE);
	const auth = createAuth(db, c.env, getAppOrigin(c.env, c.req.url));
	c.set('db', db);
	c.set('auth', auth);
	await next();
});

// ---- Auth ----
app.post(
	'/api/login',
	bodyLimit({
		maxSize: 4 * 1024,
		onError: (c) => c.json({ error: 'Żądanie przekracza dozwolony rozmiar.' }, 413),
	}),
	async (c) => {
	// Edge-level limit in front of Better Auth's own per-endpoint rate limit
	// (see src/auth.ts) — cheap defense in depth against credential stuffing.
	// Fails closed if LOGIN_RATE_LIMITER is not configured.
	if (!c.env.LOGIN_RATE_LIMITER) {
		return c.json({ error: 'Logowanie jest niedostępne: brak wymaganego limitera.' }, 503);
	}
	const allowed = await checkRateLimit(
		c.env.LOGIN_RATE_LIMITER,
		rateLimitKey(c, getAppOrigin(c.env, c.req.url)),
	);
	if (!allowed) return c.json({ error: 'Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.' }, 429);

	const bodySchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
	const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: 'Nieprawidłowe dane logowania.' }, 400);
	const auth = c.get('auth');
	try {
		return await auth.api.signInEmail({ body: parsed.data, headers: c.req.raw.headers, asResponse: true });
	} catch {
		return c.json({ error: 'Nieprawidłowy email lub hasło.' }, 401);
	}
	},
);

app.post('/api/logout', async (c) => {
	const auth = c.get('auth');
	return auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
});

app.get('/api/me', requireAuth, (c) => c.json({ email: c.get('session')!.user.email }));

// ---- Images (R2) ----
// The Content-Type served here is always the value WE assigned at upload
// time (from validateUpload's byte-sniffed result, never the client's claim)
// — see uploads handler below. Content-Disposition + nosniff below stop the
// browser from ever executing a served file as HTML/script even in edge cases.
app.get('/api/images/*', async (c) => {
	const key = c.req.path.replace('/api/images/', '');
	const object = await c.env.IMAGES.get(key);
	if (!object) return c.json({ error: 'Nie znaleziono pliku.' }, 404);
	const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
	const isPublicImage = isPublicUploadContentType(contentType);
	if (!isPublicImage) {
		const session = await c.get('auth').api.getSession({ headers: c.req.raw.headers });
		if (!session) return c.json({ error: 'Wymagane logowanie.' }, 401);
		if (!isConfiguredAdmin(session.user.email, c.env.ADMIN_EMAIL)) {
			return c.json({ error: 'Brak uprawnień administratora.' }, 403);
		}
	}
	return new Response(object.body, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': isPublicImage ? 'public, max-age=31536000, immutable' : 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Content-Disposition': contentType === 'application/pdf' ? 'attachment' : 'inline',
			'Content-Security-Policy': "default-src 'none'; sandbox",
		},
	});
});

// ---- Uploads (R2, authenticated) ----
const uploads = new Hono<AppEnv>();
uploads.use('*', requireAuth);
uploads.post(
	'/',
	bodyLimit({
		maxSize: MAX_UPLOAD_BYTES + 1024 * 1024,
		onError: (c) => c.json({ error: 'Żądanie przekracza dozwolony rozmiar.' }, 413),
	}),
	async (c) => {
	const body = await c.req.parseBody();
	const file = body['file'];
	const folder =
		typeof body['folder'] === 'string'
			? body['folder']
					.replace(/[^a-z0-9_\-/]/gi, '')
					.replace(/\.+/g, '')
					.replace(/\/+/g, '/')
					.replace(/^\/|\/$/g, '')
			: 'misc';
	if (!(file instanceof File)) {
		return c.json({ error: 'Nie przesłano pliku.' }, 400);
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return c.json({ error: `Plik jest za duży (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` }, 413);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Never trust file.type or the filename extension — verify the actual
	// bytes. See src/lib/uploads.ts for why this matters.
	const validated = validateUpload(bytes, bytes.byteLength);
	if (!validated.ok) return c.json({ error: validated.error }, 415);

	const safeName = sanitizeFileName(file.name);
	const key = `${folder || 'misc'}/${crypto.randomUUID()}-${safeName}`;
	await c.env.IMAGES.put(key, bytes, {
		httpMetadata: { contentType: validated.contentType },
	});
	return c.json({ url: `/api/images/${key}` }, 201);
	},
);
app.route('/api/uploads', uploads);

// ---- Public read endpoints (no auth — for the live website) ----
// Public data is readable without authentication, but browser access is
// limited to the configured client-site origin. This also reduces cross-site
// abuse of the billable chatbot endpoint.
app.use(
	'/api/public/*',
	cors({
		origin: (origin, c) => {
			try {
				return origin === getPublicSiteOrigin(c.env, c.req.url) ? origin : null;
			} catch {
				return null;
			}
		},
		allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 600,
		credentials: false,
	}),
);
app.route('/api/public/properties', propertiesPublic);
app.route('/api/public/posts', postsPublic);
app.route('/api/public/chatbot', chatbotPublic);
app.route('/api/public/reviews', reviewsPublic);

// ---- Admin modules (each router guards itself with requireAuth) ----
app.route('/api/properties', propertiesAdmin);
app.route('/api/posts', postsAdmin);
app.route('/api/chatbot', chatbotAdmin);
app.route('/api/reviews', reviewsAdmin);

export default app;
