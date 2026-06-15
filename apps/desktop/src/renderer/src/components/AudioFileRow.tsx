import { useCallback, useRef, useState } from "react";
import { MoreHorizontal, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";
import { useAssetSlot } from "@/hooks/useAssetSlot";
import { useClickOutside } from "@/hooks/use-click-outside";
import { formatBytes } from "@/lib/format-bytes";
import { useToastStore } from "@/stores/toast";

interface Props {
  trackId: number;
  role: string;
  format: string;
  label: string;
  extensions: string[];
}

export function AudioFileRow({ trackId, role, format, label, extensions }: Props) {
  const { t } = useTranslation();
  const { asset, pickAndAttach, detach, relocate, reveal } = useAssetSlot(
    trackId,
    role,
    format,
    label,
    extensions,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    containerRef,
    useCallback(() => setMenuOpen(false), []),
    menuOpen,
  );

  const filename = asset ? (asset.abs_path.split("/").pop() ?? asset.abs_path) : null;

  function extensionAccepted(name: string): boolean {
    const lower = name.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    // Always preventDefault when over a drop zone — otherwise the drop event
    // never fires. types.includes("Files") was unreliable on first dragover
    // frame (caused silent rejection in v0.0.13.1).
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (platform.kind === "electron" && !dragOver) setDragOver(true);
  }
  function handleDragLeave(): void {
    setDragOver(false);
  }
  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (platform.kind === "web") return;
    const file = e.dataTransfer.files[0];
    if (!file) {
      console.warn("[file-row drop] dataTransfer.files is empty");
      return;
    }
    if (!extensionAccepted(file.name)) {
      useToastStore
        .getState()
        .show(
          "error",
          t("fileRows.dropWrongType", { label, exts: extensions.join(", "), name: file.name }),
        );
      return;
    }
    let absPath: string;
    try {
      absPath = platform.getPathForFile(file);
    } catch (err) {
      console.warn("[file-row drop] getPathForFile threw", err);
      useToastStore.getState().show("error", t("fileRows.getPathFailed"));
      return;
    }
    if (!absPath) {
      console.warn("[file-row drop] getPathForFile returned empty");
      useToastStore.getState().show("error", t("fileRows.emptyPath"));
      return;
    }
    await pickAndAttach(asset != null, absPath);
  }

  if (asset && asset.missing) {
    return (
      <div
        data-role={role}
        data-file-row
        className="group flex items-center gap-3 px-3 py-2 rounded-md border border-danger/40 bg-danger/5"
      >
        <span className="w-[140px] shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          {label}
        </span>
        <AlertTriangle size={14} className="text-danger" />
        <span className="flex-1 text-sm text-danger truncate">{t("fileRows.missing")}</span>
        <button
          type="button"
          onClick={relocate}
          className="text-xs text-danger underline hover:no-underline inline-flex items-center gap-1"
        >
          <RefreshCw size={10} /> {t("fileRows.findFile")}
        </button>
      </div>
    );
  }

  if (!asset) {
    return (
      <div
        data-role={role}
        data-file-row
        data-empty="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-3 px-3 py-2 rounded-md border border-dashed transition-colors ${
          dragOver ? "border-accent bg-accent/10" : "border-border-subtle"
        }`}
      >
        <span className="w-[140px] shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          {label}
        </span>
        <span className="text-text-tertiary text-sm">—</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => pickAndAttach(false)}
          className="text-sm text-accent hover:underline"
        >
          {t("fileRows.addFile")}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-role={role}
      data-file-row
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-md border bg-bg-elevated transition-colors ${
        dragOver ? "border-accent" : "border-border-subtle"
      }`}
    >
      <span className="w-[140px] shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        {label}
      </span>
      <span className="flex-1 text-sm text-text-primary truncate" title={asset.abs_path}>
        {filename}
      </span>
      <span className="w-20 text-right text-xs font-mono text-text-secondary">
        {formatBytes(asset.size_bytes)}
      </span>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg-row-hover text-text-secondary opacity-0 group-hover:opacity-100"
        aria-label={`${label} actions`}
      >
        <MoreHorizontal size={14} />
      </button>
      {menuOpen && (
        <div
          className="absolute right-2 top-10 bg-bg-elevated border border-border-subtle rounded-md shadow-lg text-sm z-10 w-44"
          onClick={() => setMenuOpen(false)}
        >
          <button
            type="button"
            onClick={reveal}
            className="w-full text-left px-3 py-2 hover:bg-bg-row-hover"
          >
            {t("fileRows.revealInFinder")}
          </button>
          <button
            type="button"
            onClick={() => pickAndAttach(true)}
            className="w-full text-left px-3 py-2 hover:bg-bg-row-hover"
          >
            {t("fileRows.replaceFile")}
          </button>
          <button
            type="button"
            onClick={detach}
            className="w-full text-left px-3 py-2 text-danger hover:bg-bg-row-hover"
          >
            {t("fileRows.detach")}
          </button>
        </div>
      )}
    </div>
  );
}
