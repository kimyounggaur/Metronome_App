import { useEffect } from "react";

interface ShortcutHandlers {
  onToggle: () => void;
  onTap: () => void;
  onNudge: (delta: number) => void;
  onCloseSheet: () => void;
  onHelp: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        if (event.key === "Escape") handlers.onCloseSheet();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        handlers.onToggle();
      }

      if (event.key.toLowerCase() === "t") {
        handlers.onTap();
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        handlers.onNudge(event.shiftKey ? 5 : 1);
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        handlers.onNudge(event.shiftKey ? -5 : -1);
      }

      if (event.key === "Escape") {
        handlers.onCloseSheet();
      }

      if (event.key === "?") {
        handlers.onHelp();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
