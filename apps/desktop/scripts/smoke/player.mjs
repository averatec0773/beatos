// Bottom player bar + playback assertions (v0.0.9), resume-after-end (v0.0.9.1),
// DAW-style WAV regression (v0.0.14.1), real-audio regression (v0.0.15.1).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Attaches a real WAV to Smoke1, reloads, then asserts the bottom player bar
// renders and the no-audio play button is disabled.
// Stores ctx.fixtures.audioAsset for later sections.
export async function assertAttachAudioAndBottomBar(ctx) {
  const { window, userData, postJson, fixtures, failures, makeTinyWav } = ctx;
  const { t1 } = fixtures;

  const audioPath = join(userData, "smoke1-audio.wav");
  writeFileSync(audioPath, makeTinyWav());
  const audioAsset = await postJson(`/api/tracks/${t1.id}/assets`, {
    role: "audio_tagged_wav",
    path: audioPath,
  });
  if (typeof audioAsset.id !== "number") {
    failures.push(`attach audio returned no id: ${JSON.stringify(audioAsset)}`);
  }
  ctx.fixtures.audioAsset = audioAsset;
  ctx.fixtures.audioPath = audioPath;

  // Reload so the renderer fetches updated has_audio flags.
  await window.evaluate(() => { location.hash = "/"; });
  await window.evaluate(() => location.reload());
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await window.waitForSelector('[role="row"]', { timeout: 5000 });

  try {
    await window.waitForSelector("[data-bottom-player]", { timeout: 3000 });
    console.log("smoke: bottom player bar renders PASS");
  } catch (e) {
    failures.push(`UI: [data-bottom-player] not found — ${e.message}`);
  }
}

export async function assertNoAudioDisabled(ctx) {
  const { window, failures } = ctx;
  const noAudioBtn = window.locator('[data-has-audio="false"][data-row-play-button]').first();
  if ((await noAudioBtn.count()) > 0) {
    const disabled = await noAudioBtn.isDisabled();
    if (disabled) {
      console.log("smoke: no-audio play button disabled PASS");
    } else {
      failures.push("UI: play button for no-audio track is not disabled");
    }
  } else {
    console.log("smoke: no-audio play button disabled SKIP (no such row visible)");
  }
}

// Row body click → bottom bar reflects selection (title + play button enabled)
// BEFORE any playback. Guards the BottomPlayerBar.selectedTrack fallback.
export async function assertRowClickPopulatesBar(ctx) {
  const { window, failures } = ctx;
  try {
    const row = window.locator("[data-track-id]").filter({ hasText: "Smoke1" }).first();
    await row.click({ force: true });
    await new Promise((r) => setTimeout(r, 200));
    const bar = await window.evaluate(() => {
      const footer = document.querySelector("[data-bottom-player]");
      if (!footer) return { error: "no bottom bar" };
      const title = footer.querySelector(".text-zinc-100")?.textContent ?? "";
      const playBtn = footer.querySelector("[data-play-button]");
      return { title, disabled: playBtn?.hasAttribute("disabled") ?? true };
    });
    if (bar.error) failures.push(`row-click-bar: ${bar.error}`);
    else if (bar.title !== "Smoke1")
      failures.push(`row-click-bar: title expected "Smoke1", got "${bar.title}"`);
    else if (bar.disabled)
      failures.push("row-click-bar: play button still disabled after row click");
    else console.log("smoke: row click → bottom bar populated + play enabled PASS");
  } catch (e) {
    failures.push(`row-click-bar assertion error: ${e.message}`);
  }
}

// Click row play button → bottom bar shows data-playing="true".
// Sets ctx.flags.playbackStarted = true so resume-after-end can check.
export async function assertPlaybackStarts(ctx) {
  const { window, failures } = ctx;
  ctx.flags.playbackStarted = false;
  const playableBtn = window.locator('[data-has-audio="true"][data-row-play-button]').first();
  if ((await playableBtn.count()) > 0) {
    await playableBtn.click();
    try {
      await window.waitForSelector('[data-bottom-player][data-playing="true"]', { timeout: 3000 });
      console.log("smoke: click play → playback starts PASS");
      ctx.flags.playbackStarted = true;
    } catch (e) {
      failures.push(`UI: [data-bottom-player][data-playing="true"] never appeared — ${e.message}`);
    }
  } else {
    console.log("smoke: click play → playback starts SKIP (no playable row visible)");
  }
}

