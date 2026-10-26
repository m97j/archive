import Link from "next/link";
import type { PublicContentPage, PublicNavigation } from "@archive/contracts";

import { ContentCard } from "@/components/content-card";
import { CatalogNotice } from "@/components/catalog-notice";
import { ProfileIntro, SelectedProjects } from "@/components/portfolio-overview";
import { getPublicNavigation, listPublicDocuments } from "@/lib/archive-api.server";
import { requireLocale, requireSpace, spaceLabel } from "@/lib/routing";
import { siteCopy } from "@/lib/site-copy";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ locale: string; space: string }>;
}) {
  const values = await params;
  const locale = requireLocale(values.locale);
  const space = requireSpace(values.space);
  const copy = siteCopy(locale);
  let navigation: PublicNavigation | undefined;
  let page: PublicContentPage | undefined;
  try {
    [navigation, page] = await Promise.all([
      getPublicNavigation({ locale, space }),
      listPublicDocuments({ locale, space, limit: 24 }),
    ]);
  } catch {
    /* Keep the repository-backed project overview available. */
  }
  return (
    <section
      className="space-page"
      data-analytics-path={`/${locale}/spaces/${values.space}`}
      data-analytics-title={`${spaceLabel(space)} · marchivej`}
    >
      <div className="space-heading">
        <p className="eyebrow">{spaceLabel(space)}</p>
        <h1>{navigation?.label ?? copy.spaces[space]}</h1>
        {navigation?.description ? <p>{navigation.description}</p> : null}
      </div>
      {space === "ABOUT" ? (
        <div className="about-overview">
          <ProfileIntro locale={locale} />
          <p>{copy.heroDescription}</p>
        </div>
      ) : null}
      {space === "WORK" ? <SelectedProjects locale={locale} /> : null}
      {space === "RESEARCH" ? (
        <div className="research-entry">
          <span className="eyebrow">{copy.lead}</span>
          <a href="https://github.com/m97j/axiom-world">
            Axiom World <span aria-hidden="true">↗</span>
          </a>
          <p>{copy.leadDescription}</p>
        </div>
      ) : null}
      {navigation?.nodes.length ? (
        <nav className="taxonomy-nav" aria-label={`${copy.spaces[space]} · ${copy.topics}`}>
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
      {!page?.items.length ? (
        <CatalogNotice locale={locale} state={page ? "collection" : "unavailable"} />
      ) : (
        <div className="content-grid">
          {page.items.map((item) => (
            <ContentCard key={item.contentId} item={item} />
          ))}
        </div>
      )}
      {page?.nextCursor ? (
        <Link
          className="next-page"
          href={`/${locale}/archive?space=${space}&cursor=${encodeURIComponent(page.nextCursor)}`}
        >
          {copy.next} →
        </Link>
      ) : null}
    </section>
  );
}
