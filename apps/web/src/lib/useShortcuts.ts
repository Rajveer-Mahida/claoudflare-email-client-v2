import { useEffect, useRef } from "react";

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

type Handlers = Record<string, (e: KeyboardEvent) => void>;

/**
 * Bind single-key and "g+key" chord shortcuts. Keys typed inside inputs are ignored
 * (except Escape). Chords: register as "g i", "g s", etc.
 */
export function useShortcuts(handlers: Handlers, enabled = true) {
  const pending = useRef<string | null>(null);
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const h = ref.current;
      if (e.key === "Escape" && h["Escape"]) {
        h["Escape"](e);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (pending.current === "g") {
        const combo = `g ${e.key.toLowerCase()}`;
        pending.current = null;
        if (h[combo]) {
          e.preventDefault();
          h[combo](e);
          return;
        }
      }
      if (e.key === "g") {
        pending.current = "g";
        setTimeout(() => (pending.current = null), 700);
        return;
      }
      const fn = h[e.key] ?? h[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
