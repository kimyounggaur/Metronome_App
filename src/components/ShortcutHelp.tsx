import { Keyboard } from "lucide-react";

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-5">
      <section className="surface w-full max-w-md rounded-[28px] p-5" role="dialog" aria-modal="true" aria-label="키보드 단축키">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Keyboard size={18} aria-hidden="true" />
            단축키
          </h2>
          <button className="touch-target rounded-full surface-2" type="button" aria-label="단축키 닫기" onClick={onClose}>
            닫기
          </button>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="font-bold">Space</dt>
          <dd>재생 / 정지</dd>
          <dt className="font-bold">T</dt>
          <dd>탭 템포</dd>
          <dt className="font-bold">↑ / ↓</dt>
          <dd>BPM 1 증감</dd>
          <dt className="font-bold">Shift + ↑ / ↓</dt>
          <dd>BPM 5 증감</dd>
          <dt className="font-bold">Esc</dt>
          <dd>시트 닫기</dd>
        </dl>
      </section>
    </div>
  );
}
