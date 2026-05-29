import React from "react";
import { Music } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useTrackStore } from "@/stores/tracks";

export function AllBeatsSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const count = useTrackStore((s) => s.total);
  const active = location.pathname === "/";

  return (
    <button
      type="button"
      data-all-beats-link
      onClick={() => navigate("/")}
      className={[
        "w-full px-3 py-1.5 text-left text-[15px] rounded-md flex items-center gap-2",
        active ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
      ].join(" ")}
    >
      <Music size={14} />
      <span className="flex-1">All Beats</span>
      {count != null && count > 0 && (
        <span className="text-[10px] text-text-tertiary">{count}</span>
      )}
    </button>
  );
}
