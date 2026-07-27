import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const createDb = (hyperdrive: Hyperdrive) => {
	const client = postgres(hyperdrive.connectionString, { max: 5, fetch_types: false });
	return drizzle(client, { schema });
};

export type Db = ReturnType<typeof createDb>;
