import { beforeEach, describe, expect, it } from "vitest";
import { useTrackQueryStore } from "../track-query";

const DEFAULT_FILTERS = {
  producers: [],
  genres: [],
  moods: [],
  keys: [],
  bpm_min: null,
  bpm_max: null,
  has_audio: null,
};

beforeEach(() => {
  useTrackQueryStore.setState({
    sortBy: "updated_at",
    sortDir: "desc",
    filters: { ...DEFAULT_FILTERS },
  });
});

describe("useTrackQueryStore defaults", () => {
  it("has sortBy updated_at", () => {
    expect(useTrackQueryStore.getState().sortBy).toBe("updated_at");
  });
  it("has sortDir desc", () => {
    expect(useTrackQueryStore.getState().sortDir).toBe("desc");
  });
  it("has empty filter arrays", () => {
    const { filters } = useTrackQueryStore.getState();
    expect(filters.producers).toEqual([]);
    expect(filters.genres).toEqual([]);
    expect(filters.moods).toEqual([]);
    expect(filters.keys).toEqual([]);
  });
  it("has null bpm_min, bpm_max, has_audio", () => {
    const { filters } = useTrackQueryStore.getState();
    expect(filters.bpm_min).toBeNull();
    expect(filters.bpm_max).toBeNull();
    expect(filters.has_audio).toBeNull();
  });
});

describe("toggleSort", () => {
  it("toggleSort different field → sets field + asc", () => {
    useTrackQueryStore.getState().toggleSort("title");
    const s = useTrackQueryStore.getState();
    expect(s.sortBy).toBe("title");
    expect(s.sortDir).toBe("asc");
  });
  it("toggleSort same field → flips direction", () => {
    useTrackQueryStore.getState().toggleSort("title");
    useTrackQueryStore.getState().toggleSort("title");
    const s = useTrackQueryStore.getState();
    expect(s.sortBy).toBe("title");
    expect(s.sortDir).toBe("desc");
  });
  it("toggleSort back to a third field resets to asc", () => {
    useTrackQueryStore.getState().toggleSort("title");
    useTrackQueryStore.getState().toggleSort("bpm");
    const s = useTrackQueryStore.getState();
    expect(s.sortBy).toBe("bpm");
    expect(s.sortDir).toBe("asc");
  });
});

describe("setProducerFilter", () => {
  it("sets producers list", () => {
    useTrackQueryStore.getState().setProducerFilter(["a", "b"]);
    expect(useTrackQueryStore.getState().filters.producers).toEqual(["a", "b"]);
  });
  it("clears producers when empty array", () => {
    useTrackQueryStore.getState().setProducerFilter(["a"]);
    useTrackQueryStore.getState().setProducerFilter([]);
    expect(useTrackQueryStore.getState().filters.producers).toEqual([]);
  });
});

describe("setGenreFilter", () => {
  it("sets genres list", () => {
    useTrackQueryStore.getState().setGenreFilter(["hip-hop"]);
    expect(useTrackQueryStore.getState().filters.genres).toEqual(["hip-hop"]);
  });
});

describe("setMoodFilter", () => {
  it("sets moods list", () => {
    useTrackQueryStore.getState().setMoodFilter(["dark", "chill"]);
    expect(useTrackQueryStore.getState().filters.moods).toEqual(["dark", "chill"]);
  });
});

describe("setKeyFilter", () => {
  it("sets keys list", () => {
    useTrackQueryStore.getState().setKeyFilter(["C minor"]);
    expect(useTrackQueryStore.getState().filters.keys).toEqual(["C minor"]);
  });
});

describe("setBpmRange", () => {
  it("sets bpm_min and bpm_max", () => {
    useTrackQueryStore.getState().setBpmRange(80, 140);
    const { filters } = useTrackQueryStore.getState();
    expect(filters.bpm_min).toBe(80);
    expect(filters.bpm_max).toBe(140);
  });
  it("sets null values to clear range", () => {
    useTrackQueryStore.getState().setBpmRange(80, 140);
    useTrackQueryStore.getState().setBpmRange(null, null);
    const { filters } = useTrackQueryStore.getState();
    expect(filters.bpm_min).toBeNull();
    expect(filters.bpm_max).toBeNull();
  });
  it("sets only lower bound", () => {
    useTrackQueryStore.getState().setBpmRange(100, null);
    const { filters } = useTrackQueryStore.getState();
    expect(filters.bpm_min).toBe(100);
    expect(filters.bpm_max).toBeNull();
  });
});

describe("setHasAudio", () => {
  it("sets has_audio to true", () => {
    useTrackQueryStore.getState().setHasAudio(true);
    expect(useTrackQueryStore.getState().filters.has_audio).toBe(true);
  });
  it("sets has_audio to false", () => {
    useTrackQueryStore.getState().setHasAudio(false);
    expect(useTrackQueryStore.getState().filters.has_audio).toBe(false);
  });
  it("sets has_audio to null (no filter)", () => {
    useTrackQueryStore.getState().setHasAudio(true);
    useTrackQueryStore.getState().setHasAudio(null);
    expect(useTrackQueryStore.getState().filters.has_audio).toBeNull();
  });
});

describe("removeFilter", () => {
  it("removeFilter with value removes that value from producers", () => {
    useTrackQueryStore.getState().setProducerFilter(["a", "b"]);
    useTrackQueryStore.getState().removeFilter("producers", "a");
    expect(useTrackQueryStore.getState().filters.producers).toEqual(["b"]);
  });
  it("removeFilter without value clears entire producers field", () => {
    useTrackQueryStore.getState().setProducerFilter(["a", "b"]);
    useTrackQueryStore.getState().removeFilter("producers");
    expect(useTrackQueryStore.getState().filters.producers).toEqual([]);
  });
  it("removeFilter on bpm_min resets to null", () => {
    useTrackQueryStore.getState().setBpmRange(80, 140);
    useTrackQueryStore.getState().removeFilter("bpm_min");
    expect(useTrackQueryStore.getState().filters.bpm_min).toBeNull();
  });
  it("removeFilter on bpm_max resets to null", () => {
    useTrackQueryStore.getState().setBpmRange(80, 140);
    useTrackQueryStore.getState().removeFilter("bpm_max");
    expect(useTrackQueryStore.getState().filters.bpm_max).toBeNull();
  });
  it("removeFilter on has_audio resets to null", () => {
    useTrackQueryStore.getState().setHasAudio(true);
    useTrackQueryStore.getState().removeFilter("has_audio");
    expect(useTrackQueryStore.getState().filters.has_audio).toBeNull();
  });
});

describe("clearAllFilters", () => {
  it("resets all filters to defaults", () => {
    useTrackQueryStore.getState().setProducerFilter(["a"]);
    useTrackQueryStore.getState().setGenreFilter(["hip-hop"]);
    useTrackQueryStore.getState().setBpmRange(80, 140);
    useTrackQueryStore.getState().setHasAudio(true);
    useTrackQueryStore.getState().toggleSort("title");
    useTrackQueryStore.getState().clearAllFilters();
    const s = useTrackQueryStore.getState();
    expect(s.filters).toEqual(DEFAULT_FILTERS);
    // sort is NOT reset by clearAllFilters
    expect(s.sortBy).toBe("title");
  });
});
