// TrackEditor route assertions: double-click open, key picker round-trip,
// auto-save (v0.0.15), chip pickers + cover drag-source (v0.0.12),
// audio analysis endpoint shape (v0.0.13), producer rewrite (v0.0.15).

// Helper: ensure the track editor is open on Smoke1. Used by chip-picker assertions.
async function ensureEditorOpen(window) {
  const editor = window.locator("[data-track-editor]");
  if ((await editor.count()) > 0) return;
  await window.evaluate(() => {
    location.hash = "/";
  });
  await window.evaluate(() => location.reload());
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector("[data-track-id]", { timeout: 5000 });
  await window.waitForFunction(
    () => document.querySelectorAll("[data-track-id]").length >= 1,
    undefined,
    { timeout: 4000 },
  );
  await window.waitForTimeout(300);
  const row = window.locator("[data-track-id]").first();
  const titleSpan = row.locator("[data-track-title]").first();
  await titleSpan.dblclick();
  await window.waitForSelector("[data-track-editor]", { timeout: 3000 });
}

// Double-click on a track row should open the editor route. Navigates to "/"
// first because the empty-list section above left us at a List view.
export async function assertDoubleClickOpensEditor(ctx) {
  const { window, failures } = ctx;
  await window.evaluate(() => {
    location.hash = "/";
  });
  await window.evaluate(() => location.reload());
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector("[data-track-id]", { timeout: 5000 });
  await window.waitForFunction(
    () => document.querySelectorAll("[data-track-id]").length >= 1,
    undefined,
    { timeout: 4000 },
  );
  await window.waitForTimeout(400);
  const firstRow = window.locator("[data-track-id]").first();
  const titleSpan = firstRow.locator("[data-track-title]").first();
  await titleSpan.dblclick();
  try {
    await window.waitForSelector("[data-track-editor]", { timeout: 3000 });
    console.log("smoke: double-click → editor PASS");
  } catch (e) {
    failures.push(`UI: double-click did not open editor — ${e.message}`);
  }
}

// v0.0.10: Key picker round-trip — click trigger, pick F# Minor, assert trigger text.
export async function assertKeyPickerRoundTrip(ctx) {
  const { window, failures } = ctx;
  try {
    const editor = window.locator("[data-track-editor]");
    if ((await editor.count()) === 0) {
      await window.evaluate(() => {
        location.hash = "/";
      });
      await window.waitForSelector('[role="row"]', { timeout: 5000 });
      const rowToOpen = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
      await rowToOpen.dblclick();
      await window.waitForSelector("[data-track-editor]", { timeout: 3000 });
    }
    const trigger = window.locator("[data-key-picker-trigger]").first();
    await trigger.click();
    await window.waitForSelector("text=Flat keys", { timeout: 2000 });
    await window.locator("text=Sharp keys").click();
    await window.locator('button[aria-label="F#"]').click();
    await window.locator('button[aria-label="Minor"]').click();
    // Use aria-label to target the popover's Save, not the form's submit button.
    await window.locator('button[aria-label="Save"]').click();
    await window.waitForFunction(
      () => {
        const t = document.querySelector("[data-key-picker-trigger]");
        return t && t.textContent && t.textContent.trim() === "F# minor";
      },
      undefined,
      { timeout: 2000 },
    );
    console.log("smoke: key picker round-trip PASS");
  } catch (e) {
    failures.push(`UI: key picker round-trip — ${e.message}`);
  }
}

