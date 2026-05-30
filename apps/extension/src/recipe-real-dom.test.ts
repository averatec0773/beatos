import { describe, it, expect, beforeEach } from "vitest";
import { fillForm } from "./fill-form";
import { fillInteractions } from "./interaction-fill";
import type { ExportResult, FormMap } from "./fill-form";
// Load fixtures via Vite's ?raw (no node `fs` — keeps node globals out of the
// browser-typed extension source; the `*?raw` module shape is declared in
// raw-modules.d.ts). esbuild's build step never sees test files.
import HTML from "../reference/netease-upload-page.html?raw";
import RECIPE_JSON from "../../../packages/beatos-platforms/beatos_platforms/data/netease/upload-form.json?raw";

// Drive the REAL drivers against the REAL saved NetEase DOM snapshot
// (apps/extension/reference/netease-upload-page.html), using the REAL recipe
// (beatos-platforms/.../netease/upload-form.json). Unlike interaction-fill.test.ts
// — which wires SYNTHETIC Ant selects with hand-written option text — this test
// proves the recipe's selectors still resolve against the real page AND that the
// recipe's match values (genre prefixes, KEY labelMap glyphs ♯/♭/无, Major/Minor)
// match NetEase's ACTUAL option strings. A NetEase redesign that renames an
// option or moves an anchor fails here.
//
// What it CANNOT verify (the snapshot is a dead, React-less capture): the live
// open/close state machine — so the 调式 multi-select linger bug and the tag /
// license MODAL contents (not pre-rendered in the snapshot) are out of scope.

const RECIPE = JSON.parse(RECIPE_JSON) as FormMap;

function mkExport(fields: Record<string, string>): ExportResult {
  return {
    platform: "netease",
    fields: Object.entries(fields).map(([key, value]) => ({ key, label: key, value, options: [], note: null })),
  };
}

function items(dd: Element): string[] {
  return [...dd.querySelectorAll(".ant-select-dropdown-menu-item")].map((i) => (i.textContent ?? "").trim());
}

// Seed live-like open/close onto the snapshot's pre-rendered (hidden) dropdowns:
// clicking a trigger toggles ITS dropdown visible; clicking an option marks it
// and (single-select) re-hides. This replays the real Ant behavior using the
// real trigger elements + real option text already present in the snapshot.
function wireSnapshot(doc: Document): void {
  const dds = [...doc.querySelectorAll(".ant-select-dropdown")];
  const find = (pred: (t: string[]) => boolean): Element | undefined => dds.find((dd) => pred(items(dd)));
  const genreDD = find((t) => t.some((x) => x.includes("Trap Rap")));
  const noteDD = find((t) => t.length === 7 && t.includes("C") && t.includes("B") && !t.includes("Major"));
  const accDD = find((t) => t.includes("♯"));
  const modeDD = find((t) => t.includes("Major"));

  const wire = (trigger: Element | null, dd: Element | undefined, multi = false): void => {
    if (!trigger || !dd) return;
    trigger.addEventListener("click", () => dd.classList.toggle("ant-select-dropdown-hidden"));
    dd.querySelectorAll(".ant-select-dropdown-menu-item").forEach((it) =>
      it.addEventListener("click", () => {
        it.setAttribute("data-picked", "1");
        if (!multi) dd.classList.add("ant-select-dropdown-hidden");
      }),
    );
  };

  wire(doc.querySelector('[data-ne2e-name="beatGenre"] .ant-select-selection'), genreDD);
  const keySel = doc.querySelectorAll('[data-ne2e-name="beatKey"] .ant-select-selection');
  wire(keySel[0], noteDD); // 音名
  wire(keySel[1], accDD); // 调号
  wire(keySel[2], modeDD, true); // 调式 (multi-select)

  // closePopups()'s outside-click should drop any lingering single-select dropdown.
  doc.body.addEventListener("mousedown", () => dds.forEach((dd) => dd.classList.add("ant-select-dropdown-hidden")));
}

