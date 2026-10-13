import type {
  Locale,
  PublicContentPage,
  PublicContentQuery,
  PublicNavigation,
  PublicNavigationQuery,
  PublicResolution,
  HybridSearchInput,
  HybridSearchResult,
} from "@archive/contracts";
import { env } from "node:process";
import { publicCacheTag } from "./public-cache";

export class ArchiveApiError extends Error {
  override readonly name = "ArchiveApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function baseUrl(): string {
  const configured = env.ARCHIVE_API_BASE_URL?.trim() || "http://localhost:7860";
  return configured.replace(/\/$/, "");
}

function serverHeaders(): Headers {
  const headers = new Headers({ accept: "application/json" });
  const upstreamToken = env.ARCHIVE_API_UPSTREAM_BEARER_TOKEN?.trim();

  if (upstreamToken) {
    // A private HF Space consumes the standard Authorization header at its gateway.
    headers.set("authorization", `Bearer ${upstreamToken}`);
  } else {
    const token = env.ARCHIVE_API_BEARER_TOKEN?.trim();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

async function getJson<T>(
  path: string,
  options: { revalidate?: number | false; locale?: Locale } = {},
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    signal: AbortSignal.timeout(12_000),
    headers: serverHeaders(),
    ...(options.revalidate === false
      ? { cache: "no-store" }
      : {
          next: {
            revalidate: options.revalidate ?? 60,
            ...(options.locale ? { tags: [publicCacheTag(options.locale)] } : {}),
          },
        }),
  });
  if (!response.ok) {
    throw new ArchiveApiError(response.status, `Archive API request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function resolvePublicDocument(
  locale: Locale,
  path: string,
  options?: { revalidate?: number | false },
): Promise<PublicResolution | undefined> {
  try {
    return await getJson<PublicResolution>(
      `/v1/public/resolve?${new URLSearchParams({ locale, path }).toString()}`,
      { ...options, locale },
    );
  } catch (error) {
    if (error instanceof ArchiveApiError && error.status === 404) return undefined;
    throw error;
  }
}

export function listPublicDocuments(
  query: PublicContentQuery,
  options?: { revalidate?: number | false },
): Promise<PublicContentPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return getJson<PublicContentPage>(`/v1/public/contents?${search.toString()}`, {
    ...options,
    locale: query.locale,
  });
}

export function getPublicNavigation(
  query: PublicNavigationQuery,
  options?: { revalidate?: number | false },
): Promise<PublicNavigation> {
  return getJson<PublicNavigation>(
    `/v1/public/navigation?${new URLSearchParams(query).toString()}`,
    { ...options, locale: query.locale },
  );
}

/** Queries stay in a request body and are never placed in the HF gateway URL. */
export async function searchPublicDocuments(input: HybridSearchInput): Promise<HybridSearchResult> {
  const headers = serverHeaders();
  headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl()}/v1/public/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ArchiveApiError(response.status, "Archive search unavailable");
  return (await response.json()) as HybridSearchResult;
}
