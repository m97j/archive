import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LatestRecords } from "@/components/latest-records";
import { AmbientField } from "@/components/ambient-field";
import { SelectedProjects } from "@/components/portfolio-overview";
import { requireLocale } from "@/lib/routing";
import { siteCopy } from "@/lib/site-copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const copy = siteCopy(requireLocale((await params).locale));
  return { title: "Marchivej · Minjae", description: copy.heroDescription };
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const copy = siteCopy(locale);
  return (
    <div
      className="home-page"
      data-analytics-path={`/${locale}`}
      data-analytics-title="Marchivej · Minjae"
    >
      <section className="home-hero" aria-labelledby="home-title">
        <div className="intro-copy">
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h1 id="home-title" aria-label={copy.heroTitle}>
            <span>{copy.heroFirst}</span>
            <span className={locale === "ko" ? "hero-last" : "hero-last is-serif"}>
              {copy.heroLast}
            </span>
          </h1>
          <p>{copy.heroDescription}</p>
          <div className="intro-actions">
            <Link className="primary-link" href={`/${locale}/spaces/work`}>
              {locale === "ko" ? "작업 둘러보기" : "Explore the work"}
              <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href={`/${locale}/archive`}>
              {locale === "ko" ? "글과 노트" : "Writing & notes"}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <AmbientField locale={locale} />
        <div className="hero-bottom" aria-hidden="true">
          <span>RESEARCH · SYSTEMS · OPEN QUESTIONS</span>
          <span>SCROLL TO EXPLORE ↓</span>
        </div>
      </section>
      <SelectedProjects locale={locale} compact />
      <Suspense
        fallback={
          <section className="latest-section" aria-busy="true">
            <h2>{copy.latest}</h2>
            <div
              className="record-skeleton"
              aria-label={locale === "ko" ? "글을 불러오는 중" : "Loading writing"}
            />
          </section>
        }
      >
        <LatestRecords locale={locale} />
      </Suspense>
    </div>
  );
}
