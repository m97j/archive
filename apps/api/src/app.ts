import {
  AdminContentPageSchema,
  AdminContentQuerySchema,
  AttachTagInputSchema,
  ClaimSchema,
  ContentIdentitySchema,
  ContentRelationSchema,
  CreateClaimInputSchema,
  CreateContentInputSchema,
  CreateContentRelationInputSchema,
  CreateEvidenceInputSchema,
  CreateHypothesisInputSchema,
  CreateMediaUploadInputSchema,
  CreateResearchProgramInputSchema,
  CreatedRevisionSchema,
  CreateRevisionInputSchema,
  CreateTagInputSchema,
  CreateTaxonomyNodeInputSchema,
  EvidenceSchema,
  HypothesisSchema,
  LocaleSchema,
  MediaUploadTicketSchema,
  PlaceContentInputSchema,
  PublishRevisionInputSchema,
  PublishedRevisionSchema,
  PublicContentPageSchema,
  PublicContentQuerySchema,
  PublicNavigationQuerySchema,
  PublicNavigationSchema,
  PublicResolutionSchema,
  ResearchProgramSchema,
  RevisionReviewInputSchema,
  TagSchema,
  TaxonomyNodeSchema,
  TaxonomyPlacementSchema,
  TranslationReviewInputSchema,
  WorkflowTransitionSchema,
  ContentAccessSchema,
  UpdateContentAccessInputSchema,
  type ContentAccess,
  type UpdateContentAccessInput,
  AdminDraftSchema,
  type AdminDraft,
  type AdminContentPage,
  type AdminContentQuery,
  type AttachTagInput,
  type Claim,
  type ContentIdentity,
  type ContentRelation,
  type CreateClaimInput,
  type CreateContentInput,
  type CreateContentRelationInput,
  type CreateEvidenceInput,
  type CreateHypothesisInput,
  type CreateMediaUploadInput,
  type CreateResearchProgramInput,
  type CreatedRevision,
  type CreateRevisionInput,
  type CreateTagInput,
  type CreateTaxonomyNodeInput,
  type Evidence,
  type Hypothesis,
  type Locale,
  type MediaUploadTicket,
  type PlaceContentInput,
  type PublishRevisionInput,
  type PublishedRevision,
  type PublicContentPage,
  type PublicContentQuery,
  type PublicNavigation,
  type PublicNavigationQuery,
  type PublicResolution,
  type ResearchProgram,
  type RevisionReviewInput,
  type Tag,
  type TaxonomyNode,
  type TaxonomyPlacement,
  type TranslationReviewInput,
  type WorkflowTransition,
} from "@archive/contracts";
import {
  ArchiveInvariantError,
  PublicationInvariantError,
  WorkflowInvariantError,
} from "@archive/db";
import { Type } from "@sinclair/typebox";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

export interface AuthenticatedActor {
  id: string;
}

export interface PublicationPublisher {
  publish(input: PublishRevisionInput, actor: AuthenticatedActor): Promise<PublishedRevision>;
}

export interface BuildAppOptions {
  publisher: PublicationPublisher;
  workflow?: {
    createContent(input: CreateContentInput, actor: AuthenticatedActor): Promise<ContentIdentity>;
    createRevision(
      contentId: string,
      input: CreateRevisionInput,
      actor: AuthenticatedActor,
    ): Promise<CreatedRevision>;
    reviewRevision(
      revisionId: string,
      input: RevisionReviewInput,
      actor: AuthenticatedActor,
    ): Promise<WorkflowTransition>;
    reviewTranslation(
      localizedRevisionId: string,
      input: TranslationReviewInput,
      actor: AuthenticatedActor,
    ): Promise<WorkflowTransition>;
  };
  resolvePublic?: (locale: Locale, path: string) => Promise<PublicResolution | undefined>;
  listPublic?: (query: PublicContentQuery) => Promise<PublicContentPage>;
  resolveNavigation?: (query: PublicNavigationQuery) => Promise<PublicNavigation>;
  media?: {
    createUpload(
      input: CreateMediaUploadInput,
      actor: AuthenticatedActor,
    ): Promise<MediaUploadTicket>;
  };
  archive?: {
    listContents(query: AdminContentQuery): Promise<AdminContentPage>;
    createTaxonomyNode(
      input: CreateTaxonomyNodeInput,
      actor: AuthenticatedActor,
    ): Promise<TaxonomyNode>;
    placeContent(
      contentId: string,
      nodeId: string,
      input: PlaceContentInput,
    ): Promise<TaxonomyPlacement>;
    createTag(input: CreateTagInput): Promise<Tag>;
    attachTag(contentId: string, input: AttachTagInput): Promise<void>;
    createRelation(
      fromContentId: string,
      input: CreateContentRelationInput,
    ): Promise<ContentRelation>;
    createResearchProgram(input: CreateResearchProgramInput): Promise<ResearchProgram>;
    createHypothesis(researchProgramId: string, input: CreateHypothesisInput): Promise<Hypothesis>;
    createClaim(input: CreateClaimInput): Promise<Claim>;
    createEvidence(claimId: string, input: CreateEvidenceInput): Promise<Evidence>;
  };
  authenticate(request: FastifyRequest): Promise<AuthenticatedActor>;
  updateContentAccess?: (
    contentId: string,
    input: UpdateContentAccessInput,
    actor: AuthenticatedActor,
  ) => Promise<ContentAccess>;
  getAdminDraft?: (contentId: string, locale: Locale) => Promise<AdminDraft | undefined>;
  logger?: boolean;
  rateLimitMax?: number;
}

