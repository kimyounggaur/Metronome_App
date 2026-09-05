import { BottomSheet } from "./BottomSheet";
interface ShortcutHelpProps { isOpen:boolean; onClose:()=>void; }
export function ShortcutHelp({isOpen,onClose}:ShortcutHelpProps) {
  return <BottomSheet title="키보드 단축키" isOpen={isOpen} onClose={onClose}>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
      <dt className="font-bold">Space</dt><dd>재생 / 정지</dd>
      <dt className="font-bold">T</dt><dd>탭 템포</dd>
      <dt className="font-bold">↑ / ↓</dt><dd>BPM 1 증감</dd>
      <dt className="font-bold">Shift + ↑ / ↓</dt><dd>BPM 5 증감</dd>
      <dt className="font-bold">Esc</dt><dd>열린 창 닫기 / 입력 취소</dd>
    </dl>
    <p className="mt-5 text-sm text-[color:var(--muted)]">입력칸·버튼·설정 창에서는 각 컨트롤의 기본 키보드 동작을 사용합니다.</p>
  </BottomSheet>;
}

