import { vi } from "vitest";

/** Synthetic keys only; no provider credentials are read in these tests. */
export function reviewedActivitySettings() {
  for (const [key, value] of Object.entries({
    ACTIVITY_COOKIE_SIGNING_SECRET: "1".repeat(64),
    ACTIVITY_SESSION_ENCRYPTION_KEY: "2".repeat(64),
    ACTIVITY_DELETE_HMAC_SECRET: "3".repeat(64),
    ACTIVITY_RAW_ENCRYPTION_KEY: "4".repeat(64),
    CRON_SECRET: "5".repeat(64),
    ACTIVITY_HF_BUCKET: "example/private-activity",
    ACTIVITY_HF_HUB_TOKEN: "synthetic-test-token",
    ACTIVITY_HF_S3_ACCESS_KEY_ID: "HFAK-synthetic-test",
    ACTIVITY_HF_S3_SECRET_ACCESS_KEY: "synthetic-test-secret",
    ACTIVITY_COLLECTION_ENABLED: "true",
    ACTIVITY_POLICY_REVIEWED: "true",
    ACTIVITY_RETENTION_SCHEDULER_REVIEWED: "true",
    ACTIVITY_POLICY_VERSION: "2026-10-14",
    ACTIVITY_SESSION_RETENTION_HOURS: "2",
    ACTIVITY_MODEL_RETENTION_DAYS: "90",
  }))
    vi.stubEnv(key, value);
}
