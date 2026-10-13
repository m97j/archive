import type { Locale } from "@archive/contracts";

export interface EmbeddingVector {
  dense: number[];
  sparse: Record<string, number>;
}
export interface EmbeddingResponse {
  model: string;
  dimension: number;
  embeddings: EmbeddingVector[];
}
export interface TranslationResponse {
  model: string;
  translations: string[];
}
export interface KnowledgeProvider {
  embeddings(texts: string[]): Promise<EmbeddingResponse>;
  translate(
    texts: string[],
    sourceLocale: Locale,
    targetLocale: Locale,
  ): Promise<TranslationResponse>;
}
export class ProviderError extends Error {
  override readonly name = "ProviderError";
  constructor(readonly code: string) {
    super(code);
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasControl = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
function modelName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || hasControl(value))
    throw new ProviderError("PROVIDER_RESPONSE_INVALID");
  return value;
}
export function validateEmbeddingResponse(value: unknown, count: number): EmbeddingResponse {
  if (
    !object(value) ||
    !Number.isInteger(value.dimension) ||
    Number(value.dimension) < 1 ||
    Number(value.dimension) > 4096 ||
    !Array.isArray(value.embeddings) ||
    value.embeddings.length !== count
  )
    throw new ProviderError("PROVIDER_RESPONSE_INVALID");
  const dimension = Number(value.dimension);
  const embeddings = value.embeddings.map((entry: unknown) => {
    if (
      !object(entry) ||
      !Array.isArray(entry.dense) ||
      entry.dense.length !== dimension ||
      !entry.dense.every(
        (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1000,
      ) ||
      !object(entry.sparse) ||
      Object.keys(entry.sparse).length > 8192
    )
      throw new ProviderError("PROVIDER_RESPONSE_INVALID");
    const sparse: Record<string, number> = {};
    for (const [key, weight] of Object.entries(entry.sparse)) {
      if (
        !/^\d{1,10}$/.test(key) ||
        typeof weight !== "number" ||
        !Number.isFinite(weight) ||
        weight < 0 ||
        weight > 1000
      )
        throw new ProviderError("PROVIDER_RESPONSE_INVALID");
      sparse[key] = weight;
    }
    if (!entry.dense.some((n: number) => n !== 0))
      throw new ProviderError("PROVIDER_RESPONSE_INVALID");
    return { dense: entry.dense as number[], sparse };
  });
  return { model: modelName(value.model), dimension, embeddings };
}
export function validateTranslationResponse(value: unknown, count: number): TranslationResponse {
  if (
    !object(value) ||
    !Array.isArray(value.translations) ||
    value.translations.length !== count ||
    !value.translations.every(
      (text: unknown) =>
        typeof text === "string" &&
        text.length > 0 &&
        text.length <= 16000 &&
        ![...text].some((char) => {
          const code = char.codePointAt(0) ?? 0;
          return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
        }),
    )
  )
    throw new ProviderError("PROVIDER_RESPONSE_INVALID");
  return { model: modelName(value.model), translations: value.translations as string[] };
}
function validateInputs(texts: string[]): void {
  if (
    !texts.length ||
    texts.length > 64 ||
    texts.some((text) => !text.trim() || text.length > 8000) ||
    Buffer.byteLength(texts.join(""), "utf8") > 64000
  )
    throw new ProviderError("PROVIDER_INPUT_LIMIT");
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new ProviderError("PROVIDER_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 5_000_000) throw new ProviderError("PROVIDER_RESPONSE_LIMIT");
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    try {
      return JSON.parse(bytes.toString("utf8")) as unknown;
    } catch {
      throw new ProviderError("PROVIDER_RESPONSE_INVALID");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export function createKnowledgeProvider(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): KnowledgeProvider {
  const url = new URL(options.baseUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new ProviderError("PROVIDER_CONFIG_INVALID");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    options.apiKey.length < 32 ||
    /\s/.test(options.apiKey) ||
    hasControl(options.apiKey)
  )
    throw new ProviderError("PROVIDER_CONFIG_INVALID");
  const timeoutMs = options.timeoutMs ?? 95000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000)
    throw new ProviderError("PROVIDER_CONFIG_INVALID");
  let failures = 0;
  let openUntil = 0;
  const fetcher = options.fetcher ?? fetch;
  async function request(
    path: string,
    input: unknown,
    validate: (body: unknown) => unknown,
  ): Promise<unknown> {
    if (Date.now() < openUntil) throw new ProviderError("PROVIDER_CIRCUIT_OPEN");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(new URL(path, url), {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError(response.status === 429 ? "PROVIDER_BUSY" : "PROVIDER_UNAVAILABLE");
      }
      const result = validate(await boundedJson(response));
      failures = 0;
      openUntil = 0;
      return result;
    } catch (error) {
      failures += 1;
      if (failures >= 3) openUntil = Date.now() + 60000;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        controller.signal.aborted ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async embeddings(texts) {
      validateInputs(texts);
      return (await request("/api/v1/archive/embeddings", { texts }, (body) =>
        validateEmbeddingResponse(body, texts.length),
      )) as EmbeddingResponse;
    },
    async translate(texts, sourceLocale, targetLocale) {
      validateInputs(texts);
      return (await request(
        "/api/v1/archive/translate",
        { texts, source_locale: sourceLocale, target_locale: targetLocale },
        (body) => validateTranslationResponse(body, texts.length),
      )) as TranslationResponse;
    },
  };
}
export function knowledgeProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  timeoutMs?: number,
): KnowledgeProvider | undefined {
  if (environment.AI_PROVIDER_ENABLED !== "true") return undefined;
  return createKnowledgeProvider({
    baseUrl: environment.KNOWLEDGE_ENGINE_BASE_URL ?? "https://m97j-knowledge-engine.hf.space",
    apiKey: environment.KNOWLEDGE_ENGINE_API_KEY ?? "",
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

/** Exact mean pooling is intentionally small-corpus indexing, not a claimed ANN benchmark. */
export function aggregateEmbeddings(vectors: EmbeddingVector[]): EmbeddingVector {
  const first = vectors[0];
  if (!first || vectors.some((vector) => vector.dense.length !== first.dense.length))
    throw new ProviderError("PROVIDER_RESPONSE_INVALID");
  const dense = first.dense.map(
    (_, index) =>
      vectors.reduce((sum, vector) => sum + (vector.dense[index] ?? 0), 0) / vectors.length,
  );
  const denseNorm = Math.hypot(...dense) || 1;
  const sparse: Record<string, number> = {};
  for (const vector of vectors)
    for (const [key, weight] of Object.entries(vector.sparse))
      sparse[key] = Math.max(sparse[key] ?? 0, weight);
  const top = Object.entries(sparse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8192);
  const sparseNorm = Math.hypot(...top.map((entry) => entry[1])) || 1;
  return {
    dense: dense.map((n) => n / denseNorm),
    sparse: Object.fromEntries(top.map(([key, n]) => [key, n / sparseNorm])),
  };
}
