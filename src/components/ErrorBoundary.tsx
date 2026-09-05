import { Component, type ErrorInfo, type ReactNode } from "react";

/** Emergency contract shared with the transport: render failure must stop sound. */
export const EMERGENCY_STOP_EVENT = "pulse:emergency-stop";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    window.dispatchEvent(new Event(EMERGENCY_STOP_EVENT));
    console.error("Pulse 화면 복구", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold">Pulse 화면을 다시 열어주세요</h1>
      <p>화면을 표시하는 중 오류가 발생해 재생을 중단했습니다. 저장한 데이터는 지우지 않았습니다.</p>
      <button className="touch-target rounded-xl px-4 surface-2" onClick={() => location.reload()}>다시 열기</button>
    </main>;
  }
}
