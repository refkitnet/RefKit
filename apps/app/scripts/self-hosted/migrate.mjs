import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  DEFAULT_MIGRATIONS_DIR,
  loadMigrationPlan,
} from "./runtime-metadata.mjs";

const MIGRATION_LOCK_ID = "7114051158326756469";

function databaseUrl() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error("DATABASE_URL is required for the migration operation.");
  }

  const parsed = new URL(value);

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }

  return value;
}

async function readAppliedMigrations(sql) {
  const [result] = await sql`
    select to_regclass('drizzle.__drizzle_migrations')::text as name
  `;

  if (!result?.name) {
    return [];
  }

  const rows = await sql`
    select hash, created_at::text as created_at
    from drizzle.__drizzle_migrations
    order by created_at asc, id asc
  `;

  return rows.map((row) => ({
    hash: row.hash,
    when: Number(row.created_at),
  }));
}

function verifyAppliedMigrations(applied, plan, requireComplete) {
  if (applied.length > plan.length) {
    throw new Error(
      "The database contains migrations newer than this RefKit image. Use a newer image or restore a compatible backup."
    );
  }

  for (const [index, migration] of applied.entries()) {
    const expected = plan[index];

    if (!expected || migration.when !== expected.when) {
      throw new Error(
        `Database migration ${migration.when} is not the expected migration at position ${index}. Refusing a non-prefix migration history.`
      );
    }

    if (migration.hash !== expected.hash) {
      throw new Error(
        `Database migration ${expected.tag} does not match the immutable migration in this image.`
      );
    }
  }

  if (requireComplete && applied.length !== plan.length) {
    const next = plan[applied.length];
    throw new Error(
      `Migration operation ended before ${next?.tag ?? "the target schema"} was applied.`
    );
  }
}

async function run() {
  const migrationsDirectory = process.env.REFKIT_MIGRATIONS_DIR
    ?? DEFAULT_MIGRATIONS_DIR;
  const plan = await loadMigrationPlan(migrationsDirectory);
  const target = plan.at(-1);
  const client = postgres(databaseUrl(), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    application_name: "refkit-migrate",
  });
  let locked = false;

  try {
    const [lockResult] = await client`
      select pg_try_advisory_lock(${MIGRATION_LOCK_ID}::bigint) as locked
    `;

    locked = lockResult?.locked === true;

    if (!locked) {
      throw new Error(
        "Another RefKit migration operation holds the database lock. Wait for it to finish before retrying."
      );
    }

    const appliedBefore = await readAppliedMigrations(client);
    verifyAppliedMigrations(appliedBefore, plan, false);

    console.log(
      `[refkit:migrate] Applying ${process.env.REFKIT_BUILD_VERSION ?? "development"} (${process.env.REFKIT_SOURCE_REVISION ?? "unknown"}) to ${target.tag}.`
    );

    await migrate(drizzle(client), { migrationsFolder: migrationsDirectory });

    const appliedAfter = await readAppliedMigrations(client);
    verifyAppliedMigrations(appliedAfter, plan, true);

    console.log(
      `[refkit:migrate] Database is compatible with ${target.tag} (${appliedAfter.length} migrations).`
    );
  }
  finally {
    if (locked) {
      await client`
        select pg_advisory_unlock(${MIGRATION_LOCK_ID}::bigint)
      `.catch(() => undefined);
    }

    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(`[refkit:migrate] ${error.message}`);
  console.error(
    "[refkit:migrate] The application was not started. Fix the error or restore the pre-upgrade backup, then retry with the pinned target image."
  );
  process.exitCode = 1;
});
