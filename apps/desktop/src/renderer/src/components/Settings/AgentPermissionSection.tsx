import React from "react";
import { useTranslation } from "react-i18next";

import { type AgentPermissionMode, useAgentPermissionStore } from "@/stores/agent-permission";

export function AgentPermissionSection(): React.JSX.Element {
  const { t } = useTranslation();
  const mode = useAgentPermissionStore((s) => s.mode);
  const setMode = useAgentPermissionStore((s) => s.setMode);

  const options: { value: AgentPermissionMode; label: string; desc: string }[] = [
    {
      value: "enabled",
      label: t("settings.agentPermissions.enabled"),
      desc: t("settings.agentPermissions.enabledDesc"),
    },
    {
      value: "read_only",
      label: t("settings.agentPermissions.readOnly"),
      desc: t("settings.agentPermissions.readOnlyDesc"),
    },
  ];

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("settings.agentPermissions.title")}</h2>
      <p className="text-xs text-text-tertiary mb-3">{t("settings.agentPermissions.desc")}</p>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={mode === opt.value}
            onClick={() => void setMode(opt.value)}
            className={`text-left rounded-md px-3 py-2 text-sm border transition-colors ${
              mode === opt.value
                ? "border-accent/50 bg-accent/10 text-text-primary"
                : "border-border-subtle text-text-tertiary hover:text-text-secondary hover:border-border-subtle/80"
            }`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className="text-xs mt-0.5 text-text-tertiary">{opt.desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
