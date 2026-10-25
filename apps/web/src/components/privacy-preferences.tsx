"use client";

import { useEffect, useRef, useState } from "react";
import { SessionActivity } from "./session-activity";

interface Preferences {
  enabled: boolean;
  sessionPersonalization: boolean;
  modelImprovement: boolean;
  decided: boolean;
  version: string;
  retention?: { sessionHours: number; modelDays: number };
}

export function PrivacyPreferences({ locale }: { locale: string }) {
  const ko = locale === "ko";
  const [preferences, setPreferences] = useState<Preferences>();
  const [sessionPersonalization, setSession] = useState(false);
  const [modelImprovement, setModel] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const recoveryGeneration = useRef(0);
  const apply = (value: Preferences) => {
    setPreferences(value);
    setSession(value.sessionPersonalization);
    setModel(value.modelImprovement);
    window.dispatchEvent(new CustomEvent("archive:privacy-change", { detail: value }));
  };
  useEffect(() => {
    let active = true;
    fetch("/api/privacy", { cache: "no-store" })
      .then((result) => {
        if (!result.ok) throw new Error("PRIVACY_UNAVAILABLE");
        return result.json();
      })
      .then((value: Preferences) => {
        if (active) {
          apply(value);
          if (value.enabled && !value.decided) setOpen(true);
        }
      })
      .catch(() => {
        /* Fail closed. */
      });
    const show = () => setOpen(true);
    window.addEventListener("archive:privacy-open", show);
    return () => {
      active = false;
      window.removeEventListener("archive:privacy-open", show);
    };
  }, []);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  async function choose(session: boolean, model: boolean) {
    setBusy(true);
    setMessage("");
    // Stop immediately: a failed withdrawal never restarts this page's listeners.
    window.dispatchEvent(new Event("archive:privacy-pause"));
    if (preferences)
      apply({ ...preferences, sessionPersonalization: false, modelImprovement: false });
    try {
      const result = await fetch("/api/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionPersonalization: session, modelImprovement: model }),
      });
      if (!result.ok) throw new Error("PREFERENCE_FAILED");
      if (result.status === 202) throw new Error("DELETE_PENDING");
      const saved = (await result.json()) as Preferences;
      if (
        typeof saved.enabled !== "boolean" ||
        typeof saved.sessionPersonalization !== "boolean" ||
        typeof saved.modelImprovement !== "boolean"
      )
        throw new Error("INVALID_PREFERENCE_RECEIPT");
      apply(saved);
      setOpen(false);
      setRecovery("");
      trigger.current?.focus();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "DELETE_PENDING"
          ? ko
            ? "철회를 요청했지만 현재 세션 삭제는 아직 완료되지 않았습니다. 삭제 코드를 보관하고 활동 자료 삭제를 다시 요청해 주세요."
            : "Withdrawal was requested, but session deletion is pending. Keep its deletion code and retry deleting activity."
          : ko
            ? "저장하지 못했습니다. 이 화면의 수집은 중지된 상태입니다. 다시 시도해 주세요."
            : "Could not save. Collection in this page is stopped; please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    setBusy(true);
    setMessage("");
    window.dispatchEvent(new Event("archive:privacy-pause"));
    if (preferences)
      apply({ ...preferences, sessionPersonalization: false, modelImprovement: false });
    try {
      const result = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(deleteCode.trim() ? { deleteCode: deleteCode.trim() } : {}),
      });
      if (!result.ok) throw new Error("DELETE_FAILED");
      const receipt = (await result.json()) as { complete?: boolean };
      if (receipt.complete !== true) throw new Error("DELETE_PENDING");
      setDeleteCode("");
      setRecovery("");
      const latest = await fetch("/api/privacy", { cache: "no-store" });
      if (latest.ok) apply((await latest.json()) as Preferences);
      setMessage(
        ko
          ? "삭제가 확인됐습니다. 다른 세션의 기록은 해당 세션의 삭제 코드로 삭제할 수 있습니다."
          : "Deletion confirmed. Other sessions require their own deletion codes.",
      );
    } catch {
      setMessage(
        ko
          ? "삭제 완료를 확인하지 못했습니다. 수집은 중지했으며, 삭제 코드를 보관하고 다시 시도해 주세요."
          : "Deletion was not confirmed. Collection is stopped; keep the deletion code and retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revealRecovery() {
    setBusy(true);
    setMessage("");
    const requestGeneration = ++recoveryGeneration.current;
    try {
      const result = await fetch("/api/privacy/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!result.ok) throw new Error("RECOVERY_UNAVAILABLE");
      const value = (await result.json()) as { deleteCode?: string };
      if (!value.deleteCode) throw new Error("RECOVERY_UNAVAILABLE");
      if (requestGeneration === recoveryGeneration.current && dialog.current?.open)
        setRecovery(value.deleteCode);
    } catch {
      setMessage(
        ko
          ? "활성 수집 세션이 없거나 코드를 가져올 수 없습니다."
          : "No active collection session, or the code could not be retrieved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const hours = preferences?.retention?.sessionHours ?? 2;
  const days = preferences?.retention?.modelDays ?? 90;
  return (
    <>
      <SessionActivity preferences={preferences} />
      <button className="privacy-trigger" ref={trigger} onClick={() => setOpen(true)}>
        {ko ? "개인정보 설정" : "Privacy settings"}
      </button>
      <dialog
        className="privacy-dialog"
        ref={dialog}
        aria-labelledby="privacy-title"
        onCancel={() => setOpen(false)}
        onClose={() => {
          recoveryGeneration.current++;
          setOpen(false);
          setRecovery("");
          trigger.current?.focus();
        }}
      >
        <div className="privacy-heading">
          <p className="eyebrow">YOUR CHOICE</p>
          <button
            type="button"
            aria-label={ko ? "개인정보 설정 닫기" : "Close privacy settings"}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <h2 id="privacy-title">
          {ko
            ? "맞춤 처리와 보관은, 따로 선택해요."
            : "Personalization and retention. Your choices, separately."}
        </h2>
        <p>
          {ko
            ? "검색·공개 문서·기본 읽기 성능은 선택과 무관하게 같습니다. 개인화 모델은 아직 제공하지 않습니다."
            : "Search, public documents and reading performance are the same for everyone. A personalization model is not yet available."}
        </p>
        {!preferences?.enabled && (
          <p className="privacy-status" role="status">
            {ko
              ? "현재 수집은 비활성화되어 있습니다. 운영 설정과 보관·삭제 검증 후에만 켭니다."
              : "Collection is disabled until operating settings, retention and deletion have been verified."}
          </p>
        )}
        <fieldset className="privacy-options" disabled={busy || !preferences?.enabled}>
          <legend className="privacy-detail">
            {ko ? "선택적 처리 목적" : "Optional purposes"}
          </legend>
          <label>
            <input
              type="checkbox"
              checked={sessionPersonalization}
              onChange={(event) => setSession(event.target.checked)}
            />
            <span>
              <strong>{ko ? "이번 세션 맞춤 처리" : "Processing for this session"}</strong>
              <small>
                {ko
                  ? `공개 문서 이동과 활성 읽기 시간을 짧은 세션으로 처리합니다. 처리 유효기간은 ${hours}시간이며, 만료 자료는 다음 정기 작업에서 삭제합니다. 다른 방문과 연결하지 않습니다.`
                  : `Minimum public-document activity has a ${hours}-hour processing lifetime; expired objects are removed by the next scheduled sweep. Visits are not linked.`}
              </small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={modelImprovement}
              onChange={(event) => setModel(event.target.checked)}
            />
            <span>
              <strong>
                {ko
                  ? "맞춤 기능 개선용 학습 자료 보관"
                  : "Retention for improving recommendation models"}
              </strong>
              <small>
                {ko
                  ? `동의한 최소 자료를 HF 비공개 Bucket에 ${days}일의 처리 유효기간으로 보관하고 정기 삭제합니다. 지금 모델 학습은 실행하지 않으며 원로그는 영구 보관하지 않습니다.`
                  : `Minimum consented activity has a ${days}-day processing lifetime in a private HF Bucket, followed by scheduled deletion. Model training is not running; raw histories are not kept forever.`}
              </small>
            </span>
          </label>
        </fieldset>
        <p className="privacy-detail">
          {ko
            ? "IP·이메일·검색어·입력 내용·화면 녹화는 이 파이프라인에 저장하지 않습니다. 임의 세션 ID는 완전한 익명화를 뜻하지 않습니다. 플랫폼 보안 로그와 외부 미디어 처리는 별개입니다."
            : "This pipeline does not store IPs, email, search queries, typed text or screen recordings. A random session ID is not proof of anonymity. Hosting security logs and external media are separate."}{" "}
          <a href={`/${locale}/privacy`}>
            {ko ? "처리·보관 안내" : "Processing and retention notice"} ↗
          </a>
        </p>
        <div className="privacy-actions">
          <button disabled={busy} onClick={() => void choose(false, false)}>
            {ko ? "모두 거부 / 철회" : "Decline all / withdraw"}
          </button>
          {preferences?.enabled ? (
            <button
              disabled={busy}
              onClick={() => void choose(sessionPersonalization, modelImprovement)}
            >
              {ko ? "선택 저장" : "Save choices"}
            </button>
          ) : (
            <button onClick={() => setOpen(false)}>{ko ? "닫기" : "Close"}</button>
          )}
        </div>
        <details className="privacy-deletion">
          <summary>{ko ? "내 활동 삭제·삭제 코드" : "Delete activity / deletion code"}</summary>
          <p className="privacy-detail">
            {ko
              ? "철회하면 현재 세션의 새 수집을 중단하고 삭제도 요청합니다. 이전 세션은 보관한 삭제 코드로 별도 삭제해야 합니다. 코드 없이 임의 세션을 이메일만으로 찾지 못할 수 있으므로 세션 만료 전에 코드를 보관하세요."
              : "Withdrawal stops capture and requests deletion of this session. Older sessions need their saved deletion codes. Email alone may not locate a random session; save its code before it expires."}
          </p>
          <label className="privacy-code-label">
            {ko ? "다른 세션 삭제 코드 (선택)" : "Another session’s deletion code (optional)"}
            <input
              autoComplete="off"
              type="password"
              data-deletion-capability
              value={deleteCode}
              onChange={(event) => setDeleteCode(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="privacy-actions">
            <button disabled={busy} onClick={() => void erase()}>
              {ko ? "활동 자료 삭제" : "Delete activity"}
            </button>
            <button disabled={busy} onClick={() => void revealRecovery()}>
              {ko ? "현재 세션 삭제 코드 보기" : "Show this session’s deletion code"}
            </button>
          </div>
          {recovery && (
            <label className="privacy-code-label">
              {ko
                ? "안전한 곳에 직접 보관하세요. 화면을 닫으면 표시가 사라집니다."
                : "Save securely yourself. The display clears when this dialog closes."}
              <input
                value={recovery}
                readOnly
                autoComplete="off"
                onFocus={(event) => event.currentTarget.select()}
                aria-label={ko ? "현재 세션 삭제 코드" : "Current session deletion code"}
              />
            </label>
          )}
        </details>
        {message && (
          <p className="privacy-status" role="status">
            {message}
          </p>
        )}
      </dialog>
    </>
  );
}
