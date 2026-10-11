import type { PublicNavigation, PublicNavigationQuery } from "@archive/contracts";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contents,
  navigationSpaces,
  publicationPointers,
  taxonomyClosure,
  taxonomyNodeLabels,
  taxonomyNodes,
  taxonomyPlacements,
} from "./schema/index.js";

export async function getPublicNavigation(
  db: ArchiveDatabase,
  query: PublicNavigationQuery,
): Promise<PublicNavigation> {
  const [space] = await db
    .select({
      label: navigationSpaces.label,
      description: navigationSpaces.description,
    })
    .from(navigationSpaces)
    .where(and(eq(navigationSpaces.space, query.space), eq(navigationSpaces.locale, query.locale)))
    .limit(1);
  const nodes = await db
    .select({
      id: taxonomyNodes.id,
      stableKey: taxonomyNodes.stableKey,
      label: taxonomyNodeLabels.label,
      slug: taxonomyNodeLabels.slug,
      description: taxonomyNodeLabels.description,
    })
    .from(taxonomyNodes)
    .innerJoin(
      taxonomyNodeLabels,
      and(
        eq(taxonomyNodeLabels.nodeId, taxonomyNodes.id),
        eq(taxonomyNodeLabels.locale, query.locale),
      ),
    )
    .where(
      and(
        eq(taxonomyNodes.space, query.space),
        sql`exists (
          select 1
          from ${taxonomyClosure} visible_tree
          inner join ${taxonomyPlacements} visible_placement
            on visible_placement.node_id = visible_tree.descendant_id
          inner join ${contents} visible_content
            on visible_content.id = visible_placement.content_id
          inner join ${publicationPointers} visible_publication
            on visible_publication.content_id = visible_content.id
          where visible_tree.ancestor_id = ${taxonomyNodes.id}
            and visible_content.visibility = 'PUBLIC'
            and visible_content.archived_at is null
            and visible_publication.locale = ${query.locale}
        )`,
      ),
    )
    .orderBy(asc(taxonomyNodes.stableKey));
  const nodeIds = nodes.map((node) => node.id);
  const parents =
    nodeIds.length === 0
      ? []
      : await db
          .select({
            childId: taxonomyClosure.descendantId,
            parentId: taxonomyClosure.ancestorId,
          })
          .from(taxonomyClosure)
          .where(and(eq(taxonomyClosure.depth, 1), inArray(taxonomyClosure.descendantId, nodeIds)));
  const visibleIds = new Set(nodeIds);
  const parentByChild = new Map(
    parents
      .filter((edge) => visibleIds.has(edge.childId) && visibleIds.has(edge.parentId))
      .map((edge) => [edge.childId, edge.parentId]),
  );
  return {
    locale: query.locale,
    space: query.space,
    ...(space?.label === undefined ? {} : { label: space.label }),
    ...(space?.description == null ? {} : { description: space.description }),
    nodes: nodes.map((node) => {
      const parentId = parentByChild.get(node.id);
      return {
        id: node.id,
        stableKey: node.stableKey,
        label: node.label,
        slug: node.slug,
        ...(node.description === null ? {} : { description: node.description }),
        ...(parentId === undefined ? {} : { parentId }),
      };
    }),
  };
}
