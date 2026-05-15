import React from "react";
import { AssetSlot } from "./AssetSlot";

type RoleSpec = {
  role: string;
  label: string;
  extensions: string[];
};

const SLOTS: RoleSpec[] = [
  { role: "cover", label: "Cover", extensions: [".jpg", ".jpeg", ".png", ".webp"] },
  { role: "stems", label: "Stems", extensions: [".zip", ".rar", ".7z"] },
  { role: "audio_tagged_mp3", label: "Tagged MP3", extensions: [".mp3"] },
  { role: "audio_untagged_mp3", label: "Untagged MP3", extensions: [".mp3"] },
  { role: "audio_tagged_wav", label: "Tagged WAV", extensions: [".wav"] },
  { role: "audio_untagged_wav", label: "Untagged WAV", extensions: [".wav"] },
];

export function FilesSection({ trackId }: { trackId: number }): React.JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        Files
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map((spec) => (
          <AssetSlot
            key={spec.role}
            trackId={trackId}
            role={spec.role}
            label={spec.label}
            extensions={spec.extensions}
          />
        ))}
      </div>
    </section>
  );
}
