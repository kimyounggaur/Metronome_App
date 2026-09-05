import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { applyPwaUpdate, requestPwaInstall, usePwa } from "../pwa";

interface PwaStatusProps {
  isPlaying: boolean;
  onStop?: () => void | Promise<void>;
  onBeforeUpdate?: () => void | Promise<void>;
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
    {pwa.offline === "error" ? <p role="status">오프라인 준비를 완료하지 못했습니다. 온라인에서 다시 열어 주세요.</p> : null}
    {pwa.updateReady ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3 surface">
      <span role="status">업데이트 준비됨{isPlaying ? " · 연습을 마친 뒤 적용할 수 있어요." : ""}</span>
      <button type="button" disabled={applying || (isPlaying && !onStop)} className="touch-target inline-flex items-center gap-2 rounded-xl px-3 surface-2 disabled:opacity-50" onClick={async () => {
        setApplying(true);
        try {
          if (isPlaying) await onStop?.();
          await onBeforeUpdate?.();
          applyPwaUpdate();
        } catch {
          setApplying(false);
          setError("업데이트를 적용하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      }}><RefreshCw size={16} aria-hidden="true" />{applying ? "적용 중…" : isPlaying ? "정지 후 업데이트 적용" : "업데이트 적용"}</button>
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
