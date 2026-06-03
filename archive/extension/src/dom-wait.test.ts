import { describe, it, expect, beforeEach } from "vitest";
import { waitFor, sleep } from "./dom-wait";

describe("sleep", () => {
  it("resolves after ~ms", async () => {
    const t0 = Date.now();
    await sleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});

describe("waitFor", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("resolves immediately when element already present", async () => {
    document.body.innerHTML = `<div id="x"></div>`;
    const el = await waitFor("#x", { timeoutMs: 200 });
    expect(el).not.toBeNull();
  });

  it("resolves once a delayed element appears", async () => {
    setTimeout(() => (document.body.innerHTML = `<div class="late"></div>`), 30);
    const el = await waitFor(".late", { timeoutMs: 500 });
    expect(el).not.toBeNull();
  });

  it("returns null on timeout", async () => {
    const el = await waitFor("#never", { timeoutMs: 80 });
    expect(el).toBeNull();
  });

  it("scopes to a given root", async () => {
    document.body.innerHTML = `<div id="r"></div><span class="t"></span>`;
    const root = document.getElementById("r")!;
    const el = await waitFor(".t", { timeoutMs: 80, root });
    expect(el).toBeNull(); // .t is outside #r
  });
});
