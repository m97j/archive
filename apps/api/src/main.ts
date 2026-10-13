import {
  attachTag,
  createClaim,
  createContentRelation,
  createContentIdentity,
  createDatabaseFromEnvironment,
  createDraftRevision,
  createEvidence,
  createHypothesis,
  createResearchProgram,
  createTag,
  createTaxonomyNode,
  getPublicNavigation,
  listAdminContent,
  listPublicContent,
  placeContentInTaxonomy,
  publishLocalizedRevision,
  resolvePublicContent,
  reviewRevision,
  reviewTranslation,
  updateContentAccess,
  getAdminDraft,
  enqueueEmbedding,
  enqueueTranslation,
  listAdminJobs,
  listTaxonomyNodes,
  listTags,
  loadSearchCandidates,
} from "@archive/db";
import { knowledgeProviderFromEnvironment, ProviderError } from "@archive/content-engine";

import { buildApp } from "./app.js";
import { createJwtAuthenticator } from "./plugins/auth.js";
import { createR2MediaStorage } from "./services/media-storage.js";
import { createHybridSearch } from "./services/hybrid-search.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}

function mediaStorageFromEnvironment() {
  const names = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_BASE_URL",
  ] as const;
  const values = names.map((name) => process.env[name]?.trim());
  if (values.every((value) => !value)) return undefined;
  const [accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl] = values;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(`R2 media storage requires ${names.join(", ")}`);
  }
  return createR2MediaStorage({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  });
}

async function main(): Promise<void> {
  const database = createDatabaseFromEnvironment();
  const authenticate = createJwtAuthenticator({
    jwksUrl: requiredEnvironment("SUPABASE_JWKS_URL"),
    ...(process.env.SUPABASE_JWT_ISSUER === undefined
      ? {}
      : { issuer: process.env.SUPABASE_JWT_ISSUER }),
    ...(process.env.SUPABASE_JWT_AUDIENCE === undefined
      ? {}
      : { audience: process.env.SUPABASE_JWT_AUDIENCE }),
    requiredRole: process.env.PUBLISHER_ROLE ?? "archive_admin",
  });
  const media = mediaStorageFromEnvironment();
  const provider = knowledgeProviderFromEnvironment(process.env, 6000);
  const app = buildApp({
    logger: true,
    authenticate,
    ai: {
      enqueueEmbedding: (input, actor) => {
        if (!provider) throw new ProviderError("AI_PROVIDER_DISABLED");
        return enqueueEmbedding(database.db, input.contentId, input.locale ?? "ko", actor.id);
      },
      enqueueTranslation: (input, actor) => {
        if (!provider) throw new ProviderError("AI_PROVIDER_DISABLED");
        return enqueueTranslation(database.db, input, actor.id);
      },
      listJobs: () => listAdminJobs(database.db),
    },
    search: createHybridSearch({
      ...(provider ? { provider } : {}),
      lexical: async (input) =>
        (
          await listPublicContent(
            database.db,
            { locale: input.locale, q: input.q, limit: 100 },
            { rankByQuery: true },
          )
        ).items,
      candidates: (locale) => loadSearchCandidates(database.db, locale),
    }),
    updateContentAccess: (contentId, input, actor) =>
      updateContentAccess(database.db, contentId, input, actor.id),
    getAdminDraft: (contentId, locale) => getAdminDraft(database.db, contentId, locale),
    ...(media === undefined ? {} : { media }),
    publisher: {
      publish: (input, actor) =>
        publishLocalizedRevision(database.db, input, { actorId: actor.id }),
    },
    workflow: {
      createContent: (input, actor) => createContentIdentity(database.db, input, actor.id),
      createRevision: (contentId, input, actor) =>
        createDraftRevision(
          database.db,
          contentId,
          input,
          actor.id,
          process.env.CONTENT_COMPILER_VERSION ?? "content-engine-v1",
        ),
      reviewRevision: (revisionId, input, actor) =>
        reviewRevision(database.db, revisionId, input, actor.id),
      reviewTranslation: (localizedRevisionId, input, actor) =>
        reviewTranslation(database.db, localizedRevisionId, input, actor.id),
    },
    resolvePublic: (locale, path) => resolvePublicContent(database.db, locale, path),
    listPublic: (query) => listPublicContent(database.db, query),
    resolveNavigation: (query) => getPublicNavigation(database.db, query),
    archive: {
      listTaxonomyNodes: () => listTaxonomyNodes(database.db),
      listTags: () => listTags(database.db),
      listContents: (query) => listAdminContent(database.db, query),
      createTaxonomyNode: (input, actor) => createTaxonomyNode(database.db, input, actor.id),
      placeContent: (contentId, nodeId, input) =>
        placeContentInTaxonomy(database.db, contentId, nodeId, input),
      createTag: (input) => createTag(database.db, input),
      attachTag: (contentId, input) => attachTag(database.db, contentId, input.tagId),
      createRelation: (contentId, input) => createContentRelation(database.db, contentId, input),
      createResearchProgram: (input) => createResearchProgram(database.db, input),
      createHypothesis: (researchProgramId, input) =>
        createHypothesis(database.db, researchProgramId, input),
      createClaim: (input) => createClaim(database.db, input),
      createEvidence: (claimId, input) => createEvidence(database.db, claimId, input),
    },
  });
  app.addHook("onClose", () => database.close());

  const portValue = Number(process.env.PORT ?? "3001");
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  await app.listen({ host: process.env.HOST ?? "0.0.0.0", port: portValue });
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,50}$/.test(error.code)
      ? error.code
      : "API_STARTUP_FAILED";
  process.stderr.write(`${JSON.stringify({ errorCode: code, service: "archive-api" })}\n`);
  process.exitCode = 1;
});
