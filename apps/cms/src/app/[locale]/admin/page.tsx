import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "./auth-actions";
import { workflowAction } from "./workflow-actions";
import { getAdminSession } from "@/lib/admin-auth.server";
import { listAdminContents } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";
import { cmsCopy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ updated?: string; archived?: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const copy = cmsCopy(locale);
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const includeArchived = (await searchParams).archived === "1";
  const page = await listAdminContents(session.accessToken, includeArchived);
  const updated = (await searchParams).updated === "1";
  return (
    <section className="admin-dashboard">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">Private / Editorial</p>
          <h1>{copy.heading}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="admin-account">
          <span>
            {session.email ?? (session.source === "development" ? "Local admin" : "Authenticated")}
          </span>
          <Link href={`/${locale}/admin/new`}>{copy.newDraft}</Link>
          <Link href={`/${locale}/admin${includeArchived ? "" : "?archived=1"}`}>
            {includeArchived ? copy.active : copy.archived}
          </Link>
          {session.source === "supabase" ? (
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit">{copy.signOut}</button>
            </form>
          ) : null}
        </div>
      </header>
      {updated ? (
        <p className="workflow-notice" role="status">
          Workflow updated.
        </p>
      ) : null}
      {page.items.length === 0 ? (
        <p className="empty-state">{copy.empty}</p>
      ) : (
        <div className="workflow-list">
          {page.items.map((content) => {
            const revision = content.latestRevision;
            return (
              <article className="workflow-card" key={content.id}>
                <header>
                  <div>
                    <span>{content.kind.replaceAll("_", " ")}</span>
                    <h2>{content.canonicalKey}</h2>
                  </div>
                  <span className={`status status-${revision?.status.toLowerCase() ?? "empty"}`}>
                    {revision?.status ?? "NO REVISION"}
                  </span>
                </header>
                <div className="workflow-meta">
                  <span>{content.visibility}</span>
                  {revision ? <span>Revision {revision.revisionNumber}</span> : null}
                </div>
                <div className="workflow-actions">
                  {!content.archivedAt ? (
                    <Link href={`/${locale}/admin/new?contentId=${content.id}`}>{copy.edit}</Link>
                  ) : null}
                  <form action={workflowAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="contentId" value={content.id} />
                    <button
                      name="intent"
                      value={content.archivedAt ? "restore-content" : "archive-content"}
                    >
                      {content.archivedAt ? "Restore content" : "Archive (keep all revisions)"}
                    </button>
                    {!content.archivedAt ? (
                      <button
                        name="intent"
                        value={content.visibility === "PUBLIC" ? "make-private" : "make-public"}
                      >
                        {content.visibility === "PUBLIC" ? "Make private" : "Allow public access"}
                      </button>
                    ) : null}
                  </form>
                </div>
                {revision ? (
                  <>
                    <div className="workflow-actions">
                      {revision.status === "DRAFT" ? (
                        <form action={workflowAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="intent" value="submit-revision" />
                          <input type="hidden" name="revisionId" value={revision.id} />
                          <button type="submit">Submit for review</button>
                        </form>
                      ) : null}
                      {revision.status === "IN_REVIEW" ? (
                        <form action={workflowAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="intent" value="approve-revision" />
                          <input type="hidden" name="revisionId" value={revision.id} />
                          <button type="submit">Approve revision</button>
                        </form>
                      ) : null}
                    </div>
                    <div className="translation-list">
                      {revision.translations.map((translation) => (
                        <section key={translation.id}>
                          <div>
                            <strong>{translation.title}</strong>
                            <span>
                              {translation.locale} · {translation.translationStatus}
                            </span>
                          </div>
                          {translation.translationStatus === "DRAFT" ||
                          translation.translationStatus === "STALE" ? (
                            <form action={workflowAction}>
                              <input type="hidden" name="locale" value={locale} />
                              <input type="hidden" name="intent" value="review-translation" />
                              <input
                                type="hidden"
                                name="localizedRevisionId"
                                value={translation.id}
                              />
                              <button type="submit">Mark reviewed</button>
                            </form>
                          ) : null}
                          {revision.status === "APPROVED" &&
                          translation.translationStatus === "REVIEWED" &&
                          translation.artifact ? (
                            <form className="publish-form" action={workflowAction}>
                              <input type="hidden" name="locale" value={translation.locale} />
                              <input type="hidden" name="intent" value="publish" />
                              <input type="hidden" name="contentId" value={content.id} />
                              <input
                                type="hidden"
                                name="localizedRevisionId"
                                value={translation.id}
                              />
                              <input
                                type="hidden"
                                name="artifactId"
                                value={translation.artifact.id}
                              />
                              <label>
                                <span>Public path</span>
                                <input
                                  name="path"
                                  defaultValue={`/${translation.locale}/${translation.slug.replace(/^\/+/, "")}`}
                                  required
                                />
                              </label>
                              <button type="submit">Publish</button>
                            </form>
                          ) : null}
                          {!translation.artifact ? <small>Compilation pending</small> : null}
                        </section>
                      ))}
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
