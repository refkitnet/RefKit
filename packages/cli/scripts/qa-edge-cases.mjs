#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scriptDir);
const cliEntry = join(packageRoot, "dist", "index.js");
const appDir = join(packageRoot, "..", "..", "apps", "app");
const baseUrl = process.env.REFKIT_API_URL ?? "http://localhost:3000";
const deviceClientId = "refkitnet-cli";

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: options.cwd ?? appDir,
    env: {
      ...process.env,
      REFKIT_API_URL: baseUrl,
      NO_COLOR: "1",
    },
    encoding: "utf8",
    shell: false,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function saveCliConfig(token) {
  const configPath = join(homedir(), ".refkitnet", "config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify({ api_url: baseUrl, token }, null, 2)}\n`,
    "utf8"
  );
}

async function waitForMagicLink(sql, email, timeoutMs = 15000) {
  const logPath = join(appDir, ".next", "dev", "logs", "next-development.log");
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const rows = await sql`
      SELECT identifier
      FROM verifications
      WHERE value LIKE ${`%${email}%`}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (rows.length > 0) {
      const url = new URL("/api/auth/magic-link/verify", baseUrl);
      url.searchParams.set("token", rows[0].identifier);
      url.searchParams.set("callbackURL", "/dashboard");
      return url.toString();
    }

    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      const marker = `to: ${email}`;
      const markerIndex = log.lastIndexOf(marker);

      if (markerIndex !== -1) {
        const slice = log.slice(markerIndex, markerIndex + 1200);
        const match = slice.match(
          /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?[^\s"]+/
        );

        if (match) {
          return match[0];
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Magic link for ${email} not found within ${timeoutMs}ms.`);
}

async function authenticateForQa(sql, email) {
  const signIn = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "CLI QA Owner",
      email,
      primary_mode: "owner",
      callback_url: "/dashboard",
    }),
  });

  if (!signIn.ok) {
    throw new Error("Magic link sign-in failed.");
  }

  const verifyUrl = await waitForMagicLink(sql, email);
  const verify = await fetch(verifyUrl, {
    redirect: "manual",
    headers: { Origin: baseUrl },
  });

  if (![302, 303, 307].includes(verify.status)) {
    throw new Error(`Magic link verify failed with status ${verify.status}.`);
  }

  let cookies = "";

  for (const setCookie of verify.headers.getSetCookie?.() ?? []) {
    const [pair] = setCookie.split(";");
    const [name, ...rest] = pair.split("=");
    cookies = cookies ? `${cookies}; ${name}=${rest.join("=")}` : `${name}=${rest.join("=")}`;
  }

  const device = await fetch(`${baseUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: deviceClientId }),
  }).then((response) => response.json());

  await fetch(`${baseUrl}/api/auth/device?user_code=${encodeURIComponent(device.user_code)}`, {
    headers: { Cookie: cookies, Origin: baseUrl },
  });

  await fetch(`${baseUrl}/api/auth/device/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      Origin: baseUrl,
    },
    body: JSON.stringify({ userCode: device.user_code }),
  });

  const tokenResponse = await fetch(`${baseUrl}/api/auth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: deviceClientId,
    }),
  }).then((response) => response.json());

  if (!tokenResponse.access_token) {
    throw new Error("Device authorization failed during QA setup.");
  }

  saveCliConfig(tokenResponse.access_token);
  return tokenResponse.access_token;
}

async function api(token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : null;
  }
  catch {
    body = text;
  }

  return { status: response.status, body };
}

const findings = [];

function report(name, pass, detail) {
  findings.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark} ${name}`);
  if (detail) {
    console.log(`     ${detail}`);
  }
}

