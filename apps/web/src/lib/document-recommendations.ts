import {
  isReservedPublicationPath,
  type Locale,
  type PublicContentSummary,
  type PublicDocument,
} from "@archive/contracts";

export const RECOMMENDATION_VERSION = "editorial-v2";
export const RECOMMENDATION_CATALOG_PAGE_SIZE = 100;
export const RECOMMENDATION_CATALOG_MAX_PAGES = 4;
export const RECOMMENDATION_LIMIT = 3;

export type RecommendationCandidate = PublicContentSummary & {
  visibility?: string;
  archivedAt?: string | null;
  type?: string;
};

export interface DocumentRecommendation {
  document: PublicContentSummary;
  reason: "editorial" | "shared-tags" | "next-read";
  sharedTags: string[];
}

/** Only an approved aggregate producer should supply this snapshot, not document frontmatter. */
export interface NextReadSnapshot {
  locale: Locale;
  sourceContentId: string;
  sourceRevisionNumber: number;
  generatedAt: string;
  items: { contentId: string; sessionCount: number }[];
}

export interface RecommendationSet {
  related: DocumentRecommendation[];
  nextRead: DocumentRecommendation[];
  aggregateUpdatedAt?: string;
  available: boolean;
  browserSession?: {
    source: { path: string; locale: Locale; tags: string[] };
    candidates: PublicContentSummary[];
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim())
            .slice(0, 32),
        ),
      ]
    : [];
}

export function safeRecommendationPath(path: string, locale: Locale): boolean {
  if (
    !path.startsWith(`/${locale}/`) ||
    path.length > 2_048 ||
    /[?#\\]/.test(path) ||
    /%(?:2f|5c|25)/i.test(path)
  )
    return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path).normalize("NFKC");
  } catch {
    return false;
  }
  return (
    decoded.startsWith(`/${locale}/`) &&
    !decoded.includes("//") &&
    !decoded.includes("%") &&
    !isReservedPublicationPath(path) &&
    !decoded
      .split("/")
      .some((part) =>
        [
          "admin",
          "login",
          "signin",
          "sign-in",
          "cms",
          "studio",
          "api",
          "auth",
          "_next",
          ".",
          "..",
        ].includes(part.toLowerCase()),
      ) &&
    ![...decoded].some((part) => (part.codePointAt(0) ?? 0) < 32 || part === "\u007f")
  );
}

export function recommendationCacheKey(
  document: Pick<PublicDocument, "locale" | "contentId" | "revisionNumber" | "artifact">,
): string[] {
  return [
    RECOMMENDATION_VERSION,
    document.locale,
    document.contentId,
    String(document.revisionNumber),
    document.artifact.sourceHash,
  ];
}

export function selectDocumentRecommendations(
  source: PublicDocument,
  catalogue: readonly RecommendationCandidate[],
  snapshot?: NextReadSnapshot,
): RecommendationSet {
  const current = catalogue.find(
    (item) => item.contentId === source.contentId && item.locale === source.locale,
  );
  const sourceTags = strings(
    current?.tags.length ? current.tags : source.artifact.frontmatter.tags,
  );
  const sourceTagKeys = new Set(sourceTags.map((tag) => tag.normalize("NFKC").toLocaleLowerCase()));
  const explicit = strings(source.artifact.frontmatter.relatedContentIds);
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const candidates = catalogue.filter((item) => {
    if (
      item.contentId === source.contentId ||
      item.path === source.path ||
      item.locale !== source.locale ||
      !safeRecommendationPath(item.path, source.locale) ||
      (item.visibility !== undefined && item.visibility !== "PUBLIC") ||
      item.archivedAt != null ||
      (item.type !== undefined && item.type !== "document") ||
      seenIds.has(item.contentId) ||
      seenPaths.has(item.path)
    )
      return false;
    seenIds.add(item.contentId);
    seenPaths.add(item.path);
    return true;
  });
  const related = candidates
    .flatMap((item) => {
      const sharedTags = strings(item.tags).filter((tag) =>
        sourceTagKeys.has(tag.normalize("NFKC").toLocaleLowerCase()),
      );
      const editorial = explicit.indexOf(item.contentId);
      if (editorial < 0 && sharedTags.length === 0) return [];
      return [
        {
          document: item,
          reason: editorial >= 0 ? ("editorial" as const) : ("shared-tags" as const),
          sharedTags,
          score:
            editorial >= 0
              ? 1_000 - editorial
              : sharedTags.length * 10 + Number(item.kind === source.kind),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.document.path.localeCompare(right.document.path),
    )
    .slice(0, RECOMMENDATION_LIMIT)
    .map(({ document, reason, sharedTags }) => ({ document, reason, sharedTags }));

  const result: RecommendationSet = {
    related,
    nextRead: [],
    available: true,
    browserSession: {
      source: { path: source.path, locale: source.locale, tags: sourceTags },
      candidates: candidates.slice(0, 24).map((item) => ({
        contentId: item.contentId,
        kind: item.kind,
        locale: item.locale,
        path: item.path,
        title: item.title,
        ...(item.description === undefined ? {} : { description: item.description }),
        publishedAt: item.publishedAt,
        tags: strings(item.tags),
      })),
    },
  };
  if (
    !snapshot ||
    snapshot.locale !== source.locale ||
    snapshot.sourceContentId !== source.contentId ||
    snapshot.sourceRevisionNumber !== source.revisionNumber ||
    !Number.isFinite(Date.parse(snapshot.generatedAt))
  )
    return result;
  const candidatesById = new Map(candidates.map((item) => [item.contentId, item]));
  const used = new Set<string>();
  // A minimum cohort avoids displaying a single visitor's reading path as a public aggregate.
  result.nextRead = [...snapshot.items]
    .filter((item) => Number.isSafeInteger(item.sessionCount) && item.sessionCount >= 10)
    .sort(
      (left, right) =>
        right.sessionCount - left.sessionCount || left.contentId.localeCompare(right.contentId),
    )
    .flatMap((item) => {
      const document = candidatesById.get(item.contentId);
      if (!document || used.has(item.contentId)) return [];
      used.add(item.contentId);
      return [{ document, reason: "next-read" as const, sharedTags: [] }];
    })
    .slice(0, RECOMMENDATION_LIMIT);
  if (result.nextRead.length) result.aggregateUpdatedAt = snapshot.generatedAt;
  return result;
}
