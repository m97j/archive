import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface Node {
  type: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
export interface TranslationSegment {
  text: string;
  start: number;
  end: number;
}
export interface TranslationPlan {
  source: string;
  segments: TranslationSegment[];
}
/** Select only prose text spans. Everything else, including frontmatter, URLs and embeds, remains byte-for-byte. */
export function planMarkdownTranslation(source: string): TranslationPlan {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .parse(source) as Node;
  const segments: TranslationSegment[] = [];
  const blocked = new Set([
    "code",
    "inlineCode",
    "math",
    "inlineMath",
    "html",
    "yaml",
    "leafDirective",
    "textDirective",
  ]);
  const walk = (node: Node) => {
    if (blocked.has(node.type)) return;
    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined && source.slice(start, end).trim()) {
        // Bound inference segments without splitting Markdown delimiters (already excluded by AST).
        for (let offset = start; offset < end;) {
          let finish = Math.min(offset + 300, end);
          if (finish < end) {
            const separator = source.lastIndexOf(" ", finish);
            if (separator > offset + 150) finish = separator + 1;
          }
          if (finish < end && /[\uD800-\uDBFF]/.test(source[finish - 1] ?? "")) finish -= 1;
          const text = source.slice(offset, finish);
          if (text.trim()) segments.push({ text, start: offset, end: finish });
          offset = finish;
        }
      }
    } else for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  if (segments.length > 256) throw new Error("TRANSLATION_DOCUMENT_LIMIT");
  return { source, segments };
}
function escapedProse(text: string): string {
  // Model output is text, never executable HTML or Markdown structure.
  return text
    .replaceAll("\\", "\\\\")
    .replace(/([`*_{}[\]()<>#!|~+\-=.:])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
}
export function applyMarkdownTranslation(plan: TranslationPlan, translations: string[]): string {
  if (translations.length !== plan.segments.length)
    throw new Error("TRANSLATION_ALIGNMENT_INVALID");
  let output = plan.source;
  for (let index = plan.segments.length - 1; index >= 0; index--) {
    const segment = plan.segments[index];
    const translated = translations[index];
    if (
      !segment ||
      typeof translated !== "string" ||
      !translated.trim() ||
      translated.length > 16000
    )
      throw new Error("TRANSLATION_ALIGNMENT_INVALID");
    const leading = /^\s*/.exec(segment.text)?.[0] ?? "";
    const trailing = /\s*$/.exec(segment.text)?.[0] ?? "";
    output =
      output.slice(0, segment.start) +
      leading +
      escapedProse(translated.trim()) +
      trailing +
      output.slice(segment.end);
  }
  return output;
}
