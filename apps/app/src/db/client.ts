import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  postgresClient: ReturnType<typeof postgres> | undefined;
  drizzleDb: DbInstance | undefined;
};

function createPostgresClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    prepare: false,
    // Next dev hot-reloads server modules; reuse one pool via globalThis.
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
}

export function getDb() {
  if (!globalForDb.drizzleDb) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }

    globalForDb.postgresClient = createPostgresClient(databaseUrl);
    globalForDb.drizzleDb = drizzle(globalForDb.postgresClient, { schema });
  }

  return globalForDb.drizzleDb;
}

export async function closeDb() {
  if (globalForDb.postgresClient) {
    await globalForDb.postgresClient.end();
    globalForDb.postgresClient = undefined;
    globalForDb.drizzleDb = undefined;
  }
}

export type Db = ReturnType<typeof getDb>;
export type DbTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0];
export type DbExecutor = Db | DbTransaction;
