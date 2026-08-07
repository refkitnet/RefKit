import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../assets/icon-32.png"
);

export function getServerIcons() {
  const iconBase64 = readFileSync(ICON_PATH).toString("base64");

  return [
    {
      src: `data:image/png;base64,${iconBase64}`,
      mimeType: "image/png",
      sizes: ["32x32"],
    },
  ];
}
