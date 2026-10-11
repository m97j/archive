import { notFound, redirect } from "next/navigation";
import type { AdminDraft } from "@archive/contracts";

import { DraftEditor } from "@/components/draft-editor";
import { getAdminSession } from "@/lib/admin-auth.server";
import { requireLocale } from "@/lib/routing";
import { ArchiveApiError, archiveApiRequest, listAdminContents } from "@/lib/archive-api.server";

export const dynamic = "force-dynamic";

export default async function NewDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ contentId?: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const contentId = (await searchParams).contentId;
  const content = contentId
    ? (await listAdminContents(session.accessToken)).items.find((item) => item.id === contentId)
    : undefined;
  if (contentId && !content) notFound();
  let draft: AdminDraft | undefined;
  if (content) {
    try {
      draft = await archiveApiRequest<AdminDraft>(
        `/v1/admin/contents/${content.id}/draft?locale=${locale}`,
        { accessToken: session.accessToken },
      );
    } catch (error) {
      if (!(error instanceof ArchiveApiError && error.status === 404)) throw error;
    }
  }
  return (
    <section className="admin-page">
      <header className="admin-heading">
        <p className="eyebrow">Authoring</p>
        <h1>{content ? "Create a new revision" : "Create a new draft"}</h1>
        <p>
          {content
            ? "Previous source and revisions remain intact until you explicitly review and publish this replacement."
            : "Start a content identity and its first localized revision."}
        </p>
      </header>
      <DraftEditor
        locale={locale}
        {...(content ? { content } : {})}
        {...(draft ? { draft } : {})}
      />
    </section>
  );
}
