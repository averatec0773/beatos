import { waitFor, sleep } from "./dom-wait";
import type { ExportResult, FillReport, FormMap } from "./fill-form";
import { setNativeValue } from "./fill-form";
import { decomposeKey } from "./key-decompose";
import { parsePrice } from "./price-parse";

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
  // Best-effort dismissal for Ant popups: Esc closes modals; an outside pointer
  // event closes most dropdowns; blur drops focus. NOTE: NetEase's KEY 调式
  // multi-select dropdown ignores all of these and may linger open (its value is
  // still correctly committed) — a known, accepted limitation.
  const body = doc.body;
  body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
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
  if (spec.triggerSelector) {
    if (typeof spec.triggerIndex === "number") {
      return (doc.querySelectorAll(spec.triggerSelector)[spec.triggerIndex] as HTMLElement) ?? null;
    }
    return doc.querySelector(spec.triggerSelector) as HTMLElement | null;
  }
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
 * The dropdown belonging to THIS trigger, located via its `aria-controls` (Ant
 * v3 points it at a node inside the trigger's own dropdown). Returns null when
 * there's no aria-controls (e.g. the jsdom test fixtures) so the caller falls
 * back to scanning all visible dropdowns.
 *
 * Why this matters (proven live on the NetEase page): Ant v3's rc-trigger only
 * closes a dropdown on a TRUSTED outside click — a content script can emit only
 * untrusted events, so none of our close attempts work and dropdowns ACCUMULATE
 * across fields. A previous field's stale dropdown then satisfies a naive
 * "wait for any .ant-select-dropdown" instantly, so the option scan races ahead
 * of the new dropdown's render and finds nothing (this was the 调式-left-empty
 * bug). Scoping to the trigger's own dropdown removes the race entirely.
 */
function ownDropdown(doc: Document, trig: HTMLElement): HTMLElement | null {
  const id = trig.getAttribute?.("aria-controls");
  if (!id) return null;
  const inner = doc.getElementById(id);
  return (inner?.closest(".ant-select-dropdown") as HTMLElement | null) ?? null;
}

/**
 * Open an Ant v3 select (trigger by label/selector/index) and click the option
 * whose text matches `target`. Polls until the option is actually present, so
 * it never races the dropdown's async render. When the trigger exposes
 * `aria-controls` it scopes strictly to that trigger's OWN dropdown (see
 * ownDropdown); otherwise it scans every visible dropdown. Returns true on a
 * successful click. Does NOT try to close the dropdown afterward — a multi-
 * select's dropdown lingers open (unavoidable; the value still commits) and
 * that's purely cosmetic.
 */
