import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MIGRATIONS_DIR = resolve(
  scriptDirectory,
  "../../src/db/migrations"
);

function assertJournalEntry(entry, index, previousWhen) {
  if (
    !entry
    || !Number.isSafeInteger(entry.idx)
    || entry.idx !== index
    || !Number.isSafeInteger(entry.when)
    || entry.when <= previousWhen
    || typeof entry.tag !== "string"
    || !/^\d{4}_[a-z0-9_]+$/.test(entry.tag)
  ) {
    throw new Error(`Invalid migration journal entry at index ${index}.`);
  }
}

export async function loadMigrationPlan(
  migrationsDirectory = DEFAULT_MIGRATIONS_DIR
) {
  const journalPath = resolve(migrationsDirectory, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));

  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("The migration journal must contain at least one entry.");
  }

  const plan = [];
  let previousWhen = -1;

  for (const [index, entry] of journal.entries.entries()) {
    assertJournalEntry(entry, index, previousWhen);
    const sql = await readFile(
      resolve(migrationsDirectory, `${entry.tag}.sql`),
      "utf8"
    );
    const hash = createHash("sha256").update(sql).digest("hex");

    plan.push({
      index,
      tag: entry.tag,
      when: entry.when,
      hash,
    });
    previousWhen = entry.when;
  }

  return plan;
}

export async function createRuntimeMetadata(options = {}) {
  const plan = await loadMigrationPlan(options.migrationsDirectory);
  const latest = plan.at(-1);

  return {
    format_version: 1,
    version: options.version ?? process.env.REFKIT_BUILD_VERSION ?? "development",
    revision: options.revision ?? process.env.REFKIT_SOURCE_REVISION ?? "unknown",
    source_url:
      options.sourceUrl
      ?? process.env.REFKIT_SOURCE_URL
      ?? "https://github.com/refkitnet/RefKit",
    schema_migration: {
      tag: latest.tag,
      when: latest.when,
      hash: latest.hash,
    },
  };
}

async function runCli() {
  const command = process.argv[2] ?? "print";
  const metadata = await createRuntimeMetadata();

  if (command === "print") {
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
    return;
  }

  if (command === "schema") {
    process.stdout.write(`${metadata.schema_migration.tag}\n`);
    return;
  }

  if (command === "write") {
    const outputPath = process.argv[3];

    if (!outputPath) {
      throw new Error("Usage: runtime-metadata.mjs write <output-path>");
    }

    await writeFile(resolve(outputPath), `${JSON.stringify(metadata, null, 2)}\n`, {
      mode: 0o644,
    });
    return;
  }

  throw new Error(`Unknown runtime metadata command: ${command}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`[refkit:metadata] ${error.message}`);
    process.exitCode = 1;
  });
}
