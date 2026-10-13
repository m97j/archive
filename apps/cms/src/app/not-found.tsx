import Link from "next/link";
export default function NotFound() {
  return (
    <section className="studio-error">
      <h1>페이지를 찾을 수 없습니다.</h1>
      <Link href="/ko/admin">콘텐츠로 돌아가기</Link>
    </section>
  );
}
