import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { useAssetStore } from "@/stores/assets";
import { AudioFileRow } from "./AudioFileRow";
import { ProjectFolderRow } from "./ProjectFolderRow";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

type Row = { role: string; format: string; label: string; extensions: string[] };

// Default audio slots — the common case: WAV + MP3 (tagged/untagged), loop, stems.
const BASE_ROWS: Row[] = [
  { role: "audio_tagged", format: "wav", label: "WAV (tagged)", extensions: [".wav"] },
  { role: "audio_untagged", format: "wav", label: "WAV (untagged)", extensions: [".wav"] },
  { role: "audio_tagged", format: "mp3", label: "MP3 (tagged)", extensions: [".mp3"] },
  { role: "audio_untagged", format: "mp3", label: "MP3 (untagged)", extensions: [".mp3"] },
];
const LOOP_STEMS_ROWS: Row[] = [
  { role: "loop", format: "", label: "Loop", extensions: [".wav", ".mp3"] },
  { role: "stems", format: "", label: "Stems", extensions: [".zip", ".rar", ".7z"] },
];

// Extra audio formats — rare in practice, so they are NOT shown by default; the
// user adds a slot on demand via "+ Add format" (and an already-present file in
// such a format reveals its slots automatically). The data model fully supports
// these — adding one here is all it takes (mirror beatos_core SUPPORTED_AUDIO_FORMATS).
const EXTRA_FORMATS: { format: string; ext: string; label: string }[] = [
  { format: "flac", ext: ".flac", label: "FLAC" },
];

function extraRows(format: string, ext: string, label: string): Row[] {
  return [
    { role: "audio_tagged", format, label: `${label} (tagged)`, extensions: [ext] },
    { role: "audio_untagged", format, label: `${label} (untagged)`, extensions: [ext] },
  ];
}

// Promo videos for publishing to video platforms (Douyin/WeChat Video/Bilibili…). Fixed aspect
// slots reuse the one-asset-per-role model — same AudioFileRow slot, video exts.
const PROMO_VIDEO_ROWS: Row[] = [
  {
    role: "promo_video_vertical",
    format: "",
    label: "Promo 9:16",
    extensions: [".mp4", ".mov", ".webm"],
  },
  {
    role: "promo_video_landscape",
    format: "",
    label: "Promo 16:9",
    extensions: [".mp4", ".mov", ".webm"],
  },
  {
    role: "promo_video_square",
    format: "",
    label: "Promo 1:1",
    extensions: [".mp4", ".mov", ".webm"],
  },
];

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
  const assets = useAssetStore((s) => s.byTrack[trackId]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // An extra format is shown if the user added it, or the track already holds a
  // file in it (existing / MCP-attached FLAC stays visible without re-adding).
  const present = useMemo(() => {
    const s = new Set<string>();
    for (const a of assets ?? [])
      if (a.format && a.format !== "wav" && a.format !== "mp3") s.add(a.format);
    return s;
  }, [assets]);

  const audioRows = useMemo(() => {
    const shown = EXTRA_FORMATS.filter((f) => added.has(f.format) || present.has(f.format));
    return [
      ...BASE_ROWS,
      ...shown.flatMap((f) => extraRows(f.format, f.ext, f.label)),
      ...LOOP_STEMS_ROWS,
    ];
  }, [added, present]);

  const addable = EXTRA_FORMATS.filter((f) => !added.has(f.format) && !present.has(f.format));

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          {t("fileRows.files")}
        </h3>
        {addable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded border border-border-subtle px-2.5 py-1 text-xs hover:bg-bg-row-hover"
                data-add-format
              >
                <Plus size={12} />
                {t("fileRows.addFormat")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {addable.map((f) => (
                <DropdownMenuItem
                  key={f.format}
                  onClick={() => setAdded((prev) => new Set(prev).add(f.format))}
                >
                  {f.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="flex flex-col gap-1.5">
        <ProjectFolderRow projectPath={projectPath} onChange={onChangeProjectPath} />
        {audioRows.map((r) => (
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
