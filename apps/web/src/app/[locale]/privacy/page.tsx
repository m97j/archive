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
        <h2>{ko ? "저장 장소·국외 처리" : "Storage and overseas processing"}</h2>
        <p>
          {ko
            ? "Vercel의 사이트 서버가 검증한 최소 자료를 Hugging Face의 별도 비공개 Bucket에 암호화하여 저장합니다. 일반 PRO 저장소는 공식 지역 안내상 미국에 저장됩니다. 이 저장 경로의 적용 계약, 구체적 처리·이전 조건과 필요한 고지는 실제 활성화 전에 운영자가 확인해야 합니다. 이 페이지나 private 설정만으로 계약·법률 검토가 완료된 것은 아닙니다."
            : "The Vercel site server validates minimum records and encrypts them in a separate private Hugging Face Bucket. Standard PRO storage is US-based according to HF's region documentation. Applicable contracts, actual overseas processing and transfer notices must be confirmed before activation. This notice or private visibility is not legal clearance."}
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
            ? "화면 하단 개인정보 설정에서 선택을 바꾸거나 활동 자료를 삭제할 수 있습니다. 현재 세션은 브라우저의 서버 전용 세션 정보로 요청하고, 다른 기기·이전 세션은 직접 보관한 삭제 코드를 사용합니다. 이메일 주소만으로는 임의 세션의 소유자를 확인하지 못할 수 있습니다. 삭제 완료가 확인되지 않으면 완료로 표시하지 않습니다."
            : "Use Privacy settings in the footer to change choices or delete activity. This session uses its server-only browser session; another device or previous session requires its saved deletion code. Email alone may not identify a random session. Unconfirmed deletion is not presented as complete."}
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
