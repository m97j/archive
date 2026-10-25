import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPreferences } from "@/components/privacy-preferences";

vi.mock("next/navigation", () => ({ usePathname: () => "/ko/docs/example" }));
const preferences = {
  enabled: true,
  version: "2026-10-14",
  decided: false,
  sessionPersonalization: false,
  modelImprovement: false,
  retention: { sessionHours: 2, modelDays: 90 },
};
const response = (value: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("independent processing and retention choices", () => {
  it("does not preselect either purpose and saves model improvement independently", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(preferences))
      .mockResolvedValueOnce(response({ ...preferences, decided: true, modelImprovement: true }));
    vi.stubGlobal("fetch", fetcher);
    render(<PrivacyPreferences locale="ko" />);
    const model = await screen.findByLabelText(/맞춤 기능 개선용 학습 자료 보관/);
    expect(model).not.toBeChecked();
    expect(screen.getByLabelText(/이번 세션 맞춤 처리/)).not.toBeChecked();
    fireEvent.click(model);
    fireEvent.click(screen.getByRole("button", { name: "선택 저장" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      sessionPersonalization: false,
      modelImprovement: true,
    });
    expect(fetcher.mock.calls.some(([path]) => String(path).includes("telemetry"))).toBe(false);
  });
  it("disabled deployment exposes no accepting controls or measurement", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...preferences, enabled: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<PrivacyPreferences locale="ko" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "개인정보 설정" }));
    expect(screen.getByLabelText(/이번 세션 맞춤 처리/)).toBeDisabled();
    expect(screen.getByLabelText(/맞춤 기능 개선용 학습 자료 보관/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "선택 저장" })).not.toBeInTheDocument();
  });
  it("pauses synchronously and does not close a pending-deletion dialog", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(preferences))
      .mockResolvedValueOnce(response({ complete: false }, 202));
    const pause = vi.fn();
    window.addEventListener("archive:privacy-pause", pause);
    vi.stubGlobal("fetch", fetcher);
    render(<PrivacyPreferences locale="ko" />);
    await screen.findByRole("button", { name: "선택 저장" });
    fireEvent.click(screen.getByRole("button", { name: "모두 거부 / 철회" }));
    expect(pause).toHaveBeenCalledOnce();
    await screen.findByText(/삭제는 아직 완료되지 않았습니다/);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    window.removeEventListener("archive:privacy-pause", pause);
  });
  it("never reports partial deletion as complete", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(preferences))
      .mockResolvedValueOnce(response({ complete: false }));
    vi.stubGlobal("fetch", fetcher);
    render(<PrivacyPreferences locale="ko" />);
    await screen.findByRole("button", { name: "선택 저장" });
    fireEvent.click(screen.getByText("내 활동 삭제·삭제 코드"));
    fireEvent.click(screen.getByRole("button", { name: "활동 자료 삭제" }));
    await screen.findByText(/삭제 완료를 확인하지 못했습니다/);
    expect(screen.queryByText(/^삭제가 확인됐습니다/)).not.toBeInTheDocument();
  });
  it("does not restore a recovery secret arriving after the dialog closes", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(preferences))
      .mockReturnValueOnce(pending);
    vi.stubGlobal("fetch", fetcher);
    render(<PrivacyPreferences locale="ko" />);
    await screen.findByRole("button", { name: "선택 저장" });
    fireEvent.click(screen.getByText("내 활동 삭제·삭제 코드"));
    fireEvent.click(screen.getByRole("button", { name: "현재 세션 삭제 코드 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "개인정보 설정 닫기" }));
    release(response({ deleteCode: "a".repeat(43) }));
    await waitFor(() =>
      expect(screen.queryByLabelText("현재 세션 삭제 코드")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "개인정보 설정" }));
    expect(screen.queryByDisplayValue("a".repeat(43))).not.toBeInTheDocument();
  });
});
