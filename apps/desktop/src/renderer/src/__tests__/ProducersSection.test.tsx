import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const settings: Record<string, unknown> = {};
vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn(async (k: string) => ({ key: k, value: settings[k] ?? null })),
    set: vi.fn(async (k: string, v: unknown) => {
      settings[k] = v;
      return { key: k, value: v };
    }),
    remove: vi.fn(),
  },
}));
vi.mock("@/api/distinct", () => ({
  distinct: { values: vi.fn(async () => ["Averatec", "Redketch"]) },
}));
vi.mock("@/api/producers", () => ({ producers: { rewrite: vi.fn() } }));
vi.mock("@/stores/tracks", () => ({ useTrackStore: (sel: any) => sel({ refresh: vi.fn() }) }));

import { ProducersSection } from "@/components/Settings/ProducersSection";

describe("ProducersSection primary marker", () => {
  beforeEach(() => {
    for (const k of Object.keys(settings)) delete settings[k];
  });

  it("clicking the star sets the producer as primary (★)", async () => {
    const user = userEvent.setup();
    render(<ProducersSection />);
    await screen.findByText("Averatec");
    const starBtn = screen.getByRole("button", { name: /set Averatec as primary/i });
    await user.click(starBtn);
    await waitFor(() => expect(settings["primary_producer"]).toBe("Averatec"));
    expect(await screen.findByText("★")).toBeTruthy();
  });

  it("clicking the current primary's star clears it", async () => {
    settings["primary_producer"] = "Averatec";
    const user = userEvent.setup();
    render(<ProducersSection />);
    const starBtn = await screen.findByRole("button", { name: /unset Averatec as primary/i });
    await user.click(starBtn);
    await waitFor(() => expect(settings["primary_producer"]).toBe(""));
  });
});
