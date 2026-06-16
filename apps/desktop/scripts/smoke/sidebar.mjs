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
    await postJson(`/api/tracks/${dropTrack.id}/assets`, {
      role: "audio_tagged",
      path: dropPath,
    });
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

// Assert the sidebar order — All Beats / Publish Center / Agent Actions / Trash / Lists
// (footer is non-button so omitted). Replaces the v0.0.14 source reorder API
// assertion which targeted the now-removed /api/sources/reorder route.
// ("Approvals" was renamed to "Agent Actions" and Publish Center added — v0.0.47.)
//
// "All Beats", "Publish Center", "Agent Actions", "Trash" each render as a single
// sidebar button whose text starts with that label (count suffix may be appended,
// e.g. "All Beats5"). "Lists" is a section header (plain text node, NOT a button).
// For each label we anchor
// on the MOST SPECIFIC element containing it (shortest textContent) so a wrapper
// that contains several labels never collapses them to the same top.
export async function assertSidebarOrder(ctx) {
  const { window, failures } = ctx;
  try {
    const positions = await window.evaluate(() => {
      const sidebar = document.querySelector("aside");
      if (!sidebar) return null;
      // For each "needle", record the top of the element with the SHORTEST
      // textContent containing it — i.e. the most specific (leaf) node, so a
      // wrapper that contains several labels never wins over the label itself.
      const needles = ["All Beats", "Publish Center", "Agent Actions", "Trash", "Lists"];
      const out = {};
      const all = Array.from(sidebar.querySelectorAll("*"));
      for (const needle of needles) {
        let bestLen = Infinity;
        for (const el of all) {
          const txt = (el.textContent ?? "").trim();
          if (!txt || !txt.includes(needle)) continue;
          if (txt.length < bestLen) {
            bestLen = txt.length;
            out[needle] = el.getBoundingClientRect().top;
          }
        }
      }
      return out;
    });
    if (!positions) {
      failures.push("sidebar order: <aside> not found");
      return;
    }
    const required = ["All Beats", "Publish Center", "Agent Actions", "Trash", "Lists"];
    const missing = required.filter((n) => positions[n] === undefined);
    if (missing.length > 0) {
      failures.push(
        `sidebar order: missing labels ${JSON.stringify(missing)}; positions=${JSON.stringify(positions)}`,
      );
      return;
    }
    const tops = required.map((n) => positions[n]);
    for (let i = 1; i < tops.length; i++) {
      if (tops[i] <= tops[i - 1]) {
        failures.push(
          `sidebar order: out of order — ${required[i - 1]}=${tops[i - 1]} not above ${required[i]}=${tops[i]}`,
        );
        return;
      }
    }
    console.log(
      "smoke: sidebar order (All Beats → Publish Center → Agent Actions → Trash → Lists) PASS",
    );
  } catch (e) {
    failures.push(`sidebar order assertion error: ${e.message}`);
  }
}
