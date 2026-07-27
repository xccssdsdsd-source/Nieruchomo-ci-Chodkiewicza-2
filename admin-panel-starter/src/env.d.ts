export {};

// Required deployment values are declared in wrangler.jsonc and provided
// through encrypted Worker secrets. This file also describes optional
// bindings so local type checking remains explicit.
//
// ADMIN_EMAIL is also a runtime authorization allowlist. ADMIN_PASSWORD never
// appears here: only the local seed script needs the plaintext password.
declare global {
	interface Env {
		BETTER_AUTH_SECRET: string;
		APP_ORIGIN: string;
		ADMIN_EMAIL: string;
		PUBLIC_SITE_ORIGIN: string;
		// Optional — only present when the Workers AI binding is enabled in
		// wrangler.jsonc (needed for the chatbot module's live chat). Kept
		// optional so the panel type-checks and runs without it.
		AI?: { run(model: string, input: Record<string, unknown>): Promise<{ response?: string } | string> };
		// Required in production. The handlers fail closed if a binding is absent.
		LOGIN_RATE_LIMITER?: RateLimit;
		CHAT_RATE_LIMITER?: RateLimit;
	}
}
