import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Db } from './db';
import * as schema from './db/schema';

export const createAuth = (db: Db, env: Env, appOrigin: string) =>
	betterAuth({
		baseURL: appOrigin,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema,
		}),
		// Lock cookies/CSRF checks to this exact deployment. Without this, Better
		// Auth's origin check falls back to `baseURL` only — being explicit here
		// means a stray extra origin (e.g. a preview URL) can never slip through
		// unnoticed when this file is copied into a new project.
		trustedOrigins: [appOrigin],
		emailAndPassword: {
			enabled: true,
			disableSignUp: true, // the only account is created by scripts/seed-admin.ts
			minPasswordLength: 16,
			maxPasswordLength: 128,
		},
		session: {
			expiresIn: 60 * 60 * 8, // 8 godzin
			updateAge: 60 * 60, // odśwież po godzinie aktywności
		},
		// Built-in IP-based rate limiting on every Better Auth endpoint (incl.
		// /sign-in/email). This is on by default in better-auth, but we pin the
		// values explicitly so they can't silently regress, and tighten sign-in
		// further below to slow down credential-stuffing / brute force.
		rateLimit: {
			enabled: true,
			window: 60,
			max: 30,
			customRules: {
				'/sign-in/email': { window: 60, max: 5 },
			},
		},
		advanced: {
			// Force the Secure cookie flag whenever we're actually served over
			// HTTPS (every real deployment). Left false only for `wrangler dev`
			// on http://localhost, so local development keeps working.
			useSecureCookies: appOrigin.startsWith('https://'),
			defaultCookieAttributes: {
				httpOnly: true,
				secure: appOrigin.startsWith('https://'),
				sameSite: 'lax',
				path: '/',
			},
		},
	});

export type Auth = ReturnType<typeof createAuth>;
