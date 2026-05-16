import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { AUDIO_ROLES, AUDIO_ROLE_LABEL, type AudioRole } from "@/lib/audio-resolve";
import { usePlayerStore } from "@/stores/player";
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
  const currentRole = usePlayerStore((s) => s.currentRole);
  const [availableRoles, setAvailableRoles] = useState<Set<AudioRole>>(new Set());

  useEffect(() => {
    if (currentTrackId == null) {
      setAvailableRoles(new Set());
      return;
    }
    let cancelled = false;
    assetsApi.listForTrack(currentTrackId).then((list) => {
      if (cancelled) return;
      const set = new Set<AudioRole>();
      for (const a of list) {
        if (a.missing) continue;
        if ((AUDIO_ROLES as readonly string[]).includes(a.role)) set.add(a.role as AudioRole);
      }
      setAvailableRoles(set);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrackId]);

  const label = currentRole ? AUDIO_ROLE_LABEL[currentRole] : "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={currentTrackId == null}
          className="gap-1"
        >
          <span className="text-xs">{label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {AUDIO_ROLES.map((role) => (
          <DropdownMenuItem
            key={role}
            disabled={!availableRoles.has(role)}
            onClick={() => usePlayerStore.getState().setPreferredRole(role)}
          >
            {AUDIO_ROLE_LABEL[role]}
            {role === currentRole && <span className="ml-2 text-violet-400">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
