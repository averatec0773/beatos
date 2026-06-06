import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { useAppLanguageStore } from "@/stores/app-language";

vi.mock("@/api/tracks", () => ({
  tracks: {
    listTrash: vi.fn().mockResolvedValue([]),
    restore: vi.fn().mockResolvedValue({}),
    purge: vi.fn().mockResolvedValue({}),
    purgeAllTrash: vi.fn().mockResolvedValue({ purged: 0 }),
  },
}));

import { useTrashStore } from "@/stores/trash";
import { TrashPanel } from "@/routes/TrashPanel";

describe("TrashPanel i18n — empty state", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
    useAppLanguageStore.setState({ language: "en" });
    useTrashStore.setState({ list: [], selectedIds: new Set(), loading: false });
  });

  it("renders English empty-state when lang is en", async () => {
    await i18n.changeLanguage("en");
    useTrashStore.setState({
      list: [],
      selectedIds: new Set(),
      loading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
    } as any);

    render(<TrashPanel />);

    await waitFor(() => expect(screen.getByText("Trash is empty.")).toBeInTheDocument());
  });

  it("renders Chinese empty-state after switching to zh", async () => {
    await i18n.changeLanguage("zh");
    useAppLanguageStore.setState({ language: "zh" });
    useTrashStore.setState({
      list: [],
      selectedIds: new Set(),
      loading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
    } as any);

    render(<TrashPanel />);

    await waitFor(() => expect(screen.getByText("回收站是空的。")).toBeInTheDocument());
  });
});
