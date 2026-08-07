import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    fail(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function filesUnder(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(relative(root, child));
    }
    return [relative(root, child).replaceAll("\\", "/")];
  });
}

function assertSameNames(label, actual, expected) {
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();

  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${label} differ. Expected ${normalizedExpected.join(", ")}; found ${normalizedActual.join(", ")}`,
    );
  }
}

function matchNames(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

function tableColumnNames(source, tableName) {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const table = source.match(
    new RegExp(
      `CREATE TABLE "${escapedTableName}" \\(\\r?\\n([\\s\\S]*?)\\r?\\n\\);`,
      "u",
    ),
  );

  if (!table) {
    fail(`Public baseline is missing CREATE TABLE for ${tableName}`);
  }

  return matchNames(table[1], /^\s*"([^"]+)"\s+/gmu);
}

const required = [
  "LICENSE",
  "LICENSES.md",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
  "CONTRIBUTING.md",
  "DCO",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "SUPPORT.md",
  ".gitleaks.toml",
  "docs/publication/README.md",
  "docs/publication/release-policy.md",
  "docs/publication/public-repository-boundary.md",
  "docs/publication/release-notes-template.md",
  "docs/publication/publication-checklist.md",
  "docs/publication/security-review.md",
  "docs/publication/asset-rights-review.md",
  "docs/publication/operator-responsibilities.md",
  "docs/publication/agpl-compliance.md",
  "docs/publication/artifact-verification.md",
  "docs/publication/pilot-checklist.md",
  "third-party/DEPENDENCY_LICENSE_FALLBACKS.txt",
  "scripts/stage-third-party-notices.mjs",
  "apps/app/src/db/migrations/meta/_journal.json",
  ".github/dependabot.yml",
  ".github/release.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_proposal.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/container.yml",
  ".github/workflows/dco.yml",
  ".github/workflows/release-draft.yml",
  ".github/workflows/repository-policy.yml",
  ".github/workflows/security.yml",
];

for (const path of required) read(path);

const migrationsDirectory = "apps/app/src/db/migrations";
const baselinePath = `${migrationsDirectory}/0000_public_baseline.sql`;
const journalPath = `${migrationsDirectory}/meta/_journal.json`;
const snapshotPath = `${migrationsDirectory}/meta/0000_snapshot.json`;
const baselineSql = read(baselinePath);
const migrationSqlFiles = filesUnder(migrationsDirectory).filter((path) =>
  path.endsWith(".sql"),
);
const migrationMetadataFiles = filesUnder(`${migrationsDirectory}/meta`);

assertSameNames("Public migration SQL files", migrationSqlFiles, [baselinePath]);
assertSameNames("Public migration metadata files", migrationMetadataFiles, [
  journalPath,
  snapshotPath,
]);

let baselineJournal;
try {
  baselineJournal = JSON.parse(read(journalPath));
} catch (error) {
  fail(`${journalPath} is not valid JSON: ${error.message}`);
}

if (
  baselineJournal?.version !== "7"
  || baselineJournal?.dialect !== "postgresql"
  || baselineJournal?.entries?.length !== 1
  || baselineJournal.entries[0]?.idx !== 0
  || baselineJournal.entries[0]?.version !== "7"
  || !Number.isSafeInteger(baselineJournal.entries[0]?.when)
  || baselineJournal.entries[0]?.tag !== "0000_public_baseline"
) {
  fail("The public migration journal must contain only 0000_public_baseline");
}

let baselineSnapshot;
try {
  baselineSnapshot = JSON.parse(read(snapshotPath));
} catch (error) {
  fail(`${snapshotPath} is not valid JSON: ${error.message}`);
}

if (
  baselineSnapshot?.version !== "7"
  || baselineSnapshot?.dialect !== "postgresql"
  || baselineSnapshot?.prevId !== "00000000-0000-0000-0000-000000000000"
  || !baselineSnapshot?.tables
) {
  fail("The public baseline snapshot is not a fresh PostgreSQL schema snapshot");
} else {
  const snapshotTables = Object.values(baselineSnapshot.tables);
  const expectedTables = snapshotTables.map((table) => table.name);
  const expectedIndexes = snapshotTables.flatMap((table) =>
    Object.values(table.indexes).map((index) => index.name),
  );
  const expectedForeignKeys = snapshotTables.flatMap((table) =>
    Object.values(table.foreignKeys).map((foreignKey) => foreignKey.name),
  );
  const expectedChecks = snapshotTables.flatMap((table) =>
    Object.values(table.checkConstraints).map((constraint) => constraint.name),
  );

  assertSameNames(
    "Public baseline tables and snapshot tables",
    matchNames(baselineSql, /CREATE TABLE "([^"]+)"/g),
    expectedTables,
  );
  assertSameNames(
    "Public baseline indexes and snapshot indexes",
    matchNames(baselineSql, /CREATE (?:UNIQUE )?INDEX "([^"]+)"/g),
    expectedIndexes,
  );
  assertSameNames(
    "Public baseline foreign keys and snapshot foreign keys",
    matchNames(baselineSql, /ADD CONSTRAINT "([^"]+)" FOREIGN KEY/g),
    expectedForeignKeys,
  );
  assertSameNames(
    "Public baseline checks and snapshot checks",
    matchNames(baselineSql, /CONSTRAINT "([^"]+)" CHECK/g),
    expectedChecks,
  );

  for (const table of snapshotTables) {
    assertSameNames(
      `Public baseline columns for ${table.name}`,
      tableColumnNames(baselineSql, table.name),
      Object.values(table.columns).map((column) => column.name),
    );
  }
}

for (const expected of [
  "CREATE OR REPLACE FUNCTION payout_items_affiliate_matches_commission()",
  "ce.id = NEW.commission_entry_id",
  "ce.program_affiliate_id = NEW.program_affiliate_id",
  "CREATE TRIGGER payout_items_affiliate_match_check",
  "BEFORE INSERT OR UPDATE OF program_affiliate_id, commission_entry_id ON payout_items",
  "EXECUTE FUNCTION payout_items_affiliate_matches_commission();",
]) {
  const occurrences = baselineSql.split(expected).length - 1;
  if (occurrences !== 1) {
    fail(`Public baseline must contain exactly one occurrence of: ${expected}`);
  }
}

if (/\bDROP\b/iu.test(baselineSql)) {
  fail("The fresh public baseline must not contain DROP statements");
}

for (const [indexName, dependentConstraints] of [
  [
    "program_affiliates_id_program_unique",
    [
      "clicks_affiliate_program_fk",
      "referrals_program_affiliate_program_fk",
      "commission_entries_program_affiliate_program_fk",
    ],
  ],
  [
    "affiliate_links_id_program_affiliate_program_unique",
    ["clicks_link_program_affiliate_program_fk"],
  ],
]) {
  const indexOffset = baselineSql.indexOf(`CREATE UNIQUE INDEX "${indexName}"`);
  for (const constraintName of dependentConstraints) {
    const constraintOffset = baselineSql.indexOf(
      `ADD CONSTRAINT "${constraintName}" FOREIGN KEY`,
    );
    if (
      indexOffset === -1
      || constraintOffset === -1
      || indexOffset >= constraintOffset
    ) {
      fail(
        `Public baseline index ${indexName} must precede dependent foreign key ${constraintName}`,
      );
    }
  }
}

const rootLicense = read("LICENSE");
if (
  !rootLicense.includes("GNU AFFERO GENERAL PUBLIC LICENSE") ||
  !rootLicense.includes("Version 3, 19 November 2007")
) {
  fail("Root LICENSE is not the complete expected AGPL version 3 text");
}

const licenseMap = read("LICENSES.md");
for (const expected of [
  "AGPL-3.0-only",
  "apps/app/**",
  "packages/sdk/**",
  "packages/cli/**",
  "packages/mcp/**",
  "packages/validation/**",
  "deploy/self-hosted/**",
]) {
  if (!licenseMap.includes(expected)) {
    fail(`LICENSES.md is missing required boundary: ${expected}`);
  }
}

for (const excluded of [
  "apps/website/**",
  "apps/demo-app-client/**",
  "apps/demo-app-express/**",
  "apps/stripe-app/**",
  "help-center/**",
  "product/**/*.md",
]) {
  if (licenseMap.includes(excluded)) {
    fail(`LICENSES.md must not grant a public-distribution license to excluded path: ${excluded}`);
  }
}

const publicBoundary = read("docs/publication/public-repository-boundary.md");
for (const expected of [
  "apps/website",
  "apps/demo-app-client",
  "apps/demo-app-express",
  "apps/stripe-app",
  "public repository is the canonical home",
]) {
  if (!publicBoundary.includes(expected)) {
    fail(`Public repository boundary is missing: ${expected}`);
  }
}

const notice = read("NOTICE");
if (!notice.includes("Copyright (c) 2026 RefKit contributors")) {
  fail("NOTICE must use the approved public contributor identity");
}

const thirdPartyNotices = read("THIRD_PARTY_NOTICES.md");
for (const expected of [
  "Lucide Icons and Contributors",
  "Cole Bemis",
  "Copyright (c) 2023 shadcn",
  "Copyright (c) 2022 WorkOS",
  "Copyright (c) 2023 Emil Kowalski",
  "Copyright 2022 Joe Bell",
]) {
  if (!thirdPartyNotices.includes(expected)) {
    fail(`THIRD_PARTY_NOTICES.md is missing required notice: ${expected}`);
  }
}

for (const packagePath of [
  "packages/sdk",
  "packages/cli",
  "packages/mcp",
  "packages/validation",
]) {
  const manifestPath = `${packagePath}/package.json`;
  const manifestText = read(manifestPath);
  try {
    const manifest = JSON.parse(manifestText);
    if (manifest.license !== "MIT") {
      fail(`${manifestPath} must keep license MIT`);
    }
    if (!Array.isArray(manifest.files) || !manifest.files.includes("LICENSE")) {
      fail(`${manifestPath} must publish its LICENSE file`);
    }
  } catch (error) {
    fail(`${manifestPath} is not valid JSON: ${error.message}`);
  }

  const packageLicense = read(`${packagePath}/LICENSE`);
  if (!packageLicense.startsWith("MIT License")) {
    fail(`${packagePath}/LICENSE must keep the MIT license text`);
  }
  if (!packageLicense.includes("Copyright (c) 2026 RefKit contributors")) {
    fail(`${packagePath}/LICENSE must use the approved public contributor identity`);
  }
}

const mcpManifest = JSON.parse(read("packages/mcp/package.json"));
if (!mcpManifest.files?.includes("BRAND_NOTICE.md")) {
  fail("packages/mcp/package.json must publish BRAND_NOTICE.md with its icon");
}
read("packages/mcp/BRAND_NOTICE.md");

const publicRootManifestPath = existsSync(
  join(root, "distribution/public/root/package.json"),
)
  ? "distribution/public/root/package.json"
  : "package.json";
const canonicalRepositoryUrl = "git+https://github.com/refkitnet/RefKit.git";

for (const manifestPath of [
  publicRootManifestPath,
  "packages/sdk/package.json",
  "packages/cli/package.json",
  "packages/mcp/package.json",
  "packages/validation/package.json",
]) {
  const manifest = JSON.parse(read(manifestPath));
  if (manifest.repository?.url !== canonicalRepositoryUrl) {
    fail(`${manifestPath} must use the canonical public repository`);
  }
}

const containerWorkflow = read(".github/workflows/container.yml");
for (const expected of ["refkitnet/RefKit", "ghcr.io/refkitnet/refkit"]) {
  if (!containerWorkflow.includes(expected)) {
    fail(`Container workflow is missing canonical public identity: ${expected}`);
  }
}

const privateIdentityMarkers = [
  ["it", "ay"].join(""),
  ["char", "itan"].join(""),
];
const privacyScanPaths = new Set([
  ...required,
  ...filesUnder("docs/self-hosting"),
  ...filesUnder("docs/publication"),
  publicRootManifestPath,
  "apps/app/.env.example",
  "apps/app/scripts/self-hosted/runtime-metadata.mjs",
  "apps/app/src/lib/runtime-metadata.ts",
  "apps/app/public/favicon-16x16.png",
  "apps/app/public/favicon-32x32.png",
  "apps/app/public/refkit-logo.png",
  "apps/app/src/app/apple-icon.png",
  "packages/sdk/package.json",
  "packages/sdk/LICENSE",
  "packages/cli/package.json",
  "packages/cli/LICENSE",
  "packages/mcp/package.json",
  "packages/mcp/LICENSE",
  "packages/mcp/BRAND_NOTICE.md",
  "packages/mcp/assets/icon-32.png",
  "packages/validation/package.json",
  "packages/validation/LICENSE",
]);

for (const path of privacyScanPaths) {
  const content = readFileSync(join(root, path)).toString("latin1").toLowerCase();
  if (privateIdentityMarkers.some((marker) => content.includes(marker))) {
    fail(`${path} contains a private identity marker`);
  }
}

const workflowFiles = filesUnder(".github/workflows").filter((path) =>
  /\.ya?ml$/.test(path),
);

for (const path of workflowFiles) {
  const source = read(path);
  if (!/^permissions:\s*(?:$|\{)/m.test(source)) {
    fail(`${path} must declare top-level permissions`);
  }
  if (/^\s*pull_request_target\s*:/m.test(source)) {
    fail(`${path} must not use pull_request_target`);
  }

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const imageMatch = line.match(/^\s*image:\s*([^\s#]+)(?:\s+#.*)?$/);
    if (
      imageMatch
      && !/@sha256:[0-9a-f]{64}$/i.test(imageMatch[1])
    ) {
      fail(`${path}:${index + 1} container image is not pinned by digest: ${imageMatch[1]}`);
    }

    const buildkitMatch = line.match(
      /^\s*driver-opts:\s*image=([^\s#]+)(?:\s+#.*)?$/,
    );
    if (
      buildkitMatch
      && !/@sha256:[0-9a-f]{64}$/i.test(buildkitMatch[1])
    ) {
      fail(`${path}:${index + 1} BuildKit image is not pinned by digest: ${buildkitMatch[1]}`);
    }

    const match = line.match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if (!match) continue;

    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const immutableAction = /@[0-9a-f]{40}$/i.test(reference);
    const immutableContainer = /^docker:\/\/[^\s]+@sha256:[0-9a-f]{64}$/i.test(
      reference,
    );
    if (!immutableAction && !immutableContainer) {
      fail(`${path}:${index + 1} action is not pinned immutably: ${reference}`);
    }
  }
}

const proseAndPolicyFiles = [
  ...required.filter((path) => path !== "LICENSE"),
  ...filesUnder("docs/publication"),
  ...filesUnder(".github").filter((path) => /\.(md|ya?ml)$/.test(path)),
  "scripts/check-publication.mjs",
];

for (const path of new Set(proseAndPolicyFiles)) {
  const source = read(path);
  if (source.includes("\u2014")) {
    fail(`${path} contains a Unicode em dash`);
  }

  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolved = resolve(root, dirname(path), target);
    if (!existsSync(resolved)) {
      fail(`${path} has a broken relative link: ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Publication policy check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Publication policy check passed (${required.length} required files, ${workflowFiles.length} workflows, 4 MIT packages).`,
);
