import { describe, expect, it } from "vitest";

import { createR2MediaStorage } from "../src/services/media-storage.js";

describe("R2 media storage", () => {
  it("creates a short-lived, content-type-bound upload URL and public image URL", async () => {
    const storage = createR2MediaStorage({
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      bucket: "archive-image",
      publicBaseUrl: "https://media.example.com/",
      expiresInSeconds: 120,
    });

    const ticket = await storage.createUpload(
      { filename: "architecture diagram.PNG", contentType: "image/png", sizeBytes: 2048 },
      { id: "10000000-0000-4000-8000-000000000001" },
    );

    expect(ticket.method).toBe("PUT");
    expect(ticket.key).toMatch(/^images\/\d{4}\/\d{2}\/[\da-f-]+-architecture-diagram\.png$/);
    expect(ticket.uploadUrl).toContain("0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
    expect(ticket.publicUrl).toBe(`https://media.example.com/${ticket.key}`);
    expect(ticket.expiresInSeconds).toBe(120);
    expect(ticket.headers).toEqual({ "content-type": "image/png" });
  });
});
