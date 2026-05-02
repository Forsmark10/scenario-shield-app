import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export interface ShortcutHandlers {
  onSaveSnapshot?: () => void;
  onOpenSearch?: () => void;
  onShowHelp?: () => void;
}

export const SHORTCUTS = [
  { keys: "⌘/Ctrl + 1", desc: "Dashboard" },
  { keys: "⌘/Ctrl + 2", desc: "Scenario" },
  { keys: "⌘/Ctrl + 3", desc: "Assumptions" },
  { keys: "⌘/Ctrl + 4", desc: "Scenario Comparison" },
  { keys: "⌘/Ctrl + 5", desc: "Om modellen" },
  { keys: "⌘/Ctrl + S", desc: "Lagre snapshot" },
  { keys: "⌘/Ctrl + K", desc: "Åpne søk" },
  { keys: "?", desc: "Vis hurtigtaster" },
];

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      if (mod) {
        const map: Record<string, string> = {
          "1": "/",
          "2": "/comparison",
          "3": "/assumptions",
          "4": "/om-modellen",
        };
        if (map[e.key]) {
          e.preventDefault();
          navigate(map[e.key]);
          return;
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          handlers.onSaveSnapshot?.();
          return;
        }
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          handlers.onOpenSearch?.();
          return;
        }
      }

      if (!isTyping && e.key === "?" && !mod) {
        e.preventDefault();
        handlers.onShowHelp?.();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, handlers]);
}