function pickedTexts(doc: Document): string[] {
  return [...doc.querySelectorAll('.ant-select-dropdown-menu-item[data-picked="1"]')].map((e) =>
    (e.textContent ?? "").trim(),
  );
}

describe("recipe vs real saved NetEase DOM", () => {
  beforeEach(() => {
    // DOMParser gives the full lenient HTML parse (document.write truncates the
    // snapshot; documentElement.replaceWith silently drops nodes in jsdom).
    // importNode the parsed <body> into the SAME global `document` so waitFor
    // (root defaults to the global document) and the drivers' ctx.doc agree.
    const parsed = new DOMParser().parseFromString(HTML, "text/html");
    document.documentElement.replaceChild(document.importNode(parsed.body, true), document.body);
    wireSnapshot(document);
  });

  it("every recipe selector resolves against the real page (drift guard)", () => {
    const f = RECIPE.fields as Record<string, any>;
    expect(document.querySelector(f.title.selector), "title").toBeTruthy();
    expect(document.querySelector(f.bpm.selector), "bpm").toBeTruthy();
    expect(document.querySelector(f.description.selector), "description").toBeTruthy();
    expect(document.querySelector(f.genre.triggerSelector), "genre trigger").toBeTruthy();
    // KEY uses triggerIndex 0/1/2 against the same selector — need ≥3 matches.
    expect(document.querySelectorAll(f.key.note.triggerSelector).length, "key selections").toBeGreaterThanOrEqual(3);
    expect(document.querySelector(f.mood.triggerSelector), "mood trigger").toBeTruthy();
    expect(document.querySelector(f.price.triggerSelector), "price trigger").toBeTruthy();
  });

  it("native fields fill through the real placeholder selectors", () => {
    const exp = mkExport({ title: "Midnight Drill", bpm: "140", description: "dark drill beat" });
    const report = fillForm(document, exp, RECIPE);
    expect(report.filled.sort()).toEqual(["bpm", "description", "title"]);
    expect((document.querySelector(RECIPE.fields.title.selector as any) as HTMLInputElement).value).toBe(
      "Midnight Drill",
    );
  });

  it("genre picks the real bilingual option by zh prefix", async () => {
    const exp = mkExport({ genre: "陷阱说唱", key: "", mood: "", tags: "", price: "" });
    const report = await fillInteractions(document, exp, RECIPE);
    expect(report.filled).toContain("genre");
    expect(pickedTexts(document)).toContain("陷阱说唱 Trap Rap");
  });

  it("KEY 'F# minor' selects the real note + accidental + mode options", async () => {
    const exp = mkExport({ genre: "", key: "F# minor", mood: "", tags: "", price: "" });
    const report = await fillInteractions(document, exp, RECIPE);
    expect(report.filled).toContain("key");
    const picked = pickedTexts(document);
    expect(picked).toContain("F"); // 音名
    expect(picked).toContain("♯"); // 调号 — labelMap sharp matches NetEase's real glyph
    expect(picked).toContain("Minor"); // 调式 — labelMap minor matches NetEase's real label
  });

  it("KEY 'C major' selects the natural accidental 无 (not skipped)", async () => {
    const exp = mkExport({ genre: "", key: "C major", mood: "", tags: "", price: "" });
    const report = await fillInteractions(document, exp, RECIPE);
    expect(report.filled).toContain("key");
    const picked = pickedTexts(document);
    expect(picked).toContain("C");
    expect(picked).toContain("无"); // labelMap natural -> 无 matches NetEase
    expect(picked).toContain("Major");
  });

  it("album_name native field selector resolves on the real page", () => {
    const f = RECIPE.fields as Record<string, any>;
    expect(f.album_name, "album_name in recipe").toBeTruthy();
    expect(document.querySelector(f.album_name.selector), "album_name input").toBeTruthy();
  });

  it("album_description native field selector resolves on the real page", () => {
    const f = RECIPE.fields as Record<string, any>;
    expect(f.album_description, "album_description in recipe").toBeTruthy();
    expect(document.querySelector(f.album_description.selector), "album_description textarea").toBeTruthy();
  });
});
