import React from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, X } from "lucide-react";

import { useToastStore } from "@/stores/toast";

/**
 * Project-folder slot at the top of the editor's Files section. Points at the
 * beat's DAW project directory (FL Studio / Ableton / Logic). The path is a
 * plain `track.project_path` string saved like any other metadata field; this
 * row only picks it (folder dialog) and opens it (Finder via shell.openPath).
 * Local-only — never published to a platform.
 */
export function ProjectFolderRow({
  projectPath,
  onChange,
}: {
  projectPath: string | null;
  onChange: (path: string | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);

  const pick = async (): Promise<void> => {
    const picked = await window.beatos.pickFolder();
    if (picked) onChange(picked);
  };

  const open = async (): Promise<void> => {
    if (!projectPath) return;
    const err = await window.beatos.openPath(projectPath);
    if (err) showToast("error", t("projectFolder.openFailed", { error: err }));
  };

  if (!projectPath) {
    return (
      <div
        data-project-folder
        data-empty="true"
        className="flex items-center gap-3 px-3 py-2 rounded-md border border-dashed border-border-subtle"
      >
        <span className="w-[140px] shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          {t("projectFolder.label")}
        </span>
        <span className="text-text-tertiary text-sm">—</span>
        <div className="flex-1" />
        <button type="button" onClick={pick} className="text-sm text-accent hover:underline">
          {t("projectFolder.choose")}
        </button>
      </div>
    );
  }

  return (
    <div
      data-project-folder
      className="group flex items-center gap-3 px-3 py-2 rounded-md border border-border-subtle bg-bg-elevated"
    >
      <span className="w-[140px] shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        {t("projectFolder.label")}
      </span>
      <button
        type="button"
        onClick={open}
        title={t("projectFolder.openTitle", { path: projectPath })}
        className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm text-text-primary hover:text-accent"
      >
        <FolderOpen size={14} className="shrink-0 text-text-secondary group-hover:text-accent" />
        <span className="truncate font-mono">{projectPath}</span>
      </button>
      <button
        type="button"
        onClick={pick}
        className="shrink-0 text-xs text-text-secondary hover:text-text-primary hover:underline"
      >
        {t("projectFolder.change")}
      </button>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label={t("projectFolder.clearAria")}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-bg-row-hover text-text-secondary opacity-0 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
