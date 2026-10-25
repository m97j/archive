import type { Locale, PublicContentSummary } from "@archive/contracts";
import { safeRecommendationPath } from "./document-recommendations";

export const BROWSER_READING_LIFETIME_MS = 30 * 60_000;
export interface BrowserReadingDocument {
  path: string;
  locale: Locale;
  tags: string[];
}
export interface BrowserReadingState {
  enabled: boolean;
  tags: { tag: string; weight: number }[];
  readPaths: string[];
}
const EMPTY: BrowserReadingState = { enabled: false, tags: [], readPaths: [] };
let state = EMPTY;
let expiry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function browserReadingSnapshot() {
  return typeof window === "undefined" ? EMPTY : state;
}
export function browserReadingServerSnapshot() {
  return EMPTY;
}
export function subscribeBrowserReading(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: BrowserReadingState) {
  state = next;
  for (const listener of listeners) listener();
}
function renewExpiry() {
  clearTimeout(expiry);
  expiry = setTimeout(() => setBrowserReadingEnabled(false), BROWSER_READING_LIFETIME_MS);
}
/** Choice and interest counters stay in tab memory: no IDs, persistence or transport. */
export function setBrowserReadingEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  clearTimeout(expiry);
  publish(enabled ? { enabled: true, tags: [], readPaths: [] } : EMPTY);
  if (enabled) renewExpiry();
}
export function rememberBrowserReading(document: BrowserReadingDocument) {
  if (
    !state.enabled ||
    !safeRecommendationPath(document.path, document.locale) ||
    state.readPaths.includes(document.path)
  )
    return;
  const tags = new Map(state.tags.map(({ tag, weight }) => [tag, weight]));
  for (const tag of new Set(
    document.tags
      .slice(0, 12)
      .map((value) => value.normalize("NFKC").trim().toLocaleLowerCase())
      .filter((value) => value.length > 0 && value.length <= 64),
  ))
    tags.set(tag, Math.min(16, (tags.get(tag) ?? 0) + 1));
  publish({
    enabled: true,
    tags: [...tags]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 48)
      .map(([tag, weight]) => ({ tag, weight })),
    readPaths: [...state.readPaths, document.path].slice(-24),
  });
  renewExpiry();
}
export function rankBrowserReading(
  snapshot: BrowserReadingState,
  candidates: readonly PublicContentSummary[],
  currentPath: string,
  locale: Locale,
) {
  if (!snapshot.enabled || !snapshot.tags.length) return [];
  const interests = new Map(snapshot.tags.map(({ tag, weight }) => [tag, weight]));
  const paths = new Set<string>();
  return candidates
    .slice(0, 24)
    .flatMap((document) => {
      if (
        document.locale !== locale ||
        !safeRecommendationPath(document.path, locale) ||
        document.path === currentPath ||
        snapshot.readPaths.includes(document.path) ||
        paths.has(document.path)
      )
        return [];
      paths.add(document.path);
      const sharedTags = [...new Set(document.tags)].filter((tag) =>
        interests.has(tag.normalize("NFKC").toLocaleLowerCase()),
      );
      const score = sharedTags.reduce(
        (sum, tag) => sum + (interests.get(tag.normalize("NFKC").toLocaleLowerCase()) ?? 0),
        0,
      );
      return score > 0 ? [{ document, sharedTags, score }] : [];
    })
    .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
    .slice(0, 3);
}
