import React, { useEffect, useState } from "react";

import { AIIntegrationSection } from "@/components/Settings/AIIntegrationSection";
import { DefaultLicenseTiersSection } from "@/components/Settings/DefaultLicenseTiersSection";
import { ProducersSection } from "@/components/Settings/ProducersSection";
import { VocabLocaleSection } from "@/components/Settings/VocabLocaleSection";

function StorageSection(): React.JSX.Element {
  const [dbPath, setDbPath] = useState<string>("");

  useEffect(() => {
    window.beatos
      .getDbPath()
      .then(setDbPath)
      .catch(() => setDbPath(""));
  }, []);

  async function onChange(): Promise<void> {
    const newFolder = await window.beatos.openFolderDialog();
    if (!newFolder) return;
    const fullPath = `${newFolder}/global.db`;
    try {
      const r = await window.beatos.setDbPath(fullPath);
      if (r.restartRequired) {
        alert("Database path changed. Please restart BeatOS for the new location to take effect.");
      }
      setDbPath(fullPath);
    } catch (e) {
      alert(`Failed to update db path: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Storage</h2>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
          Catalog database path
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-bg-elevated rounded-md text-xs truncate border border-border-subtle">
            {dbPath || "Loading…"}
          </code>
          <button
            type="button"
            onClick={onChange}
            className="px-3 py-2 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover"
          >
            Change…
          </button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          A restart is required after changing this path.
        </p>
      </div>
    </section>
  );
}

function AboutSection(): React.JSX.Element {
  return (
    <section className="mt-10 pt-6 border-t border-border-subtle">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-3">
        About
      </h2>
      <div className="text-sm text-text-secondary">
        Made by <span className="text-text-primary font-medium">averatec0773</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <div>
          <span className="text-text-secondary">My website: </span>
          <button
            type="button"
            onClick={() => void window.beatos.openExternal("https://averatec.studio")}
            className="text-accent underline hover:no-underline"
            aria-label="Open averatec.studio in browser"
          >
            averatec.studio
          </button>
        </div>
        <div>
          <span className="text-text-secondary">Project repo: </span>
          <button
            type="button"
            onClick={() =>
              void window.beatos.openExternal("https://github.com/averatec0773/beatos")
            }
            className="text-accent underline hover:no-underline"
            aria-label="Open project repository on GitHub in browser"
          >
            github.com/averatec0773/beatos
          </button>
        </div>
      </div>
    </section>
  );
}

export function SettingsPanel(): React.JSX.Element {
  const [dbPath, setDbPath] = useState<string>("");
  const [repoRoot, setRepoRoot] = useState<string>("");
  useEffect(() => {
    void window.beatos.getDbPath().then(setDbPath);
    void window.beatos.getRepoRoot().then(setRepoRoot);
  }, []);

  return (
    <main className="beatos-scroll flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-text-secondary text-sm mb-8">Storage location and library management.</p>
        <StorageSection />
        <VocabLocaleSection />
        <DefaultLicenseTiersSection />
        <ProducersSection />
        <AIIntegrationSection dbPath={dbPath} repoRoot={repoRoot} />
        <AboutSection />
      </div>
    </main>
  );
}
