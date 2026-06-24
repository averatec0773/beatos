import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

/** A top-level settings group: an eyebrow header over a cluster of sections. */
function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mb-12">
      <h2 className="beatos-eyebrow mb-5 pb-2 border-b border-border-subtle">{title}</h2>
      {children}
    </div>
  );
}

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
    <section className="mt-10 pt-6 border-t border-border-subtle">
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
  useEffect(() => {
    platform
      .getDbPath()
      .then(setDbPath)
      .catch(() => setDbPath(""));
    void platform.getRepoRoot().then(setRepoRoot);
  }, []);

  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8 rounded-xl beatos-card">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-8">{t("settings.title")}</h1>

        <SettingsGroup title={t("settings.groups.appearance")}>
          <AppearanceSection />
        </SettingsGroup>

        <SettingsGroup title={t("settings.groups.beatsUpload")}>
          <UploadTemplatesSection />
          <DefaultLicenseTiersSection />
          <ProducersSection />
        </SettingsGroup>

        <SettingsGroup title={t("settings.groups.general")}>
          <LanguageSection />
          <VocabLocaleSection />
          {/* Storage (DB path) + AI Integration (MCP setup) are desktop-only:
              the web DB path is fixed by the launch env, and MCP wiring targets
              the local Claude Desktop. Hidden in the browser build. */}
          {platform.kind === "electron" && (
            <>
              <StorageSection dbPath={dbPath} onDbPathChange={setDbPath} />
              <AgentPermissionSection />
              <AIAssistSection />
              <AIIntegrationSection dbPath={dbPath} repoRoot={repoRoot} />
            </>
          )}
        </SettingsGroup>

        <AboutSection />
      </div>
    </main>
  );
}
