import { randomUUID } from "node:crypto";

import type {
  CreateTaxonomyNodeInput,
  PlaceContentInput,
  TaxonomyNode,
  TaxonomyPlacement,
} from "@archive/contracts";
import { and, eq, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contents,
  outboxEvents,
  taxonomyClosure,
  taxonomyNodeLabels,
  taxonomyNodes,
  taxonomyPlacements,
} from "./schema/index.js";

export class ArchiveInvariantError extends Error {
  override readonly name = "ArchiveInvariantError";
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function listTaxonomyNodes(db: ArchiveDatabase): Promise<{ items: TaxonomyNode[] }> {
  const nodes = await db.select().from(taxonomyNodes).limit(500);
  const labels = await db.select().from(taxonomyNodeLabels).limit(3500);
  const parents = await db
    .select()
    .from(taxonomyClosure)
    .where(eq(taxonomyClosure.depth, 1))
    .limit(500);
  return {
    items: nodes.map((node) => {
      const parentId = parents.find((parent) => parent.descendantId === node.id)?.ancestorId;
      return {
        id: node.id,
        stableKey: node.stableKey,
        space: node.space,
        createdAt: node.createdAt.toISOString(),
        ...(parentId ? { parentId } : {}),
        labels: labels
          .filter((label) => label.nodeId === node.id)
          .map((label) => ({
            locale: label.locale,
            label: label.label,
            slug: label.slug,
            ...(label.description === null ? {} : { description: label.description }),
          })),
      };
    }),
  };
}

export async function createTaxonomyNode(
  db: ArchiveDatabase,
  input: CreateTaxonomyNodeInput,
  actorId: string,
  now = new Date(),
): Promise<TaxonomyNode> {
  const localeSet = new Set(input.labels.map((label) => label.locale));
  if (localeSet.size !== input.labels.length) {
    throw new ArchiveInvariantError(
      "DUPLICATE_LOCALE",
      "A taxonomy node can label each locale once",
    );
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.stableKey}, 0))`);
    if (input.parentId !== undefined) {
      const [parent] = await tx
        .select({ space: taxonomyNodes.space })
        .from(taxonomyNodes)
        .where(eq(taxonomyNodes.id, input.parentId))
        .limit(1);
      if (parent === undefined) {
        throw new ArchiveInvariantError("PARENT_NOT_FOUND", "Taxonomy parent does not exist");
      }
      if (parent.space !== input.space) {
        throw new ArchiveInvariantError(
          "SPACE_MISMATCH",
          "Taxonomy parent belongs to another space",
        );
      }
    }

    const id = randomUUID();
    await tx.insert(taxonomyNodes).values({
      id,
      stableKey: input.stableKey,
      space: input.space,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(taxonomyClosure).values({ ancestorId: id, descendantId: id, depth: 0 });
    if (input.parentId !== undefined) {
      const ancestors = await tx
        .select({ ancestorId: taxonomyClosure.ancestorId, depth: taxonomyClosure.depth })
        .from(taxonomyClosure)
        .where(eq(taxonomyClosure.descendantId, input.parentId));
      await tx.insert(taxonomyClosure).values(
        ancestors.map((ancestor) => ({
          ancestorId: ancestor.ancestorId,
          descendantId: id,
          depth: ancestor.depth + 1,
        })),
      );
    }
    await tx.insert(taxonomyNodeLabels).values(
      input.labels.map((label) => ({
        nodeId: id,
        locale: label.locale,
        label: label.label,
        slug: label.slug ?? input.stableKey,
        ...(label.description === undefined ? {} : { description: label.description }),
      })),
    );
    await tx.insert(outboxEvents).values({
      eventType: "TAXONOMY_CHANGED",
      aggregateType: "TAXONOMY_NODE",
      aggregateId: id,
      aggregateVersion: 1,
      payload: { nodeId: id, parentId: input.parentId, actorId },
      occurredAt: now,
      availableAt: now,
    });
    return {
      id,
      stableKey: input.stableKey,
      space: input.space,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      labels: input.labels,
      createdAt: now.toISOString(),
    };
  });
}

export async function placeContentInTaxonomy(
  db: ArchiveDatabase,
  contentId: string,
  nodeId: string,
  input: PlaceContentInput,
): Promise<TaxonomyPlacement> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ contentId: contents.id, nodeId: taxonomyNodes.id })
      .from(contents)
      .innerJoin(taxonomyNodes, eq(taxonomyNodes.id, nodeId))
      .where(and(eq(contents.id, contentId), sql`${contents.archivedAt} is null`))
      .limit(1);
    if (target === undefined) {
      throw new ArchiveInvariantError(
        "PLACEMENT_TARGET_NOT_FOUND",
        "Content or taxonomy node not found",
      );
    }
    const isPrimary = input.isPrimary ?? false;
    const sortOrder = input.sortOrder ?? 0;
    if (isPrimary) {
      await tx
        .update(taxonomyPlacements)
        .set({ isPrimary: false })
        .where(eq(taxonomyPlacements.contentId, contentId));
    }
    await tx
      .insert(taxonomyPlacements)
      .values({ contentId, nodeId, isPrimary, sortOrder })
      .onConflictDoUpdate({
        target: [taxonomyPlacements.contentId, taxonomyPlacements.nodeId],
        set: { isPrimary, sortOrder },
      });
    return { contentId, nodeId, isPrimary, sortOrder };
  });
}
