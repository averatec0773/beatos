import { describe, it, expect } from "vitest";
import { fillForm, setNativeValue, type ExportResult, type FormMap } from "./fill-form";

function mkResult(fields: Array<[string, string, string[]?]>): ExportResult {
  return {
    platform: "netease",
    fields: fields.map(([key, value, options]) => ({
      key,
      label: key,
      value,
      options: options ?? [],
      note: null,
    })),
  };
}

const FORM_MAP: FormMap = {
  match: ["https://example/*"],
  fields: {
    title: { selector: "#title", type: "text" },
    description: { selector: "#desc", type: "textarea" },
    genre: { selector: "#genre", type: "select" },
  },
};

describe("setNativeValue", () => {
  it("sets value and dispatches input + change", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push("input"));
    input.addEventListener("change", () => seen.push("change"));
    setNativeValue(input, "hello");
    expect(input.value).toBe("hello");
    expect(seen).toEqual(["input", "change"]);
  });
});

describe("fillForm", () => {
  it("fills text + textarea by selector", () => {
    document.body.innerHTML = `<input id="title"><textarea id="desc"></textarea>`;
    const report = fillForm(
      document,
      mkResult([["title", "My Beat"], ["description", "hot"]]),
      FORM_MAP,
    );
    expect((document.querySelector("#title") as HTMLInputElement).value).toBe("My Beat");
    expect((document.querySelector("#desc") as HTMLTextAreaElement).value).toBe("hot");
    expect(report.filled.sort()).toEqual(["description", "title"]);
    expect(report.missed).toEqual([]);
  });

  it("fills a select whose option value matches", () => {
    document.body.innerHTML = `<select id="genre"><option value="陷阱说唱">陷阱说唱</option></select>`;
    const report = fillForm(document, mkResult([["genre", "陷阱说唱"]]), FORM_MAP);
    expect((document.querySelector("#genre") as HTMLSelectElement).value).toBe("陷阱说唱");
    expect(report.filled).toContain("genre");
  });

  it("reports missed when selector not present", () => {
    document.body.innerHTML = `<textarea id="desc"></textarea>`;
    const report = fillForm(document, mkResult([["title", "X"], ["description", "Y"]]), FORM_MAP);
    expect(report.missed).toEqual(["title"]);
    expect(report.filled).toEqual(["description"]);
  });

  it("skips empty-value fields (multi-option left for manual pick)", () => {
    document.body.innerHTML = `<select id="genre"></select>`;
    const report = fillForm(
      document,
      mkResult([["genre", "", ["陷阱说唱", "流行"]]]),
      FORM_MAP,
    );
    expect(report.filled).toEqual([]);
    expect(report.missed).toEqual([]);
  });

  it("ignores keys present in result but absent from form map", () => {
    document.body.innerHTML = `<input id="title">`;
    const report = fillForm(
      document,
      mkResult([["title", "A"], ["bpm", "140"]]),
      FORM_MAP,
    );
    expect(report.filled).toEqual(["title"]);
  });
});