// v0.0.15: typing into title triggers debounced save that lands on the server
// within ~2s, without a manual Save click.
export async function assertAutoSavePersists(ctx) {
  const { window, baseUrl, fixtures, failures } = ctx;
  const { t1 } = fixtures;
  try {
    const editor = window.locator("[data-track-editor]");
    if ((await editor.count()) === 0) {
      await window.evaluate(() => {
        location.hash = "/";
      });
      await window.waitForSelector('[role="row"]', { timeout: 5000 });
      const rowToOpen = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
      await rowToOpen.dblclick();
      await window.waitForSelector("[data-track-editor]", { timeout: 3000 });
    }

    const titleInput = window.locator("#track-title");
    const newTitle = `smoke-auto-${Date.now()}`;
    await titleInput.fill(newTitle);

    let persisted = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${baseUrl}/api/tracks/${t1.id}`);
      if (res.ok) {
        const body = await res.json();
        if (body.title === newTitle) {
          persisted = true;
          break;
        }
      }
    }
    if (!persisted) {
      failures.push(`auto-save: server title never became ${JSON.stringify(newTitle)} within 3s`);
    } else {
      await window.waitForSelector('[data-save-status="saved"]', { timeout: 1500 });
      console.log("smoke: auto-save persists title without Save click PASS");
    }

    // Restore original title for downstream sort/filter determinism.
    await titleInput.fill("Smoke1");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${baseUrl}/api/tracks/${t1.id}`);
      if (res.ok && (await res.json()).title === "Smoke1") break;
    }
    await window.locator('button:has-text("Close (ESC)")').first().click();
    await window.waitForFunction(() => !document.querySelector("[data-track-editor]"), undefined, {
      timeout: 3000,
    });
  } catch (e) {
    failures.push(`UI: auto-save — ${e.message}`);
  }
}

