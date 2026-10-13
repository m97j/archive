import { type Static, Type, type TLiteral, type TUnion } from "@sinclair/typebox";

type LiteralSchemas<T extends readonly string[]> = {
  -readonly [K in keyof T]: TLiteral<T[K]>;
};

const stringEnum = <const T extends readonly [string, ...string[]]>(
  values: T,
): TUnion<LiteralSchemas<T>> =>
  Type.Union(values.map((value) => Type.Literal(value))) as TUnion<LiteralSchemas<T>>;

export const LOCALES = ["en", "ko", "ja", "zh", "es", "fr", "de"] as const;
export const LocaleSchema = stringEnum(LOCALES);
export type Locale = (typeof LOCALES)[number];

export const CONTENT_KINDS = [
  "PAGE",
  "PROJECT",
  "RESEARCH_PROGRAM",
  "PUBLICATION",
  "DOC",
  "LOG_ENTRY",
  "EXPERIMENT",
] as const;
export const ContentKindSchema = stringEnum(CONTENT_KINDS);
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const SPACES = ["ABOUT", "WORK", "RESEARCH", "DOCS", "LOGS"] as const;
export const SpaceSchema = stringEnum(SPACES);
export type Space = (typeof SPACES)[number];

export const VISIBILITY_STATES = ["PRIVATE", "UNLISTED", "PUBLIC"] as const;
export const VisibilitySchema = stringEnum(VISIBILITY_STATES);
export type Visibility = (typeof VISIBILITY_STATES)[number];

export const REVISION_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "WITHDRAWN",
] as const;
export const RevisionStatusSchema = stringEnum(REVISION_STATES);
export type RevisionStatus = (typeof REVISION_STATES)[number];

export const TRANSLATION_STATES = ["MISSING", "DRAFT", "REVIEWED", "PUBLISHED", "STALE"] as const;
export const TranslationStatusSchema = stringEnum(TRANSLATION_STATES);
export type TranslationStatus = (typeof TRANSLATION_STATES)[number];

export const EPISTEMIC_STATUSES = [
  "REGULATIVE_IDEA",
  "SPECULATIVE",
  "HYPOTHESIS",
  "WORKING",
  "EXPERIMENTAL",
  "REPRODUCED",
  "SUPPORTED",
  "CHALLENGED",
  "REFUTED",
  "SUPERSEDED",
] as const;
export const EpistemicStatusSchema = stringEnum(EPISTEMIC_STATUSES);
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export const CONTENT_RELATION_TYPES = [
  "PART_OF",
  "CONTINUES",
  "SUPERSEDES",
  "TRANSLATES",
  "CITES",
  "SUPPORTS",
  "CHALLENGES",
  "IMPLEMENTS",
  "REPRODUCES",
  "USES_DATASET",
  "RELATED_TO",
] as const;
export const ContentRelationTypeSchema = stringEnum(CONTENT_RELATION_TYPES);
export type ContentRelationType = (typeof CONTENT_RELATION_TYPES)[number];

export const HeadingSchema = Type.Recursive(
  (This) =>
    Type.Object({
      id: Type.String({ minLength: 1 }),
      depth: Type.Integer({ minimum: 1, maximum: 6 }),
      text: Type.String(),
      children: Type.Array(This),
    }),
  { $id: "Heading" },
);
export interface Heading {
  id: string;
  depth: number;
  text: string;
  children: Heading[];
}

const HtmlBlockSchema = Type.Object({
  type: Type.Literal("html"),
  html: Type.String(),
});
const MermaidBlockSchema = Type.Object({
  type: Type.Literal("mermaid"),
  source: Type.String(),
});
const YouTubeBlockSchema = Type.Object({
  type: Type.Literal("youtube"),
  videoId: Type.String({ pattern: "^[A-Za-z0-9_-]{6,15}$" }),
  title: Type.Optional(Type.String()),
  startSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
});
const HuggingFaceDemoBlockSchema = Type.Object({
  type: Type.Literal("hf-demo"),
  space: Type.String({ pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" }),
  title: Type.Optional(Type.String()),
});
const CalloutBlockSchema = Type.Object({
  type: Type.Literal("callout"),
  tone: stringEnum(["note", "tip", "warning", "danger"]),
  title: Type.Optional(Type.String()),
  html: Type.String(),
});

export const RenderBlockSchema = Type.Union([
  HtmlBlockSchema,
  MermaidBlockSchema,
  YouTubeBlockSchema,
  HuggingFaceDemoBlockSchema,
  CalloutBlockSchema,
]);
export type RenderBlock = Static<typeof RenderBlockSchema>;

export const CompiledDocumentSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  locale: LocaleSchema,
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  sourceHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  html: Type.String(),
  blocks: Type.Array(RenderBlockSchema),
  toc: Type.Array(HeadingSchema),
  searchText: Type.String(),
  frontmatter: Type.Record(Type.String(), Type.Unknown()),
});
export type CompiledDocument = Static<typeof CompiledDocumentSchema>;

