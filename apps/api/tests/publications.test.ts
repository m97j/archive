import type { PublishRevisionInput, PublishedRevision } from "@archive/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthenticationError, AuthorizationError, buildApp } from "../src/app.js";

const input: PublishRevisionInput = {
  contentId: "10000000-0000-4000-8000-000000000001",
  localizedRevisionId: "10000000-0000-4000-8000-000000000002",
  artifactId: "10000000-0000-4000-8000-000000000003",
  locale: "ko",
  path: "/ko/research/archive",
};

const published: PublishedRevision = {
  ...input,
  revisionNumber: 3,
  publishedAt: "2026-09-02T00:00:00.000Z",
  eventId: "10000000-0000-4000-8000-000000000004",
};

describe("publication API", () => {
  it("authenticates and delegates a valid publication command", async () => {
    const publish = vi.fn().mockResolvedValue(published);
    const app = buildApp({
      authenticate: async () => ({ id: "10000000-0000-4000-8000-000000000005" }),
      publisher: { publish },
    });

    const response = await app.inject({ method: "POST", url: "/v1/publications", payload: input });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(published);
    expect(publish).toHaveBeenCalledWith(input, {
      id: "10000000-0000-4000-8000-000000000005",
    });
    await app.close();
  });

  it("rejects malformed commands before calling the publisher", async () => {
    const publish = vi.fn();
    const app = buildApp({ authenticate: async () => ({ id: "actor" }), publisher: { publish } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/publications",
      payload: { ...input, path: "not-absolute", locale: "xx" },
    });
    expect(response.statusCode).toBe(400);
    expect(publish).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 401 when authentication fails", async () => {
    const app = buildApp({
      authenticate: async () => {
        throw new AuthenticationError("A bearer token is required");
      },
      publisher: { publish: vi.fn() },
    });
    const response = await app.inject({ method: "POST", url: "/v1/publications", payload: input });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "UNAUTHORIZED" });
    await app.close();
  });

  it("returns 403 when the actor lacks publishing permission", async () => {
    const app = buildApp({
      authenticate: async () => {
        throw new AuthorizationError("Publisher role is required");
      },
      publisher: { publish: vi.fn() },
    });
    const response = await app.inject({ method: "POST", url: "/v1/publications", payload: input });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "FORBIDDEN" });
    await app.close();
  });
});
