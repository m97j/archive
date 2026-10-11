import type {
  Claim,
  ContentRelation,
  CreateClaimInput,
  CreateContentRelationInput,
  CreateEvidenceInput,
  CreateHypothesisInput,
  CreateResearchProgramInput,
  CreateTagInput,
  Evidence,
  Hypothesis,
  ResearchProgram,
  Tag,
} from "@archive/contracts";
import { eq } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  claims,
  contentRelations,
  contents,
  contentTags,
  evidence,
  hypotheses,
  localizedRevisions,
  researchPrograms,
  tagLabels,
  tags,
} from "./schema/index.js";
import { ArchiveInvariantError } from "./taxonomy.js";

const optionalDate = (value: Date | null): string | undefined =>
  value === null ? undefined : value.toISOString();

export async function createTag(db: ArchiveDatabase, input: CreateTagInput): Promise<Tag> {
  if (new Set(input.labels.map((item) => item.locale)).size !== input.labels.length) {
    throw new ArchiveInvariantError("DUPLICATE_LOCALE", "A tag can label each locale once");
  }
  return db.transaction(async (tx) => {
    const [tag] = await tx.insert(tags).values({ stableKey: input.stableKey }).returning();
    if (tag === undefined) throw new Error("Unable to create tag");
    await tx.insert(tagLabels).values(input.labels.map((label) => ({ tagId: tag.id, ...label })));
    return {
      id: tag.id,
      stableKey: tag.stableKey,
      labels: input.labels,
      createdAt: tag.createdAt.toISOString(),
    };
  });
}

export async function attachTag(
  db: ArchiveDatabase,
  contentId: string,
  tagId: string,
): Promise<void> {
  await db.insert(contentTags).values({ contentId, tagId }).onConflictDoNothing();
}

export async function createContentRelation(
  db: ArchiveDatabase,
  fromContentId: string,
  input: CreateContentRelationInput,
): Promise<ContentRelation> {
  if (fromContentId === input.toContentId) {
    throw new ArchiveInvariantError("SELF_RELATION", "Content cannot relate to itself");
  }
  const [created] = await db
    .insert(contentRelations)
    .values({
      fromContentId,
      toContentId: input.toContentId,
      type: input.type,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create relation");
  return { ...created, createdAt: created.createdAt.toISOString() };
}

export async function createResearchProgram(
  db: ArchiveDatabase,
  input: CreateResearchProgramInput,
): Promise<ResearchProgram> {
  const [content] = await db
    .select({ kind: contents.kind })
    .from(contents)
    .where(eq(contents.id, input.contentId))
    .limit(1);
  if (content?.kind !== "RESEARCH_PROGRAM") {
    throw new ArchiveInvariantError(
      "INVALID_RESEARCH_CONTENT",
      "Research profiles require RESEARCH_PROGRAM content",
    );
  }
  const [created] = await db
    .insert(researchPrograms)
    .values({
      contentId: input.contentId,
      objective: input.objective,
      ...(input.scope === undefined ? {} : { scope: input.scope }),
      ...(input.methodology === undefined ? {} : { methodology: input.methodology }),
      ...(input.startedAt === undefined ? {} : { startedAt: new Date(input.startedAt) }),
      ...(input.endedAt === undefined ? {} : { endedAt: new Date(input.endedAt) }),
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create research program");
  const startedAt = optionalDate(created.startedAt);
  const endedAt = optionalDate(created.endedAt);
  return {
    contentId: created.contentId,
    objective: created.objective,
    ...(created.scope === null ? {} : { scope: created.scope }),
    ...(created.methodology === null ? {} : { methodology: created.methodology }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
  };
}

export async function createHypothesis(
  db: ArchiveDatabase,
  researchProgramId: string,
  input: CreateHypothesisInput,
): Promise<Hypothesis> {
  const [created] = await db
    .insert(hypotheses)
    .values({
      researchProgramId,
      stableKey: input.stableKey,
      statement: input.statement,
      status: input.status ?? "HYPOTHESIS",
      falsificationCriteria: input.falsificationCriteria ?? [],
      ...(input.supersedesId === undefined ? {} : { supersedesId: input.supersedesId }),
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create hypothesis");
  return {
    id: created.id,
    researchProgramId: created.researchProgramId,
    statement: created.statement,
    status: created.status,
    falsificationCriteria: created.falsificationCriteria,
    ...(created.supersedesId === null ? {} : { supersedesId: created.supersedesId }),
  };
}

export async function createClaim(db: ArchiveDatabase, input: CreateClaimInput): Promise<Claim> {
  const [revision] = await db
    .select({ revisionId: localizedRevisions.revisionId })
    .from(localizedRevisions)
    .where(eq(localizedRevisions.id, input.localizedRevisionId))
    .limit(1);
  if (revision === undefined)
    throw new ArchiveInvariantError("REVISION_NOT_FOUND", "Localized revision not found");
  const [created] = await db
    .insert(claims)
    .values({
      localizedRevisionId: input.localizedRevisionId,
      stableKey: input.stableKey,
      statement: input.statement,
      status: input.status ?? "WORKING",
      ...(input.locator === undefined ? {} : { locator: input.locator }),
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create claim");
  return {
    id: created.id,
    revisionId: revision.revisionId,
    statement: created.statement,
    status: created.status,
    ...(created.locator === null ? {} : { locator: created.locator }),
  };
}

export async function createEvidence(
  db: ArchiveDatabase,
  claimId: string,
  input: CreateEvidenceInput,
): Promise<Evidence> {
  if (
    input.contentId === undefined &&
    input.citation === undefined &&
    input.sourceUri === undefined
  ) {
    throw new ArchiveInvariantError(
      "EVIDENCE_SOURCE_REQUIRED",
      "Evidence requires content, a citation, or a source URI",
    );
  }
  const [created] = await db
    .insert(evidence)
    .values({
      claimId,
      relation: input.relation,
      ...(input.contentId === undefined ? {} : { contentId: input.contentId }),
      ...(input.citation === undefined ? {} : { citation: input.citation }),
      ...(input.sourceUri === undefined ? {} : { sourceUri: input.sourceUri }),
      ...(input.strength === undefined ? {} : { strength: input.strength.toString() }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create evidence");
  return {
    id: created.id,
    claimId: created.claimId,
    ...(created.contentId === null ? {} : { contentId: created.contentId }),
    ...(created.citation === null ? {} : { citation: created.citation }),
    ...(created.sourceUri === null ? {} : { sourceUri: created.sourceUri }),
    relation: created.relation,
    ...(created.strength === null ? {} : { strength: Number(created.strength) }),
    ...(created.notes === null ? {} : { notes: created.notes }),
  };
}
