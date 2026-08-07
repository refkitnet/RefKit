import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

function loadDatabaseUrl() {
  const envPath = join(process.cwd(), ".env.local");

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);

    if (match) {
      let value = match[1].trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      return value;
    }
  }

  return process.env.DATABASE_URL;
}

const email = process.argv[2];

if (!email) {
  console.error("Usage: npm run admin:grant -- <email>");
  process.exit(1);
}

const databaseUrl = loadDatabaseUrl();

if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const normalizedEmail = email.trim().toLowerCase();

try {
  const rows = await sql`
    UPDATE users
    SET is_admin = true, updated_at = now()
    WHERE lower(email) = ${normalizedEmail}
    RETURNING id, email, is_admin
  `;

  if (rows.length === 0) {
    console.error(`No user found for email ${normalizedEmail}.`);
    process.exit(1);
  }

  console.log(`Granted admin to ${rows[0].email} (${rows[0].id}).`);
}
finally {
  await sql.end();
}
