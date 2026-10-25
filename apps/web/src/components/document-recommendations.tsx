import type { Locale } from "@archive/contracts";
import Link from "next/link";
import type { DocumentRecommendation, RecommendationSet } from "@/lib/document-recommendations";
import { contentKindLabel } from "@/lib/site-copy";
import { ReadingSuggestion } from "./reading-suggestion";
import { BrowserReadingSuggestions } from "./browser-reading";
import styles from "./document-recommendations.module.css";

function RecommendationLinks({
  items,
  locale,
}: {
  items: DocumentRecommendation[];
  locale: Locale;
}) {
  return (
    <ol className={styles.cards}>
      {items.map(({ document, reason, sharedTags }) => (
        <li key={document.contentId}>
          <Link href={document.path} prefetch={false} className={styles.card}>
            <span className={styles.cardMeta}>
              {contentKindLabel(document.kind, locale)}
              <span aria-hidden="true">↗</span>
            </span>
            <h3>{document.title}</h3>
            {document.description ? <p>{document.description}</p> : null}
            <span className={styles.reason}>
              {reason === "editorial"
                ? locale === "ko"
                  ? "함께 읽도록 연결한 문서"
                  : "An editorial connection"
                : reason === "shared-tags"
                  ? sharedTags.slice(0, 2).join(" · ")
                  : locale === "ko"
                    ? "공개 읽기 흐름 집계"
                    : "Aggregated reading paths"}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function DocumentRecommendations({
  locale,
  recommendations,
}: {
  locale: Locale;
  recommendations: RecommendationSet;
}) {
  const korean = locale === "ko";
  return (
    <section
      className={styles.recommendations}
      aria-labelledby="document-connections-title"
      data-reading-end
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CONTINUE READING</p>
          <h2 id="document-connections-title">
            {korean ? "다음으로 이어 읽기" : "Follow the next thread"}
          </h2>
        </div>
        <Link href={`/${locale}/archive`} className={styles.archiveLink}>
          {korean ? "모든 문서" : "All writing"}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className={styles.related}>
        <h3 className={styles.sectionTitle}>{korean ? "연결된 문서" : "Connected documents"}</h3>
        {recommendations.related.length ? (
          <RecommendationLinks items={recommendations.related} locale={locale} />
        ) : (
          <p className={styles.empty}>
            {!recommendations.available
              ? korean
                ? "연결된 문서를 잠시 불러오지 못했습니다."
                : "Connections are temporarily unavailable."
              : korean
                ? "공개된 문서 중 함께 읽을 연결을 준비하고 있습니다."
                : "Connections between published documents are still taking shape."}
          </p>
        )}
      </div>
      <div className={styles.secondary}>
        <section aria-labelledby="next-read-title">
          <h3 id="next-read-title" className={styles.sectionTitle}>
            {korean ? "이 문서 다음에 많이 읽은 글" : "Readers continued with"}
          </h3>
          {recommendations.nextRead.length ? (
            <RecommendationLinks items={recommendations.nextRead} locale={locale} />
          ) : (
            <p className={styles.empty}>
              {korean
                ? "검증된 읽기 흐름 집계가 아직 없습니다."
                : "No verified reading-path aggregate is available yet."}
            </p>
          )}
        </section>
        <section aria-labelledby="session-reading-title">
          <h3 id="session-reading-title" className={styles.sectionTitle}>
            {korean ? "이번 세션 맞춤" : "For this reading session"}
          </h3>
          <BrowserReadingSuggestions
            locale={locale}
            source={recommendations.browserSession?.source}
            candidates={recommendations.browserSession?.candidates}
          />
        </section>
      </div>
      {recommendations.related.length ? (
        <ReadingSuggestion locale={locale} items={recommendations.related} />
      ) : null}
    </section>
  );
}
