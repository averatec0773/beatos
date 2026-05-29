import React from "react";
import { Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export function SettingsSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === "/settings";

  return (
    <button
      type="button"
      data-settings-link
      onClick={() => {
        if (active) navigate(-1);
        else navigate("/settings");
      }}
      aria-pressed={active}
      className={[
        "w-full px-3 py-1.5 text-left text-[15px] rounded-md flex items-center gap-2",
        active ? "bg-bg-row-active text-accent" : "text-text-primary hover:bg-bg-row-hover",
      ].join(" ")}
    >
      <Settings size={14} />
      <span className="flex-1">Settings</span>
    </button>
  );
}
