import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { API_ENDPOINTS } from "@/app/api/v1/route";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return routeFiles(entryPath);
    }

    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

function routePath(root: string, file: string) {
  const directory = path.relative(root, path.dirname(file));

  if (!directory) {
    return "/v1";
  }

  const segments = directory.split(path.sep).map((segment) => {
    const parameter = segment.match(/^\[(.+)]$/);
    return parameter ? `:${parameter[1]}` : segment;
  });

  return `/v1/${segments.join("/")}`;
}

function exportedMethods(source: string) {
  const methods = new Set<string>();
  const functionPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const exportPattern = /export\s*\{([^}]+)\}/g;

  for (const match of source.matchAll(functionPattern)) {
    methods.add(match[1]);
  }

  for (const block of source.matchAll(exportPattern)) {
    for (const method of HTTP_METHODS) {
      if (new RegExp(`\\b${method}\\b`).test(block[1])) {
        methods.add(method);
      }
    }
  }

  return [...methods];
}

function normalizeIndexEntry(entry: string) {
  return entry
    .replace(/ \(compatibility alias\)$/, "")
    .replace(/ \(public browser or App-scoped API key\)$/, "");
}

describe("API index", () => {
  it("matches every implemented v1 route method", () => {
    const root = path.resolve(process.cwd(), "src/app/api/v1");
    const implemented = routeFiles(root)
      .flatMap((file) => {
        const apiPath = routePath(root, file);

        if (apiPath === "/v1") {
          return [];
        }

        return exportedMethods(readFileSync(file, "utf8")).map(
          (method) => `${method} ${apiPath}`
        );
      })
      .sort();
    const indexed = API_ENDPOINTS.map(normalizeIndexEntry).sort();

    expect(indexed).toEqual(implemented);
  });
});
