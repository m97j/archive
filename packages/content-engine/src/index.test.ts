import { describe, expect, it } from "vitest";

import { ContentCompilationError, compileDocument, sourceHash } from "./index.js";

describe("compileDocument", () => {
  it("drops raw HTML and dangerous links", async () => {
    const result = await compileDocument(
      "# Safe\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))",
    );
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain('<h1 id="safe">Safe</h1>');
  }, 15_000);

  it("creates deterministic unique heading ids and a nested toc", async () => {
    const result = await compileDocument("# 반복\n\n## Child\n\n### Deep\n\n## Child");
    expect(result.toc).toEqual([
      {
        id: "반복",
        depth: 1,
        text: "반복",
        children: [
          {
            id: "child",
            depth: 2,
            text: "Child",
            children: [{ id: "deep", depth: 3, text: "Deep", children: [] }],
          },
          { id: "child-2", depth: 2, text: "Child", children: [] },
        ],
      },
    ]);
  });

  it("extracts typed render blocks without emitting executable embeds", async () => {
    const result = await compileDocument(
      [
        "```mermaid",
        "graph TD; A-->B",
        "```",
        "",
        '::youtube{id="dQw4w9WgXcQ" title="Demo" start="3"}',
        "",
        '::hf-demo{space="openai/whisper"}',
        "",
        ':::callout{tone="warning" title="Careful"}',
        "Evidence is preliminary.",
        ":::",
      ].join("\n"),
    );
    expect(result.blocks.map((block) => block.type)).toEqual([
      "html",
      "mermaid",
      "youtube",
      "hf-demo",
      "callout",
    ]);
    expect(result.html).not.toContain("<iframe");
    expect(result.html).not.toContain("<script");
  });

  it("compiles GFM, math, code highlighting, frontmatter and search text", async () => {
    const result = await compileDocument(
      "---\ntitle: Test\nlocale: ko\n---\n# Hello\n\n$x^2$\n\n```ts\nconst n = 1\n```",
    );
    expect(result.locale).toBe("ko");
    expect(result.title).toBe("Test");
    expect(result.html).toContain("katex");
    expect(result.html).toContain("background-color:#0d1117");
    expect(result.searchText).toContain("Hello");
  }, 45_000);

  it("rejects unsupported directives", async () => {
    await expect(compileDocument('::iframe{src="https://example.com"}')).rejects.toBeInstanceOf(
      ContentCompilationError,
    );
  });

  it("retains accessible math markup without enabling untrusted HTML or math links", async () => {
    const result = await compileDocument(
      "$\\sqrt{x^2}$\n\n$\\href{javascript:alert(1)}{x}$\n\n<img src=x onerror=alert(1)>",
    );
    expect(result.html).toContain("<math");
    expect(result.html).toContain("<svg");
    expect(result.html).toContain('aria-hidden="true"');
    expect(result.html).not.toContain('href="javascript:');
    expect(result.html).not.toContain("onerror");
  });

  it("preserves HTTPS Markdown images from Imgur or a public R2 origin", async () => {
    const result = await compileDocument(
      "![Architecture diagram](https://media.example.com/images/archive.png)",
    );
    expect(result.html).toContain(
      '<img src="https://media.example.com/images/archive.png" alt="Architecture diagram">',
    );
  });
});

describe("sourceHash", () => {
  it("is stable SHA-256 over the exact UTF-8 source", () => {
    expect(sourceHash("archive")).toBe(
      "0eb3e36bfb24dcd9bb1d1bece1531216b59539a8fde17ee80224af0653c92aa3",
    );
    expect(sourceHash("archive\n")).not.toBe(sourceHash("archive"));
  });
});
