import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchInput, extractCompletedChipToken } from "@/components/SearchInput";
import { useTrackQueryStore } from "@/stores/track-query";
import { facetsApi } from "@/api/facets";

vi.mock("@/api/facets", () => ({
  facetsApi: {
    recent: vi.fn(async () => ["dark trap 808"]),
    top: vi.fn(async (field: string) => {
      if (field === "producer") return [{ value: "young chop", count: 3 }];
      if (field === "genre") return [{ value: "trap", count: 5 }];
      if (field === "key") return [{ value: "C# min", count: 2 }];
      return [];
    }),
    pushRecent: vi.fn(async () => ["dark trap 808"]),
  },
}));

vi.mock("@/api/tracks", () => ({
  tracks: {
    list: vi.fn(async () => [
      { id: 1, title: "Midnight", created_at: "2026-01-01" },
      { id: 2, title: "Sunrise", created_at: "2026-01-02" },
    ]),
  },
}));

function renderInput(): void {
  render(
    <MemoryRouter>
      <SearchInput />
    </MemoryRouter>,
  );
}

const DEFAULT_FILTERS = {
  producers: [],
  genres: [],
  moods: [],
  keys: [],
  bpm_min: null,
  bpm_max: null,
  has_audio: null,
};

describe("extractCompletedChipToken", () => {
  it("absorbs a completed genre token with trailing space", () => {
    expect(extractCompletedChipToken("genre:trap ")).toEqual({
      field: "genres",
      value: "trap",
      rest: "",
    });
  });

  it("returns null for partial token without trailing space", () => {
    expect(extractCompletedChipToken("genre:tr")).toBeNull();
  });

  it("returns null for bpm token (not a chip field)", () => {
    expect(extractCompletedChipToken("bpm:>140 ")).toBeNull();
  });

  it("supports a quoted producer value and preserves rest", () => {
    expect(extractCompletedChipToken('dark producer:"young chop" vibes ')).toEqual({
      field: "producers",
      value: "young chop",
      rest: "dark vibes",
    });
  });
});

describe("SearchInput", () => {
  beforeEach(() => {
    useTrackQueryStore.setState({ q: "", filters: { ...DEFAULT_FILTERS } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("absorbs a genre token into the filters and strips it from the box", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    renderInput();
    const input = screen.getByPlaceholderText(/Search title/i) as HTMLInputElement;
    await user.type(input, "genre:trap ");

    expect(useTrackQueryStore.getState().filters.genres).toEqual(["trap"]);
    expect(input.value).not.toContain("genre:trap");
  });

  it("debounces bare free text into q", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    renderInput();
    const input = screen.getByPlaceholderText(/Search title/i);
    await user.type(input, "dark");

    await vi.advanceTimersByTimeAsync(300);
    expect(useTrackQueryStore.getState().q).toBe("dark");
  });

  it("shows the dropdown on focus when empty and applies a recent search on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    renderInput();
    const input = screen.getByPlaceholderText(/Search title/i);
    await user.click(input);

    const recentBtn = await screen.findByText("dark trap 808");
    expect(recentBtn).toBeInTheDocument();

    await user.click(recentBtn);
    expect(useTrackQueryStore.getState().q).toBe("dark trap 808");
  });

  it("pending debounce does not clobber an explicit recent-search pick", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    renderInput();

    // Open search box.
    const input = screen.getByPlaceholderText(/Search title/i) as HTMLInputElement;

    // Type some text — schedules a debounced setText("stale") after 250 ms.
    await user.type(input, "stale");

    // Clear the box — schedules a debounced setText("") after 250 ms.
    // The timer from "stale" is superseded, but there is now a pending timer
    // for the empty string. We do NOT advance timers yet so both the "stale"
    // (cancelled) and the empty-string debounce are still pending.
    await user.clear(input);

    // The dropdown should now be visible (box is empty + focused).
    const recentBtn = await screen.findByText("dark trap 808");

    // Click the recent search item — this is the explicit pick.
    await user.click(recentBtn);

    // Advance past the debounce window. Without the fix the pending
    // setText("") would fire here and clobber the picked value.
    await vi.advanceTimersByTimeAsync(300);

    expect(useTrackQueryStore.getState().q).toBe("dark trap 808");
  });

  it("ignores the Enter that confirms an IME composition, submits on the next Enter", async () => {
    renderInput();
    const input = screen.getByPlaceholderText(/Search title/i) as HTMLInputElement;

    // The box already holds the IME-composed English text (e.g. typed via a
    // Chinese IME). onChange has set the controlled value to "regalia".
    fireEvent.change(input, { target: { value: "regalia" } });
    vi.mocked(facetsApi.pushRecent).mockClear();

    // The Enter that CONFIRMS the IME candidate fires keydown with
    // isComposing=true — our handler must ignore it (no submit, no mutation),
    // otherwise it races the IME commit and duplicates the text.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(facetsApi.pushRecent).not.toHaveBeenCalled();
    expect(input.value).toBe("regalia");

    // A real Enter (composition finished) submits.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(facetsApi.pushRecent).toHaveBeenCalledWith("regalia");
  });
});
