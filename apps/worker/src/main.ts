import {
  claimOutboxEvents,
  claimJobs,
  completeCompilationJob,
  createDatabaseFromEnvironment,
  failJob,
  loadCompilationSource,
  markOutboxFailed,
  markOutboxPublished,
  recoverStaleOutboxEvents,
  recoverStaleJobs,
  loadPublishedAiSource,
  completeEmbedding,
  completeTranslation,
  enqueueEmbedding,
} from "@archive/db";
import { knowledgeProviderFromEnvironment } from "@archive/content-engine";
import { LOCALES, type Locale } from "@archive/contracts";
import { createLogger } from "@archive/observability";

import { createSignedWebhookHandler } from "./jobs/publication-webhook.js";
import { runCompilationBatch, type CompilationJobRepository } from "./jobs/run-compile.js";
import { runOutboxBatch, type OutboxRepository } from "./jobs/run-outbox.js";
import { runAiBatch, type AiJobRepository } from "./jobs/run-ai.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

async function main(): Promise<void> {
  const logger = createLogger({ base: { service: "archive-worker" } });
  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
  const batchSize = positiveInteger(process.env.OUTBOX_BATCH_SIZE, 20, "OUTBOX_BATCH_SIZE");
  const pollMilliseconds = positiveInteger(
    process.env.OUTBOX_POLL_MILLISECONDS,
    1_000,
    "OUTBOX_POLL_MILLISECONDS",
  );
  const database = createDatabaseFromEnvironment();
  const provider = knowledgeProviderFromEnvironment();
  const webhook = createSignedWebhookHandler({
    url: requiredEnvironment("PUBLICATION_WEBHOOK_URL"),
    secret: requiredEnvironment("OUTBOX_WEBHOOK_SECRET"),
  });
  const repository: OutboxRepository = {
    claim: (limit, now) => claimOutboxEvents(database.db, workerId, limit, now),
    markPublished: (eventId, now) => markOutboxPublished(database.db, eventId, workerId, now),
    markFailed: (event, error, retryAt) =>
      markOutboxFailed(database.db, event, workerId, error, retryAt),
  };
  const compilationRepository: CompilationJobRepository = {
    claim: (limit, now) => claimJobs(database.db, workerId, "COMPILE_DOCUMENT", limit, now),
    load: (localizedRevisionId) => loadCompilationSource(database.db, localizedRevisionId),
    complete: (jobId, localizedRevisionId, compilerVersion, document, now) =>
      completeCompilationJob(
        database.db,
        jobId,
        workerId,
        localizedRevisionId,
        compilerVersion,
        document,
        now,
      ),
    fail: (job, error, retryAt) => failJob(database.db, job, workerId, error, retryAt),
  };
  const aiRepository: AiJobRepository = {
    claim: (type, limit, now) => claimJobs(database.db, workerId, type, limit, now),
    load: (contentId, locale, artifactId) =>
      loadPublishedAiSource(database.db, contentId, locale, artifactId),
    completeEmbedding: (job, source, vector, model) =>
      completeEmbedding(database.db, job.id, workerId, source, vector, model),
    completeTranslation: (job, source, input) =>
      completeTranslation(database.db, job.id, workerId, source, {
        ...input,
        compilerVersion: process.env.CONTENT_COMPILER_VERSION ?? "content-engine-v1",
      }),
    fail: (job, error, retryAt) => failJob(database.db, job, workerId, error, retryAt),
  };
  const publicationHandler: typeof webhook = async (event) => {
    await webhook(event);
    if (!provider) return;
    const contentId = event.payload.contentId;
    const locale = event.payload.locale;
    if (
      typeof contentId !== "string" ||
      typeof locale !== "string" ||
      !LOCALES.includes(locale as Locale)
    )
      return;
    const source = await loadPublishedAiSource(database.db, contentId, locale as Locale);
    if (source) await enqueueEmbedding(database.db, contentId, locale as Locale, event.id);
  };
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());

  const recovered = await recoverStaleOutboxEvents(
    database.db,
    new Date(Date.now() - 10 * 60 * 1_000),
  );
  if (recovered > 0) logger.warn({ recovered }, "recovered stale outbox leases");
  const recoveredJobs = await recoverStaleJobs(database.db, new Date(Date.now() - 10 * 60 * 1_000));
  if (recoveredJobs > 0) logger.warn({ recoveredJobs }, "recovered stale compilation leases");
  logger.info({ workerId, batchSize }, "outbox worker started");
  let aiTask: Promise<void> | undefined;
  let nextAiPoll = 0;

  try {
    while (!controller.signal.aborted) {
      try {
        const compilationResult = await runCompilationBatch(compilationRepository, {
          batchSize: Math.min(batchSize, 10),
        });
        // Inference never blocks publication cache invalidation or document compilation.
        if (provider && !aiTask && Date.now() >= nextAiPoll) {
          aiTask = runAiBatch(aiRepository, provider)
            .then((result) => {
              if (result.claimed) logger.info({ ai: result }, "AI job processed");
            })
            .catch(() => logger.error({ errorCode: "AI_BATCH_FAILED" }, "AI batch failed"))
            .finally(() => {
              aiTask = undefined;
              nextAiPoll = Date.now() + pollMilliseconds;
            });
        }
        const result = await runOutboxBatch(
          repository,
          {
            REVISION_CREATED: webhook,
            REVISION_PUBLISHED: publicationHandler,
            DOCUMENT_COMPILED: webhook,
            CONTENT_ACCESS_CHANGED: webhook,
          },
          { batchSize },
        );
        if (result.claimed === 0 && compilationResult.claimed === 0) {
          await delay(pollMilliseconds, controller.signal);
        } else
          logger.info({ outbox: result, compilation: compilationResult }, "worker batch processed");
      } catch (error) {
        const errorCode =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string" &&
          /^[A-Z0-9_]{1,50}$/.test(error.code)
            ? error.code
            : "WORKER_BATCH_FAILED";
        logger.error({ errorCode }, "outbox batch failed");
        await delay(pollMilliseconds, controller.signal);
      }
    }
  } finally {
    await aiTask;
    await database.close();
    logger.info("outbox worker stopped");
  }
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,50}$/.test(error.code)
      ? error.code
      : "WORKER_STARTUP_FAILED";
  process.stderr.write(`${JSON.stringify({ errorCode: code, service: "archive-worker" })}\n`);
  process.exitCode = 1;
});