export const HypothesisSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  researchProgramId: Type.String({ format: "uuid" }),
  statement: Type.String({ minLength: 1 }),
  status: EpistemicStatusSchema,
  falsificationCriteria: Type.Array(Type.String()),
  supersedesId: Type.Optional(Type.String({ format: "uuid" })),
});
export type Hypothesis = Static<typeof HypothesisSchema>;

export const ClaimSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  revisionId: Type.String({ format: "uuid" }),
  statement: Type.String({ minLength: 1 }),
  status: EpistemicStatusSchema,
  locator: Type.Optional(Type.String()),
});
export type Claim = Static<typeof ClaimSchema>;

export const EvidenceSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  claimId: Type.String({ format: "uuid" }),
  contentId: Type.Optional(Type.String({ format: "uuid" })),
  citation: Type.Optional(Type.String()),
  sourceUri: Type.Optional(Type.String()),
  relation: stringEnum(["SUPPORTS", "CHALLENGES", "NEUTRAL"]),
  strength: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  notes: Type.Optional(Type.String()),
});
export type Evidence = Static<typeof EvidenceSchema>;

export const DOMAIN_EVENT_TYPES = [
  "CONTENT_CREATED",
  "REVISION_CREATED",
  "REVISION_PUBLISHED",
  "TRANSLATION_REQUESTED",
  "DOCUMENT_COMPILED",
  "TAXONOMY_CHANGED",
  "EXPERIMENT_RECORDED",
] as const;
export const DomainEventTypeSchema = stringEnum(DOMAIN_EVENT_TYPES);
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export const DomainEventSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  type: DomainEventTypeSchema,
  aggregateType: Type.String({ minLength: 1 }),
  aggregateId: Type.String({ format: "uuid" }),
  occurredAt: Type.String({ format: "date-time" }),
  actorId: Type.Optional(Type.String({ format: "uuid" })),
  correlationId: Type.Optional(Type.String({ format: "uuid" })),
  causationId: Type.Optional(Type.String({ format: "uuid" })),
  version: Type.Integer({ minimum: 1 }),
  payload: Type.Record(Type.String(), Type.Unknown()),
});
export type DomainEvent = Static<typeof DomainEventSchema>;

export const PublishRevisionInputSchema = Type.Object(
  {
    contentId: Type.String({ format: "uuid" }),
    localizedRevisionId: Type.String({ format: "uuid" }),
    artifactId: Type.String({ format: "uuid" }),
    locale: LocaleSchema,
    path: Type.String({
      minLength: 1,
      maxLength: 512,
      pattern: "^/[^\\u0000-\\u001F\\u007F?#]*$",
    }),
  },
  { additionalProperties: false },
);
export type PublishRevisionInput = Static<typeof PublishRevisionInputSchema>;

export const PublishedRevisionSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  localizedRevisionId: Type.String({ format: "uuid" }),
  artifactId: Type.String({ format: "uuid" }),
  locale: LocaleSchema,
  path: Type.String(),
  revisionNumber: Type.Integer({ minimum: 1 }),
  publishedAt: Type.String({ format: "date-time" }),
  eventId: Type.String({ format: "uuid" }),
});
export type PublishedRevision = Static<typeof PublishedRevisionSchema>;

export const RevisionPublishedPayloadSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  localizedRevisionId: Type.String({ format: "uuid" }),
  artifactId: Type.String({ format: "uuid" }),
  locale: LocaleSchema,
  path: Type.String(),
  previousPath: Type.Optional(Type.String()),
  revisionNumber: Type.Integer({ minimum: 1 }),
  publishedAt: Type.String({ format: "date-time" }),
});
export type RevisionPublishedPayload = Static<typeof RevisionPublishedPayloadSchema>;

