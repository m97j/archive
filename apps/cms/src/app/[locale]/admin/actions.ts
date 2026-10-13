"use server";

import {
  CONTENT_KINDS,
  LOCALES,
  VISIBILITY_STATES,
  type ContentKind,
  type CreatedRevision,
  type Locale,
  type Visibility,
} from "@archive/contracts";

import { getAdminSession } from "@/lib/admin-auth.server";
import { ArchiveApiError, archiveApiRequest } from "@/lib/archive-api.server";
import { assertSameOriginAction } from "@/lib/csrf.server";

export interface DraftActionState {
  status: "idle" | "success" | "error";
  message?: string;
  contentId?: string;
  revisionId?: string;
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

export async function createDraftAction(
  _previous: DraftActionState,
  form: FormData,
): Promise<DraftActionState> {
  await assertSameOriginAction();
  const session = await getAdminSession();
  if (!session) {
    return { status: "error", message: "An authenticated authoring session is required." };
  }
  const canonicalKey = field(form, "canonicalKey");
  const existingContentId = field(form, "contentId");
  const title = field(form, "title");
  const slug = field(form, "slug");
  const sourceMarkdown = field(form, "sourceMarkdown");
  const description = field(form, "description");
  const changeSummary = field(form, "changeSummary");
  const kindValue = field(form, "kind");
  const visibilityValue = field(form, "visibility");
  const localeValue = field(form, "locale");
  if (!canonicalKey || !title || !slug || !sourceMarkdown) {
    return { status: "error", message: "Canonical key, title, slug, and Markdown are required." };
  }
  if (!existingContentId && !CONTENT_KINDS.some((value) => value === kindValue)) {
    return { status: "error", message: "Select a valid content kind." };
  }
  if (!existingContentId && !VISIBILITY_STATES.some((value) => value === visibilityValue)) {
    return { status: "error", message: "Select a valid visibility state." };
  }
  if (!LOCALES.some((value) => value === localeValue)) {
    return { status: "error", message: "Select a supported locale." };
  }

  let content: { id: string } | undefined;
  try {
    content = existingContentId
      ? { id: existingContentId }
      : await archiveApiRequest<{ id: string }>("/v1/contents", {
          method: "POST",
          accessToken: session.accessToken,
          body: JSON.stringify({
            canonicalKey,
            kind: kindValue as ContentKind,
            visibility: visibilityValue as Visibility,
          }),
        });
    const revision = await archiveApiRequest<CreatedRevision>(
      `/v1/contents/${content.id}/revisions`,
      {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({
          ...(field(form, "sourceRevisionId")
            ? { sourceRevisionId: field(form, "sourceRevisionId") }
            : {}),
          ...(changeSummary ? { changeSummary } : {}),
          translations: [
            {
              locale: localeValue as Locale,
              title,
              slug,
              sourceMarkdown,
              ...(description ? { description } : {}),
            },
          ],
        }),
      },
    );
    return {
      status: "success",
      message: `Draft revision ${revision.revisionNumber} was queued for compilation.`,
      contentId: content.id,
      revisionId: revision.revisionId,
    };
  } catch (error) {
    return {
      status: "error",
      message: existingContentId
        ? "The new revision could not be saved. The existing content and its history are unchanged."
        : content !== undefined
          ? "The content identity was created, but its first revision failed. Keep the content ID for recovery."
          : error instanceof ArchiveApiError
            ? `The archive API rejected this draft (${error.status}).`
            : "The draft could not be created.",
      ...(content === undefined ? {} : { contentId: content.id }),
    };
  }
}
