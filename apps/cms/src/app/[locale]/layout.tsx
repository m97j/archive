import Link from "next/link";
import Image from "next/image";
import { requireLocale } from "@/lib/routing";
import { cmsCopy } from "@/lib/copy";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const copy = cmsCopy(locale);
  return (
    <div className="studio-shell" lang={locale}>
      <aside className="studio-sidebar">
        <Link href={`/${locale}/admin`} className="studio-brand">
          <Image src="/brand/signature.png" width={44} height={44} alt="Minjae's signature" />
          <span>
            marchivej.<small>PRIVATE STUDIO</small>
          </span>
        </Link>
        <nav aria-label={locale === "ko" ? "스튜디오 탐색" : "Studio navigation"}>
          <Link href={`/${locale}/admin`}>
            {copy.library}
            <span>01</span>
          </Link>
          <Link href={`/${locale}/admin/new`}>
            {copy.newDraft}
            <span>＋</span>
          </Link>
          <Link href={`/${locale}/admin/taxonomy`}>
            {locale === "ko" ? "분류·태그" : "Taxonomy"}
            <span>02</span>
          </Link>
          <Link href={`/${locale}/admin/jobs`}>
            {copy.jobs}
            <span>02</span>
          </Link>
          <Link href={`/${locale}/admin/integrations`}>
            {copy.integrations}
            <span>03</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <a
            href={process.env.ARCHIVE_PUBLIC_SITE_URL || "https://marchivej.vercel.app"}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.publicSite} ↗
          </a>
          <Link href={`/${locale === "ko" ? "en" : "ko"}/admin`}>
            {locale === "ko" ? "English" : "한국어"}
          </Link>
        </div>
      </aside>
      <main id="main-content" className="studio-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
