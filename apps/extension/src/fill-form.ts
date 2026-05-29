export interface ExportField {
  key: string;
  label: string;
  value: string;
  options: string[];
  note: string | null;
}

export interface ExportResult {
  platform: string;
  fields: ExportField[];
}

export type FieldType = "text" | "textarea" | "select" | "tags";

export interface FieldSpec {
  selector: string;
  type: FieldType;
}

export interface FormMap {
  match: string[];
  fields: Record<string, FieldSpec>;
}

export interface FillReport {
  filled: string[];
  missed: string[];
}

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Set a value the way React/Vue-controlled inputs expect: go through the
 * prototype's native value setter (bypassing the framework's overridden one),
 * then dispatch input + change so the framework's state syncs.
 */
export function setNativeValue(el: Fillable, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) {
    desc.set.call(el, value);
  } else {
    (el as { value: string }).value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Fill the upload form's metadata fields. NEVER submits. Returns which keys
 * were filled and which selectors could not be found (likely page redesign).
 * Empty-value fields (e.g. multi-genre needing a manual pick) are skipped.
 */
export function fillForm(doc: Document, result: ExportResult, formMap: FormMap): FillReport {
  const filled: string[] = [];
  const missed: string[] = [];
  const byKey = new Map(result.fields.map((f) => [f.key, f]));

  for (const [key, spec] of Object.entries(formMap.fields)) {
    const field = byKey.get(key);
    const value = field?.value ?? "";
    if (!value) continue; // nothing to fill (incl. multi-option left for manual pick)

    const el = doc.querySelector(spec.selector) as Fillable | null;
    if (!el) {
      missed.push(key);
      continue;
    }
    // text / textarea / select / tags all set value the same robust way in
    // Phase 1; 'tags' is best-effort and verified against the live page later.
    setNativeValue(el, value);
    // A <select> silently ignores a value with no matching <option> (e.g. the
    // platform's option vocabulary changed). Detect that and report it as a
    // miss rather than a false-positive fill.
    if (spec.type === "select" && (el as HTMLSelectElement).value !== value) {
      missed.push(key);
      continue;
    }
    filled.push(key);
  }

  return { filled, missed };
}
