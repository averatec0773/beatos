// Library / table assertions: seed fixtures, drag-drop, filter chips, sort,
// column resizer, column alignment, scroll sync.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Seeds Source + 2 tracks + 1 list + cover for Smoke1.
// Verifies: track.cover_asset_id API wiring, cover img DOM render,
// drag handle scoping, dnd-kit drag-add, multi-add API.
// Mutates: ctx.fixtures.{ t1, t2, list, coverAsset } populated for downstream sections.
export async function assertSeedAndDragDrop(ctx) {
  const { window, userData, baseUrl, postJson, failures, TINY_PNG } = ctx;

  // Seed: Source rooted at userData (writable, real dir), 2 tracks, 1 cover image, 1 List.
  await postJson("/api/sources", { root_path: userData });

  const t1 = await postJson("/api/tracks", { title: "Smoke1" });
  const t2 = await postJson("/api/tracks", { title: "Smoke2" });
  const list = await postJson("/api/lists", { name: "SmokeList" });

  // Cover asset for Smoke1: write a tiny PNG into the Source root and attach.
  const coverPath = join(userData, "smoke1-cover.png");
  writeFileSync(coverPath, TINY_PNG);
  const coverAsset = await postJson(`/api/tracks/${t1.id}/assets`, {
    role: "cover",
    path: coverPath,
  });
  if (typeof coverAsset.id !== "number") {
    throw new Error(`attach cover returned no id: ${JSON.stringify(coverAsset)}`);
  }

  // API-level: confirm cover_asset_id flows into Track responses.
  const tracksAfterSeed = await (await fetch(`${baseUrl}/api/tracks`)).json();
  const t1FromApi = tracksAfterSeed.find((t) => t.id === t1.id);
  if (!t1FromApi || t1FromApi.cover_asset_id !== coverAsset.id) {
    failures.push(
      `API: Smoke1.cover_asset_id expected ${coverAsset.id}, got ${t1FromApi?.cover_asset_id}`,
    );
  } else {
    console.log("smoke: track.cover_asset_id wiring PASS");
  }

  // Force renderer to pick up the new state. After seeding, we're at #/welcome
  // (zero sources at boot). Navigate to "/" so AppShell mounts and refreshes.
  await window.evaluate(() => { location.hash = "/"; });
  await window.evaluate(() => location.reload());
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector('[role="row"]', { timeout: 5000 });

  // UI assertion: cover img actually renders inside the row.
  const row1 = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
  const coverImg = row1.locator('img[src^="beatos-asset://cover/"]');
  if ((await coverImg.count()) === 0) {
    failures.push("UI: Smoke1 row has no <img src=beatos-asset://cover/...>");
  } else {
    console.log("smoke: cover img render PASS");
  }

  // Structural (Phase 4): whole row is the dnd-kit drag handle. Verify the row
  // root exists and is visible — drag starts anywhere on the row.
  if ((await row1.count()) === 0) {
    failures.push("UI: drag handle for 'Smoke1' not found after seeding");
  } else {
    console.log("smoke: drag handle scoping PASS");
  }

  // UI drag: one track → SmokeList via dnd-kit. Start from row centre (whole row is handle).
  const listTarget = window.locator("text=SmokeList").first();
  if ((await row1.count()) === 0) {
    // already reported above
  } else if (!(await row1.isVisible())) {
    failures.push("UI: drag handle exists in DOM but not visible (hidden/zero-size)");
  } else if ((await listTarget.count()) === 0) {
    failures.push("UI: sidebar 'SmokeList' not found after seeding");
  } else {
    // Manual mouse drive — dragTo skips intermediate positions and dnd-kit's
    // distance constraint never trips. We move in explicit steps.
    const sourceBox = await row1.boundingBox();
    const targetBox = await listTarget.boundingBox();
    if (!sourceBox || !targetBox) {
      failures.push("UI: could not compute bounding boxes for drag");
    } else {
      const sx = sourceBox.x + sourceBox.width / 2;
      const sy = sourceBox.y + sourceBox.height / 2;
      const tx = targetBox.x + targetBox.width / 2;
      const ty = targetBox.y + targetBox.height / 2;
      await window.mouse.move(sx, sy);
      await window.mouse.down();
      await window.mouse.move(sx + 10, sy + 10, { steps: 5 });
      await window.mouse.move(tx, ty, { steps: 10 });
      await window.mouse.up();
    }
    // Poll the backend from Node (not the renderer) — avoids execution-context
    // destruction if the app navigates to the list view after the drop.
    const pollStart = Date.now();
    let pollResult = null;
    while (Date.now() - pollStart < 3000) {
      const r = await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`);
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length === 1) { pollResult = arr; break; }
      await new Promise((res) => setTimeout(res, 100));
    }
    if (pollResult === null) {
      // Re-fetch one more time to capture the actual state for the failure message.
      const final = await (await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`)).json();
      failures.push(`UI drag-drop: expected 1 member after 3000ms, got ${JSON.stringify(final)}`);
    } else {
      console.log("smoke: dnd-kit UI drag PASS");
    }
  }

  // Multi-add (API-level — Playwright shift+drag is unreliable per plan §7.1)
  await fetch(`${baseUrl}/api/lists/${list.id}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: t2.id }),
  });
  const finalMembers = await (await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`)).json();
  if (finalMembers.length !== 2) {
    failures.push(`list membership API: expected 2, got ${finalMembers.length}`);
  } else {
    console.log("smoke: multi-add API PASS");
  }

  ctx.fixtures.t1 = t1;
  ctx.fixtures.t2 = t2;
  ctx.fixtures.list = list;
  ctx.fixtures.coverAsset = coverAsset;
}