export async function pickAntOption(
  ctx: DriverCtx,
  cfg: {
    triggerSelector?: string;
    triggerIndex?: number;
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
  const match = cfg.match ?? "exact";
  const deadline = Date.now() + 2000;
  for (;;) {
    const own = ownDropdown(ctx.doc, trig);
    const containers = own
      ? own.classList.contains("ant-select-dropdown-hidden")
        ? []
        : [own]
      : Array.from(ctx.doc.querySelectorAll(cfg.optionContainer));
    for (const c of containers) {
      const items = Array.from(c.querySelectorAll(cfg.optionItem)) as HTMLElement[];
      const hit = items.find((it) => optionMatches((it.textContent ?? "").trim(), target, match));
      if (hit) {
        hit.click();
        return true;
      }
    }
    if (Date.now() >= deadline) return false;
    await sleep(40);
  }
}

const antv3Select: Driver = async (spec, key, exp, ctx) => {
  const target = (fieldValue(exp, key).split(" / ")[0] ?? "").trim();
  if (!target) return "missed";
  const ok = await pickAntOption(ctx, spec, target);
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
  // Each sub-select is scoped to its own dropdown via aria-controls (see
  // pickAntOption), so picks don't interfere even though earlier dropdowns
  // stay open — no closePopups needed (it never worked anyway: Ant v3 only
  // closes on a trusted outside click, which a content script can't emit).
  let ok = true;
  for (const { sub, raw } of subs) {
    if (!sub) continue;
    const label = sub.labelMap ? (sub.labelMap[raw] ?? "") : raw;
    if (label === "") continue; // labelMap intentionally maps this part to nothing
    const picked = await pickAntOption(ctx, sub, label);
    if (!picked) ok = false;
  }
  return ok ? "filled" : "missed";
};

function splitTagValue(v: string): string[] {
  return v
    .split(/[/，,]|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normText(s: string | null): string {
  return (s ?? "").replace(/\s+/g, "");
}

const tagModal: Driver = async (spec, key, exp, ctx) => {
  const keys: string[] = spec.sourceKeys ?? [key];
  const values = Array.from(new Set(keys.flatMap((k) => splitTagValue(fieldValue(exp, k)))));
  if (!values.length) return "missed";

  let trig: HTMLElement | null = spec.triggerSelector
    ? (ctx.doc.querySelector(spec.triggerSelector) as HTMLElement | null)
    : null;
  if (!trig && spec.triggerText) {
    const want = normText(spec.triggerText);
    trig =
      (Array.from(ctx.doc.querySelectorAll("button, a, [role=button]")).find((e) =>
        normText(e.textContent).includes(want),
      ) as HTMLElement) ?? null;
  }
  if (!trig) return "missed";
  trig.click();

  const modal = (await ctx.waitFor(spec.modal, { timeoutMs: 2000 })) as HTMLElement | null;
  if (!modal) return "missed";

  // The 添加标签 modal is a vertical ant-tabs widget: 适用场景 / 情绪表达 / 自定义.
  // Each panel's tag buttons only register clicks while its tab is active, and
  // moods live under 情绪表达 — so click each named tab, then match buttons in
  // the active panel. (Earlier the driver only saw the default tab, so no mood
  // ever matched — verified live on the NetEase page.) `tabTexts` is configured
  // in the recipe; falls back to the two stock tabs.
  const tabTexts: string[] = spec.tabTexts ?? ["适用场景", "情绪表达"];
  const tabs = Array.from(modal.querySelectorAll(spec.tabSelector ?? ".ant-tabs-tab")) as HTMLElement[];
  const selectedClass: string = spec.selectedClass ?? "beatButtonChoose";
  const remaining = new Set(values);

  const pickInActivePanel = (): void => {
    const panel = (modal.querySelector(spec.activePanel ?? ".ant-tabs-tabpane-active") ?? modal) as HTMLElement;
    const buttons = Array.from(panel.querySelectorAll(spec.tagButton ?? "button")) as HTMLElement[];
    for (const v of Array.from(remaining)) {
      const btn = buttons.find((b) => (b.textContent ?? "").trim() === v);
      if (btn) {
        if (!btn.className.includes(selectedClass)) btn.click();
        remaining.delete(v);
      }
    }
  };

  if (tabs.length) {
    for (const tabText of tabTexts) {
      const tab = tabs.find((t) => normText(t.textContent).includes(normText(tabText)));
      if (!tab) continue;
      tab.click();
      await sleep(80); // let the panel switch render
      pickInActivePanel();
      if (!remaining.size) break;
    }
  } else {
    pickInActivePanel(); // no tabs (e.g. test fixture) — match across the modal
  }

  const matched = values.length - remaining.size;

  const wantConfirm = normText(spec.confirmText ?? "确定");
  const confirm =
    (Array.from(modal.querySelectorAll("button")).find((b) => normText(b.textContent) === wantConfirm) as
      | HTMLElement
      | undefined) ?? null;
  if (confirm) confirm.click();

  return matched > 0 ? "filled" : "missed";
};

/**
 * NetEase 授权设置 is a RIGHT-SIDE DRAWER (.ant-drawer), not a modal, and it's
 * multi-step (verified live): click "添加授权方式" → drawer opens with three
 * fixed checkbox options (免费使用 / 租赁授权 / 永久独家) → checking 租赁授权
 * expands a sub-tier matrix (MP3 / MP3+WAV / …) each with its own 售价
 * input[type=number] → footer is 取消 / 保存. NetEase's fixed taxonomy doesn't
 * map 1:1 onto BeatOS's free-form tiers, so this is honest BEST-EFFORT: open the
 * drawer, check the configured license type, and fill the first visible 售价
 * with the first tier's amount. It NEVER clicks 保存 — the producer reviews the
 * sub-tier matrix and saves manually (human-in-the-loop, per the no-auto-submit
 * rule). Reports "filled" only if a price actually landed in an input.
 */
const licenseModal: Driver = async (spec, key, exp, ctx) => {
  const tiers = parsePrice(fieldValue(exp, key));
  if (!tiers.length) return "missed";

  let trig: HTMLElement | null = spec.triggerSelector
    ? (ctx.doc.querySelector(spec.triggerSelector) as HTMLElement | null)
    : null;
  if (!trig && spec.triggerText) {
    const want = normText(spec.triggerText);
    trig =
      (Array.from(ctx.doc.querySelectorAll("button, a, [role=button], [class*=button]")).find((e) =>
        normText(e.textContent).includes(want),
      ) as HTMLElement) ?? null;
  }
  if (!trig) return "missed";
  trig.click();

  const drawer = (await ctx.waitFor(spec.drawer ?? ".ant-drawer", { timeoutMs: 2000 })) as HTMLElement | null;
  if (!drawer) return "missed";

  // Check the license-type option (免费使用 / 租赁授权 / 永久独家). Which one is
  // configured in the recipe; default 租赁授权 (the paid type that exposes 售价).
  const optionText = normText(spec.licenseType ?? "租赁授权");
  const options = Array.from(drawer.querySelectorAll(spec.optionSelector ?? ".defaultView--2Kp-o")) as HTMLElement[];
  const option = options.find((o) => normText(o.textContent).includes(optionText));
  if (option) {
    const cb = option.querySelector("input[type=checkbox]") as HTMLInputElement | null;
    const label = option.querySelector("label") as HTMLElement | null;
    if (cb && !cb.checked && label) label.click();
    await sleep(120); // let the sub-tier price rows expand
  }

  const amt = tiers[0].amounts["CNY"] ?? Object.values(tiers[0].amounts)[0];
  if (amt == null) return "missed";
  const priceEl = drawer.querySelector(
    spec.priceInput ?? "input[type=number][placeholder*='售价']",
  ) as HTMLInputElement | null;
  if (!priceEl) return "missed";
  setNativeValue(priceEl, String(amt));
  // No 保存 click — human reviews + submits.
  return "filled";
};

const DRIVERS: Record<string, Driver> = {
  "antv3-select": antv3Select,
  "key-triple": keyTriple,
  "tag-modal": tagModal,
  "license-modal": licenseModal,
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