// v0.0.9.1: track plays to natural end, click play button again → resumes.
// Bug: with repeat=off, audio.ended=true and clicking play again no-op'd
// (Chromium .play() on ended element is unreliable). Fix resets currentTime=0 first.
// Uses the 5s WAV from makeTinyWav() — wait it out, then click bottom-bar play.
export async function assertResumeAfterEnd(ctx) {
  const { window, flags, failures } = ctx;
  if (!flags.playbackStarted) {
    console.log("smoke: resume after end SKIP (prerequisite assertion 11 did not start playback)");
    return;
  }
  try {
    await window.waitForSelector('[data-bottom-player][data-playing="false"]', { timeout: 8000 });
    const bottomPlayBtn = window.locator('[data-bottom-player] [data-play-button]').first();
    await bottomPlayBtn.click();
    await window.waitForSelector('[data-bottom-player][data-playing="true"]', { timeout: 3000 });
    console.log("smoke: resume after end PASS");
  } catch (e) {
    failures.push(`UI: resume after end failed — ${e.message}`);
  }
}

// v0.0.14.1 regression: DAW-produced WAV (JUNK + trailing cue) decodes end-to-end.
// Runs LAST in the post-seed batch so the extra track doesn't contaminate
// count-sensitive earlier assertions.
export async function assertDawWavDecode(ctx) {
  const { window, userData, postJson, failures, makeDawStyleWav } = ctx;
  try {
    const dawWavPath = join(userData, "smoke-daw.wav");
    writeFileSync(dawWavPath, makeDawStyleWav());
    const dawTrack = await postJson("/api/tracks", { title: "SmokeDaw" });
    await postJson(`/api/tracks/${dawTrack.id}/assets`, {
      role: "audio_tagged_wav",
      path: dawWavPath,
    });
    await window.evaluate(() => { window.location.hash = "#/"; });
    await new Promise((r) => setTimeout(r, 200));
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(() => { window.location.hash = "#/"; });
    await new Promise((r) => setTimeout(r, 800));
    const dawRow = window.locator("[data-track-id]").filter({ hasText: "SmokeDaw" }).first();
    if ((await dawRow.count()) === 0) {
      const titles = await window.evaluate(() =>
        [...document.querySelectorAll("[data-track-id]")].map((el) =>
          el.querySelector("[data-track-title]")?.textContent ?? el.textContent?.slice(0, 40),
        ),
      );
      failures.push(`daw-wav: SmokeDaw row not visible. Visible rows: ${JSON.stringify(titles)}`);
    } else {
      await dawRow.locator("[data-row-play-button]").click();
      await new Promise((r) => setTimeout(r, 2000));
      const s = await window.evaluate(() => window.__beatos?.engine?.());
      if (!s) failures.push("daw-wav: __beatos.engine() not available");
      else if (s.status === "error")
        failures.push(`daw-wav: engine status=error`);
      else if (!(s.duration > 0))
        failures.push(`daw-wav: duration not > 0 (${s.duration}), status=${s.status}`);
      else if (!(s.position > 0))
        failures.push(`daw-wav: position did not advance (${s.position}), status=${s.status}`);
      else
        console.log(
          `smoke: DAW-style WAV (JUNK + trailing) plays PASS (duration=${s.duration.toFixed(2)}s, t=${s.position.toFixed(2)}s)`,
        );
    }
  } catch (e) {
    failures.push(`daw-wav assertion error: ${e.message}`);
  }
}

// v0.0.15.1: real-audio regression — only runs when BEATOS_REAL_AUDIO is set.
// Pins the asset-protocol against an actual studio-produced WAV — bytes the
// synthetic fixture can't cover.
export async function assertRealAudioRegression(ctx) {
  const { window, postJson, failures } = ctx;
  const realAudio = process.env.BEATOS_REAL_AUDIO;
  if (!realAudio) return;
  try {
    // v0.0.22: Source removed — assets attach by absolute path directly.
    const realTrack = await postJson("/api/tracks", { title: "real-audio-smoke" });
    await postJson(`/api/tracks/${realTrack.id}/assets`, {
      role: "audio_tagged_wav",
      path: realAudio,
    });
    await window.evaluate(() => { window.location.hash = "#/"; });
    await new Promise((r) => setTimeout(r, 200));
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(() => { window.location.hash = "#/"; });
    await new Promise((r) => setTimeout(r, 800));
    const rowReal = window.locator("[data-track-id]").filter({ hasText: "real-audio-smoke" }).first();
    await rowReal.waitFor({ timeout: 5000 });
    await rowReal.locator("[data-row-play-button]").click();
    await new Promise((r) => setTimeout(r, 3000));
    const s = await window.evaluate(() => window.__beatos?.engine?.());
    if (!s) failures.push("real-audio: __beatos.engine() not available");
    else if (s.status === "error")
      failures.push(`real-audio: engine status=error`);
    else if (!(s.duration > 0))
      failures.push(`real-audio: duration not > 0 (${s.duration})`);
    else if (!(s.position > 0))
      failures.push(`real-audio: position did not advance (${s.position})`);
    else
      console.log(
        `smoke: real audio (${realAudio.split("/").pop()}) plays PASS (duration=${s.duration.toFixed(2)}s, t=${s.position.toFixed(2)}s)`,
      );
  } catch (e) {
    failures.push(`real-audio assertion error: ${e.message}`);
  }
}
