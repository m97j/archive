import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir:
    process.env.ARCHIVE_LOCAL_PREVIEW === "1" || process.env.NODE_ENV === "development"
      ? ".next-preview"
      : ".next",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@archive/contracts"],
  ...(process.env.ARCHIVE_BUILD_WORKERS === "1" ? { experimental: { cpus: 1 } } : {}),
};

export default nextConfig;
