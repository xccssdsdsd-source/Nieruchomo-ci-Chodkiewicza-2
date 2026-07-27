// File upload safety.
//
// The client-declared Content-Type / filename extension can never be trusted —
// anyone can claim a `.html` payload is `image/png`. Because uploaded files are
// served back from the SAME origin as the admin panel (/api/images/*), a spoofed
// type served as text/html or image/svg+xml would be a stored XSS that could
// steal the admin's session cookie. To prevent that we:
//   1. only accept a small allowlist of binary file kinds,
//   2. verify the actual file bytes (magic numbers) match the claimed kind —
//      never trust `file.type`,
//   3. cap file size,
//   4. always serve with `X-Content-Type-Options: nosniff` and a safe,
//      non-executable Content-Disposition (see src/index.ts).
//
// To accept more kinds (e.g. docx), add a signature checker below — do not
// just widen the allowlist without one.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

type Signature = { contentType: string; check: (bytes: Uint8Array) => boolean };

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

const signatures: Signature[] = [
	{ contentType: 'image/jpeg', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
	{ contentType: 'image/png', check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
	{ contentType: 'image/gif', check: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
	{
		contentType: 'image/webp',
		check: (b) =>
			startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
			b[8] === 0x57 &&
			b[9] === 0x45 &&
			b[10] === 0x42 &&
			b[11] === 0x50,
	},
	{ contentType: 'application/pdf', check: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
];

export type UploadValidation = { ok: true; contentType: string } | { ok: false; error: string };

export const isPublicUploadContentType = (contentType: string): boolean =>
	contentType === 'image/jpeg' ||
	contentType === 'image/png' ||
	contentType === 'image/gif' ||
	contentType === 'image/webp';

// Sniffs the real file kind from its bytes and rejects anything outside the
// allowlist, regardless of what the browser/client claimed.
export const validateUpload = (bytes: Uint8Array, size: number): UploadValidation => {
	if (size === 0) return { ok: false, error: 'Nie przesłano pliku.' };
	if (size > MAX_UPLOAD_BYTES) return { ok: false, error: `Plik jest za duży (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
	const match = signatures.find((sig) => sig.check(bytes));
	if (!match) return { ok: false, error: 'Nieobsługiwany typ pliku. Dozwolone: JPG, PNG, GIF, WEBP, PDF.' };
	return { ok: true, contentType: match.contentType };
};

// Strips the filename down to a value that is safe to echo back in a
// Content-Disposition header and safe as an R2 key segment.
export const sanitizeFileName = (name: string): string =>
	name
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.replace(/^\.+/, '')
		.slice(-100) || 'plik';
