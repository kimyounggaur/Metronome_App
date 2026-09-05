import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  title: string; isOpen: boolean; onClose: () => void; children: ReactNode; onStop?: () => void;
}
export function BottomSheet({ title, isOpen, onClose, children, onStop }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const startYRef = useRef<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    titleRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      startYRef.current = null;
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLButtonElement>('button[aria-label="메뉴"],button[aria-label="재생"]')?.focus();
    };
  }, [isOpen]);
  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-modal="true"
    className="pulse-dialog surface fixed inset-x-0 bottom-0 top-auto m-auto w-full max-w-[720px] rounded-t-[28px] p-4 shadow-glow"
    onCancel={event => { event.preventDefault(); closeRef.current(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeRef.current();
    }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(item => item.getClientRects().length > 0);
      const first=items[0], last=items.at(-1);
      if (!first) { event.preventDefault(); titleRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    {isOpen ? <>
      <div className="mx-auto flex h-7 w-24 touch-none items-center justify-center" aria-hidden="true"
        onPointerDown={event => { startYRef.current=event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => {
          const start=startYRef.current; startYRef.current=null;
          if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if(start !== null && event.clientY-start > 80) closeRef.current();
        }}
        onPointerCancel={() => { startYRef.current=null; }}
        onLostPointerCapture={() => { startYRef.current=null; }}>
        <span className="h-1.5 w-12 rounded-full bg-[color:var(--subtle)]" />
      </div>
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-lg font-bold outline-none">{title}</h2>
        <div className="flex gap-2">
          {onStop ? <button className="touch-target rounded-full px-4 surface-2" onClick={onStop}>재생 정지</button> : null}
          <button className="touch-target rounded-full p-2 surface-2" type="button" aria-label={title + " 닫기"} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain pb-3 pr-1">{children}</div>
    </> : null}
  </dialog>;
}

