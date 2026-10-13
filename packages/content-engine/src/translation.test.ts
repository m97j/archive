import { describe, expect, it } from "vitest";
import { applyMarkdownTranslation, planMarkdownTranslation } from "./translation.js";
describe("prose-only Markdown translation", () => {
  it("preserves code, math, URLs, frontmatter, tables and all embed definitions", () => {
    const protectedPieces = [
      "---\ntitle: 원래 제목\n---",
      "`literal_code`",
      "$E=mc^2$",
      "$$\na+b=c\n$$",
      "```mermaid\ngraph TD; A-->B\n```",
      "```ts\n// Do not translate code comments by default\nconst x=1;\n```",
      "(https://example.test/file?q=1)",
      '::youtube{id="dQw4w9WgXcQ" title="Demo"}',
      '::hf-demo{space="owner/demo"}',
    ];
    const source = `${protectedPieces[0]}\n\n# Heading\n\nA [link]${protectedPieces[6]} and ${protectedPieces[1]} and ${protectedPieces[2]}\n\n${protectedPieces.slice(3, 6).join("\n\n")}\n\n${protectedPieces.slice(7).join("\n\n")}\n\n| Name | Value |\n| --- | --- |\n| Cell | Another |\n`;
    const plan = planMarkdownTranslation(source);
    const translated = applyMarkdownTranslation(
      plan,
      plan.segments.map(() => "번역문"),
    );
    for (const piece of protectedPieces) expect(translated).toContain(piece);
    expect(translated).toContain("# 번역문");
    expect(translated).toContain("| --- | --- |");
  });
  it("escapes provider-generated HTML and structure instead of executing it", () => {
    const plan = planMarkdownTranslation("# Safe\n\nText");
    expect(
      applyMarkdownTranslation(plan, ["<script>", "[x](javascript:alert(1))\n# new"]),
    ).toContain("\\<script\\>");
    expect(() => applyMarkdownTranslation(plan, ["only one"])).toThrow(
      "TRANSLATION_ALIGNMENT_INVALID",
    );
  });
  it("does not change source when there is no translatable prose", () => {
    const source = "```ts\nconst x=1;\n```";
    const plan = planMarkdownTranslation(source);
    expect(plan.segments).toHaveLength(0);
    expect(applyMarkdownTranslation(plan, [])).toBe(source);
  });
});
