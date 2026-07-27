// One-off admin seeding script. Runs in Node, connects directly to Postgres
// (not through the Hyperdrive binding, which is only reachable from within
// a Cloudflare Worker). Creates exactly one admin user via Better Auth's
// sign-up flow, then that path stays disabled in the deployed Worker
// (see src/auth.ts, emailAndPassword.disableSignUp).
//
// Usage (reads .env — see .env.example):
//   npm run seed:admin
// or with explicit env:
//   DATABASE_URL="postgres://..." ADMIN_EMAIL="you@example.com" \
//   ADMIN_PASSWORD="..." BETTER_AUTH_SECRET="..." node scripts/seed-admin.ts

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from '../src/db/schema.ts';

const required = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		console.error(`Brak zmiennej środowiskowej ${name}.`);
		process.exit(1);
	}
	return value;
};

const databaseUrl = required('DATABASE_URL');
const adminEmail = required('ADMIN_EMAIL');
const adminPassword = required('ADMIN_PASSWORD');
const betterAuthSecret = required('BETTER_AUTH_SECRET');
if (adminPassword.length < 16 || adminPassword.length > 128) {
	console.error('ADMIN_PASSWORD musi mieć od 16 do 128 znaków.');
	process.exit(1);
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema });

const auth = betterAuth({
	baseURL: 'http://localhost',
	secret: betterAuthSecret,
	database: drizzleAdapter(db, { provider: 'pg', schema }),
	emailAndPassword: { enabled: true, disableSignUp: false, minPasswordLength: 16, maxPasswordLength: 128 },
});

try {
	await auth.api.signUpEmail({
		body: { name: 'Administrator', email: adminEmail, password: adminPassword },
	});
	console.log(`Utworzono konto administratora: ${adminEmail}`);
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	if (message.toLowerCase().includes('already exists') || message.toLowerCase().includes('user_email_unique')) {
		console.log(`Konto ${adminEmail} już istnieje — pomijam.`);
	} else {
		console.error('Nie udało się utworzyć konta administratora:', message);
		process.exit(1);
	}
}

await client.end();
