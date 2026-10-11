import { LOCALES } from "@archive/contracts";
import type { MetadataRoute } from "next";

/** Crawling guidance only; server-side authorization remains the access boundary. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/api/admin", ...LOCALES.map((locale) => `/${locale}/admin`)],
    },
  };
}
