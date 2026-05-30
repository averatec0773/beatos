import { waitFor } from "./dom-wait";
import type { ExportResult, FillReport, FormMap } from "./fill-form";
import { decomposeKey } from "./key-decompose";

export type DriverResult = "filled" | "missed";

export interface DriverCtx {
  doc: Document;
  waitFor: typeof waitFor;
}

// A driver gets the field key, the full ExportResult (some widgets pull several
// fields), and ctx. It NEVER throws and NEVER submits the form.
export type Driver = (spec: any, key: string, exp: ExportResult, ctx: DriverCtx) => Promise<DriverResult>;

export function fieldValue(exp: ExportResult, key: string): string {
  return exp.fields.find((f) => f.key === key)?.value ?? "";
}

export function closePopups(doc: Document): void {
  doc.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  (doc.activeElement as HTMLElement | null)?.blur?.();
}

/** Find a control near a field's visible label text (Ant selects lack stable ids). */
export function findControlByLabel(doc: Document, label: string, controlSel: string): HTMLElement | null {
  const labelEl = Array.from(doc.querySelectorAll("*")).find(
    (e) => e.childElementCount === 0 && (e.textContent ?? "").trim() === label,
  );
  if (!labelEl) return null;
  let node: Element | null = labelEl;
  for (let i = 0; i < 6 && node; i++) {
    const inside = node.querySelector(controlSel);
    if (inside) return inside as HTMLElement;
    let sib = node.nextElementSibling;
    while (sib) {
      if (sib.matches(controlSel)) return sib as HTMLElement;
      const c = sib.querySelector(controlSel);
      if (c) return c as HTMLElement;
      sib = sib.nextElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

function resolveTrigger(doc: Document, spec: any): HTMLElement | null {
  if (spec.triggerSelector) return doc.querySelector(spec.triggerSelector) as HTMLElement | null;
  if (spec.triggerLabel)
    return findControlByLabel(doc, spec.triggerLabel, spec.controlSelector ?? ".ant-select, .ant-select-selection");
  return null;
}

function optionMatches(text: string, target: string, mode: string): boolean {
  if (mode === "contains") return text.includes(target);
  if (mode === "prefix") return text === target || text.startsWith(target + " ");
  return text === target; // exact
}

/**
 * Open an Ant v3 select (trigger resolved by label or selector) and click the
 * option whose text matches `target`. Returns true on a successful click.
 * Does NOT close the dropdown — callers close (multi-selects stay open) unless
 * used inside a modal (where Esc would close the modal).
 */
export async function pickAntOption(
  ctx: DriverCtx,
  cfg: {
    triggerSelector?: string;
    triggerLabel?: string;
    controlSelector?: string;
    optionContainer: string;
    optionItem: string;
    match?: string;
  },
  target: string,
): Promise<boolean> {
  const trig = resolveTrigger(ctx.doc, cfg);
  if (!trig) return false;
  trig.click();
  const container = await ctx.waitFor(cfg.optionContainer, { timeoutMs: 2000 });
  if (!container) return false;
  const items = Array.from(container.querySelectorAll(cfg.optionItem)) as HTMLElement[];
  const hit = items.find((it) => optionMatches((it.textContent ?? "").trim(), target, cfg.match ?? "exact"));
  if (!hit) return false;
  hit.click();
  return true;
}

const antv3Select: Driver = async (spec, key, exp, ctx) => {
  const target = (fieldValue(exp, key).split(" / ")[0] ?? "").trim();
  if (!target) return "missed";
  const ok = await pickAntOption(ctx, spec, target);
  // Single-selects auto-close on pick; multi-selects stay open — only then send Esc.
  if (ok && ctx.doc.querySelector(spec.optionContainer)) closePopups(ctx.doc);
  return ok ? "filled" : "missed";
};

const keyTriple: Driver = async (spec, key, exp, ctx) => {
  const dk = decomposeKey(fieldValue(exp, key));
  if (!dk) return "missed";
  const subs: Array<{ sub: any; raw: string }> = [
    { sub: spec.note, raw: dk.note },
    { sub: spec.accidental, raw: dk.accidental },
    { sub: spec.mode, raw: dk.mode },
  ];
  let ok = true;
  for (const { sub, raw } of subs) {
    if (!sub) continue;
    const label = sub.labelMap ? (sub.labelMap[raw] ?? "") : raw;
    if (label === "") continue; // labelMap intentionally maps this part to nothing
    const picked = await pickAntOption(ctx, sub, label);
    if (picked && ctx.doc.querySelector(sub.optionContainer)) closePopups(ctx.doc);
    if (!picked) ok = false;
  }
  return ok ? "filled" : "missed";
};

const DRIVERS: Record<string, Driver> = {
  "antv3-select": antv3Select,
  "key-triple": keyTriple,
};

export async function fillInteractions(doc: Document, exp: ExportResult, formMap: FormMap): Promise<FillReport> {
  const filled: string[] = [];
  const missed: string[] = [];
  const ctx: DriverCtx = { doc, waitFor };
  for (const [key, spec] of Object.entries(formMap.fields)) {
    const driver = DRIVERS[spec.type];
    if (!driver) continue; // native field — handled by fillForm
    let result: DriverResult;
    try {
      result = await driver(spec, key, exp, ctx);
    } catch {
      closePopups(doc);
      result = "missed";
    }
    (result === "filled" ? filled : missed).push(key);
  }
  return { filled, missed };
}
