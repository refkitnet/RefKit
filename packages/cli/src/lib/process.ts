import { spawn } from "node:child_process";

export const DEVICE_CLIENT_ID = "refkitnet-cli";

export function openBrowser(url: string) {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be opened.");
  }

  const browserUrl = parsedUrl.toString();
  const platform = process.platform;
  let command = "xdg-open";
  let args = [browserUrl];

  if (platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", browserUrl];
  }
  else if (platform === "darwin") {
    command = "open";
    args = [browserUrl];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => {
    // The verification URL is already printed, so a missing system opener is non-fatal.
  });
  child.unref();
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
