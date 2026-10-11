import type { Locale, PublicContentPage } from "@archive/contracts";
import Link from "next/link";
import { listPublicDocuments } from "@/lib/archive-api.server";
import { siteCopy } from "@/lib/site-copy";
import { contentKindLabel, portfolioUrl } from "@/lib/site-copy";

export async function LatestRecords({ locale }: { locale: Locale }) {
  const copy = siteCopy(locale);
  let page: PublicContentPage | undefined;
  try {
    page = await listPublicDocuments({ locale, limit: 4 });
  } catch {
    /* Static portfolio remains readable if the document service is unavailable. */
  }
  return (
    <section className="latest-section" aria-labelledby="latest-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.latestEyebrow}</p>
          <h2 id="latest-heading">{copy.latest}</h2>
        </div>
        <Link className="text-link" href={`/${locale}/archive`}>
          {copy.allRecords} <span aria-hidden="true">→</span>
        </Link>
      </div>
      {page?.items.length ? (
        <ol className="record-list">
          {page.items.map((item) => (
            <li key={item.contentId}>
              <span className="record-kind">{contentKindLabel(item.kind, locale)}</span>
              <Link href={item.path}>
                {item.title}
                <span aria-hidden="true">↗</span>
              </Link>
              <time dateTime={item.publishedAt}>
                {new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }).format(new Date(item.publishedAt))}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="notebook-empty">
          <span className="notebook-icon" aria-hidden="true">
            ↳
          </span>
          <p className="notice-title">{page ? copy.homeEmpty : copy.homeUnavailable}</p>
          <a href={portfolioUrl(locale)}>
            {copy.fallback} <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
      <nav className="collection-dock" aria-label={copy.space}>
        {(["RESEARCH", "DOCS", "LOGS"] as const).map((space) => (
          <Link key={space} href={`/${locale}/archive?space=${space}`}>
            {copy.spaces[space]} <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
