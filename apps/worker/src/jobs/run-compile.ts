import type { ClaimedJob, CompilationSource } from "@archive/db";
import { compileDocument, type CompileOptions } from "@archive/content-engine";
import type { CompiledDocument } from "@archive/contracts";

export interface CompilationJobRepository {
  claim(limit: number, now: Date): Promise<ClaimedJob[]>;
  load(localizedRevisionId: string): Promise<CompilationSource | undefined>;
  complete(
    jobId: string,
    localizedRevisionId: string,
    compilerVersion: string,
    document: CompiledDocument,
    now: Date,
  ): Promise<string>;
  fail(
    job: Pick<ClaimedJob, "id" | "attempts" | "maxAttempts">,
    error: string,
    retryAt: Date,
  ): Promise<boolean>;
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value === "") throw new Error(`Compile job requires ${key}`);
  return value;
}

export async function runCompilationBatch(
  repository: CompilationJobRepository,
  options: { batchSize?: number; now?: Date; compile?: typeof compileDocument } = {},
): Promise<{ claimed: number; compiled: number; failed: number }> {
  const now = options.now ?? new Date();
  const jobs = await repository.claim(options.batchSize ?? 5, now);
  let compiled = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const localizedRevisionId = payloadString(job.payload, "localizedRevisionId");
      const compilerVersion = payloadString(job.payload, "compilerVersion");
      const source = await repository.load(localizedRevisionId);
      if (source === undefined)
        throw new Error(`Localized revision ${localizedRevisionId} not found`);
      const compileOptions: CompileOptions = { locale: source.locale };
      const document = await (options.compile ?? compileDocument)(
        source.sourceMarkdown,
        compileOptions,
      );
      if (document.sourceHash !== source.sourceHash)
        throw new Error("Compiled source hash mismatch");
      await repository.complete(job.id, localizedRevisionId, compilerVersion, document, now);
      compiled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delay = Math.min(5 * 60_000, 2_000 * 2 ** Math.min(job.attempts - 1, 7));
      await repository.fail(job, message, new Date(now.getTime() + delay));
      failed += 1;
    }
  }
  return { claimed: jobs.length, compiled, failed };
}
