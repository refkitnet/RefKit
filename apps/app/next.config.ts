import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  ...(process.env.REFKIT_BUILD_STANDALONE === "true"
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: resolve(process.cwd(), "../.."),
        images: { unoptimized: true },
      }
    : {}),
  async rewrites() {
    // The public API contract is /v1/*; route handlers live under /api/v1/*.
    return [
      {
        source: "/v1",
        destination: "/api/v1",
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
