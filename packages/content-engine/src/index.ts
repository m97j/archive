import { createHash } from "node:crypto";

import rehypeShiki from "@shikijs/rehype";
import type { CompiledDocument, Heading, Locale, RenderBlock } from "@archive/contracts";
import { LOCALES } from "@archive/contracts";
import { defaultSchema } from "hast-util-sanitize";
import { toString } from "mdast-util-to-string";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";

export interface CompileOptions {
  locale?: Locale;
  shikiTheme?: string;
}

export class ContentCompilationError extends Error {
  override readonly name = "ContentCompilationError";
}

interface AstNode {
  type: string;
  name?: string;
  lang?: string | null;
  value?: string;
  depth?: number;
  attributes?: Record<string, unknown> | null;
  children?: AstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

interface CompilationState {
  frontmatter: Record<string, unknown>;
  headings: Omit<Heading, "children">[];
  blocks: RenderBlock[];
}

const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      "className",
      "dataRenderBlock",
      "dataVideoId",
      "dataStartSeconds",
      "dataSpace",
      "dataTitle",
    ],
    section: [...(defaultSchema.attributes?.section ?? []), "className", "dataTone"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "section"],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function nestedToc(flat: Omit<Heading, "children">[]): Heading[] {
  const roots: Heading[] = [];
  const stack: Heading[] = [];
  for (const item of flat) {
    const heading: Heading = { ...item, children: [] };
    while (stack.length > 0 && (stack.at(-1)?.depth ?? 0) >= heading.depth) stack.pop();
    const parent = stack.at(-1);
    if (parent === undefined) roots.push(heading);
    else parent.children.push(heading);
    stack.push(heading);
  }
  return roots;
}

function requiredString(attributes: Record<string, unknown>, key: string, context: string): string {
  const value = attributes[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContentCompilationError(`${context} requires a non-empty ${key} attribute`);
  }
  return value.trim();
}

function optionalString(attributes: Record<string, unknown>, key: string): string | undefined {
  const value = attributes[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function compilationPlugin(state: CompilationState) {
  return (tree: AstNode) => {
    const usedSlugs = new Map<string, number>();

    visit(tree, "yaml", (node: AstNode) => {
      if (Object.keys(state.frontmatter).length > 0) {
        throw new ContentCompilationError("Only one frontmatter document is allowed");
      }
      const parsed: unknown = parseYaml(node.value ?? "");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new ContentCompilationError("Frontmatter must be a YAML mapping");
      }
      state.frontmatter = parsed as Record<string, unknown>;
    });

    visit(tree, "heading", (node: AstNode) => {
      const text = toString(node).trim();
      const base = slugifyHeading(text);
      const occurrence = (usedSlugs.get(base) ?? 0) + 1;
      usedSlugs.set(base, occurrence);
      const id = occurrence === 1 ? base : `${base}-${occurrence}`;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
      state.headings.push({ id, depth: node.depth ?? 1, text });
    });

    visit(tree, "code", (node: AstNode) => {
      if (node.lang !== "mermaid") return;
      const source = node.value ?? "";
      state.blocks.push({ type: "mermaid", source });
      node.type = "paragraph";
      node.children = [{ type: "text", value: source }];
      delete node.value;
      delete node.lang;
      node.data = {
        hName: "div",
        hProperties: { className: ["render-block", "mermaid"], dataRenderBlock: "mermaid" },
      };
    });

    const visitDirective = (node: AstNode) => {
      const attributes = node.attributes ?? {};
      if (node.name === "youtube" && node.type === "leafDirective") {
        const videoId = requiredString(attributes, "id", "youtube directive");
        if (!/^[A-Za-z0-9_-]{6,15}$/.test(videoId)) {
          throw new ContentCompilationError("youtube id has an invalid format");
        }
        const title = optionalString(attributes, "title");
        const startValue = attributes.start;
        const startSeconds = startValue === undefined ? undefined : Number(startValue);
        if (startSeconds !== undefined && (!Number.isInteger(startSeconds) || startSeconds < 0)) {
          throw new ContentCompilationError("youtube start must be a non-negative integer");
        }
        state.blocks.push({
          type: "youtube",
          videoId,
          ...(title === undefined ? {} : { title }),
          ...(startSeconds === undefined ? {} : { startSeconds }),
        });
        node.data = {
          hName: "div",
          hProperties: {
            className: ["render-block", "youtube"],
            dataRenderBlock: "youtube",
            dataVideoId: videoId,
            ...(title === undefined ? {} : { dataTitle: title }),
            ...(startSeconds === undefined ? {} : { dataStartSeconds: startSeconds }),
          },
        };
        return;
      }

      if (node.name === "hf-demo" && node.type === "leafDirective") {
        const space = requiredString(attributes, "space", "hf-demo directive");
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(space)) {
          throw new ContentCompilationError("hf-demo space must use owner/name format");
        }
        const title = optionalString(attributes, "title");
        state.blocks.push({ type: "hf-demo", space, ...(title === undefined ? {} : { title }) });
        node.data = {
          hName: "div",
          hProperties: {
            className: ["render-block", "hf-demo"],
            dataRenderBlock: "hf-demo",
            dataSpace: space,
            ...(title === undefined ? {} : { dataTitle: title }),
          },
        };
        return;
      }

      if (node.name === "callout" && node.type === "containerDirective") {
        const toneValue = optionalString(attributes, "tone") ?? "note";
        if (!["note", "tip", "warning", "danger"].includes(toneValue)) {
          throw new ContentCompilationError("callout tone must be note, tip, warning, or danger");
        }
        const tone = toneValue as "note" | "tip" | "warning" | "danger";
        const title = optionalString(attributes, "title");
        const html = `<p>${escapeHtml(toString(node))}</p>`;
        state.blocks.push({
          type: "callout",
          tone,
          html,
          ...(title === undefined ? {} : { title }),
        });
        node.data = {
          hName: "section",
          hProperties: { className: ["callout", `callout-${tone}`], dataTone: tone },
        };
        return;
      }

      throw new ContentCompilationError(`Unsupported directive: ${node.name ?? "unnamed"}`);
    };
    visit(tree, "leafDirective", visitDirective);
    visit(tree, "containerDirective", visitDirective);
  };
}