export class AuthenticationError extends Error {
  override readonly name = "AuthenticationError";
}

export class AuthorizationError extends Error {
  override readonly name = "AuthorizationError";
}

function validationMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("validation" in error)) return undefined;
  if (!("message" in error) || typeof error.message !== "string")
    return "Request validation failed";
  return error.message;
}

export function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: {
            paths: [
              "req.headers.authorization",
              'req.headers["x-archive-user-authorization"]',
              "req.headers.cookie",
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
        }
      : false,
    // The revision contract permits Markdown documents up to 2 MB plus JSON metadata.
    bodyLimit: 2_100_000,
    // Do not trust arbitrary forwarded-IP headers. This is a coarse peer/gateway limiter,
    // not a per-visitor distributed quota; add trusted-proxy configuration only when verified.
    trustProxy: false,
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
  });

  app.register(async (secured) => {
    await secured.register(helmet);
    await secured.register(rateLimit, { max: options.rateLimitMax ?? 600, timeWindow: 60_000 });
    registerRoutes(secured, options);
  });
  return app;
}

function registerRoutes(app: FastifyInstance, options: BuildAppOptions): void {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get<{ Params: { contentId: string }; Querystring: { locale: Locale } }>(
    "/v1/admin/contents/:contentId/draft",
    {
      schema: {
        params: Type.Object({ contentId: Type.String({ format: "uuid" }) }),
        querystring: Type.Object({ locale: LocaleSchema }),
        response: { 200: AdminDraftSchema },
      },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (!options.getAdminDraft) throw new Error("Draft loading is unavailable");
      const draft = await options.getAdminDraft(request.params.contentId, request.query.locale);
      if (!draft) return reply.code(404).send({ error: "Draft not found" });
      return draft;
    },
  );

  app.patch<{ Params: { contentId: string }; Body: UpdateContentAccessInput }>(
    "/v1/contents/:contentId/access",
    {
      schema: {
        params: Type.Object({ contentId: Type.String({ format: "uuid" }) }),
        body: UpdateContentAccessInputSchema,
        response: { 200: ContentAccessSchema },
      },
    },
    async (request) => {
      const actor = await options.authenticate(request);
      if (!options.updateContentAccess) throw new Error("Content access management is unavailable");
      return options.updateContentAccess(request.params.contentId, request.body, actor);
    },
  );

  app.post<{ Body: CreateMediaUploadInput }>(
    "/v1/media/uploads",
    {
      schema: {
        body: CreateMediaUploadInputSchema,
        response: { 201: MediaUploadTicketSchema },
      },
    },
    async (request, reply) => {
      const actor = await options.authenticate(request);
      if (options.media === undefined) throw new Error("Media storage is unavailable");
      return reply.code(201).send(await options.media.createUpload(request.body, actor));
    },
  );

  app.post<{ Body: PublishRevisionInput }>(
    "/v1/publications",
    {
      schema: {
        body: PublishRevisionInputSchema,
        response: {
          200: PublishedRevisionSchema,
        },
      },
    },
    async (request) => {
      const actor = await options.authenticate(request);
      return options.publisher.publish(request.body, actor);
    },
  );

  app.post<{ Body: CreateContentInput }>(
    "/v1/contents",
    { schema: { body: CreateContentInputSchema, response: { 201: ContentIdentitySchema } } },
    async (request, reply) => {
      const actor = await options.authenticate(request);
      if (options.workflow === undefined) throw new Error("Workflow service is unavailable");
      return reply.code(201).send(await options.workflow.createContent(request.body, actor));
    },
  );

  app.post<{ Params: { contentId: string }; Body: CreateRevisionInput }>(
    "/v1/contents/:contentId/revisions",
    {
      schema: {
        params: Type.Object({ contentId: Type.String({ format: "uuid" }) }),
        body: CreateRevisionInputSchema,
        response: { 201: CreatedRevisionSchema },
      },
    },
    async (request, reply) => {
      const actor = await options.authenticate(request);
      if (options.workflow === undefined) throw new Error("Workflow service is unavailable");
      return reply
        .code(201)
        .send(await options.workflow.createRevision(request.params.contentId, request.body, actor));
    },
  );

  app.post<{ Params: { revisionId: string }; Body: RevisionReviewInput }>(
    "/v1/revisions/:revisionId/review",
    {
      schema: {
        params: Type.Object({ revisionId: Type.String({ format: "uuid" }) }),
        body: RevisionReviewInputSchema,
        response: { 200: WorkflowTransitionSchema },
      },
    },
    async (request) => {
      const actor = await options.authenticate(request);
      if (options.workflow === undefined) throw new Error("Workflow service is unavailable");
      return options.workflow.reviewRevision(request.params.revisionId, request.body, actor);
    },
  );

  app.post<{ Params: { localizedRevisionId: string }; Body: TranslationReviewInput }>(
    "/v1/localized-revisions/:localizedRevisionId/review",
    {
      schema: {
        params: Type.Object({ localizedRevisionId: Type.String({ format: "uuid" }) }),
        body: TranslationReviewInputSchema,
        response: { 200: WorkflowTransitionSchema },
      },
    },
    async (request) => {
      const actor = await options.authenticate(request);
      if (options.workflow === undefined) throw new Error("Workflow service is unavailable");
      return options.workflow.reviewTranslation(
        request.params.localizedRevisionId,
        request.body,
        actor,
      );
    },
  );

  app.get<{ Querystring: { locale: Locale; path: string } }>(
    "/v1/public/resolve",
    {
      schema: {
        querystring: Type.Object({
          locale: LocaleSchema,
          path: Type.String({ pattern: "^/[^\\u0000-\\u001F\\u007F?#]*$", maxLength: 512 }),
        }),
        response: { 200: PublicResolutionSchema },
      },
    },
    async (request, reply) => {
      if (options.resolvePublic === undefined) throw new Error("Public resolver is unavailable");
      const result = await options.resolvePublic(request.query.locale, request.query.path);
      if (result === undefined) return reply.code(404).send({ error: "NOT_FOUND" });
      return result;
    },
  );

  app.get<{ Querystring: PublicContentQuery }>(
    "/v1/public/contents",
    {
      schema: {
        querystring: PublicContentQuerySchema,
        response: { 200: PublicContentPageSchema },
      },
    },
    async (request) => {
      if (options.listPublic === undefined) throw new Error("Public catalog is unavailable");
      return options.listPublic(request.query);
    },
  );

  app.get<{ Querystring: AdminContentQuery }>(
    "/v1/admin/contents",
    {
      schema: {
        querystring: AdminContentQuerySchema,
        response: { 200: AdminContentPageSchema },
      },
    },
    async (request) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return options.archive.listContents(request.query);
    },
  );

  app.get<{ Querystring: PublicNavigationQuery }>(
    "/v1/public/navigation",
    {
      schema: {
        querystring: PublicNavigationQuerySchema,
        response: { 200: PublicNavigationSchema },
      },
    },
    async (request) => {
      if (options.resolveNavigation === undefined) {
        throw new Error("Public navigation is unavailable");
      }
      return options.resolveNavigation(request.query);
    },
  );

  app.post<{ Body: CreateTaxonomyNodeInput }>(
    "/v1/taxonomy/nodes",
    { schema: { body: CreateTaxonomyNodeInputSchema, response: { 201: TaxonomyNodeSchema } } },
    async (request, reply) => {
      const actor = await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply.code(201).send(await options.archive.createTaxonomyNode(request.body, actor));
    },
  );

  app.put<{ Params: { nodeId: string; contentId: string }; Body: PlaceContentInput }>(
    "/v1/taxonomy/nodes/:nodeId/contents/:contentId",
    {
      schema: {
        params: Type.Object({
          nodeId: Type.String({ format: "uuid" }),
          contentId: Type.String({ format: "uuid" }),
        }),
        body: PlaceContentInputSchema,
        response: { 200: TaxonomyPlacementSchema },
      },
    },
    async (request) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return options.archive.placeContent(
        request.params.contentId,
        request.params.nodeId,
        request.body,
      );
    },
  );

  app.post<{ Body: CreateTagInput }>(
    "/v1/tags",
    { schema: { body: CreateTagInputSchema, response: { 201: TagSchema } } },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply.code(201).send(await options.archive.createTag(request.body));
    },
  );

  app.put<{ Params: { contentId: string }; Body: AttachTagInput }>(
    "/v1/contents/:contentId/tags",
    {
      schema: {
        params: Type.Object({ contentId: Type.String({ format: "uuid" }) }),
        body: AttachTagInputSchema,
      },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      await options.archive.attachTag(request.params.contentId, request.body);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { contentId: string }; Body: CreateContentRelationInput }>(
    "/v1/contents/:contentId/relations",
    {
      schema: {
        params: Type.Object({ contentId: Type.String({ format: "uuid" }) }),
        body: CreateContentRelationInputSchema,
        response: { 201: ContentRelationSchema },
      },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply
        .code(201)
        .send(await options.archive.createRelation(request.params.contentId, request.body));
    },
  );

  app.post<{ Body: CreateResearchProgramInput }>(
    "/v1/research-programs",
    {
      schema: { body: CreateResearchProgramInputSchema, response: { 201: ResearchProgramSchema } },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply.code(201).send(await options.archive.createResearchProgram(request.body));
    },
  );

  app.post<{ Params: { researchProgramId: string }; Body: CreateHypothesisInput }>(
    "/v1/research-programs/:researchProgramId/hypotheses",
    {
      schema: {
        params: Type.Object({ researchProgramId: Type.String({ format: "uuid" }) }),
        body: CreateHypothesisInputSchema,
        response: { 201: HypothesisSchema },
      },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply
        .code(201)
        .send(
          await options.archive.createHypothesis(request.params.researchProgramId, request.body),
        );
    },
  );

  app.post<{ Body: CreateClaimInput }>(
    "/v1/claims",
    { schema: { body: CreateClaimInputSchema, response: { 201: ClaimSchema } } },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply.code(201).send(await options.archive.createClaim(request.body));
    },
  );

  app.post<{ Params: { claimId: string }; Body: CreateEvidenceInput }>(
    "/v1/claims/:claimId/evidence",
    {
      schema: {
        params: Type.Object({ claimId: Type.String({ format: "uuid" }) }),
        body: CreateEvidenceInputSchema,
        response: { 201: EvidenceSchema },
      },
    },
    async (request, reply) => {
      await options.authenticate(request);
      if (options.archive === undefined) throw new Error("Archive authoring is unavailable");
      return reply
        .code(201)
        .send(await options.archive.createEvidence(request.params.claimId, request.body));
    },
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthenticationError) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: error.message });
    }
    if (error instanceof AuthorizationError) {
      return reply.code(403).send({ error: "FORBIDDEN", message: error.message });
    }
    if (error instanceof PublicationInvariantError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof WorkflowInvariantError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof ArchiveInvariantError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    const invalidRequestMessage = validationMessage(error);
    if (invalidRequestMessage !== undefined) {
      return reply.code(400).send({ error: "INVALID_REQUEST", message: invalidRequestMessage });
    }
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    if (typeof status === "number" && [400, 408, 413, 415, 429].includes(status)) {
      return reply.code(status).send({
        error: status === 429 ? "RATE_LIMITED" : "INVALID_REQUEST",
        message:
          status === 429 ? "Too many requests; retry later" : "Request could not be accepted",
      });
    }
    // SQL-driver errors can include draft text/parameters. Keep only a vetted error code.
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code
        : undefined;
    request.log.error({ errorCode: code ?? "UNKNOWN" }, "request failed");
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Internal server error" });
  });
}
