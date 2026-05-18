// Sidebar assertions (v0.0.14): drop-create API path + source reorder API.
import { mkdirSync, writeFileSync } from "node:fs";
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

// Source reorder API: POST /api/sources/reorder reverses the existing order.
export async function assertSourceReorderApi(ctx) {
  const { userData, postJson, baseUrl, failures } = ctx;
  try {
    const srcBDir = join(userData, "src-b");
    mkdirSync(srcBDir, { recursive: true });
    await postJson("/api/sources", { root_path: srcBDir });
    const existing = await (await fetch(`${baseUrl}/api/sources`)).json();
    if (!Array.isArray(existing) || existing.length < 2) {
      console.log(`smoke: sidebar source reorder API SKIP (need 2+ sources, got ${existing?.length})`);
    } else {
      const reverseIds = existing.map((s) => s.id).reverse();
      const r = await fetch(`${baseUrl}/api/sources/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reverseIds }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        failures.push(`sidebar reorder: POST /api/sources/reorder returned ${r.status}: ${text.slice(0, 200)}`);
      } else {
        const after = await (await fetch(`${baseUrl}/api/sources`)).json();
        const newOrder = after.map((s) => s.id);
        if (JSON.stringify(newOrder) === JSON.stringify(reverseIds)) {
          console.log("smoke: sidebar source reorder API PASS");
        } else {
          failures.push(`sidebar reorder: expected ${JSON.stringify(reverseIds)}, got ${JSON.stringify(newOrder)}`);
        }
      }
    }
  } catch (e) {
    failures.push(`sidebar reorder assertion error: ${e.message}`);
  }
}
