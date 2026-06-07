import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { type AgentPermissionMode, useAgentPermissionStore } from "@/stores/agent-permission";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function AgentPermissionSection(): React.JSX.Element {
  const { t } = useTranslation();
  const mode = useAgentPermissionStore((s) => s.mode);
  const setMode = useAgentPermissionStore((s) => s.setMode);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const options: { value: AgentPermissionMode; label: string; desc: string }[] = [
    {
      value: "confirm",
      label: t("settings.agentPermissions.confirm"),
      desc: t("settings.agentPermissions.confirmDesc"),
    },
    {
      value: "auto_approve",
      label: t("settings.agentPermissions.autoApprove"),
      desc: t("settings.agentPermissions.autoApproveDesc"),
    },
    {
      value: "read_only",
      label: t("settings.agentPermissions.readOnly"),
      desc: t("settings.agentPermissions.readOnlyDesc"),
    },
  ];

  function handleSelect(value: AgentPermissionMode): void {
    if (value === mode) return;
    if (value === "auto_approve") {
      setConfirmOpen(true);
      return;
    }
    void setMode(value);
  }

  function handleConfirm(): void {
    setConfirmOpen(false);
    void setMode("auto_approve");
  }

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
            onClick={() => handleSelect(opt.value)}
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.agentPermissions.autoApproveDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.agentPermissions.autoApproveDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm hover:bg-bg-row-hover"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-md bg-warning/20 border border-warning/40 px-3 py-1.5 text-sm text-warning hover:bg-warning/30"
            >
              {t("settings.agentPermissions.autoApproveDialogContinue")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
