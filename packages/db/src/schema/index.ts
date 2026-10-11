import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const localeEnum = pgEnum("locale", ["en", "ko", "ja", "zh", "es", "fr", "de"]);
export const contentKindEnum = pgEnum("content_kind", [
  "PAGE",
  "PROJECT",
  "RESEARCH_PROGRAM",
  "PUBLICATION",
  "DOC",
  "LOG_ENTRY",
  "EXPERIMENT",
]);
export const spaceEnum = pgEnum("navigation_space", ["ABOUT", "WORK", "RESEARCH", "DOCS", "LOGS"]);
export const visibilityEnum = pgEnum("visibility", ["PRIVATE", "UNLISTED", "PUBLIC"]);
export const revisionStatusEnum = pgEnum("revision_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "WITHDRAWN",
]);
export const translationStatusEnum = pgEnum("translation_status", [
  "MISSING",
  "DRAFT",
  "REVIEWED",
  "PUBLISHED",
  "STALE",
]);
export const epistemicStatusEnum = pgEnum("epistemic_status", [
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
]);
export const relationTypeEnum = pgEnum("content_relation_type", [
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
]);
export const evidenceRelationEnum = pgEnum("evidence_relation", [
  "SUPPORTS",
  "CHALLENGES",
  "NEUTRAL",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export const outboxStatusEnum = pgEnum("outbox_status", [
  "PENDING",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
]);

export const contents = pgTable(
  "contents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: contentKindEnum("kind").notNull(),
    canonicalKey: varchar("canonical_key", { length: 160 }).notNull(),
    visibility: visibilityEnum("visibility").notNull().default("PRIVATE"),
    ownerId: uuid("owner_id"),
    ...auditColumns,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("contents_canonical_key_uidx").on(table.canonicalKey)],
).enableRLS();

// A revision is append-only. Publishing is represented by publication_pointers, not by mutating history.
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "restrict" }),
    revisionNumber: integer("revision_number").notNull(),
    status: revisionStatusEnum("status").notNull().default("DRAFT"),
    sourceRevisionId: uuid("source_revision_id"),
    authoredBy: uuid("authored_by"),
    changeSummary: text("change_summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_revisions_content_number_uidx").on(table.contentId, table.revisionNumber),
    index("content_revisions_content_created_idx").on(table.contentId, table.createdAt),
    check("content_revisions_number_positive", sql`${table.revisionNumber} > 0`),
    foreignKey({
      columns: [table.sourceRevisionId],
      foreignColumns: [table.id],
      name: "content_revisions_source_revision_fk",
    }).onDelete("restrict"),
  ],
).enableRLS();

export const localizedRevisions = pgTable(
  "localized_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "restrict" }),
    locale: localeEnum("locale").notNull(),
    translationStatus: translationStatusEnum("translation_status").notNull().default("DRAFT"),
    sourceLocale: localeEnum("source_locale"),
    sourceLocalizedRevisionId: uuid("source_localized_revision_id"),
    title: text("title").notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 240 }).notNull(),
    sourceMarkdown: text("source_markdown").notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("localized_revisions_revision_locale_uidx").on(table.revisionId, table.locale),
    index("localized_revisions_slug_locale_idx").on(table.locale, table.slug),
    check("localized_revisions_source_hash_format", sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`),
    foreignKey({
      columns: [table.sourceLocalizedRevisionId],
      foreignColumns: [table.id],
      name: "localized_revisions_source_translation_fk",
    }).onDelete("restrict"),
  ],
).enableRLS();

export const revisionStatusEvents = pgTable(
  "revision_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => contentRevisions.id, { onDelete: "restrict" }),
    fromStatus: revisionStatusEnum("from_status"),
    toStatus: revisionStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("revision_status_events_revision_idx").on(table.revisionId, table.createdAt)],
).enableRLS();

export const translationStatusEvents = pgTable(
  "translation_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localizedRevisionId: uuid("localized_revision_id")
      .notNull()
      .references(() => localizedRevisions.id, { onDelete: "restrict" }),
    fromStatus: translationStatusEnum("from_status"),
    toStatus: translationStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("translation_status_events_revision_idx").on(table.localizedRevisionId, table.createdAt),
  ],
).enableRLS();

export const renderArtifacts = pgTable(
  "render_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localizedRevisionId: uuid("localized_revision_id")
      .notNull()
      .references(() => localizedRevisions.id, { onDelete: "restrict" }),
    compilerVersion: varchar("compiler_version", { length: 80 }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    html: text("html").notNull(),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    toc: jsonb("toc").$type<unknown[]>().notNull().default([]),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().notNull().default({}),
    searchText: text("search_text").notNull(),
    compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("render_artifacts_input_uidx").on(
      table.localizedRevisionId,
      table.compilerVersion,
      table.sourceHash,
    ),
    index("render_artifacts_search_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.searchText})`,
    ),
  ],
).enableRLS();

