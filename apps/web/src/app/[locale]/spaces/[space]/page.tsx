import Link from "next/link";

import { ContentCard } from "@/components/content-card";
import { getPublicNavigation, listPublicDocuments } from "@/lib/archive-api.server";
import { requireLocale, requireSpace, spaceLabel } from "@/lib/routing";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ locale: string; space: string }>;
}) {
  const values = await params;
  const locale = requireLocale(values.locale);
  const space = requireSpace(values.space);
  const [navigation, page] = await Promise.all([
    getPublicNavigation({ locale, space }),
    listPublicDocuments({ locale, space, limit: 24 }),
  ]);
  return (
    <section className="space-page">
      <div className="space-heading">
        <p className="eyebrow">{spaceLabel(space)}</p>
        <h1>{navigation.label ?? spaceLabel(space)}</h1>
        {navigation.description ? <p>{navigation.description}</p> : null}
      </div>
      {navigation.nodes.length > 0 ? (
        <nav className="taxonomy-nav" aria-label={`${spaceLabel(space)} topics`}>
          {navigation.nodes.map((node) => (
            <Link
              key={node.id}
              href={`/${locale}/archive?space=${space}&taxonomy=${encodeURIComponent(node.stableKey)}`}
            >
              <span>{node.label}</span>
              {node.description ? <small>{node.description}</small> : null}
            </Link>
          ))}
        </nav>
      ) : null}
      {page.items.length === 0 ? (
        <p className="empty-state">No public records are assigned to this space yet.</p>
      ) : (
        <div className="content-grid">
          {page.items.map((item) => (
            <ContentCard key={item.contentId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
