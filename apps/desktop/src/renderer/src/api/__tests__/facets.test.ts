import { describe, it, expect, vi, beforeEach } from "vitest";
import { facetsApi } from "@/api/facets";
import * as client from "@/api/client";

describe("facetsApi", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("fetches top values for a field", async () => {
    const spy = vi.spyOn(client, "apiGet").mockResolvedValue({ items: [{ value: "trap", count: 3 }] });
    const res = await facetsApi.top("genre", 5);
    expect(spy).toHaveBeenCalledWith("/api/tracks/facets?field=genre&limit=5");
    expect(res[0]).toEqual({ value: "trap", count: 3 });
  });
  it("pushRecent posts the query", async () => {
    const spy = vi.spyOn(client, "apiPost").mockResolvedValue({ items: ["genre:trap"] });
    const res = await facetsApi.pushRecent("genre:trap");
    expect(spy).toHaveBeenCalledWith("/api/tracks/recent-searches", { query: "genre:trap" });
    expect(res).toEqual(["genre:trap"]);
  });
});
