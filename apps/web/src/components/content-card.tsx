import type { PublicContentSummary } from "@archive/contracts";
import Link from "next/link";
import { contentKindLabel, siteCopy } from "@/lib/site-copy";

export function ContentCard({ item }: { item: PublicContentSummary }) {
  return (
    <article className="content-card">
      <div className="content-meta">
        <span>{contentKindLabel(item.kind, item.locale)}</span>
        <time dateTime={item.publishedAt}>
          {new Intl.DateTimeFormat(item.locale, { dateStyle: "medium" }).format(
            new Date(item.publishedAt),
          )}
        </time>
      </div>
      <h2>
        <Link href={item.path}>{item.title}</Link>
      </h2>
      {item.description ? <p>{item.description}</p> : null}
      {item.tags.length > 0 ? (
        <ul className="tag-list" aria-label={siteCopy(item.locale).tags}>
          {item.tags.map((tag) => (
            <li key={tag}>
              <Link href={`/${item.locale}/archive?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
