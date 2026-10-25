import type { Metadata } from "next";
import { isReservedPublicationPath, type Locale, type PublicDocument } from "@archive/contracts";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { Suspense } from "react";

import { DocumentEnhancer } from "@/components/document-enhancer";
import { DocumentRecommendations } from "@/components/document-recommendations";
import { DocumentToc } from "@/components/document-toc";
import { resolvePublicDocument } from "@/lib/archive-api.server";
import { getDocumentRecommendations } from "@/lib/document-recommendations.server";
import { requireLocale } from "@/lib/routing";
import { contentKindLabel, siteCopy } from "@/lib/site-copy";

type PageParams = Promise<{ locale: string; slug: string[] }>;

async function Recommendations({ document, locale }: { document: PublicDocument; locale: Locale }) {
  return (
    <DocumentRecommendations
      key={`${document.contentId}:${document.artifact.sourceHash}`}
      locale={locale}
      recommendations={await getDocumentRecommendations(document)}
    />
  );
}

async function load(params: PageParams) {
  const values = await params;
  const locale = requireLocale(values.locale);
  const path = `/${locale}/${values.slug.join("/")}`;
  if (isReservedPublicationPath(path)) notFound();
  return { locale, result: await resolvePublicDocument(locale, path) };
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { result } = await load(params);
  return result?.type === "document"
    ? { title: result.title, description: result.description }
    : {};
}

export default async function DocumentPage({ params }: { params: PageParams }) {
  const { locale, result } = await load(params);
  if (!result) notFound();
  if (result.type === "redirect") {
    if (result.status === 301 || result.status === 308) permanentRedirect(result.toPath);
    redirect(result.toPath);
  }
  const copy = siteCopy(locale);
  return (
    <article className="document-page">
      <nav className="breadcrumbs" aria-label={locale === "ko" ? "현재 위치" : "Breadcrumb"}>
        <Link href={`/${locale}`}>{copy.home}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/archive`}>{copy.allRecords}</Link>
      </nav>
      <header>
        <p className="eyebrow">{contentKindLabel(result.kind, locale)}</p>
        <h1>{result.title}</h1>
        {result.description ? <p>{result.description}</p> : null}
        <div className="document-meta">
          <span>
            {copy.revision} {result.revisionNumber}
          </span>
          <time dateTime={result.publishedAt}>
            {copy.published}{" "}
            {new Intl.DateTimeFormat(result.locale, { dateStyle: "long" }).format(
              new Date(result.publishedAt),
            )}
          </time>
        </div>
      </header>
      <div className={`document-body${result.artifact.toc.length ? " has-toc" : ""}`}>
        <DocumentToc locale={locale} headings={result.artifact.toc} />
        <div
          className="prose"
          data-compiled-document
          data-public-content-id={result.contentId}
          data-public-revision={result.revisionNumber}
          dangerouslySetInnerHTML={{ __html: result.artifact.html }}
        />
      </div>
      <Suspense fallback={null}>
        <Recommendations document={result} locale={locale} />
      </Suspense>
      <nav
        className="document-bottom"
        aria-label={locale === "ko" ? "읽기 탐색" : "Reading navigation"}
      >
        <Link href={`/${locale}/archive`}>← {copy.back}</Link>
        <a href="#main-content">{copy.top} ↑</a>
      </nav>
      <DocumentEnhancer key={result.artifact.sourceHash} locale={locale} />
    </article>
  );
}
