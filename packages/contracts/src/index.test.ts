import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  CompiledDocumentSchema,
  CreateMediaUploadInputSchema,
  CreateEvidenceInputSchema,
  CreateRevisionInputSchema,
  CreateTaxonomyNodeInputSchema,
  EPISTEMIC_STATUSES,
  LOCALES,
  isReservedPublicationPath,
  PublishRevisionInputSchema,
  PublicContentQuerySchema,
  PublicNavigationQuerySchema,
  RenderBlockSchema,
} from "./index.js";

describe("archive contracts", () => {
  it("reserves the privacy notice route, including encoded aliases", () => {
    for (const route of ["/ko/privacy", "/en/privacy", "/ko/%70rivacy", "/ko/privacy/other"])
      expect(isReservedPublicationPath(route)).toBe(true);
    expect(isReservedPublicationPath("/ko/docs/privacy-design")).toBe(false);
  });
  it("keeps the supported locale and epistemic vocabularies stable", () => {
    expect(LOCALES).toEqual(["en", "ko", "ja", "zh", "es", "fr", "de"]);
    expect(EPISTEMIC_STATUSES).toContain("REGULATIVE_IDEA");
    expect(EPISTEMIC_STATUSES).toContain("SUPERSEDED");
  });

  it("validates safe typed blocks", () => {
    expect(Value.Check(RenderBlockSchema, { type: "youtube", videoId: "dQw4w9WgXcQ" })).toBe(true);
    expect(
      Value.Check(RenderBlockSchema, {
        type: "youtube",
        videoId: "<script>alert(1)</script>",
      }),
    ).toBe(false);
  });

  it("validates recursive compiled document TOCs without external schema references", () => {
    expect(
      Value.Check(CompiledDocumentSchema, {
        schemaVersion: 1,
        locale: "ko",
        sourceHash: "a".repeat(64),
        html: "<h1>Archive</h1>",
        blocks: [{ type: "html", html: "<h1>Archive</h1>" }],
        toc: [
          {
            id: "archive",
            depth: 1,
            text: "Archive",
            children: [{ id: "child", depth: 2, text: "Child", children: [] }],
          },
        ],
        searchText: "Archive Child",
        frontmatter: {},
      }),
    ).toBe(true);
  });

  it("validates draft payloads and rejects publication paths with query strings", () => {
    expect(
      Value.Check(CreateRevisionInputSchema, {
        translations: [{ locale: "en", title: "Draft", slug: "draft", sourceMarkdown: "# Draft" }],
      }),
    ).toBe(true);
    expect(
      Value.Check(PublishRevisionInputSchema, {
        contentId: "10000000-0000-4000-8000-000000000001",
        localizedRevisionId: "10000000-0000-4000-8000-000000000002",
        artifactId: "10000000-0000-4000-8000-000000000003",
        locale: "en",
        path: "/en/doc?preview=true",
      }),
    ).toBe(false);
  });

  it("validates taxonomy, evidence, and bounded public catalog inputs", () => {
    expect(
      Value.Check(CreateTaxonomyNodeInputSchema, {
        stableKey: "research.ml",
        space: "RESEARCH",
        labels: [{ locale: "ko", label: "기계 학습", slug: "machine-learning" }],
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateEvidenceInputSchema, {
        relation: "SUPPORTS",
        sourceUri: "https://example.com/paper",
        strength: 0.8,
      }),
    ).toBe(true);
    expect(Value.Check(PublicContentQuerySchema, { locale: "ko", limit: 101 })).toBe(false);
    expect(Value.Check(PublicNavigationQuerySchema, { locale: "ko", space: "RESEARCH" })).toBe(
      true,
    );
  });

  it("restricts direct media uploads to bounded web image formats", () => {
    expect(
      Value.Check(CreateMediaUploadInputSchema, {
        filename: "diagram.webp",
        contentType: "image/webp",
        sizeBytes: 4096,
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateMediaUploadInputSchema, {
        filename: "payload.svg",
        contentType: "image/svg+xml",
        sizeBytes: 4096,
      }),
    ).toBe(false);
    expect(
      Value.Check(CreateMediaUploadInputSchema, {
        filename: "large.png",
        contentType: "image/png",
        sizeBytes: 11 * 1024 * 1024,
      }),
    ).toBe(false);
  });
});
