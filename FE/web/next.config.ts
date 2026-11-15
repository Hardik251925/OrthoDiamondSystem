import os from "node:os";
import type { NextConfig } from "next";

// GITHUB_PAGES=1 -> static export (out/) served from https://<user>.github.io/<repo>/
const pages = process.env.GITHUB_PAGES === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Dev server must accept requests coming via the LAN IP (same-Wi-Fi phones) and the ngrok domain.
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const backend = process.env.BACKEND_URL ?? "http://localhost:4100";

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanIps, ...(process.env.NGROK_DOMAIN ? [process.env.NGROK_DOMAIN] : [])],
  ...(pages
    ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true } }
    : {
        // Normally the gateway (:8100) routes /api and /uploads; these rewrites make :3100 work on its own too.
        async rewrites() {
          return [
            { source: "/api/:path*", destination: `${backend}/api/:path*` },
            { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
          ];
        },
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
