import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumentsByName = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || !value) {
    throw new Error(
      "Usage: node scripts/stage-third-party-notices.mjs --workspace <path> --target <path>",
    );
  }
  argumentsByName.set(name.slice(2), value);
}

const workspaceArgument = argumentsByName.get("workspace");
const targetArgument = argumentsByName.get("target");

if (!workspaceArgument || !targetArgument) {
  throw new Error("Both --workspace and --target are required.");
}

const workspaceDirectory = resolve(repositoryRoot, workspaceArgument);
const targetPath = resolve(repositoryRoot, targetArgument);
const repositoryPrefix = `${repositoryRoot}${sep}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageManifestPath(directory) {
  return join(directory, "package.json");
}

function isPackageDirectory(directory) {
  return existsSync(packageManifestPath(directory));
}

function workspaceDirectories() {
  const rootManifest = readJson(packageManifestPath(repositoryRoot));
  const patterns = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : rootManifest.workspaces?.packages ?? [];
  const directories = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      const directory = resolve(repositoryRoot, pattern);
      if (isPackageDirectory(directory)) directories.push(directory);
      continue;
    }

    const parent = resolve(repositoryRoot, pattern.slice(0, -2));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const directory = join(parent, entry.name);
      if (entry.isDirectory() && isPackageDirectory(directory)) {
        directories.push(directory);
      }
    }
  }

  return directories;
}

const internalPackages = new Map(
  workspaceDirectories().map((directory) => {
    const realDirectory = realpathSync(directory);
    return [
      readJson(packageManifestPath(realDirectory)).name,
      realDirectory,
    ];
  }),
);
const internalDirectories = new Set(internalPackages.values());

function resolveDependency(name, parentDirectory) {
  let cursor = parentDirectory;
  while (cursor === repositoryRoot || cursor.startsWith(repositoryPrefix)) {
    const candidate = join(cursor, "node_modules", ...name.split("/"));
    if (isPackageDirectory(candidate)) return realpathSync(candidate);
    if (cursor === repositoryRoot) break;
    cursor = dirname(cursor);
  }

  return internalPackages.get(name);
}

function dependencyNames(manifest) {
  return new Map([
    ...Object.keys(manifest.dependencies ?? {}).map((name) => [name, false]),
    ...Object.keys(manifest.optionalDependencies ?? {}).map((name) => [
      name,
      true,
    ]),
  ]);
}

const packages = new Map();
const visitedDirectories = new Set();
const missingDependencies = [];

function visit(directory) {
  const realDirectory = realpathSync(directory);
  if (visitedDirectories.has(realDirectory)) return;
  visitedDirectories.add(realDirectory);

  const manifest = readJson(packageManifestPath(realDirectory));
  if (!internalDirectories.has(realDirectory)) {
    packages.set(`${manifest.name}@${manifest.version}`, {
      directory: realDirectory,
      manifest,
    });
  }

  for (const [name, optional] of dependencyNames(manifest)) {
    const dependencyDirectory = resolveDependency(name, realDirectory);
    if (!dependencyDirectory) {
      if (!optional) missingDependencies.push(`${manifest.name} requires ${name}`);
      continue;
    }
    visit(dependencyDirectory);
  }
}

if (!isPackageDirectory(workspaceDirectory)) {
  throw new Error(`Workspace package.json not found: ${workspaceArgument}`);
}

visit(realpathSync(workspaceDirectory));

if (missingDependencies.length > 0) {
  throw new Error(
    `Required production dependencies are missing:\n${missingDependencies
      .sort()
      .map((message) => `- ${message}`)
      .join("\n")}`,
  );
}

const licenseFilePattern =
  /^(?:license|licence|copying|copyright|notice)(?:$|[._-])/i;
const fallbackPatterns = [
  /^@astrojs\/compiler-binding-/,
  /^@better-auth\/utils$/,
  /^@bruits\/satteri-/,
  /^@cloudflare\/(?:kv-asset-handler|unenv-preset|vite-plugin|workerd-)/,
  /^@esbuild\//,
  /^@img\/sharp-libvips-/,
  /^@next\/(?:env|swc-)/,
  /^@rolldown\/binding-/,
  /^am-i-vibing$/,
  /^boolbase$/,
  /^client-only$/,
  /^drizzle-orm$/,
  /^is-node-process$/,
  /^miniflare$/,
  /^piccolore$/,
  /^postgres$/,
  /^process-ancestry$/,
  /^react-remove-scroll-bar$/,
  /^standardwebhooks$/,
  /^workerd$/,
  /^wrangler$/,
];

function licenseFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && licenseFilePattern.test(entry.name),
    )
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(join(directory, entry.name), "utf8").trim(),
    }))
    .filter((file) => file.text.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function licenseExpression(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license?.type) return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((license) => license.type ?? license)
      .filter(Boolean)
      .join(" OR ");
  }
  return "Not declared in package.json";
}

function sourceUrl(manifest) {
  if (typeof manifest.repository === "string") return manifest.repository;
  if (manifest.repository?.url) return manifest.repository.url;
  return manifest.homepage ?? "Not declared";
}

const unreviewedMissingNotices = [];
const records = [...packages.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => {
    const files = licenseFiles(value.directory);
    if (
      files.length === 0 &&
      !fallbackPatterns.some((pattern) => pattern.test(value.manifest.name))
    ) {
      unreviewedMissingNotices.push(key);
    }
    return {
      key,
      expression: licenseExpression(value.manifest),
      source: sourceUrl(value.manifest),
      files,
    };
  });

if (unreviewedMissingNotices.length > 0) {
  throw new Error(
    `Production dependencies without a reviewed license notice:\n${unreviewedMissingNotices
      .map((name) => `- ${name}`)
      .join("\n")}`,
  );
}

const noticeGroups = new Map();
for (const record of records) {
  if (record.files.length === 0) continue;
  const text = record.files
    .map((file) => `===== ${file.name} =====\n${file.text}`)
    .join("\n\n");
  const hash = createHash("sha256").update(text).digest("hex");
  const group = noticeGroups.get(hash) ?? { packages: [], text };
  group.packages.push(record.key);
  noticeGroups.set(hash, group);
}

const lockHash = createHash("sha256")
  .update(readFileSync(join(repositoryRoot, "package-lock.json")))
  .digest("hex");
const baseNotices = readFileSync(
  join(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
  "utf8",
).trim();
const fallbackNotices = readFileSync(
  join(repositoryRoot, "third-party", "DEPENDENCY_LICENSE_FALLBACKS.txt"),
  "utf8",
).trim();

const lines = [
  baseNotices,
  "",
  fallbackNotices,
  "",
  "INSTALLED PRODUCTION DEPENDENCY INVENTORY",
  "",
  `Workspace: ${relative(repositoryRoot, workspaceDirectory).replaceAll(sep, "/")}`,
  `Package lock SHA-256: ${lockHash}`,
  "",
  ...records.flatMap((record) => [
    record.key,
    `License: ${record.expression}`,
    `Source: ${record.source}`,
    `Notice source: ${record.files.length > 0 ? "published package" : "reviewed fallback above"}`,
    "",
  ]),
  "PUBLISHED PACKAGE LICENSE AND NOTICE TEXTS",
  "",
];

for (const group of [...noticeGroups.values()].sort((left, right) =>
  left.packages[0].localeCompare(right.packages[0]),
)) {
  lines.push(
    "------------------------------------------------------------",
    group.packages.join(", "),
    "------------------------------------------------------------",
    "",
    group.text,
    "",
  );
}

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, `${lines.join("\n").trimEnd()}\n`, "utf8");

console.log(
  `Staged notices for ${records.length} production dependencies at ${targetArgument}.`,
);
