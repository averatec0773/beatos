import { AudioFileRow } from "./AudioFileRow";
import { ProjectFolderRow } from "./ProjectFolderRow";

const ROWS = [
  { role: "audio_tagged_wav", label: "WAV (tagged)", extensions: [".wav"] },
  { role: "audio_untagged_wav", label: "WAV (untagged)", extensions: [".wav"] },
  { role: "audio_tagged_mp3", label: "MP3 (tagged)", extensions: [".mp3"] },
  { role: "audio_untagged_mp3", label: "MP3 (untagged)", extensions: [".mp3"] },
  { role: "loop", label: "Loop", extensions: [".wav", ".mp3"] },
  { role: "stems", label: "Stems", extensions: [".zip", ".rar", ".7z"] },
] as const;

// Promo videos for publishing to video platforms (抖音/视频号/B站…). Fixed aspect
// slots reuse the one-asset-per-role model — same AudioFileRow slot, video exts.
const PROMO_VIDEO_ROWS = [
  { role: "promo_video_vertical", label: "Promo 9:16", extensions: [".mp4", ".mov", ".webm"] },
  { role: "promo_video_landscape", label: "Promo 16:9", extensions: [".mp4", ".mov", ".webm"] },
  { role: "promo_video_square", label: "Promo 1:1", extensions: [".mp4", ".mov", ".webm"] },
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
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        Files
      </h3>
      <div className="flex flex-col gap-1.5">
        <ProjectFolderRow projectPath={projectPath} onChange={onChangeProjectPath} />
        {ROWS.map((r) => (
          <AudioFileRow
            key={r.role}
            trackId={trackId}
            role={r.role}
            label={r.label}
            extensions={[...r.extensions]}
          />
        ))}
      </div>
      <h3 className="pt-2 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        Promo videos
      </h3>
      <div className="flex flex-col gap-1.5">
        {PROMO_VIDEO_ROWS.map((r) => (
          <AudioFileRow
            key={r.role}
            trackId={trackId}
            role={r.role}
            label={r.label}
            extensions={[...r.extensions]}
          />
        ))}
      </div>
    </section>
  );
}
