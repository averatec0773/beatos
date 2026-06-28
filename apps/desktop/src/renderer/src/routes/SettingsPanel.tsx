import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Languages, Library, Sparkles, Database, Info } from "lucide-react";

import { platform } from "@/platform";
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

export function SettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [dbPath, setDbPath] = useState<string>("");
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [active, setActive] = useState<string>("appearance");
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

  const categories: {
    id: string;
    label: string;
    icon: React.ReactNode;
    node: React.ReactNode;
  }[] = [
    {
      id: "appearance",
      label: t("settings.categories.appearance"),
      icon: <Palette size={14} />,
      node: <AppearanceSection />,
    },
    {
      id: "language",
      label: t("settings.categories.language"),
      icon: <Languages size={14} />,
      node: (
        <>
          <LanguageSection />
          <VocabLocaleSection />
        </>
      ),
    },
    {
      id: "catalog",
      label: t("settings.categories.catalog"),
      icon: <Library size={14} />,
      node: (
        <>
          <UploadTemplatesSection />
          <DefaultLicenseTiersSection />
          <ProducersSection />
        </>
      ),
    },
    ...(isDesktop
      ? [
          {
            id: "ai",
            label: t("settings.categories.ai"),
            icon: <Sparkles size={14} />,
            // Order: configure the provider → set what the agent may do → wire MCP.
            node: (
              <>
                <AIAssistSection />
                <AgentPermissionSection />
                <AIIntegrationSection dbPath={dbPath} repoRoot={repoRoot} />
              </>
            ),
          },
          {
            id: "data",
            label: t("settings.categories.data"),
            icon: <Database size={14} />,
            node: <StorageSection dbPath={dbPath} onDbPathChange={setDbPath} />,
          },
        ]
      : []),
    {
      id: "about",
      label: t("settings.categories.about"),
      icon: <Info size={14} />,
      node: <AboutSection />,
    },
  ];

  const current = categories.find((c) => c.id === active) ?? categories[0];

  return (
    <main className="beatos-card flex h-full flex-1 flex-col overflow-hidden rounded-xl">
      <header className="shrink-0 border-b border-border-subtle px-8 pt-8 pb-4">
        <h1 className="mb-5 text-2xl font-bold">{t("settings.title")}</h1>
        <nav role="tablist" aria-label={t("settings.title")} className="flex flex-wrap gap-1">
          {categories.map((c) => {
            const selected = c.id === current.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(c.id)}
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
      </header>

      <div className="beatos-scroll flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">{current.node}</div>
      </div>
    </main>
  );
}
