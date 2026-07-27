import type { Context } from 'hono';
import type { AppEnv } from './context';

const IMAGE_PREFIX = '/api/images/';
const OBJECT_KEY_PATTERN = /^[a-zA-Z0-9_./-]+$/;

export const storedObjectKey = (url: unknown): string | null => {
	if (typeof url !== 'string' || !url.startsWith(IMAGE_PREFIX)) return null;
	const key = url.slice(IMAGE_PREFIX.length);
	const segments = key.split('/');
	if (!key || !OBJECT_KEY_PATTERN.test(key) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		return null;
	}
	return key;
};

export const storedObjectKeys = (urls: unknown[]): string[] =>
	[...new Set(urls.map(storedObjectKey).filter((key): key is string => key !== null))];

// R2 and Postgres cannot participate in one atomic transaction. Database
// writes stay authoritative; cleanup runs in waitUntil so a transient R2
// failure cannot turn a successful content update into a misleading 500.
// Failures are observable in Worker logs and should be retried by the
// operational orphan-cleanup job described in docs/07-SECURITY.md.
export const scheduleStoredObjectDeletion = (c: Context<AppEnv>, urls: unknown[]): void => {
	const keys = storedObjectKeys(urls);
	if (keys.length === 0) return;
	c.executionCtx.waitUntil(
		c.env.IMAGES.delete(keys).catch((error: unknown) => {
			console.error('Nie udało się usunąć osieroconych obiektów R2.', error);
		}),
	);
};
