import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { join } from "node:path";
import postgres from "postgres";

const envPath = join(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

if (process.env.REFKIT_EDITION !== "self-hosted") {
  console.error("REFKIT_EDITION must be self-hosted.");
  process.exit(1);
}

const nextEmail = process.argv[2]?.trim().toLowerCase();

if (!nextEmail || !nextEmail.includes("@")) {
  console.error(
    "Usage: node apps/app/scripts/self-hosted/recover-admin.mjs admin@example.com"
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const database = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const result = await database.begin(async (sql) => {
    const [administrator] = await sql`
      SELECT id, email
      FROM users
      WHERE is_admin = true
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    `;

    if (!administrator) {
      throw new Error(
        "No administrator exists. Use the one-time setup page instead."
      );
    }

    await sql`DELETE FROM sessions WHERE user_id = ${administrator.id}`;
    await sql`
      DELETE FROM verifications
      WHERE value ILIKE ${`%${administrator.email}%`}
    `;
    const [updated] = await sql`
      UPDATE users
      SET email = ${nextEmail}, email_verified = false, updated_at = now()
      WHERE id = ${administrator.id}
      RETURNING id, email
    `;

    return updated;
  });

  console.log(`Administrator email updated to ${result.email} (${result.id}).`);
  console.log(
    "Repair email configuration if needed, restart RefKit, then request a sign-in link."
  );
}
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
finally {
  await database.end();
}
