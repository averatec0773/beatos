import { describe, it, expect, beforeEach } from "vitest";
import { fillInteractions } from "./interaction-fill";
import type { ExportResult, FormMap } from "./fill-form";

function mkResult(fields: Array<[string, string]>): ExportResult {
  return {
    platform: "netease",
    fields: fields.map(([key, value]) => ({ key, label: key, value, options: [], note: null })),
  };
}

// Simulate an Ant v3 select: clicking the trigger appends a dropdown of options.
// Single-select removes the dropdown on pick; multi keeps it open.
function wireAntSelect(trigger: HTMLElement, options: string[], opts: { multi?: boolean } = {}): void {
  trigger.addEventListener("click", () => {
    if (document.querySelector(".ant-select-dropdown")) return;
    const dd = document.createElement("div");
    dd.className = "ant-select-dropdown";
    for (const o of options) {
      const li = document.createElement("div");
      li.className = "ant-select-dropdown-menu-item";
      li.textContent = o;
      li.addEventListener("click", () => {
        trigger.setAttribute("data-selected", o);
        if (!opts.multi) dd.remove();
      });
      dd.appendChild(li);
    }
    document.body.appendChild(dd);
  });
}

const GENRE_SPEC = {
  type: "antv3-select",
  triggerLabel: "曲风",
  controlSelector: ".ant-select",
  optionContainer: ".ant-select-dropdown",
  optionItem: ".ant-select-dropdown-menu-item",
  match: "prefix",
};

describe("fillInteractions — antv3-select (genre)", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  it("picks the bilingual option by zh prefix, trigger found via label", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">曲风</span><div class="ant-select" id="g"></div></div>`;
    wireAntSelect(document.getElementById("g")!, ["流行 Pop", "流行说唱 Pop Rap", "中文说唱 Chinese Hip Hop"]);
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "中文说唱"]]), map);
    expect(report.filled).toEqual(["genre"]);
    expect(document.getElementById("g")!.getAttribute("data-selected")).toBe("中文说唱 Chinese Hip Hop");
  });

  it("prefix match disambiguates 流行 from 流行说唱", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">曲风</span><div class="ant-select" id="g"></div></div>`;
    wireAntSelect(document.getElementById("g")!, ["流行 Pop", "流行说唱 Pop Rap"]);
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    await fillInteractions(document, mkResult([["genre", "流行"]]), map);
    expect(document.getElementById("g")!.getAttribute("data-selected")).toBe("流行 Pop");
  });

  it("uses only the first genre when value is multi (' / ' joined)", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">曲风</span><div class="ant-select" id="g"></div></div>`;
    wireAntSelect(document.getElementById("g")!, ["流行 Pop", "中文说唱 Chinese Hip Hop"]);
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    await fillInteractions(document, mkResult([["genre", "中文说唱 / 流行"]]), map);
    expect(document.getElementById("g")!.getAttribute("data-selected")).toBe("中文说唱 Chinese Hip Hop");
  });

  it("reports missed when no option matches", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">曲风</span><div class="ant-select" id="g"></div></div>`;
    wireAntSelect(document.getElementById("g")!, ["流行 Pop", "摇滚 Rock"]);
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "中文说唱"]]), map);
    expect(report.missed).toEqual(["genre"]);
  });

  it("reports missed when the label/trigger is absent", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">其他</span><div class="ant-select" id="g"></div></div>`;
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "中文说唱"]]), map);
    expect(report.missed).toEqual(["genre"]);
  });

  it("supports triggerSelector fallback", async () => {
    document.body.innerHTML = `<div class="ant-select" id="g2"></div>`;
    wireAntSelect(document.getElementById("g2")!, ["中文说唱 Chinese Hip Hop"]);
    const spec = { ...GENRE_SPEC, triggerLabel: undefined, triggerSelector: "#g2" };
    const map = { match: ["x"], fields: { genre: spec } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "中文说唱"]]), map);
    expect(report.filled).toEqual(["genre"]);
  });

  it("skips native-type fields (handled by fillForm)", async () => {
    const map = { match: ["x"], fields: { title: { type: "text", selector: "#t" } } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["title", "A"]]), map);
    expect(report.filled).toEqual([]);
    expect(report.missed).toEqual([]);
  });
});
