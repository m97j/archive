import type { Heading, Locale } from "@archive/contracts";
import { siteCopy } from "@/lib/site-copy";

function HeadingList({ headings }: { headings: Heading[] }) {
  return (
    <ol>
      {headings.map((heading) => (
        <li key={heading.id}>
          <a href={`#${encodeURIComponent(heading.id)}`}>{heading.text}</a>
          {heading.children.length > 0 ? <HeadingList headings={heading.children} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function DocumentToc({ headings, locale }: { headings: Heading[]; locale: Locale }) {
  if (!headings.length) return null;
  return (
    <aside className="document-toc">
      <details open>
        <summary>{siteCopy(locale).toc}</summary>
        <nav aria-label={siteCopy(locale).toc}>
          <HeadingList headings={headings} />
        </nav>
      </details>
    </aside>
  );
}
