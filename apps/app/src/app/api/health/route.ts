import { jsonOk } from "@/lib/errors";
import { getBuildIdentity } from "@/lib/runtime-metadata";

export async function GET() {
  const build = getBuildIdentity();

  return jsonOk({
    status: "ok",
    service: "refkit-app",
    ...build,
  });
}