export const CreateContentInputSchema = Type.Object(
  {
    kind: ContentKindSchema,
    canonicalKey: Type.String({ minLength: 1, maxLength: 160, pattern: "^[a-z0-9][a-z0-9._/-]*$" }),
    visibility: Type.Optional(VisibilitySchema),
  },
  { additionalProperties: false },
);
export type CreateContentInput = Static<typeof CreateContentInputSchema>;

export const ContentIdentitySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  kind: ContentKindSchema,
  canonicalKey: Type.String(),
  visibility: VisibilitySchema,
  createdAt: Type.String({ format: "date-time" }),
});
export type ContentIdentity = Static<typeof ContentIdentitySchema>;

export const UpdateContentAccessInputSchema = Type.Object(
  {
    visibility: Type.Optional(VisibilitySchema),
    archived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateContentAccessInput = Static<typeof UpdateContentAccessInputSchema>;

export const ContentAccessSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  visibility: VisibilitySchema,
  archived: Type.Boolean(),
  updatedAt: Type.String({ format: "date-time" }),
});
export type ContentAccess = Static<typeof ContentAccessSchema>;

export const AdminDraftSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  revisionId: Type.String({ format: "uuid" }),
  locale: LocaleSchema,
  title: Type.String(),
  slug: Type.String(),
  sourceMarkdown: Type.String(),
  description: Type.Optional(Type.String()),
});
export type AdminDraft = Static<typeof AdminDraftSchema>;

export const LocalizedDraftInputSchema = Type.Object(
  {
    locale: LocaleSchema,
    sourceLocale: Type.Optional(LocaleSchema),
    sourceLocalizedRevisionId: Type.Optional(Type.String({ format: "uuid" })),
    title: Type.String({ minLength: 1, maxLength: 500 }),
    description: Type.Optional(Type.String({ maxLength: 2_000 })),
    slug: Type.String({ minLength: 1, maxLength: 240 }),
    sourceMarkdown: Type.String({ minLength: 1, maxLength: 2_000_000 }),
    frontmatter: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type LocalizedDraftInput = Static<typeof LocalizedDraftInputSchema>;

export const CreateRevisionInputSchema = Type.Object(
  {
    sourceRevisionId: Type.Optional(Type.String({ format: "uuid" })),
    changeSummary: Type.Optional(Type.String({ maxLength: 2_000 })),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    translations: Type.Array(LocalizedDraftInputSchema, { minItems: 1, maxItems: 7 }),
  },
  { additionalProperties: false },
);
export type CreateRevisionInput = Static<typeof CreateRevisionInputSchema>;

export const CreatedRevisionSchema = Type.Object({
  revisionId: Type.String({ format: "uuid" }),
  revisionNumber: Type.Integer({ minimum: 1 }),
  localizedRevisions: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      locale: LocaleSchema,
      compileJobId: Type.String({ format: "uuid" }),
      sourceHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    }),
  ),
  createdAt: Type.String({ format: "date-time" }),
});
export type CreatedRevision = Static<typeof CreatedRevisionSchema>;

export const RevisionReviewInputSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("IN_REVIEW"),
      Type.Literal("APPROVED"),
      Type.Literal("WITHDRAWN"),
    ]),
    note: Type.Optional(Type.String({ maxLength: 4_000 })),
  },
  { additionalProperties: false },
);
export type RevisionReviewInput = Static<typeof RevisionReviewInputSchema>;

export const TranslationReviewInputSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("DRAFT"), Type.Literal("REVIEWED"), Type.Literal("STALE")]),
    note: Type.Optional(Type.String({ maxLength: 4_000 })),
  },
  { additionalProperties: false },
);
export type TranslationReviewInput = Static<typeof TranslationReviewInputSchema>;

export const WorkflowTransitionSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  previousStatus: Type.String(),
  status: Type.String(),
  changedAt: Type.String({ format: "date-time" }),
});
export type WorkflowTransition = Static<typeof WorkflowTransitionSchema>;

export const PublicDocumentSchema = Type.Object({
  type: Type.Literal("document"),
  contentId: Type.String({ format: "uuid" }),
  kind: ContentKindSchema,
  locale: LocaleSchema,
  path: Type.String(),
  title: Type.String(),
  description: Type.Optional(Type.String()),
  revisionNumber: Type.Integer({ minimum: 1 }),
  publishedAt: Type.String({ format: "date-time" }),
  artifact: CompiledDocumentSchema,
});
export type PublicDocument = Static<typeof PublicDocumentSchema>;

