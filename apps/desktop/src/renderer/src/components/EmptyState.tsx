import React from "react";
import { Plus, X } from "lucide-react";

type Variant =
  | { variant: "no-tracks"; onAddTrack: () => void }
  | { variant: "empty-list"; listName: string }
  | { variant: "no-search-results"; query: string; onClear: () => void };

type Props = Variant;

export function EmptyState(props: Props): React.JSX.Element {
  if (props.variant === "no-tracks") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-text-primary">No tracks yet</h2>
          <p className="mt-2 text-text-secondary text-sm">Add your first track to get started.</p>
          <button
            onClick={props.onAddTrack}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-white font-medium hover:opacity-90"
          >
            <Plus size={14} /> Add Track
          </button>
        </div>
      </div>
    );
  }
  if (props.variant === "empty-list") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-text-primary">
            List &ldquo;{props.listName}&rdquo; is empty
          </h2>
          <p className="mt-2 text-text-secondary text-sm">
            Drag tracks from All Beats to add them here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold text-text-primary">
          No tracks match &ldquo;{props.query}&rdquo;
        </h2>
        <p className="mt-2 text-text-secondary text-sm">Try a shorter or different search.</p>
        <button
          onClick={props.onClear}
          className="mt-4 inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary"
        >
          <X size={12} /> Clear search
        </button>
      </div>
    </div>
  );
}
