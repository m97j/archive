import {
  aggregateEmbeddings,
  applyMarkdownTranslation,
  planMarkdownTranslation,
  ProviderError,
  type EmbeddingVector,
  type KnowledgeProvider,
} from "@archive/content-engine";
import { LOCALES, type Locale } from "@archive/contracts";
import type { ClaimedJob, PublishedAiSource } from "@archive/db";

export interface AiJobRepository {
  claim(type: string, limit: number, now: Date): Promise<ClaimedJob[]>;
  load(
    contentId: string,
    locale: Locale,
    artifactId: string,
  ): Promise<PublishedAiSource | undefined>;
  completeEmbedding(
    job: ClaimedJob,
    source: PublishedAiSource,
    vector: EmbeddingVector,
    model: string,
  ): Promise<void>;
  completeTranslation(
    job: ClaimedJob,
    source: PublishedAiSource,
    input: {
      targetLocale: Locale;
      title: string;
      description?: string;
      markdown: string;
      model: string;
      actorId: string;
    },
  ): Promise<void>;
  fail(job: ClaimedJob, errorCode: string, retryAt: Date): Promise<boolean>;
}
function payloadString(job: ClaimedJob, key: string): string {
  const value = job.payload[key];
  if (typeof value !== "string" || !value) throw new ProviderError("AI_PAYLOAD_INVALID");
  return value;
}
function payloadLocale(job: ClaimedJob, key: string): Locale {
  const value = payloadString(job, key);
  if (!LOCALES.includes(value as Locale)) throw new ProviderError("AI_PAYLOAD_INVALID");
  return value as Locale;
}
function chunks(text: string): string[] {
  if (text.length > 48000) throw new ProviderError("AI_DOCUMENT_LIMIT");
  const result: string[] = [];
  for (let index = 0; index < text.length;) {
    let end = Math.min(index + 300, text.length);
    if (end < text.length) {
      const separator = text.lastIndexOf(" ", end);
      if (separator > index + 150) end = separator + 1;
    }
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end -= 1;
    const chunk = text.slice(index, end).trim();
    if (chunk) result.push(chunk);
    index = end;
  }
  if (!result.length) throw new ProviderError("AI_DOCUMENT_EMPTY");
  return result;
}
async function translateAligned(
  provider: KnowledgeProvider,
  texts: string[],
  sourceLocale: Locale,
  targetLocale: Locale,
  deadline: number,
): Promise<{ texts: string[]; model: string }> {
  const translations: string[] = [];
  let model = "";
  for (let index = 0; index < texts.length; index += 8) {
    if (Date.now() > deadline) throw new ProviderError("AI_JOB_TIMEOUT");
    const response = await provider.translate(
      texts.slice(index, index + 8),
      sourceLocale,
      targetLocale,
    );
    if (model && model !== response.model) throw new ProviderError("PROVIDER_MODEL_CHANGED");
    model = response.model;
    translations.push(...response.translations);
  }
  return { texts: translations, model };
}
export async function runAiBatch(
  repository: AiJobRepository,
  provider: KnowledgeProvider | undefined,
  options: { now?: Date } = {},
): Promise<{ claimed: number; succeeded: number; failed: number }> {
  if (!provider) return { claimed: 0, succeeded: 0, failed: 0 };
  const now = options.now ?? new Date();
  // Claim one at a time: bounded inference + no lease expiry for jobs waiting in a local batch.
  const jobs = await repository.claim("EMBED_PUBLICATION", 1, now);
  if (!jobs.length) jobs.push(...(await repository.claim("TRANSLATE_PUBLICATION", 1, now)));
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const locale = payloadLocale(job, "locale");
      const source = await repository.load(
        payloadString(job, "contentId"),
        locale,
        payloadString(job, "artifactId"),
      );
      if (!source || source.sourceHash !== payloadString(job, "sourceHash"))
        throw new ProviderError("AI_SOURCE_STALE");
      const deadline = Date.now() + 5 * 60_000;
      if (job.type === "EMBED_PUBLICATION") {
        const texts = chunks(source.searchText);
        const vectors: EmbeddingVector[] = [];
        let model = "";
        for (let index = 0; index < texts.length; index += 8) {
          if (Date.now() > deadline) throw new ProviderError("AI_JOB_TIMEOUT");
          const response = await provider.embeddings(texts.slice(index, index + 8));
          if (model && model !== response.model) throw new ProviderError("PROVIDER_MODEL_CHANGED");
          model = response.model;
          vectors.push(...response.embeddings);
        }
        await repository.completeEmbedding(job, source, aggregateEmbeddings(vectors), model);
      } else {
        const targetLocale = payloadLocale(job, "targetLocale");
        if (targetLocale === locale) throw new ProviderError("AI_PAYLOAD_INVALID");
        const plan = planMarkdownTranslation(source.sourceMarkdown);
        const titleParts = chunks(source.title);
        const descriptionParts = source.description?.trim() ? chunks(source.description) : [];
        const prefix = [...titleParts, ...descriptionParts];
        const translated = await translateAligned(
          provider,
          [...prefix, ...plan.segments.map((segment) => segment.text)],
          locale,
          targetLocale,
          deadline,
        );
        const title = translated.texts.slice(0, titleParts.length).join(" ");
        if (!title) throw new ProviderError("PROVIDER_RESPONSE_INVALID");
        const description = descriptionParts.length
          ? translated.texts.slice(titleParts.length, prefix.length).join(" ")
          : undefined;
        await repository.completeTranslation(job, source, {
          targetLocale,
          title,
          ...(description === undefined ? {} : { description }),
          markdown: applyMarkdownTranslation(plan, translated.texts.slice(prefix.length)),
          model: translated.model,
          actorId: payloadString(job, "actorId"),
        });
      }
      succeeded += 1;
    } catch (error) {
      const errorCode = error instanceof ProviderError ? error.code : "AI_JOB_FAILED";
      // Never persist provider error bodies, source text, prompts, query strings or tokens.
      await repository.fail(
        job,
        errorCode,
        new Date(Date.now() + Math.min(300000, 10000 * 2 ** Math.min(job.attempts, 4))),
      );
      failed += 1;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}