export const PublicRedirectSchema = Type.Object({
  type: Type.Literal("redirect"),
  locale: LocaleSchema,
  fromPath: Type.String(),
  toPath: Type.String(),
  status: Type.Integer(),
});
export type PublicRedirect = Static<typeof PublicRedirectSchema>;

export const PublicResolutionSchema = Type.Union([PublicDocumentSchema, PublicRedirectSchema]);
export type PublicResolution = Static<typeof PublicResolutionSchema>;

export const LocalizedLabelInputSchema = Type.Object(
  {
    locale: LocaleSchema,
    label: Type.String({ minLength: 1, maxLength: 240 }),
    slug: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    description: Type.Optional(Type.String({ maxLength: 2_000 })),
  },
  { additionalProperties: false },
);
export type LocalizedLabelInput = Static<typeof LocalizedLabelInputSchema>;

export const CreateTaxonomyNodeInputSchema = Type.Object(
  {
    stableKey: Type.String({ minLength: 1, maxLength: 160, pattern: "^[a-z0-9][a-z0-9._/-]*$" }),
    space: SpaceSchema,
    parentId: Type.Optional(Type.String({ format: "uuid" })),
    labels: Type.Array(LocalizedLabelInputSchema, { minItems: 1, maxItems: 7 }),
  },
  { additionalProperties: false },
);
export type CreateTaxonomyNodeInput = Static<typeof CreateTaxonomyNodeInputSchema>;

export const TaxonomyNodeSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  stableKey: Type.String(),
  space: SpaceSchema,
  parentId: Type.Optional(Type.String({ format: "uuid" })),
  labels: Type.Array(LocalizedLabelInputSchema),
  createdAt: Type.String({ format: "date-time" }),
});
export type TaxonomyNode = Static<typeof TaxonomyNodeSchema>;

export const PlaceContentInputSchema = Type.Object(
  {
    isPrimary: Type.Optional(Type.Boolean()),
    sortOrder: Type.Optional(Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);
export type PlaceContentInput = Static<typeof PlaceContentInputSchema>;

export const TaxonomyPlacementSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  nodeId: Type.String({ format: "uuid" }),
  isPrimary: Type.Boolean(),
  sortOrder: Type.Integer(),
});
export type TaxonomyPlacement = Static<typeof TaxonomyPlacementSchema>;

export const CreateTagInputSchema = Type.Object(
  {
    stableKey: Type.String({ minLength: 1, maxLength: 100, pattern: "^[a-z0-9][a-z0-9._/-]*$" }),
    labels: Type.Array(
      Type.Object(
        { locale: LocaleSchema, label: Type.String({ minLength: 1, maxLength: 240 }) },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 7 },
    ),
  },
  { additionalProperties: false },
);
export type CreateTagInput = Static<typeof CreateTagInputSchema>;

export const TagSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  stableKey: Type.String(),
  labels: Type.Array(Type.Object({ locale: LocaleSchema, label: Type.String() })),
  createdAt: Type.String({ format: "date-time" }),
});
export type Tag = Static<typeof TagSchema>;

export const AttachTagInputSchema = Type.Object(
  { tagId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
export type AttachTagInput = Static<typeof AttachTagInputSchema>;

export const CreateContentRelationInputSchema = Type.Object(
  {
    toContentId: Type.String({ format: "uuid" }),
    type: ContentRelationTypeSchema,
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type CreateContentRelationInput = Static<typeof CreateContentRelationInputSchema>;

export const ContentRelationSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  fromContentId: Type.String({ format: "uuid" }),
  toContentId: Type.String({ format: "uuid" }),
  type: ContentRelationTypeSchema,
  metadata: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String({ format: "date-time" }),
});
export type ContentRelation = Static<typeof ContentRelationSchema>;

export const CreateResearchProgramInputSchema = Type.Object(
  {
    contentId: Type.String({ format: "uuid" }),
    objective: Type.String({ minLength: 1, maxLength: 20_000 }),
    scope: Type.Optional(Type.String({ maxLength: 20_000 })),
    methodology: Type.Optional(Type.String({ maxLength: 20_000 })),
    startedAt: Type.Optional(Type.String({ format: "date-time" })),
    endedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export type CreateResearchProgramInput = Static<typeof CreateResearchProgramInputSchema>;

export const ResearchProgramSchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  objective: Type.String(),
  scope: Type.Optional(Type.String()),
  methodology: Type.Optional(Type.String()),
  startedAt: Type.Optional(Type.String({ format: "date-time" })),
  endedAt: Type.Optional(Type.String({ format: "date-time" })),
});
export type ResearchProgram = Static<typeof ResearchProgramSchema>;

export const CreateHypothesisInputSchema = Type.Object(
  {
    stableKey: Type.String({ minLength: 1, maxLength: 160, pattern: "^[a-z0-9][a-z0-9._/-]*$" }),
    statement: Type.String({ minLength: 1, maxLength: 20_000 }),
    status: Type.Optional(EpistemicStatusSchema),
    falsificationCriteria: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 4_000 }), { maxItems: 100 }),
    ),
    supersedesId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { additionalProperties: false },
);
export type CreateHypothesisInput = Static<typeof CreateHypothesisInputSchema>;

