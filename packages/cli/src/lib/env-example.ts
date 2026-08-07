import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENV_KEY = "REFKIT_API_KEY=";
const ENV_COMMENT =
  "# RefKit app API key (server-side only). Create one with `refkitnet init` or the dashboard.";

export function mergeEnvExample(cwd = process.cwd()) {
  const envExamplePath = join(cwd, ".env.example");
  let content = "";

  if (existsSync(envExamplePath)) {
    content = readFileSync(envExamplePath, "utf8");
  }

  const lines = content.length > 0 ? content.replace(/\r\n/g, "\n").split("\n") : [];
  const hasKey = lines.some((line) => line.startsWith(ENV_KEY) || line === "REFKIT_API_KEY");

  if (!hasKey) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }

    lines.push(ENV_COMMENT);
    lines.push(`${ENV_KEY}<your-app-api-key>`);
  }

  const next = `${lines.join("\n").replace(/\n*$/, "\n")}`;
  writeFileSync(envExamplePath, next, "utf8");

  return envExamplePath;
}
