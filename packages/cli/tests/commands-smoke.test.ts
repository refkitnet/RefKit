import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(cliRoot, "dist", "index.js");

function runCli(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: cliRoot,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("refkitnet command surface", () => {
  it("lists top-level commands in --help", async () => {
    const { stdout, stderr, code } = await runCli(["--help"], {
      REFKIT_API_URL: "https://app.refkit.net",
    });
    const output = `${stdout}\n${stderr}`;

    expect(code).toBe(0);

    for (const command of [
      "auth",
      "init",
      "apps",
      "programs",
      "affiliates",
      "network",
      "links",
      "commissions",
      "payouts",
      "status",
    ]) {
      expect(output).toContain(command);
    }

    expect(output).toContain("https://refkit.gitbook.io/docs");
    expect(output).toContain("/integrate-refkit");
    expect(output).toContain("/reference/sdk-cli-mcp");
  });

  it("shows documentation links in subcommand help", async () => {
    const { stdout, stderr, code } = await runCli(["apps", "--help"], {
      REFKIT_API_URL: "https://app.refkit.net",
    });
    const output = `${stdout}\n${stderr}`;

    expect(code).toBe(0);
    expect(output).toContain("https://refkit.gitbook.io/docs");
  });

  it("does not show RefKit Cloud docs for a custom API origin", async () => {
    const { stdout, stderr, code } = await runCli(["--help"], {
      REFKIT_API_URL: "https://refkit.internal.example",
    });
    const output = `${stdout}\n${stderr}`;

    expect(code).toBe(0);
    expect(output).toContain("Self-Hosted instance operator");
    expect(output).not.toContain("refkit.gitbook.io");
  });
});
