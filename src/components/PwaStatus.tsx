import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { applyPwaUpdate, requestPwaInstall, retryOffline, usePwa } from "../pwa";

interface PwaStatusProps {
  isPlaying: boolean;
  onStop?: () => void | Promise<void>;
  onBeforeUpdate?: () => void | boolean | Promise<void | boolean>;
  showInstallHint?: boolean;
  onDismissInstall?: () => void;
}

export function PwaStatus({ isPlaying, onStop, onBeforeUpdate, showInstallHint = true, onDismissInstall }: PwaStatusProps) {
  const pwa = usePwa();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const canShowInstall = showInstallHint && !installDismissed && !pwa.standalone && (pwa.canInstall || pwa.isIos);
  return <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-4 pb-4 text-xs text-[color:var(--muted)]" aria-label="설치와 오프라인 상태">
    {pwa.offline === "ready" ? <p role="status">오프라인 사용 준비 완료</p> : null}
    {pwa.offline === "preparing" ? <p role="status">오프라인 사용 준비 중…</p> : null}
    {pwa.offline === "error" || pwa.candidateFailed ? <div>
      <p role="status">{pwa.offline === "error" ? "오프라인 준비를 완료하지 못했습니다." : "새 버전을 준비하지 못했습니다. 현재 버전으로 연습할 수 있어요."}</p>
      <button type="button" className="touch-target underline" onClick={() => void retryOffline()}>다시 확인</button>
    </div> : null}
    {pwa.updateReady || pwa.newerActive ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 surface">
      <span role="status">{pwa.newerActive ? "다른 탭에서 새 버전을 적용했습니다." : "업데이트 준비됨"}{isPlaying ? " · 연습을 마친 뒤 적용할 수 있어요." : ""}</span>
      <button type="button" disabled={applying || (isPlaying && !onStop)} className="touch-target inline-flex items-center gap-2 rounded-xl px-3 surface-2 disabled:opacity-50" onClick={async () => {
        setError(null);
        setApplying(true);
        try {
          if (isPlaying) await onStop?.();
          if (await onBeforeUpdate?.() === false) throw new Error("저장 실패");
          const result = await applyPwaUpdate();
          if (result === "accepted") {
            // Activation may have taken several seconds; persist edits made while the worker was waiting.
            if (await onBeforeUpdate?.() === false) throw new Error("저장 실패");
            window.location.reload();
          }
          if (result === "blocked") setError("열린 메트로놈 탭에서 연습을 마치고 닫은 뒤 다시 시도해 주세요.");
          if (result === "failed") setError("버전 전환을 확인하지 못했습니다. 다시 시도해 주세요.");
        } catch {
          setError("저장을 완료하지 못했습니다. 현재 자료를 백업하거나 저장을 다시 시도해 주세요.");
        } finally { setApplying(false); }
      }}><RefreshCw size={16} aria-hidden="true" />{applying ? "적용 중…" : pwa.newerActive ? "연습을 마치고 새 버전 열기" : isPlaying ? "정지 후 업데이트 적용" : "업데이트 적용"}</button>
    </div> : null}
    {canShowInstall ? <div className="rounded-2xl p-3 surface">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="touch-target inline-flex items-center gap-2 rounded-xl px-3 surface-2" onClick={() => {
          if (pwa.canInstall) void requestPwaInstall().catch(() => setError("설치를 완료하지 못했습니다. 브라우저 메뉴에서도 설치할 수 있어요."));
          else setShowIosSteps(current => !current);
        }}><Download size={16} aria-hidden="true" />{pwa.canInstall ? "Pulse 설치" : "홈 화면에 추가하는 방법"}</button>
        <button type="button" className="touch-target rounded-full p-2" aria-label="설치 안내 닫기" onClick={() => { setInstallDismissed(true); onDismissInstall?.(); }}><X size={16} aria-hidden="true" /></button>
      </div>
      {showIosSteps ? <p className="mt-2 leading-relaxed">Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.</p> : null}
    </div> : null}
    {error ? <p role="status">{error}</p> : null}
  </section>;
}
