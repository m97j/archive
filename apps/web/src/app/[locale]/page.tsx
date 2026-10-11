import Link from "next/link";

import { ContentCard } from "@/components/content-card";
import { listPublicDocuments } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const page = await listPublicDocuments({ locale, limit: 12 });

  return (
    <>
      <section className="archive-intro">
        <p className="eyebrow">Public knowledge record</p>
        <h1>Ideas are easier to trust when their history stays visible.</h1>
        <p>
          Research, projects, and working notes—published with their evidence and revision lineage.
        </p>
        <Link className="text-link" href={`/${locale}/archive`}>
          Browse the complete archive <span aria-hidden="true">→</span>
        </Link>
      </section>
      <section className="latest-section" aria-labelledby="latest-heading">
        <div className="section-heading">
          <p className="eyebrow">Recently published</p>
          <h2 id="latest-heading">Latest records</h2>
          <span>{page.items.length.toString().padStart(2, "0")}</span>
        </div>
        {page.items.length === 0 ? (
          <p className="empty-state">No public records have been published in this locale yet.</p>
        ) : (
          <div className="content-grid">
            {page.items.map((item) => (
              <ContentCard key={item.contentId} item={item} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
