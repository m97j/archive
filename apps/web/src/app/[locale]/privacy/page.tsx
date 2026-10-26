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
            ? "브라우저 안의 맞춤과 서버로 보내는 활동 자료를 구분합니다."
            : "Browser-only suggestions and server activity processing are separate choices."}
        </p>
        <div className="document-meta">
          <span>
            {ko ? "안내 버전" : "Notice version"}: {policy.version}
          </span>
          <span>{ko ? "처리 현황 확인: 2026-10-26" : "Processing review: 2026-10-26"}</span>
          <span>
            {policy.enabled
              ? ko
                ? "선택적 수집 설정됨"
                : "Optional collection configured"
              : ko
                ? "현재 서버 수집 비활성화"
                : "Server collection disabled"}
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
        <h2 id="google-analytics">
          Google Analytics · {ko ? "선택적 방문 분석" : "Optional visit analytics"}
        </h2>
        <p>
          {ko
            ? "별도로 허용한 경우에만 Google 태그를 불러오며, 공개 페이지의 주소·제목, 페이지 조회, 문서의 90% 읽기 지점 도달, 참여 시간과 Google의 기본 기기·대략적 지역 통계를 분석합니다. 분석용 _ga 계열 쿠키를 최대 90일 사용합니다. GA의 식별자는 완전한 익명정보가 아니며 브라우저 내 이어 읽기 맞춤이나 HF 원로그 보관 동의와 연결하지 않습니다."
            : "Google tags load only after a separate opt-in to measure public page paths and titles, page views, reaching 90% of a document, engagement time and Google's basic device and approximate-location statistics. _ga analytics cookies last up to 90 days. GA identifiers are not fully anonymous and are independent of tab-only suggestions and HF raw-data retention."}
        </p>
        <p>
          {ko
            ? "Google LLC(미국) 및 Google의 처리 업체가 방문 분석·사이트 개선을 위해 처리합니다. 허용 이후 이벤트가 발생할 때 브라우저에서 HTTPS로 전송되며, 미국 및 Google의 글로벌 처리 인프라에서 처리될 수 있습니다. 한국 전용 저장 지역을 선택한 서비스가 아닙니다. 국외 처리에 동의하지 않으면 분석을 거부할 수 있고 공개 문서·검색 이용에 제한은 없습니다."
            : "Google LLC (USA) and its processing providers handle analytics for site improvement. After consent, the browser sends events over HTTPS to Google's US and global processing infrastructure. This is not Korea-only storage. Declining overseas analytics leaves public reading and search available."}
        </p>
        <p>
          {ko
            ? "이벤트·사용자 수준 자료의 GA4 보관 설정은 2개월, 새 활동 시 사용자 보관 기간 재설정은 끔으로 운영합니다. 이 설정이 모든 표준 집계 보고서의 삭제 기한을 뜻하지는 않습니다. 검색어·폼 입력·이메일·인증 코드와 URL의 query/hash, 외부 링크·다운로드 주소는 이 연결에서 전송하지 않습니다. Google Signals·광고 목적의 허용·사용자 계정 ID 연결·BigQuery 원자료 내보내기는 사용하지 않습니다."
            : "GA4 user/event retention is configured to 2 months with reset on new activity off; this is not an erasure deadline for all standard aggregate reports. This integration excludes search terms, form input, email, authentication codes, query/hash values and outbound/download URLs. Google Signals, advertising consent, account User-ID linking and BigQuery raw exports are not used."}
        </p>
        <p>
          {ko
            ? "선택 기록에는 허용 여부·버전·만료 시각만 담아 브라우저 localStorage에 최대 90일 저장하며, 방문자 ID나 행동 이력은 넣지 않습니다. 거부·미선택 상태에서는 Google 태그와 분석 요청을 보내지 않는 Basic Consent Mode를 사용합니다. 개인정보 설정에서 철회하면 새 측정을 차단하고 분석 쿠키를 지우며, 이미 태그가 실행된 화면은 새로고침합니다. 다른 탭에도 철회를 전달합니다. 이미 전송된 자료의 삭제는 철회와 별개이므로 운영자에게 문의해 주세요."
            : "A localStorage preference contains only permission, version and expiry for up to 90 days, without a visitor ID or reading history. Basic Consent Mode blocks Google tags and analytics requests before consent or after refusal. Withdrawal in Privacy settings blocks new measurement, clears analytics cookies and reloads a page where the tag ran; other tabs receive the change. Previously transmitted data requires a separate deletion request to the operator."}
        </p>
        <p>
          <a href="https://policies.google.com/privacy">Google Privacy</a>
          {" · "}
          <a href="https://business.safety.google/adsprocessorterms/">Google processing terms</a>
          {" · "}
          <a href="https://business.safety.google/subprocessors/">Google subprocessors</a>
          {" · "}
          <a href={`mailto:${policy.contact}`}>{policy.contact}</a>
        </p>
        <h2>{ko ? "브라우저 안에서만 이어 읽기" : "Reading suggestions confined to this tab"}</h2>
        <p>
          {ko
            ? "개인정보 설정에서 별도로 허용하면, 화면에 보이는 공개 문서를 일정 시간 읽었을 때 문서 태그와 제한된 읽은 문서 목록을 탭 메모리에만 유지해 다음 글을 정렬합니다. 직업·신원을 추정하거나 개인화 모델을 실행하지 않습니다. 서버·Google·HF로 전송하지 않고 UUID, 쿠키, localStorage, sessionStorage에 행동 이력을 기록하지 않습니다."
            : "A separate Privacy setting can use tags from visible public documents and a bounded read-document list in tab memory to order next reads. It does not infer identity or occupation, run a personalization model, upload activity to the server, Google or HF, issue a visitor UUID, or persist behavior in cookies, localStorage or sessionStorage."}
        </p>
        <p>
          {ko
            ? "이 선택과 읽기 정보는 새로고침·탭 종료·기능 끄기 또는 30분 동안 새 읽기 기록이 없을 때 초기화됩니다. 거부해도 기본 읽기·검색·콘텐츠 기반 관련 문서는 같습니다. 이 선택은 아래 서버 전송·학습 자료 보관 동의와 독립적이며, 해당 서버 수집을 켜지 않습니다. 일반적인 페이지 요청과 플랫폼 보안 로그는 별개입니다."
            : "The choice and reading state reset on reload, tab closure, switching off, or 30 minutes without a new reading record. Declining preserves reading, search and content-based connections. This choice is independent of the server-transmission and model-retention choices below and does not enable them. Ordinary page requests and hosting security logs are separate."}
        </p>
        <h2>{ko ? "비활성 상태로 보존한 HF 수집 기능" : "HF collection retained but inactive"}</h2>
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
            ? "서버로 보내는 선택적 활동 수집은 현재 비활성화되어 있습니다. 활성화할 경우 브라우저에서 사이트 서버로 전송한 최소 활동 자료를 검증한 뒤, 별도 비공개 저장소에 암호화하여 보관하는 구조입니다. 이 원로그를 Supabase DB나 공개 Dataset에 저장하지 않습니다."
            : "Optional server activity collection is currently disabled. The intended flow validates minimum records sent from the browser to the site server, then encrypts them in separate private storage. Raw activity is not stored in the Supabase database or a public Dataset."}
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