export const CreateClaimInputSchema = Type.Object(
  {
    localizedRevisionId: Type.String({ format: "uuid" }),
    stableKey: Type.String({ minLength: 1, maxLength: 160, pattern: "^[a-z0-9][a-z0-9._/-]*$" }),
    statement: Type.String({ minLength: 1, maxLength: 20_000 }),
    status: Type.Optional(EpistemicStatusSchema),
    locator: Type.Optional(Type.String({ maxLength: 240 })),
  },
  { additionalProperties: false },
);
export type CreateClaimInput = Static<typeof CreateClaimInputSchema>;

export const CreateEvidenceInputSchema = Type.Object(
  {
    contentId: Type.Optional(Type.String({ format: "uuid" })),
    relation: stringEnum(["SUPPORTS", "CHALLENGES", "NEUTRAL"]),
    citation: Type.Optional(Type.String({ maxLength: 20_000 })),
    sourceUri: Type.Optional(Type.String({ maxLength: 4_000 })),
    strength: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    notes: Type.Optional(Type.String({ maxLength: 20_000 })),
  },
  { additionalProperties: false },
);
export type CreateEvidenceInput = Static<typeof CreateEvidenceInputSchema>;

export const PublicContentSummarySchema = Type.Object({
  contentId: Type.String({ format: "uuid" }),
  kind: ContentKindSchema,
  locale: LocaleSchema,
  path: Type.String(),
  title: Type.String(),
  description: Type.Optional(Type.String()),
  publishedAt: Type.String({ format: "date-time" }),
  tags: Type.Array(Type.String()),
});
export type PublicContentSummary = Static<typeof PublicContentSummarySchema>;

export const PublicContentPageSchema = Type.Object({
  items: Type.Array(PublicContentSummarySchema),
  nextCursor: Type.Optional(Type.String()),
});
export type PublicContentPage = Static<typeof PublicContentPageSchema>;

export const PublicContentQuerySchema = Type.Object(
  {
    locale: LocaleSchema,
    kind: Type.Optional(ContentKindSchema),
    space: Type.Optional(SpaceSchema),
    tag: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    taxonomy: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    q: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  },
  { additionalProperties: false },
);
export type PublicContentQuery = Static<typeof PublicContentQuerySchema>;

export const PublicNavigationQuerySchema = Type.Object(
  { locale: LocaleSchema, space: SpaceSchema },
  { additionalProperties: false },
);
export type PublicNavigationQuery = Static<typeof PublicNavigationQuerySchema>;

export const PublicNavigationNodeSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  stableKey: Type.String(),
  label: Type.String(),
  slug: Type.String(),
  description: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String({ format: "uuid" })),
});
export type PublicNavigationNode = Static<typeof PublicNavigationNodeSchema>;

export const PublicNavigationSchema = Type.Object({
  locale: LocaleSchema,
  space: SpaceSchema,
  label: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  nodes: Type.Array(PublicNavigationNodeSchema),
});
export type PublicNavigation = Static<typeof PublicNavigationSchema>;

export const AdminArtifactSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  compilerVersion: Type.String(),
  compiledAt: Type.String({ format: "date-time" }),
});
export type AdminArtifactSummary = Static<typeof AdminArtifactSummarySchema>;

export const AdminTranslationSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  locale: LocaleSchema,
  title: Type.String(),
  slug: Type.String(),
  translationStatus: TranslationStatusSchema,
  artifact: Type.Optional(AdminArtifactSummarySchema),
});
export type AdminTranslationSummary = Static<typeof AdminTranslationSummarySchema>;

export const AdminRevisionSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  revisionNumber: Type.Integer({ minimum: 1 }),
  status: RevisionStatusSchema,
  createdAt: Type.String({ format: "date-time" }),
  translations: Type.Array(AdminTranslationSummarySchema),
});
export type AdminRevisionSummary = Static<typeof AdminRevisionSummarySchema>;

