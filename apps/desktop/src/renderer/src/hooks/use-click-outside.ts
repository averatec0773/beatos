import { useEffect, type RefObject } from "react";

/**
 * Fires `onOutside` when a mousedown lands outside `ref`. No-op while
 * `enabled` is false so the listener isn't attached when the menu is closed.
 * Listens on mousedown (not click) so a drag-select that ends outside still
 * closes the popover before the click would otherwise fire.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: MouseEvent): void {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, enabled]);
}
