import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(cliRoot, "dist", "index.js");

describe("ensureCliSession via init", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      }
      catch {
        // Windows can keep handles open briefly after child exit.
      }

      tempRoot = "";
    }
  });

  it("re-authenticates when the saved token is invalid", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "refkit-cli-auth-retry-"));
    const home = join(tempRoot, "home");
    const configPath = join(home, ".refkitnet", "config.json");
    mkdirSync(dirname(configPath), { recursive: true });

    let meCalls = 0;
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      const auth = request.headers.authorization ?? "";

      if (request.method === "POST" && request.url === "/api/auth/device/code") {
        response.end(JSON.stringify({
          device_code: "device_test",
          user_code: "TEST-CODE",
          verification_uri: "/device",
          verification_uri_complete: "http://127.0.0.1/device?user_code=TEST-CODE",
          expires_in: 600,
          interval: 0,
        }));
        return;
      }

      if (request.method === "POST" && request.url === "/api/auth/device/token") {
        response.end(JSON.stringify({
          access_token: "session_refreshed",
          token_type: "Bearer",
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/v1/me") {
        meCalls += 1;

        if (auth === "Bearer stale_token") {
          response.statusCode = 401;
          response.end(JSON.stringify({
            error: {
              type: "unauthorized",
              code: "invalid_credentials",
              message: "Invalid credentials.",
            },
          }));
          return;
        }

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
        response.end(JSON.stringify({ test_api_key: null }));
        return;
      }

      if (request.method === "POST" && request.url === "/v1/api-keys") {
        response.end(JSON.stringify({
          id: "key_fixture",
          key: "rk_test_app_fixture",
          prefix: "rk_test_app_",
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
    writeFileSync(
      configPath,
      JSON.stringify({ api_url: apiUrl, token: "stale_token" }),
    );

    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const child = spawn(process.execPath, [
        cliEntry,
        "init",
        "--api-url", apiUrl,
        "--app-id", "app_fixture",
        "--program-id", "prg_fixture",
        "--skip-sdk-install",
      ], {
        cwd: tempRoot,
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
    expect(meCalls).toBe(2);
    expect(result.output).toContain("Signing in again");
    expect(result.output).toContain("API key created");
  }, 15_000);
});
