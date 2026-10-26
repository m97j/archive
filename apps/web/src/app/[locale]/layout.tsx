import type { ReactNode } from "react";
import Link from "next/link";
import { SPACES } from "@archive/contracts";

import { SiteHeader } from "@/components/site-header";
import { requireLocale } from "@/lib/routing";
import { portfolioUrl, siteCopy } from "@/lib/site-copy";
import { googleAnalyticsSettings } from "@/lib/google-analytics-settings";
import { PrivacyPreferences } from "@/components/privacy-preferences";
import "@/components/privacy-preferences.css";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const locale = requireLocale((await params).locale);
  const copy = siteCopy(locale);
  return (
    <div className="site-shell" lang={locale}>
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <SiteHeader locale={locale} spaces={SPACES} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <p>{copy.footerInvitation}</p>
          <Link href={`/${locale}/archive`} className="footer-invitation">
            <span className="footer-title">Keep exploring.</span>
            <span className="footer-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>
        <div className="footer-bottom">
          <Link className="wordmark" href={`/${locale}`}>
            marchivej.<span>© Minjae</span>
          </Link>
          <nav aria-label={locale === "ko" ? "외부 링크" : "Resources"}>
            <a href="https://github.com/m97j">GitHub</a>
            <a href="https://huggingface.co/m97j">Hugging Face</a>
            <a href={portfolioUrl(locale)}>{copy.fallback}</a>
            <PrivacyPreferences locale={locale} analytics={googleAnalyticsSettings()} />
          </nav>
        </div>
      </footer>
    </div>
  );
}
