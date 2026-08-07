import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(cliRoot, "fixtures", "react-app");
const cliEntry = join(cliRoot, "dist", "index.js");

describe("refkitnet init fixture", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  it("runs the compiled CLI against a React customer app", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "refkit-init-fixture-"));
    const customerApp = join(tempRoot, "customer-app");
    const home = join(tempRoot, "home");
    cpSync(fixtureRoot, customerApp, { recursive: true });

    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader("Content-Type", "application/json");

      if (request.method === "GET" && request.url === "/v1/me") {
        response.end(JSON.stringify({
          email: "owner@refkit.local",
          name: "Owner",
          primary_mode: "owner",
          organizations: [],
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/v1/apps/app_fixture") {
        response.end(JSON.stringify({
          id: "app_fixture",
          name: "Fixture app",
          organization_id: "org_fixture",
          revenue_source: "api",
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/v1/programs/prg_fixture") {
        response.end(JSON.stringify({
          id: "prg_fixture",
          app_id: "app_fixture",
          name: "Fixture program",
          slug: "fixture-program",
        }));
        return;
      }

      if (
        request.method === "GET"
        && request.url === "/v1/apps/app_fixture/setup-status"
      ) {
        response.end(JSON.stringify({
          test_api_key: "rk_test_app_fixture",
        }));
        return;
      }

      if (request.method === "POST" && request.url === "/v1/api-keys") {
        response.statusCode = 409;
        response.end(JSON.stringify({ error: { message: "Unexpected key creation" } }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: "Not found" } }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Test server did not bind to a TCP port.");
    }

    const apiUrl = `http://127.0.0.1:${address.port}`;
    const configPath = join(home, ".refkitnet", "config.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ api_url: apiUrl, token: "session_fixture" }));

    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const child = spawn(process.execPath, [
        cliEntry,
        "init",
        "--api-url", apiUrl,
        "--app-id", "app_fixture",
        "--program-id", "prg_fixture",
        "--skip-sdk-install",
      ], {
        cwd: customerApp,
        env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.on("close", (code) => resolve({ code, output }));
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("Detected framework: react");
    expect(result.output).toContain("API key ready");
    expect(result.output).toContain("Fixture program");
    expect(readFileSync(join(customerApp, ".env.example"), "utf8")).toContain(
      "REFKIT_API_KEY=",
    );
    expect(requests).toEqual([
      "GET /v1/me",
      "GET /v1/apps/app_fixture",
      "GET /v1/programs/prg_fixture",
      "GET /v1/apps/app_fixture/setup-status",
    ]);
  }, 15_000);

  it("creates a live key without requesting test setup status", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "refkit-init-live-fixture-"));
    const customerApp = join(tempRoot, "customer-app");
    const home = join(tempRoot, "home");
    cpSync(fixtureRoot, customerApp, { recursive: true });

    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader("Content-Type", "application/json");

      if (request.method === "GET" && request.url === "/v1/me") {
        response.end(JSON.stringify({
          email: "owner@refkit.local",
          name: "Owner",
          primary_mode: "owner",
          organizations: [],
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/v1/apps/app_fixture") {
        response.end(JSON.stringify({
          id: "app_fixture",
          name: "Fixture app",
          organization_id: "org_fixture",
          revenue_source: "api",
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/v1/programs/prg_fixture") {
        response.end(JSON.stringify({
          id: "prg_fixture",
          app_id: "app_fixture",
          name: "Fixture program",
          slug: "fixture-program",
        }));
        return;
      }

      if (request.method === "POST" && request.url === "/v1/api-keys") {
        response.end(JSON.stringify({
          id: "key_live",
          key: "rk_app_live_fixture",
          prefix: "rk_app_",
        }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: "Not found" } }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Test server did not bind to a TCP port.");
    }

    const apiUrl = `http://127.0.0.1:${address.port}`;
    const configPath = join(home, ".refkitnet", "config.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ api_url: apiUrl, token: "session_fixture" }));

    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const child = spawn(process.execPath, [
        cliEntry,
        "init",
        "--api-url", apiUrl,
        "--app-id", "app_fixture",
        "--program-id", "prg_fixture",
        "--skip-sdk-install",
        "--live",
      ], {
        cwd: customerApp,
        env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.on("close", (code) => resolve({ code, output }));
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("Live API key created");
    expect(result.output).toContain("rk_app_live_fixture");
    expect(requests).toEqual([
      "GET /v1/me",
      "GET /v1/apps/app_fixture",
      "GET /v1/programs/prg_fixture",
      "POST /v1/api-keys",
    ]);
  }, 15_000);
});
