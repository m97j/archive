import type { Locale } from "@archive/contracts";
import Link from "next/link";
import { portfolioUrl, siteCopy } from "@/lib/site-copy";

export function CatalogNotice({
  locale,
  state,
}: {
  locale: Locale;
  state: "empty" | "unavailable" | "filtered" | "collection";
}) {
  const copy = siteCopy(locale);
  const heading =
    state === "unavailable"
      ? copy.unavailable
      : state === "filtered"
        ? copy.noMatches
        : state === "collection"
          ? copy.collectionEmpty
          : copy.empty;
  return (
    <div className="empty-state">
      <p className="notice-title">{heading}</p>
      <p>
        {state === "unavailable"
          ? copy.unavailableDetail
          : state === "filtered"
            ? copy.noMatchesDetail
            : copy.emptyDetail}
      </p>
      <div className="notice-links">
        {state === "filtered" ? (
          <Link className="text-link" href={`/${locale}/archive`}>
            {copy.clear}
          </Link>
        ) : (
          <Link className="text-link" href={`/${locale}#selected-projects`}>
            {copy.projects}
          </Link>
        )}
        <a className="text-link" href={portfolioUrl(locale)}>
          {copy.fallback} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
