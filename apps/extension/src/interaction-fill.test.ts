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

  it("triggerIndex selects the Nth matching trigger", async () => {
    document.body.innerHTML = `<div class="kbox"><div class="ant-select" data-i="0"></div><div class="ant-select" data-i="1"></div><div class="ant-select" data-i="2"></div></div>`;
    const trigs = [...document.querySelectorAll(".ant-select")] as HTMLElement[];
    wireAntSelect(trigs[1], ["Major", "Minor"]); // only the index-1 trigger opens options
    const spec = { type: "antv3-select", triggerSelector: ".kbox .ant-select", triggerIndex: 1, optionContainer: ".ant-select-dropdown", optionItem: ".ant-select-dropdown-menu-item", match: "exact" };
    const map = { match: ["x"], fields: { genre: spec } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["genre", "Minor"]]), map);
    expect(report.filled).toEqual(["genre"]);
    expect(trigs[1].getAttribute("data-selected")).toBe("Minor");
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

describe("fillInteractions — tag-modal", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  // Simulate: a "+添加标签" trigger button; clicking opens a modal with fixed
  // tag buttons + a "确 定" confirm button. Clicking a tag records selection;
  // clicking 确定 records confirm and removes the modal.
  function wireTagModal(tags: string[]): void {
    const trig = document.createElement("button");
    trig.textContent = "+ 添加标签";
    trig.id = "addtag";
    document.body.appendChild(trig);
    trig.addEventListener("click", () => {
      if (document.querySelector(".ant-modal")) return;
      const modal = document.createElement("div");
      modal.className = "ant-modal";
      for (const t of tags) {
        const b = document.createElement("button");
        b.textContent = t;
        b.addEventListener("click", () => {
          const mark = document.createElement("i");
          mark.className = "picked";
          mark.textContent = t;
          document.body.appendChild(mark); // survives modal.remove()
        });
        modal.appendChild(b);
      }
      const ok = document.createElement("button");
      ok.textContent = "确 定";
      ok.addEventListener("click", () => modal.remove());
      modal.appendChild(ok);
      document.body.appendChild(modal);
    });
  }

  const TAG_SPEC = {
    type: "tag-modal",
    sourceKeys: ["mood", "tags"],
    triggerText: "添加标签",
    modal: ".ant-modal",
    confirmText: "确定",
  };

  it("clicks the tag buttons matching mood + tags, then confirms", async () => {
    wireTagModal(["学习", "跑步", "驾驶", "健身房"]);
    const map = { match: ["x"], fields: { mood: TAG_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(
      document,
      mkResult([["mood", "跑步 / 驾驶"], ["tags", "学习"]]),
      map,
    );
    expect(report.filled).toEqual(["mood"]);
    const on = [...document.querySelectorAll("i.picked")].map((b) => b.textContent);
    expect(on.sort()).toEqual(["学习", "跑步", "驾驶"]);
    expect(document.querySelector(".ant-modal")).toBeNull(); // 确定 closed it
  });

  it("reports missed when none of the values match a tag button", async () => {
    wireTagModal(["学习", "跑步"]);
    const map = { match: ["x"], fields: { mood: TAG_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["mood", "神圣 / 迷幻"], ["tags", ""]]), map);
    expect(report.missed).toEqual(["mood"]);
  });

  it("reports missed when the trigger is absent", async () => {
    const map = { match: ["x"], fields: { mood: TAG_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["mood", "跑步"]]), map);
    expect(report.missed).toEqual(["mood"]);
  });

  it("reports missed when there are no values", async () => {
    wireTagModal(["学习"]);
    const map = { match: ["x"], fields: { mood: TAG_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["mood", ""], ["tags", ""]]), map);
    expect(report.missed).toEqual(["mood"]);
  });
});

describe("fillInteractions — license-modal", () => {
  beforeEach(() => (document.body.innerHTML = ""));

  // Simulate: a "+添加授权方式" trigger; clicking opens a modal with a price
  // input + a 确定 button. Confirm records the price (durable marker on body) + closes modal.
  function wireLicenseModal(): void {
    const trig = document.createElement("button");
    trig.id = "addlic";
    trig.textContent = "+ 添加授权方式";
    document.body.appendChild(trig);
    trig.addEventListener("click", () => {
      if (document.querySelector(".ant-modal")) return;
      const modal = document.createElement("div");
      modal.className = "ant-modal";
      const price = document.createElement("input");
      price.className = "price-in";
      const ok = document.createElement("button");
      ok.textContent = "确 定";
      ok.addEventListener("click", () => {
        const mark = document.createElement("i");
        mark.className = "saved";
        mark.textContent = price.value;
        document.body.appendChild(mark); // survives modal.remove()
        modal.remove();
      });
      modal.appendChild(price);
      modal.appendChild(ok);
      document.body.appendChild(modal);
    });
  }

  const PRICE_SPEC = {
    type: "license-modal",
    triggerText: "添加授权方式",
    modal: ".ant-modal",
    priceInput: ".price-in",
    confirmText: "确定",
    tierMap: {},
  };

  it("fills + confirms a price per tier (best-effort, no type mapping)", async () => {
    wireLicenseModal();
    const map = { match: ["x"], fields: { price: PRICE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(
      document,
      mkResult([["price", "Basic: ¥50\nPremium: ¥300 / USD 50"]]),
      map,
    );
    expect(report.filled).toEqual(["price"]);
    expect([...document.querySelectorAll("i.saved")].map((s) => s.textContent)).toEqual(["50", "300"]);
  });

  it("reports missed when there is no price", async () => {
    wireLicenseModal();
    const map = { match: ["x"], fields: { price: PRICE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["price", ""]]), map);
    expect(report.missed).toEqual(["price"]);
  });

  it("reports missed when the trigger is absent", async () => {
    const map = { match: ["x"], fields: { price: PRICE_SPEC } } as unknown as FormMap;
    const report = await fillInteractions(document, mkResult([["price", "Basic: ¥50"]]), map);
    expect(report.missed).toEqual(["price"]);
  });
});
