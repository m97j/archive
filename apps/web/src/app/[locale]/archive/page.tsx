import type { ContentKind, Space } from "@archive/contracts";
import Link from "next/link";

import { ContentCard } from "@/components/content-card";
import { listPublicDocuments } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";

interface ArchiveSearch {
  q?: string | string[];
  kind?: string | string[];
  space?: string | string[];
  tag?: string | string[];
  taxonomy?: string | string[];
  cursor?: string | string[];
}

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export default async function ArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ArchiveSearch>;
}) {
  const locale = requireLocale((await params).locale);
  const search = await searchParams;
  const q = one(search.q);
  const kind = one(search.kind) as ContentKind | undefined;
  const space = one(search.space)?.toUpperCase() as Space | undefined;
  const tag = one(search.tag);
  const taxonomy = one(search.taxonomy);
  const cursor = one(search.cursor);
  const page = await listPublicDocuments({
    locale,
    limit: 24,
    ...(q ? { q } : {}),
    ...(kind ? { kind } : {}),
    ...(space ? { space } : {}),
    ...(tag ? { tag } : {}),
    ...(taxonomy ? { taxonomy } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ q, kind, space, tag, taxonomy })) {
    if (value) next.set(key, value);
  }
  if (page.nextCursor) next.set("cursor", page.nextCursor);

  return (
    <section className="archive-browser">
      <div className="browser-heading">
        <p className="eyebrow">Index</p>
        <h1>Browse the archive</h1>
      </div>
      <form className="search-form" action={`/${locale}/archive`}>
        <label htmlFor="archive-query">Search titles, notes, and compiled text</label>
        <div>
          <input
            id="archive-query"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="e.g. retrieval evaluation"
          />
          <button type="submit">Search</button>
        </div>
      </form>
      <div className="result-count" aria-live="polite">
        {page.items.length} record{page.items.length === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : " on this page"}
      </div>
      {page.items.length === 0 ? (
        <div className="empty-state">
          <p>No records match these filters.</p>
          <Link className="text-link" href={`/${locale}/archive`}>
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="content-grid">
          {page.items.map((item) => (
            <ContentCard key={item.contentId} item={item} />
          ))}
        </div>
      )}
      {page.nextCursor ? (
        <Link className="next-page" href={`/${locale}/archive?${next.toString()}`}>
          Next page <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </section>
  );
}
