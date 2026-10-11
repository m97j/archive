"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LOCALES, type Locale } from "@archive/contracts";
import { portfolioUrl, siteCopy } from "@/lib/site-copy";

export default function MissingRecord() {
  const params = useParams();
  const locale: Locale = LOCALES.find((value) => value === params.locale) ?? "ko";
  const copy = siteCopy(locale);
  return (
    <section className="page-error">
      <p className="eyebrow">404 / Marchivej</p>
      <h1>{copy.missingTitle}</h1>
      <p>{copy.missingDetail}</p>
      <div className="notice-links">
        <Link className="primary-link" href={`/${locale}/archive`}>
          {copy.search}
        </Link>
        <Link className="text-link" href={`/${locale}`}>
          {copy.home}
        </Link>
        <a className="text-link" href={portfolioUrl(locale)}>
          {copy.fallback}
        </a>
      </div>
    </section>
  );
}