function extractSearchText(tree: AstNode): string {
  const values: string[] = [];
  visit(tree, (node: AstNode) => {
    if (
      (node.type === "text" || node.type === "inlineCode" || node.type === "code") &&
      node.value
    ) {
      values.push(node.value);
    }
  });
  return values.join(" ").replace(/\s+/g, " ").trim();
}

export function sourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function needsSyntaxHighlighting(source: string): boolean {
  if (/(?:^|\n) {4}\S/.test(source)) return true;
  let openFence: string | undefined;
  for (const line of source.split(/\r?\n/)) {
    const match = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s]*)/.exec(line);
    if (match === null) continue;
    const marker = match[1];
    if (marker === undefined) continue;
    if (openFence === undefined) {
      if ((match[2] ?? "").toLocaleLowerCase("en-US") !== "mermaid") return true;
      openFence = marker;
    } else if (marker[0] === openFence[0] && marker.length >= openFence.length) {
      openFence = undefined;
    }
  }
  return false;
}

export async function compileDocument(
  source: string,
  options: CompileOptions = {},
): Promise<CompiledDocument> {
  const state: CompilationState = { frontmatter: {}, headings: [], blocks: [] };
  let searchText = "";
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(() => (tree) => {
      compilationPlugin(state)(tree as AstNode);
      searchText = extractSearchText(tree as AstNode);
    })
    .use(remarkRehype)
    // Sanitize untrusted input first; trusted renderers then preserve MathML/SVG/styles.
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeKatex, { trust: false });

  if (needsSyntaxHighlighting(source)) {
    processor.use(rehypeShiki, { theme: options.shikiTheme ?? "github-dark-default" });
  }
  processor.use(rehypeStringify);

  let html: string;
  try {
    html = String(await processor.process(source));
  } catch (error) {
    if (error instanceof ContentCompilationError) throw error;
    throw new ContentCompilationError(
      error instanceof Error ? error.message : "Compilation failed",
    );
  }

  const frontmatterLocale = state.frontmatter.locale;
  const locale =
    options.locale ??
    (typeof frontmatterLocale === "string" && LOCALES.some((locale) => locale === frontmatterLocale)
      ? (frontmatterLocale as Locale)
      : "en");
  const title = typeof state.frontmatter.title === "string" ? state.frontmatter.title : undefined;
  const description =
    typeof state.frontmatter.description === "string" ? state.frontmatter.description : undefined;

  return {
    schemaVersion: 1,
    locale,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    sourceHash: sourceHash(source),
    html,
    blocks: [{ type: "html", html }, ...state.blocks],
    toc: nestedToc(state.headings),
    searchText,
    frontmatter: state.frontmatter,
  };
}
