import { pathToFileURL } from "node:url";

/** No Bucket credentials on the runner; the reviewed server performs private access checks. */
export async function runActivityMaintenance({
  origin,
  secret,
  apply = false,
  verifyStorage = false,
  allowLocal = false,
  fetchImpl = fetch,
}) {
  const url = new URL(origin ?? "https://marchivej.vercel.app");
  const local =
    allowLocal && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (
    (!local && url.origin !== "https://marchivej.vercel.app") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("SITE_ORIGIN_REJECTED");
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret))
    throw new Error("MAINTENANCE_SECRET_REQUIRED");
  if (apply && verifyStorage) throw new Error("MAINTENANCE_MODE_REJECTED");
  const endpoint = new URL(
    verifyStorage ? "/api/privacy/verification" : "/api/privacy/maintenance",
    url,
  ).href;
  const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  const summary = { complete: false, removed: 0, scanned: 0, skipped: 0, pages: 0 };
  let cursor;
  const deadline = Date.now() + 8 * 60_000;
  for (let page = 0; page < (apply ? 1000 : 1); page++) {
    if (Date.now() > deadline) throw new Error("MAINTENANCE_DEADLINE");
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: apply || verifyStorage ? "POST" : "GET",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(verifyStorage ? 110_000 : 55_000),
        ...(apply || verifyStorage ? { body: JSON.stringify(cursor ? { cursor } : {}) } : {}),
      });
    } catch {
      throw new Error("MAINTENANCE_REQUEST_FAILED");
    }
    if (!response.ok) throw new Error("MAINTENANCE_REQUEST_FAILED");
    const text = await response.text();
    if (text.length > 16384) throw new Error("MAINTENANCE_RESPONSE_REJECTED");
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error("MAINTENANCE_RESPONSE_REJECTED");
    }
    if (verifyStorage) {
      const required = [
        "privateVerified",
        "conditionalWriteVerified",
        "listingVerified",
        "deletionVerified",
        "expiryVerified",
        "expiryClockSimulated",
        "cleanupVerified",
      ];
      if (required.some((key) => result[key] !== true) || result.collectionEnabled !== false)
        throw new Error("MAINTENANCE_RESPONSE_REJECTED");
      return Object.fromEntries([
        ...required.map((key) => [key, true]),
        ["collectionEnabled", false],
      ]);
    }
    if (!apply) {
      if (result.privateVerified !== true || typeof result.maintenanceRecent !== "boolean")
        throw new Error("MAINTENANCE_RESPONSE_REJECTED");
      return { readOnly: true, privateVerified: true, maintenanceRecent: result.maintenanceRecent };
    }
    if (
      typeof result.complete !== "boolean" ||
      !["removed", "scanned", "skipped"].every(
        (key) => Number.isSafeInteger(result[key]) && result[key] >= 0,
      ) ||
      result.skipped !== 0
    )
      throw new Error("MAINTENANCE_RESPONSE_REJECTED");
    summary.removed += result.removed;
    summary.scanned += result.scanned;
    summary.pages++;
    if (result.complete) return { ...summary, complete: true };
    if (
      typeof result.cursor !== "string" ||
      !result.cursor ||
      result.cursor.length > 2048 ||
      result.cursor === cursor
    )
      throw new Error("MAINTENANCE_PAGINATION_REJECTED");
    cursor = result.cursor;
  }
  throw new Error("MAINTENANCE_INCOMPLETE");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runActivityMaintenance({
      origin: process.env.ARCHIVE_ACTIVITY_SITE_URL,
      secret: process.env.ARCHIVE_ACTIVITY_MAINTENANCE_SECRET,
      apply: process.argv.includes("--apply"),
      verifyStorage: process.argv.includes("--verify-storage"),
      allowLocal: process.argv.includes("--allow-local"),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Do not echo URLs, request headers, credentials, cursors or provider exception bodies.
    console.error(
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "MAINTENANCE_FAILED",
    );
    process.exitCode = 1;
  }
}