export const publicationPointers = pgTable(
  "publication_pointers",
  {
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    localizedRevisionId: uuid("localized_revision_id")
      .notNull()
      .references(() => localizedRevisions.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => renderArtifacts.id, { onDelete: "restrict" }),
    path: varchar("path", { length: 512 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid("published_by"),
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.locale] }),
    uniqueIndex("publication_pointers_locale_path_uidx").on(table.locale, table.path),
  ],
).enableRLS();

export const redirectHistory = pgTable(
  "redirect_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locale: localeEnum("locale").notNull(),
    fromPath: varchar("from_path", { length: 512 }).notNull(),
    toContentId: uuid("to_content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    toPath: varchar("to_path", { length: 512 }).notNull(),
    httpStatus: integer("http_status").notNull().default(308),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("redirect_history_locale_from_uidx").on(table.locale, table.fromPath),
    check("redirect_history_http_status_allowed", sql`${table.httpStatus} in (301, 302, 307, 308)`),
  ],
).enableRLS();

export const navigationSpaces = pgTable(
  "navigation_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    space: spaceEnum("space").notNull(),
    locale: localeEnum("locale").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns,
  },
  (table) => [uniqueIndex("navigation_spaces_space_locale_uidx").on(table.space, table.locale)],
).enableRLS();

export const taxonomyNodes = pgTable(
  "taxonomy_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stableKey: varchar("stable_key", { length: 160 }).notNull(),
    space: spaceEnum("space").notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex("taxonomy_nodes_stable_key_uidx").on(table.stableKey)],
).enableRLS();

export const taxonomyNodeLabels = pgTable(
  "taxonomy_node_labels",
  {
    nodeId: uuid("node_id")
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    label: text("label").notNull(),
    slug: varchar("slug", { length: 240 }).notNull(),
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.nodeId, table.locale] }),
    uniqueIndex("taxonomy_node_labels_locale_slug_uidx").on(table.locale, table.slug),
  ],
).enableRLS();

export const taxonomyClosure = pgTable(
  "taxonomy_closure",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ancestorId, table.descendantId] }),
    index("taxonomy_closure_descendant_idx").on(table.descendantId, table.depth),
    check("taxonomy_closure_depth_nonnegative", sql`${table.depth} >= 0`),
  ],
).enableRLS();

export const taxonomyPlacements = pgTable(
  "taxonomy_placements",
  {
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.contentId, table.nodeId] })],
).enableRLS();

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stableKey: varchar("stable_key", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tags_stable_key_uidx").on(table.stableKey)],
).enableRLS();

export const tagLabels = pgTable(
  "tag_labels",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    locale: localeEnum("locale").notNull(),
    label: text("label").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tagId, table.locale] })],
).enableRLS();

export const contentTags = pgTable(
  "content_tags",
  {
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.contentId, table.tagId] })],
).enableRLS();

export const contentRelations = pgTable(
  "content_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromContentId: uuid("from_content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    toContentId: uuid("to_content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    type: relationTypeEnum("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_relations_edge_uidx").on(
      table.fromContentId,
      table.toContentId,
      table.type,
    ),
    check("content_relations_not_self", sql`${table.fromContentId} <> ${table.toContentId}`),
  ],
).enableRLS();

