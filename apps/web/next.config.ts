import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@archive/contracts"],
  headers() {
    const adminHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/:locale/admin/:path*", headers: adminHeaders },
      { source: "/api/admin/:path*", headers: adminHeaders },
      { source: "/admin", headers: adminHeaders },
      { source: "/login", headers: adminHeaders },
    ];
  },
};

export default nextConfig;
