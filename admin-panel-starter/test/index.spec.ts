import { describe, expect, it } from 'vitest';
import worker from '../src';
import { isPublicUploadContentType, MAX_UPLOAD_BYTES, sanitizeFileName, validateUpload } from '../src/lib/uploads';
import { isConfiguredAdmin } from '../src/lib/authorization';
import { checkRateLimit } from '../src/lib/rate-limit';
import { getAppOrigin, getPublicSiteOrigin } from '../src/lib/security';
import { storedObjectKey, storedObjectKeys } from '../src/lib/storage';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

describe('admin panel worker', () => {
	it('responds to /api/health without touching protected bindings', async () => {
		const response = await worker.request('/api/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
		const csp = response.headers.get('content-security-policy') ?? '';
		expect(csp).toContain("default-src 'self'");
		expect(csp).not.toContain("'unsafe-inline'");
		expect(csp).not.toMatch(/https?:\/\//);
	});

	it('rejects executable uploads even when their name claims to be an image', () => {
		const payload = new TextEncoder().encode('<script>alert(document.cookie)</script>');
		expect(validateUpload(payload, payload.byteLength)).toMatchObject({ ok: false });
	});

	it('accepts a byte-sniffed PNG and enforces the upload limit', () => {
		const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(validateUpload(png, png.byteLength)).toEqual({ ok: true, contentType: 'image/png' });
		expect(validateUpload(png, MAX_UPLOAD_BYTES + 1)).toMatchObject({ ok: false });
		expect(isPublicUploadContentType('image/png')).toBe(true);
		expect(isPublicUploadContentType('application/pdf')).toBe(false);
		expect(isPublicUploadContentType('text/html')).toBe(false);
	});

	it('removes header and path metacharacters from filenames', () => {
		expect(sanitizeFileName('../evil\r\nContent-Type:text/html.svg')).toBe('_evil__Content-Type_text_html.svg');
	});

	it('fails closed unless the authenticated email is the configured admin', () => {
		expect(isConfiguredAdmin('ADMIN@example.com', ' admin@example.com ')).toBe(true);
		expect(isConfiguredAdmin('attacker@example.com', 'admin@example.com')).toBe(false);
		expect(isConfiguredAdmin('admin@example.com', undefined)).toBe(false);
	});

	it('rejects missing/malformed production origins and permits local development', () => {
		expect(getAppOrigin({ APP_ORIGIN: 'https://panel.example.com' } as Env, 'https://ignored.example')).toBe(
			'https://panel.example.com',
		);
		expect(getAppOrigin({} as Env, 'http://localhost:8787/api/health')).toBe('http://localhost:8787');
		expect(() => getAppOrigin({} as Env, 'https://panel.example.com/api/health')).toThrow();
		expect(() =>
			getAppOrigin({ APP_ORIGIN: 'https://panel.example.com/path' } as Env, 'https://panel.example.com'),
		).toThrow();
		expect(() =>
			getAppOrigin({ APP_ORIGIN: 'http://panel.example.com' } as Env, 'https://panel.example.com'),
		).toThrow();
		expect(
			getPublicSiteOrigin(
				{ PUBLIC_SITE_ORIGIN: 'https://www.example.com' } as Env,
				'https://panel.example.com/api/public/posts',
			),
		).toBe('https://www.example.com');
		expect(() =>
			getPublicSiteOrigin({} as Env, 'https://panel.example.com/api/public/posts'),
		).toThrow();
	});

	it('fails closed when a required edge limiter is absent', async () => {
		await expect(checkRateLimit(undefined, 'actor')).resolves.toBe(false);
		const limiter = { limit: async () => ({ success: false }) } as unknown as RateLimit;
		await expect(checkRateLimit(limiter, 'actor')).resolves.toBe(false);
	});

	it('only derives unique R2 keys from same-origin managed URLs', () => {
		expect(storedObjectKey('/api/images/properties/example.webp')).toBe('properties/example.webp');
		expect(storedObjectKey('https://attacker.example/example.webp')).toBeNull();
		expect(storedObjectKey('/api/images/../../secret')).toBeNull();
		expect(storedObjectKeys([
			'/api/images/properties/example.webp',
			'/api/images/properties/example.webp',
			'javascript:alert(1)',
		])).toEqual(['properties/example.webp']);
	});

	it('keeps CSP hashes synchronized with every inline script', async () => {
		const [html, headers, css] = await Promise.all([
			readFile(new URL('../public/admin.html', import.meta.url), 'utf8'),
			readFile(new URL('../public/_headers', import.meta.url), 'utf8'),
			readFile(new URL('../public/admin.css', import.meta.url), 'utf8'),
		]);
		const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
			.map((match) => match[1])
			.filter(Boolean);
		expect(scripts.length).toBeGreaterThan(0);
		for (const script of scripts) {
			const hash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
			expect(headers).toContain(`'${hash}'`);
		}
		expect(headers).toContain("script-src-attr 'none'");
		expect(headers).not.toContain("'unsafe-inline'");
		expect(headers).not.toMatch(/https?:\/\//);
		expect(html).toContain('<link href="/admin.css" rel="stylesheet">');
		expect(html).not.toMatch(/cdn\.tailwindcss|fonts\.googleapis|fonts\.gstatic/);
		expect(css.length).toBeGreaterThan(10_000);
		expect(html).toContain('id="np-published" type="checkbox" checked');
	});

	it('publishes new blog posts by default and cleans up removed post covers', async () => {
		const source = await readFile(new URL('../src/modules/posts.ts', import.meta.url), 'utf8');

		expect(source).toContain('published: input.published ?? true');
		expect(source).toContain('previous.coverImageUrl !== updated.coverImageUrl');
		expect(source).toContain('scheduleStoredObjectDeletion(c, [deleted.coverImageUrl])');
	});
});
