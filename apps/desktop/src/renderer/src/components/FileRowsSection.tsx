import { useTranslation } from "react-i18next";

import { AudioFileRow } from "./AudioFileRow";
import { ProjectFolderRow } from "./ProjectFolderRow";

// Slot identity is (role, format) now that audio format is decoupled from role.
// Each audio format is its own row (same one-file-per-slot UI as before).
const ROWS = [
  { role: "audio_tagged", format: "wav", label: "WAV (tagged)", extensions: [".wav"] },
  { role: "audio_untagged", format: "wav", label: "WAV (untagged)", extensions: [".wav"] },
  { role: "audio_tagged", format: "mp3", label: "MP3 (tagged)", extensions: [".mp3"] },
  { role: "audio_untagged", format: "mp3", label: "MP3 (untagged)", extensions: [".mp3"] },
  { role: "audio_tagged", format: "flac", label: "FLAC (tagged)", extensions: [".flac"] },
  { role: "audio_untagged", format: "flac", label: "FLAC (untagged)", extensions: [".flac"] },
  { role: "loop", format: "", label: "Loop", extensions: [".wav", ".mp3"] },
  { role: "stems", format: "", label: "Stems", extensions: [".zip", ".rar", ".7z"] },
] as const;

// Promo videos for publishing to video platforms (Douyin/WeChat Video/Bilibili…). Fixed aspect
// slots reuse the one-asset-per-role model — same AudioFileRow slot, video exts.
const PROMO_VIDEO_ROWS = [
  { role: "promo_video_vertical", format: "", label: "Promo 9:16", extensions: [".mp4", ".mov", ".webm"] },
  { role: "promo_video_landscape", format: "", label: "Promo 16:9", extensions: [".mp4", ".mov", ".webm"] },
  { role: "promo_video_square", format: "", label: "Promo 1:1", extensions: [".mp4", ".mov", ".webm"] },
] as const;

export function FileRowsSection({
  trackId,
  projectPath,
  onChangeProjectPath,
}: {
  trackId: number;
  projectPath: string | null;
  onChangeProjectPath: (path: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        {t("fileRows.files")}
      </h3>
      <div className="flex flex-col gap-1.5">
        <ProjectFolderRow projectPath={projectPath} onChange={onChangeProjectPath} />
        {ROWS.map((r) => (
          <AudioFileRow
            key={`${r.role}:${r.format}`}
            trackId={trackId}
            role={r.role}
            format={r.format}
            label={r.label}
            extensions={[...r.extensions]}
          />
        ))}
      </div>
      <h3 className="pt-2 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        {t("fileRows.promoVideos")}
      </h3>
      <div className="flex flex-col gap-1.5">
        {PROMO_VIDEO_ROWS.map((r) => (
          <AudioFileRow
            key={r.role}
            trackId={trackId}
            role={r.role}
            format={r.format}
            label={r.label}
            extensions={[...r.extensions]}
          />
        ))}
      </div>
    </section>
  );
}
