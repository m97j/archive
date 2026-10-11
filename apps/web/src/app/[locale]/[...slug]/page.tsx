import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { DocumentEnhancer } from "@/components/document-enhancer";
import { resolvePublicDocument } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";

type PageParams = Promise<{ locale: string; slug: string[] }>;

async function load(params: PageParams) {
  const values = await params;
  const locale = requireLocale(values.locale);
  const path = `/${locale}/${values.slug.join("/")}`;
  return { locale, result: await resolvePublicDocument(locale, path) };
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { result } = await load(params);
  return result?.type === "document"
    ? { title: result.title, description: result.description }
    : {};
}

export default async function DocumentPage({ params }: { params: PageParams }) {
  const { result } = await load(params);
  if (!result) notFound();
  if (result.type === "redirect") {
    if (result.status === 301 || result.status === 308) permanentRedirect(result.toPath);
    redirect(result.toPath);
  }
  return (
    <article className="document-page">
      <header>
        <p className="eyebrow">{result.kind.replaceAll("_", " ")}</p>
        <h1>{result.title}</h1>
        {result.description ? <p>{result.description}</p> : null}
        <div className="document-meta">
          <span>Revision {result.revisionNumber}</span>
          <time dateTime={result.publishedAt}>
            Published{" "}
            {new Intl.DateTimeFormat(result.locale, { dateStyle: "long" }).format(
              new Date(result.publishedAt),
            )}
          </time>
        </div>
      </header>
      <div
        className="prose"
        data-compiled-document
        dangerouslySetInnerHTML={{ __html: result.artifact.html }}
      />
      <DocumentEnhancer />
    </article>
  );
}
