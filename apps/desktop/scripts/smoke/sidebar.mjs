// Sidebar assertions (v0.0.14): drop-create API path.
// v0.0.22: source reorder removed; added sidebar-order assertion.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Drop-create via API path. Playwright can't synthesize OS-level file drops in
// Electron, so we verify the underlying API wiring (track create + asset attach)
// that the drop handler calls.
export async function assertDropCreateApiPath(ctx) {
  const { userData, postJson, baseUrl, failures, makeTinyWav } = ctx;
  try {
    const dropPath = join(userData, "drop-test.wav");
    writeFileSync(dropPath, makeTinyWav());
    const dropTrack = await postJson("/api/tracks", { title: "drop-test" });
    await postJson(`/api/tracks/${dropTrack.id}/assets`, { role: "audio_tagged_wav", path: dropPath });
    const allTracks = await (await fetch(`${baseUrl}/api/tracks`)).json();
    const found = Array.isArray(allTracks) && allTracks.some((t) => t.title === "drop-test");
    if (found) {
      console.log("smoke: drop-create track API path PASS");
    } else {
      failures.push(`drop-create: 'drop-test' not found in track list after create+attach`);
    }
  } catch (e) {
    failures.push(`drop-create assertion error: ${e.message}`);
  }
}

// v0.0.22: assert the new sidebar order — All Beats / Trash / Lists / Approvals
// (footer is non-button so omitted). Replaces the v0.0.14 source reorder API
// assertion which targeted the now-removed /api/sources/reorder route.
//
// "All Beats", "Trash", "Approvals" each render as a single sidebar button whose
// text starts with that label (count suffix appended, e.g. "All Beats5"). "Lists"
// is a section header (plain text node, NOT a button), so we read the sidebar's
// full topY-ordered text nodes instead of just buttons to anchor its position.
export async function assertSidebarOrder(ctx) {
  const { window, failures } = ctx;
  try {
    const positions = await window.evaluate(() => {
      const sidebar = document.querySelector("aside");
      if (!sidebar) return null;
      // Walk all text-bearing descendants; for each "needle", record the top
      // of the first element whose textContent contains it.
      const needles = ["All Beats", "Trash", "Lists", "Approvals"];
      const out = {};
      const all = Array.from(sidebar.querySelectorAll("*"));
      for (const needle of needles) {
        for (const el of all) {
          const txt = (el.textContent ?? "").trim();
          // Only count leaf-ish nodes — avoid the <aside> root matching everything.
          if (!txt || el.children.length > 4) continue;
          if (txt.includes(needle)) {
            const rect = el.getBoundingClientRect();
            if (out[needle] === undefined) out[needle] = rect.top;
            break;
          }
        }
      }
      return out;
    });
    if (!positions) {
      failures.push("sidebar order: <aside> not found");
      return;
    }
    const required = ["All Beats", "Trash", "Lists", "Approvals"];
    const missing = required.filter((n) => positions[n] === undefined);
    if (missing.length > 0) {
      failures.push(`sidebar order: missing labels ${JSON.stringify(missing)}; positions=${JSON.stringify(positions)}`);
      return;
    }
    const tops = required.map((n) => positions[n]);
    for (let i = 1; i < tops.length; i++) {
      if (tops[i] <= tops[i - 1]) {
        failures.push(`sidebar order: out of order — ${required[i - 1]}=${tops[i - 1]} not above ${required[i]}=${tops[i]}`);
        return;
      }
    }
    console.log("smoke: sidebar order (All Beats → Trash → Lists → Approvals) PASS");
  } catch (e) {
    failures.push(`sidebar order assertion error: ${e.message}`);
  }
}
