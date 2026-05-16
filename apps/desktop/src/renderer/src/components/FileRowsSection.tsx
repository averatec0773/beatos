import { AudioFileRow } from "./AudioFileRow";

const ROWS = [
  { role: "audio_tagged_wav", label: "WAV (tagged)", extensions: [".wav"] },
  { role: "audio_untagged_wav", label: "WAV (untagged)", extensions: [".wav"] },
  { role: "audio_tagged_mp3", label: "MP3 (tagged)", extensions: [".mp3"] },
  { role: "audio_untagged_mp3", label: "MP3 (untagged)", extensions: [".mp3"] },
  { role: "stems", label: "Stems", extensions: [".zip", ".rar", ".7z"] },
] as const;

export function FileRowsSection({ trackId }: { trackId: number }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        Files
      </h3>
      <div className="flex flex-col gap-1.5">
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
    </section>
  );
}