export async function assertEmptyListCopy(ctx) {
  const { window, baseUrl, failures } = ctx;
  // Empty-state copy on a fresh List — navigate via sidebar click
  await fetch(`${baseUrl}/api/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "EmptyList" }),
  });
  await window.evaluate(() => location.reload());
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector("text=EmptyList", { timeout: 5000 });
  const emptyTarget = window.locator("text=EmptyList").first();
  await emptyTarget.click();
  await window.waitForSelector("text=/is empty/i", { timeout: 3000 });
  const html = await window.content();
  if (!/is empty/i.test(html) || !/drag tracks from all beats/i.test(html)) {
    failures.push("UI: empty-list state copy missing 'is empty' or drag hint");
  } else {
    console.log("smoke: empty-list copy PASS");
  }
}

// === v0.0.11: filter chip add/remove + sort title round-trip ===
export async function assertFilterChips(ctx) {
  const { window, putJson, fixtures, failures } = ctx;
  const { t1 } = fixtures;

  // Setup: attach producer to t1 (Smoke1) so we can filter by it.
  // producer is now a multi-value JSON array field (v0.0.12).
  await putJson(`/api/tracks/${t1.id}`, { producer: ["smoke-producer"] });

  // Navigate to "/" to ensure the main library view is showing.
  await window.evaluate(() => { location.hash = "/"; });
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector('[data-track-id]', { timeout: 5000 });

  try {
    const addFilterBtn = window.locator('[data-add-filter]').first();
    await addFilterBtn.click();

    await window.waitForSelector('text=Producer', { timeout: 3000 });

    const producerOption = window.locator('button:has-text("Producer")').first();
    await producerOption.click();

    await window.waitForFunction(
      () => {
        const labels = Array.from(document.querySelectorAll('label'));
        return labels.some((l) => l.textContent && l.textContent.includes('smoke-producer'));
      },
      undefined,
      { timeout: 5000 },
    );

    const smokeProducerLabel = window.locator('label', { hasText: 'smoke-producer' }).first();
    await smokeProducerLabel.click();

    await window.locator('button:has-text("Apply")').first().click();

    await window.waitForSelector('[data-filter-chip][data-field="producers"]', { timeout: 3000 });
    console.log("smoke: filter chip appears PASS");

    await window.waitForFunction(
      () => document.querySelectorAll('[data-track-id]').length === 1,
      undefined,
      { timeout: 3000 },
    );
    const filteredCount = await window.evaluate(
      () => document.querySelectorAll('[data-track-id]').length,
    );
    if (filteredCount !== 1) {
      failures.push(`filter chip: expected 1 visible track row, got ${filteredCount}`);
    } else {
      console.log("smoke: filter chip row count PASS");
    }

    const chip = window.locator('[data-filter-chip][data-field="producers"]').first();
    const removeSpan = chip.locator('span[aria-label="Remove producer filter"]').first();
    await removeSpan.click();

    await window.waitForFunction(
      () => document.querySelector('[data-filter-chip][data-field="producers"]') === null,
      undefined,
      { timeout: 3000 },
    );
    console.log("smoke: filter chip remove PASS");

    await window.waitForFunction(
      () => document.querySelectorAll('[data-track-id]').length === 2,
      undefined,
      { timeout: 3000 },
    );
    const restoredCount = await window.evaluate(
      () => document.querySelectorAll('[data-track-id]').length,
    );
    if (restoredCount !== 2) {
      failures.push(`filter chip remove: expected 2 rows restored, got ${restoredCount}`);
    } else {
      console.log("smoke: filter chip restore PASS");
    }
  } catch (e) {
    failures.push(`UI: filter chip add/remove — ${e.message}`);
  }
}

export async function assertSortTitle(ctx) {
  const { window, failures } = ctx;
  try {
    // We should already be on the main library view after assertion 14 cleanup.
    await window.waitForSelector('[data-track-id]', { timeout: 5000 });
    await window.waitForFunction(
      () => document.querySelectorAll('[data-track-id]').length >= 2,
      undefined,
      { timeout: 5000 },
    );

    const titleHeaderBtn = window.locator('[data-column="title"]').first();
    await titleHeaderBtn.click();
    await window.waitForTimeout(1200);

    const ascResult = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-track-id]'));
      const titles = rows.map((el) => {
        const span = el.querySelector('[data-track-title]');
        return span ? (span.textContent ?? "").trim() : "";
      });
      return { count: rows.length, titles };
    });

    if (ascResult.count !== 2) {
      failures.push(`sort asc: expected 2 rows, got ${ascResult.count}`);
    } else if (ascResult.titles[0] > ascResult.titles[1]) {
      failures.push(`sort asc: expected ascending order, got ${JSON.stringify(ascResult.titles)}`);
    } else {
      console.log(`smoke: sort title asc PASS (${ascResult.titles.join(', ')})`);
    }

    await titleHeaderBtn.click();
    await window.waitForTimeout(1200);

    const descResult = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-track-id]'));
      const titles = rows.map((el) => {
        const span = el.querySelector('[data-track-title]');
        return span ? (span.textContent ?? "").trim() : "";
      });
      return { count: rows.length, titles };
    });

    if (descResult.count !== 2) {
      failures.push(`sort desc: expected 2 rows, got ${descResult.count}`);
    } else if (descResult.titles[0] < descResult.titles[1]) {
      failures.push(`sort desc: expected descending order, got ${JSON.stringify(descResult.titles)}`);
    } else {
      console.log(`smoke: sort title desc PASS (${descResult.titles.join(', ')})`);
    }
  } catch (e) {
    failures.push(`UI: sort title round-trip — ${e.message}`);
  }
}

// === v0.0.11.1: column resizer drag (BPM column) ===
export async function assertColumnResizerDrag(ctx) {
  const { window, failures } = ctx;
  try {
    await window.waitForSelector('[data-track-id]', { timeout: 5000 });

    const bpmHeader = window.locator('[data-column-cell="bpm"]').first();
    const initialBox = await bpmHeader.boundingBox();
    if (!initialBox) throw new Error('[data-column-cell="bpm"] not visible');
    const initialWidth = initialBox.width;

    const resizer = window.locator('[data-column-resizer="bpm"]').first();
    const resizerBox = await resizer.boundingBox();
    if (!resizerBox) throw new Error('[data-column-resizer="bpm"] not visible');

    const cx = resizerBox.x + resizerBox.width / 2;
    const cy = resizerBox.y + resizerBox.height / 2;
    await window.mouse.move(cx, cy);
    await window.mouse.down();
    await window.mouse.move(cx + 40, cy, { steps: 5 });
    await window.mouse.up();

    await window.waitForTimeout(300);

    const newBox = await bpmHeader.boundingBox();
    if (!newBox) throw new Error('[data-column-cell="bpm"] disappeared after drag');
    const newWidth = newBox.width;

    if (newWidth >= initialWidth + 30) {
      console.log(`smoke: column resizer drag PASS (bpm: ${Math.round(initialWidth)}px → ${Math.round(newWidth)}px)`);
    } else {
      failures.push(
        `UI: column resizer drag — expected bpm width ≥ ${initialWidth + 30}, got ${newWidth} (initial ${initialWidth})`,
      );
    }
  } catch (e) {
    failures.push(`UI: column resizer drag — ${e.message}`);
  }
}

// === v0.0.15: column alignment survives a user resize ===
export async function assertColumnAlignmentAfterResize(ctx) {
  const { window, failures } = ctx;
  try {
    await window.evaluate(() => {
      const s = window.__beatos?.widths?.();
      s?.setWidth?.("title", 400);
    });
    await new Promise((r) => setTimeout(r, 150));
    const align = await window.evaluate(() => {
      const COLS = ["title", "bpm", "key_signature", "genre", "updated_at"];
      const g = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      };
      const header = document.querySelector('[role="row"]');
      const rows = [...document.querySelectorAll("[data-track-id]")];
      const row = rows.find((r) => !r.className.includes("border-accent")) ?? rows[0];
      if (!header || !row) return { error: "header/row missing" };
      const diffs = [];
      for (const col of COLS) {
        const h = g(header.querySelector(`[data-column-cell="${col}"]`));
        const c = g(row.querySelector(`[data-column-cell="${col}"]`));
        if (!h || !c) { diffs.push({ col, error: "missing" }); continue; }
        diffs.push({ col, leftDelta: c.left - h.left, rightDelta: c.right - h.right });
      }
      return { diffs };
    });
    if (align.error) failures.push(`resize-align: ${align.error}`);
    else {
      const desync = align.diffs.filter(
        (d) => d.error || Math.abs(d.leftDelta) > 1 || Math.abs(d.rightDelta) > 1,
      );
      if (desync.length > 0) {
        failures.push(`resize-align: post-resize desync — ${JSON.stringify(desync)}`);
      } else {
        console.log("smoke: column alignment after title resize (400px) PASS");
      }
    }
  } catch (e) {
    failures.push(`resize-align assertion error: ${e.message}`);
  }
}

// === v0.0.16: header tracks body scrollLeft ===
export async function assertScrollSync(ctx) {
  const { window, failures } = ctx;
  try {
    const result = await window.evaluate(() => {
      const scrollables = [...document.querySelectorAll(".beatos-scroll")];
      const body = scrollables.find((el) => el.querySelector("[data-track-id]"));
      const header = scrollables.find(
        (el) => el !== body && el.querySelector('[role="row"]'),
      );
      if (!body || !header) return { error: "scroll containers not found" };
      body.scrollLeft = 80;
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve({ bodyScrollLeft: body.scrollLeft, headerScrollLeft: header.scrollLeft });
          });
        });
      });
    });
    if (result.error) {
      failures.push(`scroll-sync: ${result.error}`);
    } else if (Math.abs(result.bodyScrollLeft - result.headerScrollLeft) > 1) {
      failures.push(
        `scroll-sync: header.scrollLeft=${result.headerScrollLeft} does not track body.scrollLeft=${result.bodyScrollLeft}`,
      );
    } else {
      console.log(
        `smoke: header tracks body scrollLeft PASS (body=${result.bodyScrollLeft}, header=${result.headerScrollLeft})`,
      );
    }
    // Reset BOTH containers explicitly + wait for sync handlers to flush —
    // else the next alignment check measures mid-flight positions.
    await window.evaluate(() => {
      const scrollables = [...document.querySelectorAll(".beatos-scroll")];
      const body = scrollables.find((el) => el.querySelector("[data-track-id]"));
      const header = scrollables.find(
        (el) => el !== body && el.querySelector('[role="row"]'),
      );
      if (body) body.scrollLeft = 0;
      if (header) header.scrollLeft = 0;
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
  } catch (e) {
    failures.push(`scroll-sync assertion error: ${e.message}`);
  }
}

// === v0.0.15: TableHeader / TrackRow column alignment ===
export async function assertTableAlignment(ctx) {
  const { window, failures } = ctx;
  try {
    const align = await window.evaluate(() => {
      const COLS = ["title", "bpm", "key_signature", "genre", "updated_at"];
      function geom(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      }
      const header = document.querySelector('[role="row"]');
      const rows = [...document.querySelectorAll("[data-track-id]")];
      const row = rows.find((r) => !r.className.includes("border-accent")) ?? rows[0];
      if (!header || !row) return { error: "header or row not found" };
      const diffs = [];
      for (const col of COLS) {
        const h = geom(header.querySelector(`[data-column-cell="${col}"]`));
        const c = geom(row.querySelector(`[data-column-cell="${col}"]`));
        if (!h || !c) {
          diffs.push({ col, error: "missing" });
          continue;
        }
        diffs.push({ col, leftDelta: c.left - h.left, rightDelta: c.right - h.right });
      }
      return { diffs };
    });
    if (align.error) {
      failures.push(`table-align: ${align.error}`);
    } else {
      const desynced = align.diffs.filter(
        (d) => d.error || Math.abs(d.leftDelta) > 1 || Math.abs(d.rightDelta) > 1,
      );
      if (desynced.length > 0) {
        failures.push(
          `table-align: column desync — ${JSON.stringify(desynced)}`,
        );
      } else {
        console.log("smoke: TableHeader/TrackRow column alignment PASS (5 cols, ≤1px slack)");
      }
    }
  } catch (e) {
    failures.push(`table-align assertion error: ${e.message}`);
  }
}
