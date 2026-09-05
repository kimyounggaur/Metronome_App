import { useEffect } from "react";

interface ShortcutHandlers {
  onToggle: () => void;
  onTap: () => void;
  onNudge: (delta: number) => void;
  onCloseSheet: () => void;
  onHelp: () => void;
}

function hasNativeKeyBehavior(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, button, a[href], summary, dialog, [contenteditable]:not([contenteditable='false']), [role='button'], [role='link'], [role='slider'], [role='spinbutton'], [role='dialog']"));
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      // Native modal dialogs own Escape, focus movement and all keyboard activation.
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        handlers.onCloseSheet();
        return;
      }
      if (hasNativeKeyBehavior(event.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.code === "Space") {
        event.preventDefault();
        handlers.onToggle();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        handlers.onTap();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        handlers.onNudge((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 5 : 1));
      } else if (event.key === "?") {
        handlers.onHelp();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
