import type { AdminContentPage } from "@archive/contracts";

export class ArchiveApiError extends Error {
  override readonly name = "ArchiveApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function archiveApiRequest<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const base = (process.env.ARCHIVE_API_BASE_URL?.trim() || "http://127.0.0.1:7861").replace(
    /\/$/,
    "",
  );
  const headers = new Headers({ accept: "application/json" });
  const upstream = process.env.ARCHIVE_API_UPSTREAM_BEARER_TOKEN?.trim();
  if (upstream) {
    headers.set("authorization", `Bearer ${upstream}`);
    if (init.accessToken) headers.set("x-archive-user-authorization", `Bearer ${init.accessToken}`);
  } else if (init.accessToken) headers.set("authorization", `Bearer ${init.accessToken}`);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new ArchiveApiError(response.status, `Archive API request failed (${response.status})`);
  return (await response.json()) as T;
}
export function listAdminContents(
  accessToken: string,
  includeArchived = false,
): Promise<AdminContentPage> {
  return archiveApiRequest(
    `/v1/admin/contents?limit=50${includeArchived ? "&includeArchived=true" : ""}`,
    { accessToken },
  );
}