// Empty title gates auto-save (no save fires; indicator shows "Title required").
export async function assertEmptyTitleGatesSave(ctx) {
  const { window, baseUrl, fixtures, failures } = ctx;
  const { t1 } = fixtures;
  try {
    await window.evaluate(() => {
      location.hash = "/";
    });
    await window.waitForSelector('[role="row"]', { timeout: 5000 });
    const rowToOpen = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
    await rowToOpen.dblclick();
    await window.waitForSelector("[data-track-editor]", { timeout: 3000 });

    const titleInput = window.locator("#track-title");
    await titleInput.fill("");
    await new Promise((r) => setTimeout(r, 1500));

    const titleRequired = await window.locator('[data-save-status="title-required"]').count();
    if (titleRequired === 0) {
      failures.push(`auto-save: empty title did not show "Title required" indicator`);
    }
    const server = await (await fetch(`${baseUrl}/api/tracks/${t1.id}`)).json();
    if (server.title !== "Smoke1") {
      failures.push(
        `auto-save: empty title leaked to server — got ${JSON.stringify(server.title)}`,
      );
    }
    if (titleRequired > 0 && server.title === "Smoke1") {
      console.log("smoke: empty title gates auto-save PASS");
    }
    // Restore before continuing.
    await titleInput.fill("Smoke1");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${baseUrl}/api/tracks/${t1.id}`);
      if (res.ok && (await res.json()).title === "Smoke1") break;
    }
    await window.locator('button:has-text("Close (ESC)")').first().click();
    await window.waitForFunction(() => !document.querySelector("[data-track-editor]"), undefined, {
      timeout: 3000,
    });
  } catch (e) {
    failures.push(`UI: auto-save empty title — ${e.message}`);
  }
}

// v0.0.12: Genre chip select — open picker, check 流行 (Pop), Apply, verify chip.
export async function assertGenreChipSelect(ctx) {
  const { window, failures } = ctx;
  try {
    await ensureEditorOpen(window);
    const genreField = window.locator('[data-field="genre"]');
    const addBtn = genreField.locator("[data-add-button]").first();
    await addBtn.click();
    await window.waitForFunction(
      () => {
        const labels = Array.from(document.querySelectorAll("label"));
        return labels.some((l) => l.textContent && l.textContent.includes("流行 (Pop)"));
      },
      undefined,
      { timeout: 3000 },
    );
    const popLabel = window.locator("label", { hasText: "流行 (Pop)" }).first();
    await popLabel.click();
    await window.locator('button:has-text("Apply")').first().click();
    await window.waitForFunction(
      () => {
        const field = document.querySelector('[data-field="genre"]');
        return field && field.textContent && field.textContent.includes("流行 (Pop)");
      },
      undefined,
      { timeout: 3000 },
    );
    console.log("smoke: genre chip select (流行/Pop) PASS");
  } catch (e) {
    failures.push(`UI: genre chip select — ${e.message}`);
  }
}

// Producer custom add + persist verification.
export async function assertProducerCustomChip(ctx) {
  const { window, baseUrl, failures } = ctx;
  try {
    await ensureEditorOpen(window);
    const producerField = window.locator('[data-field="producer"]');
    const addBtn = producerField.locator("[data-add-button]").first();
    await addBtn.click();
    await window.waitForSelector('input[placeholder="Type to add…"]', { timeout: 3000 });
    const customInput = window.locator('input[placeholder="Type to add…"]').first();
    await customInput.fill("smoke-custom-producer");
    await window.locator('button[aria-label="Add custom value"]').first().click();
    await window.locator('button:has-text("Apply")').first().click();
    await window.waitForFunction(
      () => {
        const field = document.querySelector('[data-field="producer"]');
        return field && field.textContent && field.textContent.includes("smoke-custom-producer");
      },
      undefined,
      { timeout: 3000 },
    );
    console.log("smoke: producer custom chip PASS");

    // Auto-save persists the chip — wait for indicator + confirm via API.
    await window.waitForSelector('[data-save-status="saved"]', { timeout: 5000 });
    await window.locator('button:has-text("Close (ESC)")').first().click();
    await window.waitForFunction(() => !document.querySelector("[data-track-editor]"), undefined, {
      timeout: 5000,
    });

    const distinctRes = await fetch(`${baseUrl}/api/tracks/distinct/producer`);
    const distinctVals = await distinctRes.json();
    if (Array.isArray(distinctVals) && distinctVals.includes("smoke-custom-producer")) {
      console.log("smoke: producer distinct API includes smoke-custom-producer PASS");
    } else {
      failures.push(
        `API: distinct/producer missing 'smoke-custom-producer'; got ${JSON.stringify(distinctVals)}`,
      );
    }
  } catch (e) {
    failures.push(`UI: producer custom add — ${e.message}`);
  }
}

// Cover drag-source has draggable="true".
export async function assertCoverDragSource(ctx) {
  const { window, failures } = ctx;
  try {
    await ensureEditorOpen(window);
    const dragSources = window.locator("[data-cover-drag-source]");
    const count = await dragSources.count();
    if (count !== 1) {
      failures.push(`UI: expected 1 [data-cover-drag-source], found ${count}`);
    } else {
      const draggable = await dragSources.first().getAttribute("draggable");
      if (draggable === "true") {
        console.log("smoke: cover drag-source draggable=true PASS");
      } else {
        failures.push(`UI: [data-cover-drag-source] draggable="${draggable}", expected "true"`);
      }
    }
  } catch (e) {
    failures.push(`UI: cover drag-source attribute — ${e.message}`);
  }
}

// v0.0.13: analyze endpoint shape — Smoke1's 5s silence WAV. BPM/key may be
// 0/null (silence has no detectable beat); we verify the API contract only.
export async function assertAnalyzeEndpointShape(ctx) {
  const { baseUrl, fixtures, failures } = ctx;
  const { t1 } = fixtures;
  try {
    const res = await fetch(`${baseUrl}/api/tracks/${t1.id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      failures.push(`POST /analyze for Smoke1 returned ${res.status}: ${text.slice(0, 200)}`);
    } else {
      const body = await res.json();
      const requiredKeys = [
        "asset_id",
        "sha256",
        "bpm",
        "bpm_confidence",
        "key",
        "key_confidence",
        "duration_seconds",
        "analyzed_at",
      ];
      const missing = requiredKeys.filter((k) => !(k in body));
      if (missing.length) {
        failures.push(`analyze response missing keys: ${missing.join(", ")}`);
      } else if (
        typeof body.asset_id !== "number" ||
        typeof body.duration_seconds !== "number" ||
        body.duration_seconds < 4.0 ||
        body.duration_seconds > 6.0
      ) {
        failures.push(
          `analyze response sanity check failed: asset_id=${body.asset_id} duration=${body.duration_seconds}`,
        );
      } else {
        console.log(
          `smoke: analyze endpoint shape PASS (duration=${body.duration_seconds.toFixed(2)}s)`,
        );
      }
    }
  } catch (e) {
    failures.push(`analyze endpoint error: ${e.message}`);
  }
}

