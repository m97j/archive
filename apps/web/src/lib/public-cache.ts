import type { Locale } from "@archive/contracts";

export function publicCacheTag(locale: Locale): string {
  return `archive:public:${locale}`;
}
