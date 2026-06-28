import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Palette, Languages, Library, Sparkles, Database, Info, Search, X } from "lucide-react";

import { platform } from "@/platform";
import { SETTINGS_SEARCH_KEYWORDS as KW } from "@/lib/settings-search";
import { useToastStore } from "@/stores/toast";
import { AgentPermissionSection } from "@/components/Settings/AgentPermissionSection";
import { AIAssistSection } from "@/components/Settings/AIAssistSection";
import { AIIntegrationSection } from "@/components/Settings/AIIntegrationSection";
import { AppearanceSection } from "@/components/Settings/AppearanceSection";
import { DefaultLicenseTiersSection } from "@/components/Settings/DefaultLicenseTiersSection";
import { LanguageSection } from "@/components/Settings/LanguageSection";
import { ProducersSection } from "@/components/Settings/ProducersSection";
import { UploadTemplatesSection } from "@/components/Settings/UploadTemplatesSection";
import { VocabLocaleSection } from "@/components/Settings/VocabLocaleSection";

function StorageSection({
  dbPath,
  onDbPathChange,
}: {
  dbPath: string;
  onDbPathChange: (newPath: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  async function onChange(): Promise<void> {
    const newFolder = await platform.openFolderDialog();
    if (!newFolder) return;
    const fullPath = `${newFolder}/global.db`;
    try {
      const r = await platform.setDbPath(fullPath);
      if (r.restartRequired) {
        useToastStore.getState().show("info", t("settings.storage.restartAlert"), 8000);
      }
      onDbPathChange(fullPath);
    } catch (e) {
      useToastStore
        .getState()
        .show(
          "error",
          t("settings.storage.updateFailed", { error: e instanceof Error ? e.message : String(e) }),
        );
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("settings.storage.title")}</h2>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
          {t("settings.storage.dbPath")}
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-bg-elevated rounded-md text-xs truncate border border-border-subtle">
            {dbPath || t("common.loading")}
          </code>
          <button
            type="button"
            onClick={onChange}
            className="px-3 py-2 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover"
          >
            {t("common.change")}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">{t("settings.storage.restartHint")}</p>
      </div>
    </section>
  );
}

function AboutSection(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-3">
        {t("settings.about.title")}
      </h2>
      <div className="text-sm text-text-secondary">{t("settings.about.madeBy")}</div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <div>
          <span className="text-text-secondary">{t("settings.about.website")}</span>
          <button
            type="button"
            onClick={() => void platform.openExternal("https://averatec.studio")}
            className="text-accent underline hover:no-underline"
            aria-label={t("settings.about.websiteAria")}
          >
            averatec.studio
          </button>
        </div>
        <div>
          <span className="text-text-secondary">{t("settings.about.repo")}</span>
          <button
            type="button"
            onClick={() => void platform.openExternal("https://github.com/averatec0773/beatos")}
            className="text-accent underline hover:no-underline"
            aria-label={t("settings.about.repoAria")}
          >
            github.com/averatec0773/beatos
          </button>
        </div>
      </div>
    </section>
  );
}

/** Category metadata (label + icon). Order here is the tab order. */
function useCategoryMeta(): { id: string; label: string; icon: React.ReactNode }[] {
  const { t } = useTranslation();
  return [
    { id: "appearance", label: t("settings.categories.appearance"), icon: <Palette size={14} /> },
    { id: "language", label: t("settings.categories.language"), icon: <Languages size={14} /> },
    { id: "catalog", label: t("settings.categories.catalog"), icon: <Library size={14} /> },
    { id: "ai", label: t("settings.categories.ai"), icon: <Sparkles size={14} /> },
    { id: "data", label: t("settings.categories.data"), icon: <Database size={14} /> },
    { id: "about", label: t("settings.categories.about"), icon: <Info size={14} /> },
  ];
}

export function SettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [dbPath, setDbPath] = useState<string>("");
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState<string>("");
  useEffect(() => {
    platform
      .getDbPath()
      .then(setDbPath)
      .catch(() => setDbPath(""));
    void platform.getRepoRoot().then(setRepoRoot);
  }, []);

  // Desktop-only: web DB path is fixed by the launch env, and AI provider/MCP
  // wiring targets the local Claude Desktop — so the AI + Data categories are
  // hidden in the browser build (their tabs simply don't appear).
  const isDesktop = platform.kind === "electron";

  const catMeta = useCategoryMeta();

  // Section-level registry: one entry per setting block. `keywords` is a flat
  // EN+ZH match string (search terms are data, exempt from i18n) so the search
  // box works in either language; the section's own heading shows on render.
  const entries: {
    id: string;
    cat: string;
    keywords: string;
    node: React.ReactNode;
    desktopOnly?: boolean;
  }[] = [
    { id: "appearance", cat: "appearance", keywords: KW.appearance, node: <AppearanceSection /> },
    { id: "language", cat: "language", keywords: KW.language, node: <LanguageSection /> },
    { id: "tagDisplay", cat: "language", keywords: KW.tagDisplay, node: <VocabLocaleSection /> },
    { id: "uploadTemplates", cat: "catalog", keywords: KW.uploadTemplates, node: <UploadTemplatesSection /> },
    { id: "licenseTiers", cat: "catalog", keywords: KW.licenseTiers, node: <DefaultLicenseTiersSection /> },
    { id: "producers", cat: "catalog", keywords: KW.producers, node: <ProducersSection /> },
    { id: "aiAssist", cat: "ai", desktopOnly: true, keywords: KW.aiAssist, node: <AIAssistSection /> },
    { id: "agentPermissions", cat: "ai", desktopOnly: true, keywords: KW.agentPermissions, node: <AgentPermissionSection /> },
    { id: "aiIntegration", cat: "ai", desktopOnly: true, keywords: KW.aiIntegration, node: <AIIntegrationSection dbPath={dbPath} repoRoot={repoRoot} /> },
    { id: "storage", cat: "data", desktopOnly: true, keywords: KW.storage, node: <StorageSection dbPath={dbPath} onDbPathChange={setDbPath} /> },
    { id: "about", cat: "about", keywords: KW.about, node: <AboutSection /> },
  ].filter((e) => isDesktop || !e.desktopOnly);

  const catLabel = (id: string): string => catMeta.find((c) => c.id === id)?.label ?? id;
  const presentCats = catMeta.filter((c) => entries.some((e) => e.cat === c.id));

  // Active tab is deep-linked via ?cat= so back/forward + refresh + links work.
  const paramCat = searchParams.get("cat");
  const active = presentCats.some((c) => c.id === paramCat) ? paramCat! : presentCats[0].id;
  const selectCat = (id: string): void => {
    setQuery("");
    setSearchParams({ cat: id }, { replace: true });
  };

  // Search: every whitespace token must appear in the entry's (category + keywords).
  const q = query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/) : [];
  const matched = q
    ? entries.filter((e) => {
        const hay = `${catLabel(e.cat)} ${e.keywords}`.toLowerCase();
        return tokens.every((tok) => hay.includes(tok));
      })
    : [];
  // Group matches by category (entries are already in category order).
  const groups: { cat: string; items: typeof entries }[] = [];
  for (const e of matched) {
    const g = groups[groups.length - 1];
    if (g && g.cat === e.cat) g.items.push(e);
    else groups.push({ cat: e.cat, items: [e] });
  }

  return (
    <main className="beatos-card flex h-full flex-1 flex-col overflow-hidden rounded-xl">
      <header className="shrink-0 border-b border-border-subtle px-8 pt-8 pb-4">
        <h1 className="mb-4 text-2xl font-bold">{t("settings.title")}</h1>

        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("settings.search.placeholder")}
            aria-label={t("settings.search.placeholder")}
            className="h-9 w-full rounded-full border border-border-subtle bg-bg-elevated pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.clear")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-tertiary hover:bg-bg-row-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tabs hide while searching — results span categories instead. */}
        {!q && (
          <nav role="tablist" aria-label={t("settings.title")} className="flex flex-wrap gap-1">
            {presentCats.map((c) => {
              const selected = c.id === active;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectCat(c.id)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
                    selected
                      ? "bg-bg-row-active text-text-primary"
                      : "text-text-tertiary hover:bg-bg-row-hover hover:text-text-primary",
                  ].join(" ")}
                >
                  <span className={selected ? "text-text-secondary" : "text-text-tertiary"}>
                    {c.icon}
                  </span>
                  {c.label}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <div className="beatos-scroll flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          {q ? (
            matched.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                {t("settings.search.noResults", { query: query.trim() })}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.cat} className="mb-8">
                  <h2 className="beatos-eyebrow mb-4">{catLabel(g.cat)}</h2>
                  {g.items.map((e) => (
                    <React.Fragment key={e.id}>{e.node}</React.Fragment>
                  ))}
                </div>
              ))
            )
          ) : (
            entries
              .filter((e) => e.cat === active)
              .map((e) => <React.Fragment key={e.id}>{e.node}</React.Fragment>)
          )}
        </div>
      </div>
    </main>
  );
}
