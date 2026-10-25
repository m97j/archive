import type { Locale, PublicContentSummary, PublicDocument } from "@archive/contracts";
import { unstable_cache } from "next/cache";
import { listPublicDocuments } from "./archive-api.server";
import { publicCacheTag } from "./public-cache";
import {
  RECOMMENDATION_CATALOG_MAX_PAGES,
  RECOMMENDATION_CATALOG_PAGE_SIZE,
  RECOMMENDATION_VERSION,
  recommendationCacheKey,
  selectDocumentRecommendations,
  type RecommendationSet,
} from "./document-recommendations";

export async function readRecommendationCatalogue(
  locale: Locale,
  readPage = listPublicDocuments,
): Promise<PublicContentSummary[]> {
  const items: PublicContentSummary[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < RECOMMENDATION_CATALOG_MAX_PAGES; page++) {
    const result = await readPage(
      { locale, limit: RECOMMENDATION_CATALOG_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
      { revalidate: 300 },
    );
    items.push(...result.items.slice(0, RECOMMENDATION_CATALOG_PAGE_SIZE));
    if (!result.nextCursor || cursors.has(result.nextCursor)) break;
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  return items;
}

function cachedCatalogue(locale: Locale) {
  return unstable_cache(
    () => readRecommendationCatalogue(locale),
    [RECOMMENDATION_VERSION, "public-catalogue", locale],
    { revalidate: 300, tags: [publicCacheTag(locale)] },
  )();
}

/** No request cookies, session identifiers or private contents enter this shared cache. */
export async function getDocumentRecommendations(
  source: PublicDocument,
): Promise<RecommendationSet> {
  try {
    return await unstable_cache(
      async () => selectDocumentRecommendations(source, await cachedCatalogue(source.locale)),
      recommendationCacheKey(source),
      { revalidate: 300, tags: [publicCacheTag(source.locale)] },
    )();
  } catch {
    // A failed optional catalogue must never hide or delay a successfully loaded document indefinitely.
    return { related: [], nextRead: [], available: false };
  }
}
