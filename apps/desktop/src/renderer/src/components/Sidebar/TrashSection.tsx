import React from "react";
import { Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useTrashStore } from "@/stores/trash";

export function TrashSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const trashCount = useTrashStore((s) => s.list.length);

  return (
    <button
      type="button"
      data-trash-link
      onClick={() => navigate("/trash")}
      className={[
        "w-full px-3 py-1.5 text-left text-[15px] rounded-md flex items-center gap-2",
        location.pathname === "/trash"
          ? "bg-bg-row-active text-accent"
          : "text-text-primary hover:bg-bg-row-hover",
      ].join(" ")}
    >
      <Trash2 size={14} />
      <span className="flex-1">Trash</span>
      {trashCount > 0 && <span className="text-[10px] text-text-tertiary">{trashCount}</span>}
    </button>
  );
}