export const researchPrograms = pgTable("research_programs", {
  contentId: uuid("content_id")
    .primaryKey()
    .references(() => contents.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),
  scope: text("scope"),
  methodology: text("methodology"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  ...auditColumns,
}).enableRLS();

export const hypotheses = pgTable(
  "hypotheses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchProgramId: uuid("research_program_id")
      .notNull()
      .references(() => researchPrograms.contentId, { onDelete: "cascade" }),
    stableKey: varchar("stable_key", { length: 160 }).notNull(),
    statement: text("statement").notNull(),
    status: epistemicStatusEnum("status").notNull().default("HYPOTHESIS"),
    falsificationCriteria: jsonb("falsification_criteria").$type<string[]>().notNull().default([]),
    supersedesId: uuid("supersedes_id"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("hypotheses_program_key_uidx").on(table.researchProgramId, table.stableKey),
    foreignKey({
      columns: [table.supersedesId],
      foreignColumns: [table.id],
      name: "hypotheses_supersedes_fk",
    }).onDelete("restrict"),
  ],
).enableRLS();

export const experimentProfiles = pgTable("experiment_profiles", {
  contentId: uuid("content_id")
    .primaryKey()
    .references(() => contents.id, { onDelete: "cascade" }),
  hypothesisId: uuid("hypothesis_id").references(() => hypotheses.id, { onDelete: "set null" }),
  protocol: text("protocol").notNull(),
  environment: jsonb("environment").$type<Record<string, unknown>>().notNull().default({}),
  parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
  resultSummary: text("result_summary"),
  reproducibilityNotes: text("reproducibility_notes"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...auditColumns,
}).enableRLS();

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localizedRevisionId: uuid("localized_revision_id")
      .notNull()
      .references(() => localizedRevisions.id, { onDelete: "cascade" }),
    stableKey: varchar("stable_key", { length: 160 }).notNull(),
    statement: text("statement").notNull(),
    status: epistemicStatusEnum("status").notNull().default("WORKING"),
    locator: varchar("locator", { length: 240 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("claims_revision_key_uidx").on(table.localizedRevisionId, table.stableKey),
  ],
).enableRLS();

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "set null" }),
    relation: evidenceRelationEnum("relation").notNull(),
    citation: text("citation"),
    sourceUri: text("source_uri"),
    strength: numeric("strength", { precision: 4, scale: 3 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "evidence_strength_range",
      sql`${table.strength} is null or (${table.strength} >= 0 and ${table.strength} <= 1)`,
    ),
  ],
).enableRLS();

export const definitionLedger = pgTable(
  "definition_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchProgramId: uuid("research_program_id")
      .notNull()
      .references(() => researchPrograms.contentId, { onDelete: "cascade" }),
    term: varchar("term", { length: 240 }).notNull(),
    locale: localeEnum("locale").notNull(),
    definition: text("definition").notNull(),
    validFromRevisionId: uuid("valid_from_revision_id").references(() => contentRevisions.id, {
      onDelete: "restrict",
    }),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("definition_ledger_program_term_idx").on(table.researchProgramId, table.term),
    foreignKey({
      columns: [table.supersedesId],
      foreignColumns: [table.id],
      name: "definition_ledger_supersedes_fk",
    }).onDelete("restrict"),
  ],
).enableRLS();

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id").references(() => contents.id, { onDelete: "set null" }),
    storageProvider: varchar("storage_provider", { length: 40 }).notNull(),
    storageKey: text("storage_key").notNull(),
    mediaType: varchar("media_type", { length: 160 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    altText: jsonb("alt_text").$type<Partial<Record<string, string>>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assets_provider_key_uidx").on(table.storageProvider, table.storageKey),
    check("assets_byte_size_nonnegative", sql`${table.byteSize} >= 0`),
  ],
).enableRLS();

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 100 }).notNull(),
    status: jobStatusEnum("status").notNull().default("PENDING"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 160 }),
    lastError: text("last_error"),
    ...auditColumns,
  },
  (table) => [
    index("jobs_claim_idx").on(table.status, table.availableAt),
    check("jobs_attempts_valid", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
  ],
).enableRLS();

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").notNull().default("PENDING"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 160 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("outbox_events_aggregate_version_uidx").on(
      table.aggregateType,
      table.aggregateId,
      table.aggregateVersion,
    ),
    index("outbox_events_dispatch_idx").on(table.status, table.availableAt),
    check("outbox_events_attempts_valid", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
  ],
).enableRLS();
