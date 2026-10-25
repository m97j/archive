import type { Metadata } from "next";
import Link from "next/link";
import { privacySettings } from "@/lib/privacy.server";
import { requireLocale } from "@/lib/routing";

export const metadata: Metadata = { title: "Privacy · marchivej" };

export default async function PrivacyNotice({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const ko = locale === "ko";
  const policy = privacySettings();
  return (
    <article className="document-page">
      <nav className="breadcrumbs" aria-label={ko ? "현재 위치" : "Breadcrumb"}>
        <Link href={`/${locale}`}>marchivej.</Link>
        <span aria-hidden="true">/</span>
        <span>{ko ? "개인정보 안내" : "Privacy"}</span>
      </nav>
      <header>
        <p className="eyebrow">PRIVACY &amp; YOUR CHOICES</p>
        <h1>{ko ? "읽기는 자유롭게. 선택은 명확하게." : "Open reading. Clear choices."}</h1>
        <p>
          {ko
            ? "세션 맞춤 처리와 기능 개선용 학습 자료 보관을 구분합니다."
            : "Session processing and retention for improving models are separate choices."}
        </p>
        <div className="document-meta">
          <span>
            {ko ? "안내 버전" : "Notice version"}: {policy.version}
          </span>
          <span>{ko ? "처리 현황 확인: 2026-10-25" : "Processing review: 2026-10-25"}</span>
          <span>
            {policy.enabled
              ? ko
                ? "선택적 수집 설정됨"
                : "Optional collection configured"
              : ko
                ? "현재 수집 비활성화"
                : "Collection disabled"}
          </span>
        </div>
      </header>
      <div className="prose">
        <h2>{ko ? "운영자와 문의" : "Operator and contact"}</h2>
        <p>
          {policy.operator} · <a href={`mailto:${policy.contact}`}>{policy.contact}</a>
        </p>
        <h2>
          {ko ? "동의하지 않아도 같은 기본 서비스" : "The same essential service without consent"}
        </h2>
        <p>
          {ko
            ? "공개 문서 열람, 일반·고도화 검색, 콘텐츠 정보 기반 관련 문서, 기본 화면 성능은 선택적 수집 동의와 무관합니다. 방문자 직업·역할 추정과 개인화 모델은 현재 실행하지 않습니다."
            : "Public reading, search, content-based related documents and essential performance do not depend on optional collection. No visitor occupation inference or personalization model is running."}
        </p>
        <h2>{ko ? "두 가지 선택적 목적" : "Two optional purposes"}</h2>
        <ul>
          <li>
            {ko
              ? `이번 세션 맞춤 처리: 공개 문서의 이동과 활성 읽기 시간을 짧은 세션으로 묶습니다. 처리 유효기간은 ${policy.retention.sessionHours}시간입니다. 현재는 향후 맞춤 기능의 처리 기반이며 모델 추천을 제공하지 않습니다.`
              : `Session processing: minimal public-document navigation and active reading time, valid for ${policy.retention.sessionHours} hours. This prepares a processing foundation; it does not provide model recommendations yet.`}
          </li>
          <li>
            {ko
              ? `맞춤 기능 개선용 학습 자료 보관: 별도로 동의하면 동일한 최소 활동 자료를 최대 ${policy.retention.modelDays}일의 처리 유효기간으로 보관합니다. 향후 사이트의 탐색·추천 기능 개선에 쓰기 위한 자료이며, 모델 학습은 아직 실행하지 않습니다.`
              : `Retention for model improvement: with separate consent, minimum activity has a ${policy.retention.modelDays}-day processing lifetime for future navigation and recommendation improvements. Model training has not started.`}
          </li>
        </ul>
        <h2>{ko ? "저장하는 정보와 저장하지 않는 정보" : "Data collected and excluded"}</h2>
        <p>
          {ko
            ? "임의의 짧은 세션 식별자, 공개 문서 ID·언어·버전, 이동 이벤트, 문서·섹션의 대략적인 활성 읽기 시간을 저장합니다. 페이지 주소는 공개 문서 확인에만 사용하고 저장 시 문서 ID로 바꿉니다. 백그라운드 탭 시간은 읽기 시간에 넣지 않습니다."
            : "Records contain a random short session identifier, public-document IDs, language and revision, navigation events, and coarse active reading duration per document or section. Paths are resolved to public IDs before storage. Hidden-tab time is excluded."}
        </p>
        <p>
          {ko
            ? "IP, 이메일, 직업, 로그인 계정, 검색어 원문, 입력 내용, 전체 URL·query string, 화면 녹화, 브라우저 지문은 이 활동 파이프라인에 저장하지 않습니다. 세션 식별자가 있다고 완전히 익명인 것은 아닙니다. 이동 기록에서 관심이 추정될 수 있습니다."
            : "This activity pipeline does not store IPs, email, occupation, account identifiers, query text, typed text, full URLs, query strings, screen recordings or browser fingerprints. Session identifiers do not guarantee anonymity; interests may be inferred from navigation."}
        </p>
        <h2>{ko ? "처리 업체와 저장 장소" : "Providers and storage locations"}</h2>
        <p>
          {ko
            ? "선택적 활동 수집은 현재 비활성화되어 있습니다. 활성화할 경우 브라우저에서 사이트 서버로 전송한 최소 활동 자료를 검증한 뒤, 별도 비공개 저장소에 암호화하여 보관하는 구조입니다. 이 원로그를 Supabase DB나 공개 Dataset에 저장하지 않습니다."
            : "Optional activity collection is currently disabled. The intended flow validates minimum records sent from the browser to the site server, then encrypts them in separate private storage. Raw activity is not stored in the Supabase database or a public Dataset."}
        </p>
        <ul>
          <li>
            <strong>Vercel Inc.</strong> —{" "}
            {ko
              ? "사이트 서버와 요청 처리. 확인일 기준 운영 함수는 미국 워싱턴 D.C. 권역(iad1)에서 실행됩니다. 전 세계 CDN·보안 로그·재위탁 처리가 모두 이 지역에 한정된다는 의미는 아닙니다."
              : "Site hosting and request processing. At the review date, production functions run in the Washington, D.C., USA region (iad1). This does not restrict global CDN, security logs or subprocessors to that region."}{" "}
            <a href="mailto:privacy@vercel.com">privacy@vercel.com</a>
          </li>
          <li>
            <strong>Hugging Face, Inc.</strong> —{" "}
            {ko
              ? "별도 비공개 Bucket의 저장·삭제 처리. 일반 PRO 저장소는 공식 지역 안내상 미국에 저장됩니다. 해당 Bucket의 실제 재위탁 업체·접근 국가와 백업 삭제 조건은 확인 중입니다."
              : "Storage and deletion in a separate private Bucket. Standard PRO storage is US-based according to the region documentation. Bucket-specific subprocessors, access countries and backup erasure conditions remain unconfirmed."}{" "}
            <a href="mailto:privacy@huggingface.co">privacy@huggingface.co</a>
          </li>
        </ul>
        <p>
          {ko
            ? "현재 구조에는 브라우저에서 AWS 저장소로 직접 보내는 경로가 없습니다. HF의 S3 호환 인터페이스는 HF가 제공하는 서비스이며, AWS SDK 사용이 AWS와의 직접 저장 계약을 의미하지는 않습니다. HF는 일반 개인정보 정책에서 AWS 등 재위탁 업체를 공개하지만, 그 목록만으로 이 Bucket의 실제 처리 업체와 모든 국가를 확정할 수는 없습니다."
            : "The current flow does not send activity directly from the browser to AWS storage. HF provides its S3-compatible service; use of an AWS SDK does not create a direct AWS storage agreement. HF lists providers including AWS in its general privacy policy, but that list alone does not establish this Bucket's actual processing chain and all countries."}
        </p>
        <h2>{ko ? "국외 처리와 활성화 조건" : "Overseas processing and activation conditions"}</h2>
        <p>
          {ko
            ? "활성화할 경우 위의 최소 활동 항목이 동의한 목적의 이벤트 전송 시 HTTPS로 국외 처리됩니다. 현재 PRO 계정에 적용되는 HF 처리 계약과 Vercel Hobby 요금제의 계약 적용 범위를 확인 중입니다. 제공자 정책의 일반적인 보유 조항을 이 사이트의 2시간·90일 삭제 보장으로 대신하지 않습니다."
            : "If activated, the minimum activity fields above would be processed overseas over HTTPS when events are sent for an accepted purpose. HF processing terms for this PRO account and the contract scope for Vercel Hobby are under review. General provider retention clauses do not establish this site's two-hour or 90-day erasure guarantees."}
        </p>
        <p>
          {ko
            ? "처리·이전 근거, 수신 업체·연락처, 실제 국가, 이전 시기·방법, 목적별 보관 기간과 거부 방법을 확정하여 안내하기 전에는 선택적 수집을 시작하지 않습니다. 국외 이전의 근거로 별도 동의를 사용하는 경우에는 두 목적의 선택과 구분하여 해당 동의를 받습니다. 이 페이지 열람이나 서비스 이용을 동의로 간주하지 않습니다. 거부해도 공개 문서와 기본 기능은 이용할 수 있습니다."
            : "Optional collection will not start before the processing and transfer basis, recipient contacts, actual countries, timing, method, purpose-specific retention and refusal procedure are confirmed and disclosed. Where separate overseas-transfer consent is the basis, it must be distinguished from the two purpose choices. Reading this notice or using the site is not consent. Refusal does not prevent public reading or essential functions."}
        </p>
        <p>
          {ko ? "제공자 공식 안내: " : "Official provider information: "}
          <a href="https://huggingface.co/privacy">Hugging Face Privacy</a>
          {" · "}
          <a href="https://huggingface.co/docs/hub/storage-buckets-security">HF Bucket security</a>
          {" · "}
          <a href="https://vercel.com/legal/privacy-notice">Vercel Privacy</a>
          {" · "}
          <a href="https://vercel.com/legal/dpa">Vercel DPA</a>
        </p>
        <h2>{ko ? "쿠키와 브라우저의 선택 기록" : "Cookies and browser choices"}</h2>
        <p>
          {ko
            ? "선택을 저장하면 목적별 허용 여부·안내 버전·선택 시각만 담은 설정 쿠키를 최대 90일 유지합니다. 이 쿠키에는 방문자 ID를 넣지 않습니다. 선택적 활동 세션이 시작되면 별도 서버 전용 쿠키를 사용하며, 30분 미활동 또는 총 12시간 후 만료됩니다. 새 방문을 장기간 연결하는 식별자로 사용하지 않습니다."
            : "Saving choices keeps a preference cookie for up to 90 days containing only purpose choices, notice version and decision time, without a visitor ID. An optional activity session uses a separate HttpOnly cookie, expiring after 30 minutes idle or 12 hours total. It does not identify the visitor across future visits."}
        </p>
        <h2>{ko ? "만료·정기 삭제" : "Expiry and scheduled deletion"}</h2>
        <p>
          {ko
            ? "유효기간이 끝난 자료는 처리에 사용하지 않도록 설계하며, 원본 객체는 정상 운영 시 매시간 정리 작업에서 삭제합니다. 따라서 물리 삭제는 만료와 동시에 일어나지 않고 다음 정리 주기에 완료됩니다. 장애 시 재시도·운영자 대응이 필요하며, 정리 성공 기록이 오래되면 새 수집을 중단합니다. 원로그의 영구 보관은 하지 않습니다."
            : "Expired records must not be used for processing. An hourly maintenance job removes raw objects, so physical deletion happens in the next sweep rather than instantly at expiry. Failures require retries and operator response; stale maintenance receipts stop new capture. Raw histories are not retained forever."}
        </p>
        <h2>{ko ? "철회와 삭제 요청" : "Withdrawal and deletion"}</h2>
        <p>
          {ko
            ? "삭제·철회 후 늦은 재전송을 차단하기 위한 최소 검증 기록은 행동 내용 없이 별도로 최대 91일 보관한 뒤 자동 삭제합니다. 이 기록은 새로운 활동 수집이나 방문자 추적에 사용하지 않습니다."
            : "Minimal keyed deletion and withdrawal records block late retries. They contain no activity content, expire after at most 91 days, and are not used for new collection or visitor tracking."}
        </p>
        <p>
          {ko
            ? "화면 하단 개인정보 설정에서 선택을 바꾸거나 활동 자료를 삭제할 수 있습니다. 현재 세션은 브라우저의 서버 전용 세션 정보로 요청하고, 다른 기기·이전 세션은 직접 보관한 삭제 코드를 사용합니다. 이메일 주소만으로는 임의 세션의 소유자를 확인하지 못할 수 있습니다. 이전 세션의 쿠키와 삭제 코드를 모두 잃으면 그 세션을 찾아 삭제할 수 없으며 정해진 만료·정리 기간을 적용합니다. 삭제 완료가 확인되지 않으면 완료로 표시하지 않습니다."
            : "Use Privacy settings in the footer to change choices or delete activity. This session uses its server-only browser session; another device or previous session requires its saved deletion code. Email alone may not identify a random session. If both an earlier cookie and its saved code are lost, that session cannot be located for deletion; its scheduled expiry still applies. Unconfirmed deletion is not presented as complete."}
        </p>
        <p>
          {ko
            ? "철회는 새 수집 중단이며 기존 자료 삭제와 구분합니다. 처리 목적이나 필요한 항목이 달라질 때에는 관련 안내·선택을 갱신합니다. 현재 개인화 모델, 개인 기록의 외부 연구 export, 데이터 판매는 실행하지 않습니다."
            : "Withdrawal stops new capture and is distinct from deleting existing records. New purposes or fields require updated notice and choices. No personalization training, external research export of individual records or data sale is running."}
        </p>
        <h2>
          {ko ? "별도 플랫폼·외부 미디어" : "Separate platform and external-media processing"}
        </h2>
        <p>
          {ko
            ? "서비스 요청 과정의 플랫폼 보안 로그, Supabase 관리자 로그인, 외부 이미지·YouTube·HF 데모의 처리는 이 선택적 활동 파이프라인과 별개입니다. 필수 보안 처리까지 중단하거나 모든 제공자의 IP 처리가 없다고 약속하는 안내는 아닙니다."
            : "Platform security logs, Supabase administrator sign-in and external images, YouTube or HF demos are separate from optional activity collection. This notice does not promise that essential security processing stops or that every provider receives no IP address."}
        </p>
      </div>
    </article>
  );
}
