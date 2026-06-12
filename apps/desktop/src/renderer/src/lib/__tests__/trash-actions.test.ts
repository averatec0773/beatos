import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/api/tracks", () => ({
  tracks: {
    remove: vi.fn().mockResolvedValue({}),
    restore: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    listTrash: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
}));

import { trashTracksWithUndo, restoreTracks } from "../trash-actions";
import { tracks } from "@/api/tracks";
import { useToastStore } from "@/stores/toast";

// Identity translator — returns the key so we can assert on it.
const t = ((key: string) => key) as unknown as TFunction;

const removeMock = tracks.remove as unknown as ReturnType<typeof vi.fn>;
const restoreMock = tracks.restore as unknown as ReturnType<typeof vi.fn>;

describe("trash-actions", () => {
  beforeEach(() => {
    removeMock.mockClear();
    restoreMock.mockClear();
    useToastStore.setState({ current: null });
  });

  it("trashes every id and offers an Undo action on the toast", async () => {
    await trashTracksWithUndo([1, 2], t);
    expect(removeMock).toHaveBeenCalledWith(1);
    expect(removeMock).toHaveBeenCalledWith(2);
    const toast = useToastStore.getState().current;
    expect(toast?.action?.label).toBe("common.undo");
  });

  it("the Undo action restores exactly the trashed ids", async () => {
    await trashTracksWithUndo([7], t);
    const action = useToastStore.getState().current?.action;
    expect(action).toBeDefined();
    action!.onClick();
    // onClick kicks off restoreTracks (fire-and-forget); await a tick.
    await Promise.resolve();
    await Promise.resolve();
    expect(restoreMock).toHaveBeenCalledWith(7);
  });

  it("restoreTracks un-deletes each id", async () => {
    await restoreTracks([3, 4], t);
    expect(restoreMock).toHaveBeenCalledWith(3);
    expect(restoreMock).toHaveBeenCalledWith(4);
  });

  it("shows no toast when nothing was trashed (all failed)", async () => {
    removeMock.mockRejectedValueOnce(new Error("boom"));
    await trashTracksWithUndo([99], t);
    expect(useToastStore.getState().current).toBeNull();
  });
});
