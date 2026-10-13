import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest, listAdminContents } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";
import { AiTaskForm } from "@/components/ai-task-form";
export const dynamic = "force-dynamic";
interface Job {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
}
export default async function Jobs({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const [jobs, contents] = await Promise.all([
    archiveApiRequest<{ items: Job[] }>("/v1/admin/jobs", { accessToken: session.accessToken }),
    listAdminContents(session.accessToken),
  ]);
  return (
    <section>
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">Worker / AI</p>
          <h1>{locale === "ko" ? "작업 큐" : "Jobs"}</h1>
          <p>
            {locale === "ko"
              ? "번역과 임베딩은 외부 API 연결을 통해 실행합니다. 자동 발행하지 않습니다."
              : "Translation and embedding run through configured APIs. Nothing is automatically published."}
          </p>
        </div>
        <Link href={`/${locale}/admin/jobs`}>{locale === "ko" ? "새로고침" : "Refresh"} ↻</Link>
      </header>
      <AiTaskForm locale={locale} contents={contents.items} />
      <div className="job-list">
        {jobs.items.length ? (
          jobs.items.map((job) => (
            <article key={job.id}>
              <div>
                <strong>{job.type}</strong>
                <small>{job.id}</small>
              </div>
              <span className="status">{job.status}</span>
              <span>
                {job.attempts}/{job.maxAttempts}
              </span>
              {job.errorCode ? <code>{job.errorCode}</code> : null}
              <time dateTime={job.updatedAt}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(job.updatedAt))}
              </time>
            </article>
          ))
        ) : (
          <p className="empty-state">
            {locale === "ko" ? "등록된 작업이 없습니다." : "No jobs yet."}
          </p>
        )}
      </div>
    </section>
  );
}
