import { getBuildIdentity } from "@/lib/runtime-metadata";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "refkit-app",
    ...getBuildIdentity(),
  });
}
