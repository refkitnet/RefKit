import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isSelfHosted } from "@/lib/deployment";
import { validateServerEnv } from "@/lib/env";
import {
  getBuildIdentity,
  readRuntimeMetadata,
} from "@/lib/runtime-metadata";

type MigrationRow = {
  hash: string;
  created_at: string | number;
};

export async function GET() {
  const build = getBuildIdentity();

  try {
    const env = validateServerEnv();
    await getDb().execute(sql`SELECT 1`);

    let migration = "platform-managed";

    if (isSelfHosted()) {
      if (!env.REFKIT_RUNTIME_METADATA_FILE) {
        throw new Error("Runtime metadata file is not configured.");
      }

      const metadata = await readRuntimeMetadata(
        env.REFKIT_RUNTIME_METADATA_FILE
      );
      const rows = await getDb().execute<MigrationRow>(sql`
        SELECT hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const applied = rows[0];

      if (
        !applied
        || applied.hash !== metadata.schema_migration.hash
        || String(applied.created_at) !== String(metadata.schema_migration.when)
      ) {
        throw new Error(
          "The database schema is not compatible with this application release."
        );
      }

      migration = metadata.schema_migration.tag;
    }

    return Response.json({
      status: "ready",
      service: "refkit-app",
      ...build,
      database: {
        status: "ready",
        migration,
      },
    });
  }
  catch (error) {
    console.error("Readiness check failed.", error);

    return Response.json(
      {
        status: "not_ready",
        service: "refkit-app",
        ...build,
        database: { status: "not_ready" },
      },
      { status: 503 }
    );
  }
}
