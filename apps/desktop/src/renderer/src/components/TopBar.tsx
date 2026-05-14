import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function TopBar(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <header
      className="h-12 flex items-center bg-bg-base border-b border-border-subtle px-3 select-none"
      style={{ paddingLeft: "84px" }}
    >
      <button
        onClick={() => navigate(-1)}
        className="w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-row-hover"
        aria-label="Back"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => navigate(1)}
        className="ml-1 w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-row-hover"
        aria-label="Forward"
      >
        <ChevronRight size={16} />
      </button>
      <div className="flex-1" />
      <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        BeatOS v0.0.2
      </div>
    </header>
  );
}
