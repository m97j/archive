import { SPACES, type Locale } from "@archive/contracts";
import Link from "next/link";

import { spaceLabel } from "@/lib/routing";

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href={`/${locale}`} aria-label="Archive home">
        <span aria-hidden="true">A/</span> Archive
      </Link>
      <nav className="primary-nav" aria-label="Primary navigation">
        {SPACES.map((space) => (
          <Link key={space} href={`/${locale}/spaces/${space.toLowerCase()}`}>
            {spaceLabel(space)}
          </Link>
        ))}
      </nav>
      <Link className="search-link" href={`/${locale}/archive`}>
        Search <span aria-hidden="true">⌕</span>
      </Link>
    </header>
  );
}
