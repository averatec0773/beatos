import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { producers as producersApi } from "@/api/producers";
import {
  addKnownProducer,
  loadAllProducerNames,
  loadPrimaryProducer,
  removeKnownProducer,
  savePrimaryProducer,
} from "@/lib/known-producers";
import { useToastStore } from "@/stores/toast";
import { useTrackStore } from "@/stores/tracks";

/**
 * Producer-name manager. Renders the union of (producers attached to tracks)
 * ∪ (Settings-only "known producers") as a chip cluster:
 *   - Used-on-tracks chips wear `bg-accent/20`, same as TrackEditor.
 *   - Known-only orphan chips wear a dashed outline so the user can tell
 *     "this name has no tracks yet" at a glance.
 *   - "+ Add producer..." opens an inline input at the end of the cluster.
 *
 * Removal semantics:
 *   - Orphan (Settings-only): just unlinks from the known_producers list.
 *   - On-tracks: calls producers.rewrite([name], null) which deletes the
 *     entry from every track's producer array (existing v0.0.25.1 path).
 *     Also unlinks from known_producers if both lists held the name.
 */
export function ProducersSection(): React.JSX.Element {
  const { t } = useTranslation();
  const [used, setUsed] = useState<string[]>([]);
  const [knownOnly, setKnownOnly] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trackRefresh = useTrackStore((s) => s.refresh);

  const refresh = useCallback(async () => {
    const { used: u, knownOnly: k } = await loadAllProducerNames();
    setUsed(u);
    setKnownOnly(k);
    setPrimary(await loadPrimaryProducer());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!adding) return;
    // Defer one paint so the input is in the DOM before we try to focus.
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [adding]);

  async function onRemove(name: string, isOrphan: boolean): Promise<void> {
    const suffix = isOrphan ? "" : t("producers.removeSuffixEveryTrack");
    if (!confirm(t("producers.removeConfirm", { name, suffix }))) return;
    setBusy(name);
    try {
      if (!isOrphan) {
        await producersApi.rewrite([name], null);
        await trackRefresh();
      }
      await removeKnownProducer(name);
      if (primary === name) {
        await savePrimaryProducer("");
      }
      await refresh();
    } catch (e) {
      useToastStore
        .getState()
        .show(
          "error",
          t("producers.removeFailed", { name, error: e instanceof Error ? e.message : String(e) }),
        );
    } finally {
      setBusy(null);
    }
  }

  async function onTogglePrimary(name: string): Promise<void> {
    const next = primary === name ? "" : name;
    setPrimary(next); // optimistic
    try {
      await savePrimaryProducer(next);
    } catch (e) {
      useToastStore
        .getState()
        .show(
          "error",
          t("producers.setPrimaryFailed", {
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      await refresh();
    }
  }

  async function commitAdd(): Promise<void> {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft("");
      return;
    }
    if ([...used, ...knownOnly].includes(name)) {
      useToastStore.getState().show("warning", t("producers.exists", { name }));
      inputRef.current?.focus();
      return;
    }
    try {
      await addKnownProducer(name);
      setDraft("");
      setAdding(false);
      await refresh();
    } catch (e) {
      useToastStore
        .getState()
        .show(
          "error",
          t("producers.addFailed", { error: e instanceof Error ? e.message : String(e) }),
        );
    }
  }

  function cancelAdd(): void {
    setAdding(false);
    setDraft("");
  }

  function onAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAdd();
    }
  }

  const allEmpty = used.length === 0 && knownOnly.length === 0;

  // prod token used in the starHint — shows the placeholder literally
  const prod = "{prod}";

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{t("producers.title")}</h2>
      </div>
      {!loaded ? (
        <div className="text-text-tertiary text-sm">{t("common.loading")}</div>
      ) : (
        <div className="rounded-md border border-border-subtle p-3">
          {allEmpty && !adding ? (
            <p className="text-xs text-text-tertiary py-1">{t("producers.empty")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {used.map((name) => (
                <ProducerChip
                  key={`used-${name}`}
                  name={name}
                  variant="used"
                  busy={busy === name}
                  isPrimary={primary === name}
                  onRemove={() => void onRemove(name, false)}
                  onTogglePrimary={() => void onTogglePrimary(name)}
                />
              ))}
              {knownOnly.map((name) => (
                <ProducerChip
                  key={`known-${name}`}
                  name={name}
                  variant="known"
                  busy={busy === name}
                  isPrimary={primary === name}
                  onRemove={() => void onRemove(name, true)}
                  onTogglePrimary={() => void onTogglePrimary(name)}
                />
              ))}
              {adding ? (
                <div className="inline-flex h-7 items-center gap-1 rounded-full border border-accent bg-bg-base px-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onAddKeyDown}
                    onBlur={() => void commitAdd()}
                    placeholder={t("producers.namePlaceholder")}
                    className="bg-transparent text-sm leading-none placeholder:text-text-tertiary focus:outline-none w-32"
                    aria-label={t("producers.newNameAria")}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-border-subtle px-3 text-sm leading-none text-text-tertiary hover:bg-bg-elevated hover:text-text-primary focus:outline-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("producers.add")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-text-tertiary">
        {t("producers.legend")} {t("producers.starHint", { prod })}
      </p>
    </section>
  );
}

interface ProducerChipProps {
  name: string;
  variant: "used" | "known";
  busy: boolean;
  isPrimary: boolean;
  onRemove: () => void;
  onTogglePrimary: () => void;
}

function ProducerChip({
  name,
  variant,
  busy,
  isPrimary,
  onRemove,
  onTogglePrimary,
}: ProducerChipProps): React.JSX.Element {
  const { t } = useTranslation();
  const baseStyle =
    variant === "used"
      ? "bg-accent/20 text-text-primary"
      : "border border-dashed border-border-subtle text-text-secondary";
  return (
    <span
      data-testid="producer-chip"
      data-producer-name={name}
      data-variant={variant}
      data-primary={isPrimary ? "1" : undefined}
      className={`group inline-flex h-7 items-center gap-1 rounded-full px-3 text-sm leading-none font-medium ${baseStyle} ${busy ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onTogglePrimary}
        disabled={busy}
        className="rounded-full p-0.5 text-text-tertiary hover:text-amber-400 focus:outline-none disabled:opacity-50"
        aria-label={t(isPrimary ? "producers.setPrimaryAriaUnset" : "producers.setPrimaryAriaSet", { name })}
        title={t(isPrimary ? "producers.primaryTooltipSet" : "producers.primaryTooltipUnset")}
      >
        {isPrimary ? <span aria-hidden="true">★</span> : <Star className="h-3 w-3" />}
      </button>
      {name}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        className="rounded-full p-0.5 text-text-tertiary hover:bg-accent/30 hover:text-text-primary focus:outline-none disabled:opacity-50"
        aria-label={`Remove ${name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