export const AdminContentSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  kind: ContentKindSchema,
  canonicalKey: Type.String(),
  visibility: VisibilitySchema,
  updatedAt: Type.String({ format: "date-time" }),
  archivedAt: Type.Optional(Type.String({ format: "date-time" })),
  latestRevision: Type.Optional(AdminRevisionSummarySchema),
});
export type AdminContentSummary = Static<typeof AdminContentSummarySchema>;

export const AdminContentPageSchema = Type.Object({
  items: Type.Array(AdminContentSummarySchema),
});
export type AdminContentPage = Static<typeof AdminContentPageSchema>;

export const AdminContentQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type AdminContentQuery = Static<typeof AdminContentQuerySchema>;

export const MediaContentTypeSchema = Type.Union([
  Type.Literal("image/avif"),
  Type.Literal("image/gif"),
  Type.Literal("image/jpeg"),
  Type.Literal("image/png"),
  Type.Literal("image/webp"),
]);
export type MediaContentType = Static<typeof MediaContentTypeSchema>;

export const CreateMediaUploadInputSchema = Type.Object(
  {
    filename: Type.String({ minLength: 1, maxLength: 180 }),
    contentType: MediaContentTypeSchema,
    sizeBytes: Type.Integer({ minimum: 1, maximum: 10 * 1024 * 1024 }),
  },
  { additionalProperties: false },
);
export type CreateMediaUploadInput = Static<typeof CreateMediaUploadInputSchema>;

export const MediaUploadTicketSchema = Type.Object({
  method: Type.Literal("PUT"),
  key: Type.String(),
  uploadUrl: Type.String({ format: "uri" }),
  publicUrl: Type.String({ format: "uri" }),
  expiresInSeconds: Type.Integer({ minimum: 1 }),
  headers: Type.Record(Type.String(), Type.String()),
});
export type MediaUploadTicket = Static<typeof MediaUploadTicketSchema>;

export const QueueEmbeddingInputSchema = Type.Object(
  { contentId: Type.String({ format: "uuid" }), locale: Type.Optional(LocaleSchema) },
  { additionalProperties: false },
);
export type QueueEmbeddingInput = Static<typeof QueueEmbeddingInputSchema>;
export const QueueTranslationInputSchema = Type.Object(
  {
    contentId: Type.String({ format: "uuid" }),
    sourceLocale: LocaleSchema,
    targetLocale: LocaleSchema,
  },
  { additionalProperties: false },
);
export type QueueTranslationInput = Static<typeof QueueTranslationInputSchema>;
export const AdminJobSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  type: Type.String(),
  status: stringEnum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
  attempts: Type.Integer(),
  maxAttempts: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  result: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  errorCode: Type.Optional(Type.String()),
});
export type AdminJob = Static<typeof AdminJobSchema>;
export const AdminJobPageSchema = Type.Object({ items: Type.Array(AdminJobSchema) });
export const HybridSearchInputSchema = Type.Object(
  {
    locale: LocaleSchema,
    q: Type.String({ minLength: 1, maxLength: 200 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);
export type HybridSearchInput = Static<typeof HybridSearchInputSchema>;
export const HybridSearchResultSchema = Type.Object({
  items: Type.Array(PublicContentSummarySchema),
  mode: stringEnum(["hybrid", "lexical"]),
  providerAvailable: Type.Boolean(),
});
export type HybridSearchResult = Static<typeof HybridSearchResultSchema>;

/** Reserved endpoints are never valid content publication paths, including encoded aliases. */
export function isReservedPublicationPath(path: string): boolean {
  let decoded: string;
  try {
    decoded = path;
    for (let attempt = 0; attempt < 4; attempt++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded)) return true;
    decoded = decoded.normalize("NFKC").toLowerCase();
  } catch {
    return true;
  }
  const segments = decoded.split("/").filter(Boolean);
  const first = segments[0];
  const route = LOCALES.includes(first as Locale) ? segments[1] : first;
  return (
    ["admin", "login", "signin", "sign-in", "new", "cms", "auth", "api", "_next"].includes(
      route ?? "",
    ) ||
    decoded.includes("\\") ||
    /[?#]/.test(decoded) ||
    [...decoded].some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    }) ||
    segments.some((segment) => segment === "." || segment === "..")
  );
}
