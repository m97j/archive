export interface GoogleAnalyticsSettings {
  enabled: boolean;
  measurementId: string;
  origin: string;
}

/** Only explicit deployment configuration can expose the optional Google integration. */
export function googleAnalyticsSettings(): GoogleAnalyticsSettings {
  const measurementId = process.env.GA4_MEASUREMENT_ID ?? "";
  let origin = "";
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    )
      origin = url.origin;
  } catch {
    /* An incomplete deployment stays disabled. */
  }
  return {
    enabled:
      process.env.GA4_ENABLED === "true" &&
      /^G-[A-Z0-9]{6,20}$/.test(measurementId) &&
      Boolean(origin) &&
      (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production"),
    measurementId: /^G-[A-Z0-9]{6,20}$/.test(measurementId) ? measurementId : "",
    origin,
  };
}
