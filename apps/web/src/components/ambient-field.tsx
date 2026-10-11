import type { Locale } from "@archive/contracts";
import Image from "next/image";
import Link from "next/link";

import styles from "./ambient-field.module.css";

export function AmbientField({ locale }: { locale: Locale }) {
  const korean = locale === "ko";
  const destinations = [
    {
      label: korean ? "연구" : "Research",
      href: `/${locale}/spaces/research`,
      position: styles.research,
      path: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l3 3m6 6 3 3M6 18l3-3m6-6 3-3",
      circle: true,
    },
    {
      label: korean ? "시스템" : "Systems",
      href: `/${locale}/spaces/work`,
      position: styles.systems,
      path: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9",
      circle: false,
    },
    {
      label: korean ? "노트" : "Notes",
      href: `/${locale}/archive?space=LOGS`,
      position: styles.notes,
      path: "M6 3h9l3 3v15H6V3Zm8 0v5h4M9 12h6m-6 4h6",
      circle: false,
    },
  ];

  return (
    <div className={styles.field}>
      <svg className={styles.contours} viewBox="0 0 600 480" fill="none" aria-hidden="true">
        <g className={styles.orbits}>
          <ellipse cx="305" cy="241" rx="233" ry="161" transform="rotate(-24 305 241)" />
          <ellipse cx="305" cy="241" rx="183" ry="195" transform="rotate(-24 305 241)" />
          <ellipse cx="305" cy="241" rx="228" ry="100" transform="rotate(29 305 241)" />
        </g>
        <g className={styles.secondaryContours}>
          <path d="M23 346C106 285 119 124 294 108c125-12 233 99 272 19" />
          <path d="M44 372c82-60 105-219 250-237 124-16 205 95 250 28" />
          <path d="M70 397c83-75 112-212 224-233 114-21 178 80 224 45" />
        </g>
        <g className={styles.markers}>
          <circle cx="156" cy="113" r="3" />
          <circle cx="492" cy="252" r="3" />
          <circle cx="191" cy="391" r="3" />
        </g>
      </svg>
      <div className={styles.signature}>
        <Image
          src="/brand/signature.png"
          alt={korean ? "민재의 서명" : "Minjae’s signature"}
          width={474}
          height={474}
          loading="eager"
          unoptimized
          className={styles.signatureImage}
        />
      </div>
      <nav
        className={styles.destinations}
        aria-label={korean ? "아카이브 둘러보기" : "Explore the archive"}
      >
        {destinations.map((destination) => (
          <Link
            key={destination.href}
            href={destination.href}
            className={`${styles.destination} ${destination.position}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d={destination.path} />
              {destination.circle ? <circle cx="12" cy="12" r="4" /> : null}
            </svg>
            <span>{destination.label}</span>
            <span className={styles.arrow} aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
