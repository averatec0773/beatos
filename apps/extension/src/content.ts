import { fillForm, type ExportResult, type FormMap } from "./fill-form";
import { fillInteractions } from "./interaction-fill";

const POLL_MS = 2000;

function overlay(report: { filled: string[]; missed: string[] }, audioHint: string, coverHint = ""): void {
  const id = "beatos-overlay";
  document.getElementById(id)?.remove();
  const box = document.createElement("div");
  box.id = id;
  box.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;" +
    "background:#1b1b1f;color:#eee;font:13px/1.5 system-ui;padding:12px 14px;" +
    "border:1px solid #444;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4)";
  const line = (text: string, css: string): HTMLDivElement => {
    const d = document.createElement("div");
    d.style.cssText = css;
    d.textContent = text;
    return d;
  };

  box.appendChild(line(`BeatOS 已填 ${report.filled.length} 个字段`, "font-weight:600;margin-bottom:4px"));
  if (report.missed.length) {
    box.appendChild(line(`未匹配字段(可能改版): ${report.missed.join(", ")}`, "color:#f6b"));
  }
  box.appendChild(line(`请拖入音频文件 ${audioHint}`, "margin-top:6px;color:#9cf"));
  if (coverHint) box.appendChild(line(`请拖入封面图 ${coverHint}`, "margin-top:2px;color:#9cf"));
  box.appendChild(line("专辑请手动新建/选择并填写专辑名+描述（可从 BeatOS 导出对话框复制）", "margin-top:2px;color:#fc9"));
  box.appendChild(line("核对后由你手动点提交", "margin-top:2px;color:#888"));

  document.body.appendChild(box);
  setTimeout(() => box.remove(), 12000);
}

async function apply(exp: ExportResult, formMap: FormMap): Promise<void> {
  const title = exp.fields.find((f) => f.key === "title")?.value ?? "";
  const hint = title ? `"${title}"` : "";
  const coverHint = "（用作品封面）";
  const native = fillForm(document, exp, formMap);
  overlay(native, hint, coverHint); // instant feedback for the native text fields
  const interactive = await fillInteractions(document, exp, formMap);
  overlay(
    { filled: [...native.filled, ...interactive.filled], missed: [...native.missed, ...interactive.missed] },
    hint,
    coverHint,
  ); // update with interaction results
}

async function poll(): Promise<void> {
  let resp: { staged: boolean; export?: unknown; formMap?: unknown } | undefined;
  try {
    resp = await chrome.runtime.sendMessage({ type: "beatos-poll" });
  } catch {
    return; // background asleep / extension reloading — try next tick
  }
  if (resp?.staged) {
    await apply(resp.export as ExportResult, resp.formMap as FormMap);
  }
}

// content script runs in the page context, so setInterval is reliable while the
// upload tab is open. This drives the cadence; background just does the fetch.
setInterval(() => void poll(), POLL_MS);
void poll();
