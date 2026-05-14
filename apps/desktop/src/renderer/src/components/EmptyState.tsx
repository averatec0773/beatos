import React from "react";
import { Plus } from "lucide-react";

interface Props {
  onAddTrack: () => void;
}

export function EmptyState({ onAddTrack }: Props): React.JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-2">
          All Beats
        </div>
        <div className="text-2xl font-semibold mb-6">Your library is empty</div>
        <button
          onClick={onAddTrack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-white font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Add Track
        </button>
      </div>
    </div>
  );
}
