import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  error: Error;
  onRetry: () => void;
}

export function ApiErrorState({ error, onRetry }: Props): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="h-screen bg-bg-base text-text-primary flex items-center justify-center">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle size={48} className="text-danger mx-auto" />
        <h1 className="text-2xl font-bold">{t("errors.backendUnreachable")}</h1>
        <p className="text-text-secondary text-sm">
          {t("errors.backendUnreachableDesc")}
        </p>
        <pre className="text-xs text-text-tertiary bg-bg-elevated rounded-md p-2 text-left overflow-auto max-h-32">
          {error.message}
        </pre>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium btn-primary"
        >
          <RotateCcw size={14} /> {t("errors.retry")}
        </button>
      </div>
    </div>
  );
}
