import { CONTENT_KINDS, SPACES, type PublicContentPage } from "@archive/contracts";
import Link from "next/link";

import { ContentCard } from "@/components/content-card";
import { CatalogNotice } from "@/components/catalog-notice";
import { parseArchiveSearch, searchQuery, type ArchiveSearch } from "@/lib/archive-search";
import { listPublicDocuments, searchPublicDocuments } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";
import { contentKindLabel, siteCopy } from "@/lib/site-copy";

export default async function ArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ArchiveSearch>;
}) {
  const locale = requireLocale((await params).locale);
  const copy = siteCopy(locale);
  const { q, kind, space, tag, taxonomy, cursor } = parseArchiveSearch(await searchParams);
  let page: PublicContentPage | undefined;
  let searchMode: "hybrid" | "lexical" | undefined;
  try {
    if (q && !kind && !space && !tag && !taxonomy && !cursor) {
      const result = await searchPublicDocuments({ locale, q, limit: 24 });
      page = { items: result.items };
      searchMode = result.mode;
    } else
      page = await listPublicDocuments({
        locale,
        limit: 24,
        ...(q ? { q } : {}),
        ...(kind ? { kind } : {}),
        ...(space ? { space } : {}),
        ...(tag ? { tag } : {}),
        ...(taxonomy ? { taxonomy } : {}),
        ...(cursor ? { cursor } : {}),
      });
  } catch {
    /* Report unavailable service separately from an empty result. */
  }
  const filters = { q, kind, space, tag, taxonomy };
  const filtered = Object.values(filters).some(Boolean);
  const next = searchQuery({ ...filters, cursor: page?.nextCursor });

  return (
    <section
      className="archive-browser"
      data-analytics-path={`/${locale}/archive`}
      data-analytics-title="Archive · marchivej"
    >
      <div className="browser-heading">
        <p className="eyebrow">{copy.browseEyebrow}</p>
        <h1>{copy.browseTitle}</h1>
      </div>
      <nav className="archive-tabs" aria-label={copy.space}>
        <Link
          href={`/${locale}/archive?${searchQuery({ ...filters, space: undefined })}`}
          aria-current={!space ? "page" : undefined}
        >
          {copy.all}
        </Link>
        {(["RESEARCH", "DOCS", "LOGS"] as const).map((collection) => (
          <Link
            key={collection}
            href={`/${locale}/archive?${searchQuery({ ...filters, space: collection })}`}
            aria-current={space === collection ? "page" : undefined}
          >
            {copy.spaces[collection]}
          </Link>
        ))}
      </nav>
      <form className="search-form" action={`/${locale}/archive`}>
        <label htmlFor="archive-query">{copy.query}</label>
        <div className="search-input-row">
          <input
            id="archive-query"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={copy.queryPlaceholder}
            maxLength={200}
          />
          <button type="submit">{copy.search}</button>
        </div>
        <div className="search-filters">
          <label>
            <span id="kind-label">{copy.kind}</span>
            <select name="kind" aria-labelledby="kind-label" defaultValue={kind ?? ""}>
              <option value="">{copy.all}</option>
              {CONTENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {contentKindLabel(value, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span id="space-label">{copy.space}</span>
            <select name="space" aria-labelledby="space-label" defaultValue={space ?? ""}>
              <option value="">{copy.all}</option>
              {SPACES.map((value) => (
                <option key={value} value={value}>
                  {copy.spaces[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.tag}
            <input
              name="tag"
              defaultValue={tag}
              maxLength={100}
              placeholder={copy.tagPlaceholder}
            />
          </label>
        </div>
        {taxonomy ? <input type="hidden" name="taxonomy" value={taxonomy} /> : null}
      </form>
      {filtered ? (
        <nav className="filter-chips" aria-label={copy.activeFilters}>
          {Object.entries(filters)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <Link
                key={key}
                href={`/${locale}/archive?${searchQuery({ ...filters, [key]: undefined })}`}
                aria-label={`${locale === "ko" ? "필터 해제" : "Remove filter"}: ${value}`}
              >
                <span>
                  {key === "space" && space
                    ? copy.spaces[space]
                    : key === "kind" && kind
                      ? contentKindLabel(kind, locale)
                      : value}
                </span>
                <span aria-hidden="true">×</span>
              </Link>
            ))}
          <Link href={`/${locale}/archive`}>{copy.clear}</Link>
        </nav>
      ) : null}
      <div className="result-count" aria-live="polite">
        {page ? `${copy.results}: ${page.items.length}` : copy.unavailable}
        {searchMode ? (
          <span>
            {" "}
            ·{" "}
            {searchMode === "hybrid"
              ? locale === "ko"
                ? "의미·키워드 검색"
                : "Semantic + keyword search"
              : locale === "ko"
                ? "키워드 검색"
                : "Keyword search"}
          </span>
        ) : null}
      </div>
      {!page?.items.length ? (
        <CatalogNotice
          locale={locale}
          state={!page ? "unavailable" : filtered ? "filtered" : "empty"}
        />
      ) : (
        <div className="content-grid">
          {page.items.map((item) => (
            <ContentCard key={item.contentId} item={item} />
          ))}
        </div>
      )}
      {cursor ? (
        <Link className="next-page" href={`/${locale}/archive?${searchQuery(filters)}`}>
          ← {copy.previous}
        </Link>
      ) : null}
      {page?.nextCursor ? (
        <Link className="next-page" href={`/${locale}/archive?${next}`}>
          {copy.next} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </section>
  );
}
