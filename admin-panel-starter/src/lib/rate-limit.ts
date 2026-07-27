// Thin wrapper around Cloudflare's native Rate Limiting binding. Optional —
// like the AI binding, the app works without it (see wrangler.jsonc), but
// login and the public chatbot endpoint are meaningfully safer with it on:
// login gets a second layer beyond Better Auth's own per-IP limit, and the
// public chat endpoint gets abuse/cost protection since Workers AI is billed
// per request. Enable it in wrangler.jsonc — see docs/07-SECURITY.md.

// A stable per-client key so one visitor can't drown out another. Falls back
// to the connecting IP; CF-Connecting-IP is set by Cloudflare and cannot be
// spoofed by the client.
export const rateLimitKey = (
	c: { req: { header: (name: string) => string | undefined } },
	appOrigin: string,
): string => `${appOrigin}|${c.req.header('CF-Connecting-IP') ?? 'unknown'}`;

// Returns true if the request is allowed, false if it should be rejected with 429.
// Security-sensitive endpoints fail closed when the binding is missing. This
// avoids silently deploying brute-force/cost protection that is only cosmetic.
export const checkRateLimit = async (
	limiter: RateLimit | undefined,
	key: string,
): Promise<boolean> => {
	if (!limiter) return false;
	const { success } = await limiter.limit({ key });
	return success;
};
