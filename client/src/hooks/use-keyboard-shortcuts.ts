import { useEffect } from "react";

interface ShortcutHandlers {
  onOpenAddBill?: () => void;
  onFocusSearch?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.closest('[role="dialog"]') !== null
  );
}

export function useKeyboardShortcuts({ onOpenAddBill, onFocusSearch }: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onOpenAddBill?.();
      }

      if (e.key === "/") {
        e.preventDefault();
        onFocusSearch?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenAddBill, onFocusSearch]);
}