// v0.0.13.2: POST /analyze on a track with NO audio asset (Smoke2) should
// return 404 with a detail mentioning "audio". Catches missing-route or
// route-regression class of bugs.
export async function assertAnalyze404OnNoAudio(ctx) {
  const { baseUrl, fixtures, failures } = ctx;
  const { t2 } = fixtures;
  try {
    const res = await fetch(`${baseUrl}/api/tracks/${t2.id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status !== 404) {
      const text = await res.text().catch(() => "");
      const msg = `expected 404 on no-audio analyze, got ${res.status}: ${text.slice(0, 200)}`;
      console.error(`smoke: FAIL — ${msg}`);
      failures.push(msg);
    } else {
      const body = await res.json().catch(() => ({}));
      const detail = String(body.detail ?? "").toLowerCase();
      if (!detail.includes("audio")) {
        const msg = `404 detail should mention "audio", got: ${JSON.stringify(body)}`;
        console.error(`smoke: FAIL — ${msg}`);
        failures.push(msg);
      } else {
        console.log(`smoke: analyze 404 on no-audio track PASS (detail="${body.detail}")`);
      }
    }
  } catch (e) {
    const msg = `analyze 404 negative test error: ${e.message}`;
    console.error(`smoke: FAIL — ${msg}`);
    failures.push(msg);
  }
}

// v0.0.15: producer rewrite (merge) — two tracks with case-different producer
// names → merge to one canonical. Verifies POST /api/producers/rewrite.
export async function assertProducerRewriteMerge(ctx) {
  const { baseUrl, postJson, failures } = ctx;
  try {
    const pt1 = await postJson("/api/tracks", { title: "ProdMergeA" });
    const pt2 = await postJson("/api/tracks", { title: "ProdMergeB" });
    await fetch(`${baseUrl}/api/tracks/${pt1.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producer: ["Alice"] }),
    });
    await fetch(`${baseUrl}/api/tracks/${pt2.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producer: ["alice"] }),
    });
    const preview = await postJson("/api/producers/preview", { values: ["Alice", "alice"] });
    if (preview.affected !== 2) {
      failures.push(`producer-preview: expected affected=2, got ${preview.affected}`);
    }
    const rewriteRes = await postJson("/api/producers/rewrite", {
      from: ["Alice", "alice"],
      to: "Alice",
    });
    if (rewriteRes.affected !== 2) {
      failures.push(`producer-rewrite: expected affected=2, got ${rewriteRes.affected}`);
    }
    const after1 = await fetch(`${baseUrl}/api/tracks/${pt1.id}`).then((r) => r.json());
    const after2 = await fetch(`${baseUrl}/api/tracks/${pt2.id}`).then((r) => r.json());
    if (JSON.stringify(after1.producer) !== '["Alice"]') {
      failures.push(
        `producer-rewrite: pt1 expected ["Alice"], got ${JSON.stringify(after1.producer)}`,
      );
    }
    if (JSON.stringify(after2.producer) !== '["Alice"]') {
      failures.push(
        `producer-rewrite: pt2 expected ["Alice"], got ${JSON.stringify(after2.producer)}`,
      );
    }
    const distinct = await fetch(`${baseUrl}/api/tracks/distinct/producer`).then((r) => r.json());
    if (distinct.includes("alice")) {
      failures.push(
        `producer-rewrite: distinct still contains "alice": ${JSON.stringify(distinct)}`,
      );
    }
    if (!failures.some((f) => f.startsWith("producer-"))) {
      console.log("smoke: producer rewrite (merge) PASS (collapsed Alice/alice → Alice)");
    }
  } catch (e) {
    failures.push(`producer-rewrite assertion error: ${e.message}`);
  }
}
