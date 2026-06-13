import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ title, isOpen, onClose, children }: BottomSheetProps) {
  const startYRef = useRef<number | null>(null);
  const deltaYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="presentation">
      <button className="absolute inset-0 bg-black/45" type="button" aria-label="시트 닫기" onClick={onClose} />
      <section
        className="surface relative z-10 flex max-h-[74dvh] w-full max-w-[720px] flex-col rounded-t-[28px] px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-2 shadow-glow"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => {
          startYRef.current = event.clientY;
          deltaYRef.current = 0;
        }}
        onPointerMove={(event) => {
          if (startYRef.current === null) return;
          deltaYRef.current = event.clientY - startYRef.current;
        }}
        onPointerUp={() => {
          if (deltaYRef.current > 80) onClose();
          startYRef.current = null;
          deltaYRef.current = 0;
        }}
      >
        <div className="mx-auto my-2 h-1.5 w-12 rounded-full bg-[color:var(--subtle)]" aria-hidden="true" />
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="touch-target rounded-full surface-2 p-2" type="button" aria-label={`${title} 닫기`} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto pb-2 pr-1">{children}</div>
      </section>
    </div>
  );
}
