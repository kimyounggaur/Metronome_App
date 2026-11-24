import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaStatus } from "../components/PwaStatus";
import { applyPwaUpdate, usePwa } from "../pwa";

vi.mock("../pwa", () => ({
  usePwa: vi.fn(), applyPwaUpdate: vi.fn(), requestPwaInstall: vi.fn(), retryOffline: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePwa).mockReturnValue({
    offline: "ready", updateReady: true, newerActive: false,
    candidateFailed: false, canInstall: false, isIos: false, standalone: false,
  });
});

describe("PWA update after explicit user action", () => {
  it("waits for the storage commit, preserves the page on failure and enables retry", async () => {
    let finish!: (ok: boolean) => void;
    const commit = new Promise<boolean>(resolve => { finish = resolve; });
    const stop = vi.fn();
    render(<PwaStatus isPlaying onStop={stop} onBeforeUpdate={() => commit} />);
    fireEvent.click(screen.getByRole("button", { name: "정지 후 업데이트 적용" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "적용 중…" })).toBeDisabled();
    expect(applyPwaUpdate).not.toHaveBeenCalled();
    finish(false);
    expect(await screen.findByText(/저장을 완료하지 못했습니다/)).toBeVisible();
    expect(applyPwaUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "정지 후 업데이트 적용" })).toBeEnabled();
  });
  it("checks dependent writes again after another worker takes control", async () => {
    const flush = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(applyPwaUpdate).mockResolvedValue("accepted");
    render(<PwaStatus isPlaying={false} onBeforeUpdate={flush} />);
    fireEvent.click(screen.getByRole("button", { name: "업데이트 적용" }));
    expect(await screen.findByText(/저장을 완료하지 못했습니다/)).toBeVisible();
    expect(flush).toHaveBeenCalledTimes(2);
  });
  it.each(["blocked", "absent", "failed"] as const)("releases pending UI when worker result is %s", async outcome => {
    vi.mocked(applyPwaUpdate).mockResolvedValue(outcome);
    render(<PwaStatus isPlaying={false} onBeforeUpdate={() => Promise.resolve(true)} />);
    fireEvent.click(screen.getByRole("button", { name: "업데이트 적용" }));
    await waitFor(() => expect(applyPwaUpdate).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "업데이트 적용" })).toBeEnabled();
  });
});
