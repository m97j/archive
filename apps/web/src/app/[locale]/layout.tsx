import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { requireLocale } from "@/lib/routing";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const locale = requireLocale((await params).locale);
  return (
    <div className="site-shell">
      <SiteHeader locale={locale} />
      <main>{children}</main>
      <footer className="site-footer">
        <span>Archive</span>
        <span>Evidence, revisions, and open questions.</span>
      </footer>
    </div>
  );
}
