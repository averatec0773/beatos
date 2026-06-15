import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { availableVariants, type AudioVariant } from "@/lib/audio-resolve";
import { usePlayerStore } from "@/stores/player";
import { useAssetStore } from "@/stores/assets";
import { assets as assetsApi } from "@/api/assets";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";

export function RoleSwitcher() {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  // currentRole is the playing variant key (role:format) now.
  const currentKey = usePlayerStore((s) => s.currentRole);
  // Re-fetch available variants when the track's assets change out-of-band (an
  // MCP attach approval, or a manual attach to the already-playing track) — not
  // just when the playing track id changes. See useAssetStore.version.
  const assetsVersion = useAssetStore((s) => s.version);
  const [variants, setVariants] = useState<AudioVariant[]>([]);

  useEffect(() => {
    if (currentTrackId == null) {
      setVariants([]);
      return;
    }
    let cancelled = false;
    assetsApi.listForTrack(currentTrackId).then((list) => {
      if (cancelled) return;
      setVariants(availableVariants(list));
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrackId, assetsVersion]);

  const current = variants.find((v) => v.key === currentKey);
  const label = current ? current.label : "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={currentTrackId == null} className="gap-1">
          <span className="text-xs">{label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {variants.length === 0 ? (
          <DropdownMenuItem disabled>—</DropdownMenuItem>
        ) : (
          variants.map((v) => (
            <DropdownMenuItem
              key={v.key}
              onClick={() => usePlayerStore.getState().setPreferredRole(v.key)}
            >
              {v.label}
              {v.key === currentKey && <span className="ml-2 text-accent">✓</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
