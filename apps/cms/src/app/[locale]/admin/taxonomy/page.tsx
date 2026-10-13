import { redirect } from "next/navigation";
import type { Tag, TaxonomyNode } from "@archive/contracts";
import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";
export const dynamic = "force-dynamic";
export default async function Taxonomy({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const [nodes, tags] = await Promise.all([
    archiveApiRequest<{ items: TaxonomyNode[] }>("/v1/admin/taxonomy/nodes", {
      accessToken: session.accessToken,
    }),
    archiveApiRequest<{ items: Tag[] }>("/v1/admin/tags", { accessToken: session.accessToken }),
  ]);
  return (
    <section>
      <p className="eyebrow">Structure / Vocabulary</p>
      <h1>{locale === "ko" ? "분류와 태그" : "Taxonomy and tags"}</h1>
      <p className="section-intro">
        {locale === "ko"
          ? "현재 저장된 분류를 확인합니다. 구조 편집과 사이트 배치의 독립 Release 기능은 후속 작업입니다."
          : "Inspect the saved vocabulary. Structure editing and independent layout releases are a later stage."}
      </p>
      <div className="connection-grid">
        {nodes.items.map((node) => (
          <article key={node.id}>
            <span className="eyebrow">{node.space}</span>
            <h2>{node.labels.find((label) => label.locale === locale)?.label || node.stableKey}</h2>
            <p>{node.stableKey}</p>
            {node.parentId ? <small>Parent: {node.parentId}</small> : null}
          </article>
        ))}
      </div>
      {!nodes.items.length ? (
        <p className="empty-state">{locale === "ko" ? "분류가 없습니다." : "No categories yet."}</p>
      ) : null}
      <h2>{locale === "ko" ? "태그" : "Tags"}</h2>
      <div className="tag-list">
        {tags.items.map((tag) => (
          <span key={tag.id}>
            {tag.labels.find((label) => label.locale === locale)?.label || tag.stableKey}
          </span>
        ))}
      </div>
      {!tags.items.length ? (
        <p className="empty-state">{locale === "ko" ? "태그가 없습니다." : "No tags yet."}</p>
      ) : null}
    </section>
  );
}
