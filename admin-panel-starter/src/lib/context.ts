import type { MiddlewareHandler } from 'hono';
import type { Db } from '../db';
import type { Auth } from '../auth';
import { isConfiguredAdmin } from './authorization';

type Session = Awaited<ReturnType<Auth['api']['getSession']>>;

export type Variables = {
	db: Db;
	auth: Auth;
	session: Session;
};

// Shared Hono generics for every app and sub-app in this project.
export type AppEnv = { Bindings: Env; Variables: Variables };

// Guards a whole router: rejects any request without a valid admin session.
// Applied as the first middleware inside each protected sub-app, so it covers
// every route in that app regardless of how the app is mounted.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
	const auth = c.get('auth');
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: 'Wymagane logowanie.' }, 401);
	}
	if (!isConfiguredAdmin(session.user.email, c.env.ADMIN_EMAIL)) {
		return c.json({ error: 'Brak uprawnień administratora.' }, 403);
	}
	c.set('session', session);
	await next();
};
