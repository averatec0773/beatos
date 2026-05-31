import { waitFor, sleep } from "./dom-wait";
import type { ExportResult, FillReport, FormMap } from "./fill-form";
import { setNativeValue } from "./fill-form";
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
 * NetEase 专辑 is a custom selector (#common-album-selector), not a native input.
 * Open it, click 创建新专辑, fill 专辑名称 + 专辑描述. 专辑类型/版本 default to 专辑/Beat;
 * cover + 发行日期 + the final 提交 stay with the human (we NEVER submit). Always
 * creates a NEW album (no existing-album matching). Open requires the full
 * focus+mousedown+mouseup+click sequence (bare click is insufficient) — confirmed live.
 */
const albumCreate: Driver = async (spec, key, exp, ctx) => {
  const albumName = fieldValue(exp, spec.sourceKeys?.name ?? "album_name");
  if (!albumName) return "missed";

  const trigger = spec.triggerSelector
    ? (ctx.doc.querySelector(spec.triggerSelector) as HTMLElement | null)
    : null;
  if (!trigger) return "missed";
  trigger.focus?.();
  trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  trigger.click();

  const createOpt = (await ctx.waitFor(spec.createOption, { timeoutMs: 2000 })) as HTMLElement | null;
  if (!createOpt) return "missed";
  createOpt.click();

  const nameInput = (await ctx.waitFor(spec.nameInput, { timeoutMs: 2000 })) as HTMLInputElement | null;
  if (!nameInput) return "missed";
  setNativeValue(nameInput, albumName);

  const desc = fieldValue(exp, spec.sourceKeys?.desc ?? "album_description");
  if (desc.length >= 10) {
    const descInput = ctx.doc.querySelector(spec.descInput) as HTMLTextAreaElement | null;
    if (descInput) setNativeValue(descInput, desc);
  }
  return "filled";
};

/**
 * NetEase 授权设置 is a RIGHT-SIDE DRAWER (.ant-drawer), not a modal, and it's
 * multi-step (verified live): click "添加授权方式" → drawer opens → checking
 * 租赁授权 expands a 4-row sub-tier matrix (MP3 / MP3+WAV / MP3+WAV+分轨文件 ×2)
 * each with its own 售价 input + 编曲分润比例 input. Consumes the structured
 * `price_tiers` export field ([{row, price, share}]) and fills each mapped row.
 * Exact-first row matching prevents "MP3" from grabbing the "MP3+WAV" row.
 * It NEVER clicks 保存 — human-in-the-loop, per the no-auto-submit rule.
 */
const licenseModal: Driver = async (spec, key, exp, ctx) => {
  // Structured tiers: [{row:"mp3"|"wav"|"stem", price:number, share:number|null}]
  const tiersKey: string = spec.tiersKey ?? "price_tiers";
  let tiers: Array<{ row: string; price: number; share: number | null }> = [];
  try {
    tiers = JSON.parse(fieldValue(exp, tiersKey) || "[]");
  } catch {
    tiers = [];
  }
  const isFree = (fieldValue(exp, "is_free") || "") === "1";
  if ((!Array.isArray(tiers) || tiers.length === 0) && !isFree) return "missed";

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

  const drawer = (await ctx.waitFor(spec.drawer ?? ".ant-drawer-open", { timeoutMs: 2000 })) as HTMLElement | null;
  if (!drawer) return "missed";

  let filled = 0;

  if (tiers.length > 0) {
    const optionText = normText(spec.licenseType ?? "租赁授权");
    const option = (Array.from(drawer.querySelectorAll(spec.optionSelector ?? ".defaultView--2Kp-o")) as HTMLElement[])
      .find((o) => normText(o.textContent).includes(optionText));
    if (option) {
      const cb = option.querySelector("input[type=checkbox]") as HTMLInputElement | null;
      const label = option.querySelector("label") as HTMLElement | null;
      if (cb && !cb.checked && label) label.click();
    }

    const container = (await ctx.waitFor(spec.rowContainer ?? ".multiSelectorView--21Ufr", { timeoutMs: 2000 })) as HTMLElement | null;
    if (!container) return "missed";

    const rowTitles: Record<string, string> = spec.rowTitles ?? {};
    const rowEls = Array.from(container.querySelectorAll(spec.rowItem ?? ".selectorSubItem--1vBQj")) as HTMLElement[];
    const titleOf = (el: HTMLElement): string => {
      const t = el.querySelector(".rowTitle, [class*=title], [class*=Title]");
      return (t?.textContent ?? el.textContent ?? "").trim();
    };

    for (const tier of tiers) {
      const wantTitle = rowTitles[tier.row];
      if (!wantTitle) continue;
      // exact-first (so "MP3" doesn't grab the "MP3+WAV" row), then prefix fallback
      const row =
        rowEls.find((el) => titleOf(el) === wantTitle) ??
        rowEls.find((el) => titleOf(el).startsWith(wantTitle));
      if (!row) continue;
      const cb = row.querySelector("input[type=checkbox]") as HTMLInputElement | null;
      const cbLabel = row.querySelector("label") as HTMLElement | null;
      if (cb && !cb.checked && cbLabel) cbLabel.click();
      const priceEl = row.querySelector(spec.priceInput ?? "input[type=number][placeholder*='售价']") as HTMLInputElement | null;
      if (priceEl && tier.price != null) {
        setNativeValue(priceEl, String(tier.price));
        filled++;
      }
      if (tier.share != null) {
        const shareEl = row.querySelector(spec.shareInput ?? "input[type=number][placeholder*='编曲分润比例']") as HTMLInputElement | null;
        if (shareEl) setNativeValue(shareEl, String(tier.share));
      }
    }
  }

  if (isFree && spec.freeLicenseType) {
    const freeText = normText(spec.freeLicenseType);
    const freeOpt = (Array.from(drawer.querySelectorAll(spec.optionSelector ?? ".defaultView--2Kp-o")) as HTMLElement[])
      .find((o) => normText(o.textContent).includes(freeText));
    if (freeOpt) {
      const fcb = freeOpt.querySelector("input[type=checkbox]") as HTMLInputElement | null;
      const flabel = freeOpt.querySelector("label") as HTMLElement | null;
      if (fcb && !fcb.checked && flabel) flabel.click();
    }
  }

  // No 保存 click — human reviews + submits.
  return filled > 0 || isFree ? "filled" : "missed";
};

const DRIVERS: Record<string, Driver> = {
  "antv3-select": antv3Select,
  "key-triple": keyTriple,
  "tag-modal": tagModal,
  "license-modal": licenseModal,
  "album-create": albumCreate,
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
