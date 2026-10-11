"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LOCALES, type Locale } from "@archive/contracts";
import { portfolioUrl, siteCopy } from "@/lib/site-copy";

export default function PageError({ retry }: { retry: () => void }) {
  const params = useParams();
  const locale: Locale = LOCALES.find((value) => value === params.locale) ?? "ko";
  const copy = siteCopy(locale);
  return (
    <section className="page-error">
      <p className="eyebrow">Marchivej</p>
      <h1>{copy.errorTitle}</h1>
      <p>{copy.errorDetail}</p>
      <div className="notice-links">
        <button className="primary-link" onClick={retry}>
          {copy.retry}
        </button>
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
