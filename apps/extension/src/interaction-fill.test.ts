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
    document.addEventListener("keydown", function onEsc(e) {
      if ((e as KeyboardEvent).key === "Escape") { dd.remove(); document.removeEventListener("keydown", onEsc); }
    });
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

  it("closes a multi-select dropdown after picking (it does not auto-close)", async () => {
    document.body.innerHTML = `<div class="row"><span class="lbl">曲风</span><div class="ant-select" id="g"></div></div>`;
    wireAntSelect(document.getElementById("g")!, ["流行 Pop", "中文说唱 Chinese Hip Hop"], { multi: true });
    const map = { match: ["x"], fields: { genre: GENRE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "中文说唱"]]), map);
    expect(report.filled).toEqual(["genre"]);
    expect(document.getElementById("g")!.getAttribute("data-selected")).toBe("中文说唱 Chinese Hip Hop");
    expect(document.querySelector(".ant-select-dropdown")).toBeNull(); // closePopups removed it
  });
});

describe("fillInteractions — key-triple", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  const KEY_SPEC = {
    type: "key-triple",
    note: { triggerLabel: "音名", controlSelector: ".ant-select", optionContainer: ".ant-select-dropdown", optionItem: ".ant-select-dropdown-menu-item" },
    accidental: { triggerLabel: "调号", controlSelector: ".ant-select", optionContainer: ".ant-select-dropdown", optionItem: ".ant-select-dropdown-menu-item", labelMap: { sharp: "♯", flat: "♭", natural: "无" } },
    mode: { triggerLabel: "调式", controlSelector: ".ant-select", optionContainer: ".ant-select-dropdown", optionItem: ".ant-select-dropdown-menu-item", labelMap: { major: "Major", minor: "Minor" } },
  };

  function wireKeyForm(noteOpts: string[], accOpts: string[], modeOpts: string[]): void {
    document.body.innerHTML = `
      <div class="r"><span>音名</span><div class="ant-select" id="kn"></div></div>
      <div class="r"><span>调号</span><div class="ant-select" id="ka"></div></div>
      <div class="r"><span>调式</span><div class="ant-select" id="km"></div></div>`;
    wireAntSelect(document.getElementById("kn")!, noteOpts);
    wireAntSelect(document.getElementById("ka")!, accOpts);
    wireAntSelect(document.getElementById("km")!, modeOpts, { multi: true }); // 调式 is multi-select
  }

  it("fills note + accidental + mode for 'F# minor'", async () => {
    wireKeyForm(["C", "F", "G"], ["♯", "♭", "无"], ["Major", "Minor", "Dorian"]);
    const map = { match: ["x"], fields: { key: KEY_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["key", "F# minor"]]), map);
    expect(report.filled).toEqual(["key"]);
    expect(document.getElementById("kn")!.getAttribute("data-selected")).toBe("F");
    expect(document.getElementById("ka")!.getAttribute("data-selected")).toBe("♯");
    expect(document.getElementById("km")!.getAttribute("data-selected")).toBe("Minor");
  });

  it("selects 无 for a natural key (C major) — accidental NOT skipped", async () => {
    wireKeyForm(["C", "D"], ["♯", "♭", "无"], ["Major", "Minor"]);
    const map = { match: ["x"], fields: { key: KEY_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["key", "C major"]]), map);
    expect(report.filled).toEqual(["key"]);
    expect(document.getElementById("ka")!.getAttribute("data-selected")).toBe("无");
    expect(document.getElementById("km")!.getAttribute("data-selected")).toBe("Major");
  });

  it("reports missed when a sub-select option is absent", async () => {
    wireKeyForm(["F"], ["♯"], ["Major"]); // no Minor
    const map = { match: ["x"], fields: { key: KEY_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["key", "F# minor"]]), map);
    expect(report.missed).toEqual(["key"]);
  });

  it("reports missed for an unparseable key", async () => {
    wireKeyForm(["C"], ["无"], ["Major"]);
    const map = { match: ["x"], fields: { key: KEY_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["key", "nonsense"]]), map);
    expect(report.missed).toEqual(["key"]);
  });
});