async function main() {
  const env = {
    ...loadEnvFile(join(appDir, ".env.local")),
    ...process.env,
  };

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from apps/app/.env.local");
  }

  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const runId = Date.now().toString(36);
  const email = `cli-qa-${runId}@refkit.local`;

  try {
    const token = await authenticateForQa(sql, email);

    const org = await api(token, "/api/v1/organizations", {
      method: "POST",
      body: JSON.stringify({ name: `CLI QA Org ${runId}` }),
    });
    const orgId = org.body.id;

    const app = await api(token, "/api/v1/apps", {
      method: "POST",
      body: JSON.stringify({
        organization_id: orgId,
        name: `QA App ${runId}`,
        website_url: "https://allowed.example.com/signup",
      }),
    });
    const appId = app.body.id;

    console.log(`\nCLI QA against ${baseUrl}\n`);

    const configPath = join(homedir(), ".refkitnet", "config.json");
    const previousConfig = existsSync(configPath)
      ? readFileSync(configPath, "utf8")
      : null;
    writeFileSync(configPath, `${JSON.stringify({ api_url: baseUrl }, null, 2)}\n`);
    const missingAuth = runCli(["status"]);
    if (previousConfig) {
      writeFileSync(configPath, previousConfig);
    }
    else {
      unlinkSync(configPath);
    }
    saveCliConfig(token);

    report(
      "status without auth exits cleanly",
      missingAuth.status === 1 && missingAuth.output.includes("Not authenticated"),
      missingAuth.output.trim()
    );

    report(
      "status with bad app id exits cleanly",
      runCli(["status", "--app-id", "app_not_real"]).status === 1,
      runCli(["status", "--app-id", "app_not_real"]).output.trim()
    );

    const invalidPercent = runCli([
      "programs",
      "create",
      "--app-id",
      appId,
      "--name",
      "Bad Percent",
      "--slug",
      `bad-percent-${runId}`,
      "--destination-url",
      "https://allowed.example.com/signup",
      "--currency",
      "usd",
      "--reward-type",
      "percent",
      "--percent-value",
      "abc",
      "--recurring-duration-months",
      "lifetime",
    ]);
    report(
      "programs create rejects invalid percent flag",
      invalidPercent.status === 1 && invalidPercent.output.includes("percent-value"),
      invalidPercent.output.trim()
    );

    const highPercent = runCli([
      "programs",
      "create",
      "--app-id",
      appId,
      "--name",
      "High Percent",
      "--slug",
      `high-percent-${runId}`,
      "--destination-url",
      "https://allowed.example.com/signup",
      "--currency",
      "usd",
      "--reward-type",
      "percent",
      "--percent-value",
      "150",
      "--recurring-duration-months",
      "lifetime",
    ]);
    report(
      "programs create rejects out-of-range percent flag",
      highPercent.status === 1 && highPercent.output.includes("percent-value"),
      highPercent.output.trim()
    );

    const wrongUrl = runCli([
      "programs",
      "create",
      "--app-id",
      appId,
      "--name",
      "Wrong URL",
      "--slug",
      `wrong-url-${runId}`,
      "--destination-url",
      "https://not-allowed.example.com",
      "--currency",
      "usd",
      "--reward-type",
      "percent",
      "--percent-value",
      "20",
      "--recurring-duration-months",
      "lifetime",
    ]);
    report(
      "programs create rejects website URL mismatch",
      wrongUrl.status === 1 && wrongUrl.output.includes("website URL"),
      wrongUrl.output.trim()
    );

    const appsCreateResult = runCli([
      "apps",
      "create",
      "--organization-id",
      orgId,
      "--name",
      `QA App 2 ${runId}`,
      "--website-url",
      "allowed2.example.com/signup",
      "--json",
    ]);
    report(
      "apps create normalizes website URL flag",
      (() => {
        if (appsCreateResult.status !== 0) {
          return false;
        }

        try {
          const body = JSON.parse(appsCreateResult.stdout);
          return body.website_url === "https://allowed2.example.com/signup";
        }
        catch {
          return false;
        }
      })(),
      appsCreateResult.output.trim()
    );

    const invalidAppUrl = runCli([
      "apps",
      "create",
      "--organization-id",
      orgId,
      "--name",
      "Bad URL App",
      "--website-url",
      "not a url",
    ]);
    report(
      "apps create rejects invalid website URL flag",
      invalidAppUrl.status === 1 && invalidAppUrl.output.includes("valid website URL"),
      invalidAppUrl.output.trim()
    );

    const badMonths = runCli([
      "programs",
      "create",
      "--app-id",
      appId,
      "--name",
      "Bad Months",
      "--slug",
      `bad-months-${runId}`,
      "--destination-url",
      "https://allowed.example.com/signup",
      "--currency",
      "usd",
      "--reward-type",
      "percent",
      "--percent-value",
      "20",
      "--recurring-duration-months",
      "0",
    ]);
    report(
      "programs create rejects zero recurring months",
      badMonths.status === 1 && badMonths.output.includes("recurring-duration-months"),
      badMonths.output.trim()
    );

    const failCount = findings.filter((item) => !item.pass).length;
    console.log(`\n${findings.length - failCount}/${findings.length} checks passed`);

    if (failCount > 0) {
      process.exit(1);
    }
  }
  finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
