import React from "react";

export function SidebarFooter(): React.JSX.Element {
  return (
    <div className="mt-auto px-3 pt-2 pb-1 text-[11px] text-text-tertiary">
      <button
        type="button"
        onClick={() => void window.beatos.openExternal("https://github.com/averatec0773")}
        className="hover:text-accent transition-colors"
        aria-label="Open developer GitHub profile in browser"
        title="Developer — open GitHub profile"
      >
        @averatec0773
      </button>
    </div>
  );
}
