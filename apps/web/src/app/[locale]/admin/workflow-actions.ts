"use server";

import { LOCALES, type Locale } from "@archive/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest } from "@/lib/archive-api.server";

const value = (form: FormData, name: string): string => {
  const entry = form.get(name);
  return typeof entry === "string" ? entry.trim() : "";
};

export async function workflowAction(form: FormData): Promise<void> {
  const localeValue = value(form, "locale");
  const locale: Locale = LOCALES.some((item) => item === localeValue)
    ? (localeValue as Locale)
    : "ko";
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const intent = value(form, "intent");
  if (intent === "submit-revision" || intent === "approve-revision") {
    await archiveApiRequest(`/v1/revisions/${value(form, "revisionId")}/review`, {
      method: "POST",
      accessToken: session.accessToken,
      body: JSON.stringify({ status: intent === "submit-revision" ? "IN_REVIEW" : "APPROVED" }),
    });
  } else if (intent === "review-translation") {
    await archiveApiRequest(
      `/v1/localized-revisions/${value(form, "localizedRevisionId")}/review`,
      {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ status: "REVIEWED" }),
      },
    );
  } else if (intent === "publish") {
    const path = value(form, "path");
    if (!path.startsWith("/")) throw new Error("Publication path must be absolute");
    await archiveApiRequest("/v1/publications", {
      method: "POST",
      accessToken: session.accessToken,
      body: JSON.stringify({
        contentId: value(form, "contentId"),
        localizedRevisionId: value(form, "localizedRevisionId"),
        artifactId: value(form, "artifactId"),
        locale,
        path,
      }),
    });
  } else if (
    ["archive-content", "restore-content", "make-public", "make-private"].includes(intent)
  ) {
    await archiveApiRequest(`/v1/contents/${value(form, "contentId")}/access`, {
      method: "PATCH",
      accessToken: session.accessToken,
      body: JSON.stringify(
        intent === "archive-content"
          ? { archived: true }
          : intent === "restore-content"
            ? { archived: false }
            : { visibility: intent === "make-public" ? "PUBLIC" : "PRIVATE" },
      ),
    });
  } else {
    throw new Error("Unsupported workflow action");
  }
  revalidatePath(`/${locale}/admin`);
  redirect(`/${locale}/admin?updated=1`);
}
