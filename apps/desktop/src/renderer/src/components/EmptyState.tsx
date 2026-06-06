import React from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type Variant =
  | { variant: "no-tracks"; onAddTrack: () => void }
  | { variant: "empty-list"; listName: string }
  | { variant: "no-search-results"; query: string; onClear: () => void };

type Props = Variant;

export function EmptyState(props: Props): React.JSX.Element {
  const { t } = useTranslation();
  if (props.variant === "no-tracks") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-text-primary">{t("emptyState.noTracks")}</h2>
          <p className="mt-2 text-text-secondary text-sm">{t("emptyState.noTracksDesc")}</p>
          <button
            onClick={props.onAddTrack}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium btn-primary"
          >
            <Plus size={14} /> {t("emptyState.addTrack")}
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
            {t("emptyState.emptyList", { name: props.listName })}
          </h2>
          <p className="mt-2 text-text-secondary text-sm">{t("emptyState.emptyListDesc")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("emptyState.noResults", { query: props.query })}
        </h2>
        <p className="mt-2 text-text-secondary text-sm">{t("emptyState.noResultsDesc")}</p>
        <button
          onClick={props.onClear}
          className="mt-4 inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary"
        >
          <X size={12} /> {t("emptyState.clearSearch")}
        </button>
      </div>
    </div>
  );
}
