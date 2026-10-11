import { CONTENT_KINDS, SPACES, type ContentKind, type Space } from "@archive/contracts";

export type ArchiveSearch = Partial<
  Record<"q" | "kind" | "space" | "tag" | "taxonomy" | "cursor", string | string[]>
>;
const one = (value: string | string[] | undefined, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) || undefined : undefined;

export function parseArchiveSearch(search: ArchiveSearch) {
  const kind = one(search.kind, 30);
  const space = one(search.space, 30)?.toUpperCase();
  return {
    q: one(search.q, 200),
    kind: CONTENT_KINDS.includes(kind as ContentKind) ? (kind as ContentKind) : undefined,
    space: SPACES.includes(space as Space) ? (space as Space) : undefined,
    tag: one(search.tag, 100),
    taxonomy: one(search.taxonomy, 160),
    cursor: one(search.cursor, 512),
  };
}

export function searchQuery(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}
