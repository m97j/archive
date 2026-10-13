"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section className="studio-error">
      <p className="eyebrow">Studio</p>
      <h1>작업을 완료하지 못했습니다.</h1>
      <p>초안과 기존 발행본은 보존됩니다. 연결과 로그인 상태를 확인한 뒤 다시 시도하세요.</p>
      <button onClick={retry}>다시 시도</button>
    </section>
  );
}
