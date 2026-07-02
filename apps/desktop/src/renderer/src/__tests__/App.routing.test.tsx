import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Replace the heavy shell + panels with lightweight stubs so we exercise only
// the <Routes> config (the catch-all redirect) without booting TopBar, the
// player, or the WebGL backdrops (unmountable in jsdom). HashRouter becomes a
// MemoryRouter seeded at an UNKNOWN path so we can assert the catch-all redirect.
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    HashRouter: ({ children }: { children: React.ReactNode }) => (
      <actual.MemoryRouter initialEntries={["/bogus-xyz"]}>{children}</actual.MemoryRouter>
    ),
  };
});

vi.mock("@/routes/AppShell", async () => {
  const { Outlet } = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { AppShell: () => <Outlet /> };
});
vi.mock("@/routes/TrackListPanel", () => ({
  TrackListPanel: () => <div data-testid="library">library</div>,
}));
vi.mock("@/routes/TrackEditor", () => ({ TrackEditor: () => <div>editor</div> }));
vi.mock("@/routes/SettingsPanel", () => ({ SettingsPanel: () => <div>settings</div> }));
vi.mock("@/routes/TrashPanel", () => ({ TrashPanel: () => <div>trash</div> }));
vi.mock("@/routes/ApprovalsPanel", () => ({ ApprovalsPanel: () => <div>approvals</div> }));
vi.mock("@/routes/PublishCenterPanel", () => ({ PublishCenterPanel: () => <div>publish</div> }));
vi.mock("@/routes/ChatPanel", () => ({ ChatPanel: () => <div>chat</div> }));
vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SidecarCrashToast", () => ({ SidecarCrashToast: () => null }));
vi.mock("@/components/LegacyMigrationToast", () => ({ LegacyMigrationToast: () => null }));
vi.mock("@/components/FileBrowserDialog", () => ({ FileBrowserDialog: () => null }));
vi.mock("@/components/DragOverlayPreview", () => ({ DragOverlayPreview: () => null }));

// The boot effect in App calls several store `.hydrate()`/`.loadProStatus()`
// methods — stub the stores it touches so mounting doesn't hit the network.
// (Factories are hoisted, so build the stub inline rather than closing over a
// top-level variable.)
vi.mock("@/stores/tracks", () => ({ useTrackStore: { getState: () => ({}) } }));
vi.mock("@/stores/lists", () => ({ useListStore: { getState: () => ({}) } }));
vi.mock("@/stores/vocab-locale", () => ({
  useVocabLocaleStore: { getState: () => ({ hydrate: () => {} }) },
}));
vi.mock("@/stores/app-language", () => ({
  useAppLanguageStore: { getState: () => ({ hydrate: () => {} }) },
}));
vi.mock("@/stores/player", () => ({
  usePlayerStore: { getState: () => ({ hydrate: () => {} }) },
}));
vi.mock("@/stores/pro", () => ({
  useProStore: { getState: () => ({ loadProStatus: () => {} }) },
}));
vi.mock("@/stores/agent-permission", () => ({
  useAgentPermissionStore: { getState: () => ({ hydrate: () => {} }) },
}));

import App from "@/App";

describe("App routing catch-all", () => {
  it("redirects an unknown route to the library instead of a blank body", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("library")).toBeInTheDocument());
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
  });
});
