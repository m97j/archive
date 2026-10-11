import type { ContentAccess, UpdateContentAccessInput } from "@archive/contracts";
import { and, eq, max, sql } from "drizzle-orm";
import type { ArchiveDatabase } from "./index.js";
import { contents, publicationPointers, outboxEvents } from "./schema/index.js";
import { WorkflowInvariantError } from "./workflow.js";

/** Reversible deletion: never destroy content, revisions, source Markdown or publications. */
export async function updateContentAccess(
  db: ArchiveDatabase,
  contentId: string,
  input: UpdateContentAccessInput,
  actorId: string,
  now = new Date(),
): Promise<ContentAccess> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contentId}, 0))`);
    const [current] = await tx
      .select()
      .from(contents)
      .where(eq(contents.id, contentId))
      .for("update")
      .limit(1);
    if (!current) throw new WorkflowInvariantError("CONTENT_NOT_FOUND", "Content does not exist");
    const visibility = input.visibility ?? current.visibility;
    const archivedAt =
      input.archived === undefined
        ? current.archivedAt
        : input.archived
          ? (current.archivedAt ?? now)
          : null;
    const changed =
      visibility !== current.visibility || Boolean(archivedAt) !== Boolean(current.archivedAt);
    if (changed) {
      await tx
        .update(contents)
        .set({ visibility, archivedAt, updatedAt: now })
        .where(eq(contents.id, contentId));
      const pointers = await tx
        .select({ locale: publicationPointers.locale, path: publicationPointers.path })
        .from(publicationPointers)
        .where(eq(publicationPointers.contentId, contentId));
      for (const pointer of pointers) {
        const aggregateType = `CONTENT_ACCESS_${pointer.locale.toUpperCase()}`;
        const [latest] = await tx
          .select({ version: max(outboxEvents.aggregateVersion) })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.aggregateType, aggregateType),
              eq(outboxEvents.aggregateId, contentId),
            ),
          );
        await tx.insert(outboxEvents).values({
          eventType: "CONTENT_ACCESS_CHANGED",
          aggregateType,
          aggregateId: contentId,
          aggregateVersion: (latest?.version ?? 0) + 1,
          payload: {
            contentId,
            locale: pointer.locale,
            path: pointer.path,
            visibility,
            archived: Boolean(archivedAt),
            actorId,
          },
          occurredAt: now,
          availableAt: now,
        });
      }
    }
    return {
      contentId,
      visibility,
      archived: Boolean(archivedAt),
      updatedAt: (changed ? now : current.updatedAt).toISOString(),
    };
  });
}
