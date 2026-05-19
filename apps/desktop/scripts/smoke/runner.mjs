// Orchestrator: calls section functions in the original chronological order.
// Order is load-bearing — earlier sections seed fixtures (Smoke1/Smoke2/SmokeList)
// that later sections consume. Reorder only if you understand the dependency chain.
import * as library from "./library.mjs";
import * as player from "./player.mjs";
import * as editor from "./editor.mjs";
import * as trash from "./trash.mjs";
import * as sidebar from "./sidebar.mjs";
import * as mcp from "./mcp.mjs";

export async function runAssertions(ctx) {
  // === seed + cover + drag (sets fixtures.{t1,t2,list,coverAsset}) ===
  await library.assertSeedAndDragDrop(ctx);
  await library.assertEmptyListCopy(ctx);

  // === editor first-open (v0.0.9 smoke ordering) ===
  await editor.assertDoubleClickOpensEditor(ctx);

  // === v0.0.9 player ===
  await player.assertAttachAudioAndBottomBar(ctx);
  await player.assertNoAudioDisabled(ctx);
  await player.assertRowClickPopulatesBar(ctx);
  await player.assertPlaybackStarts(ctx);

  // === v0.0.9.1 regression ===
  await player.assertResumeAfterEnd(ctx);

  // === v0.0.10 ===
  await editor.assertKeyPickerRoundTrip(ctx);

  // === v0.0.11 ===
  await library.assertFilterChips(ctx);
  await library.assertSortTitle(ctx);

  // === v0.0.15 auto-save ===
  await editor.assertAutoSavePersists(ctx);
  await editor.assertEmptyTitleGatesSave(ctx);

  // === v0.0.11.1 column resizer ===
  await library.assertColumnResizerDrag(ctx);

  // === v0.0.12 chip pickers + cover drag-source ===
  await editor.assertGenreChipSelect(ctx);
  await editor.assertProducerCustomChip(ctx);
  await editor.assertCoverDragSource(ctx);

  // === v0.0.13 audio analysis ===
  await editor.assertAnalyzeEndpointShape(ctx);
  await editor.assertAnalyze404OnNoAudio(ctx);

  // === v0.0.14 sidebar / trash ===
  await sidebar.assertDropCreateApiPath(ctx);
  await trash.assertTrashSoftDeleteRestore(ctx);

  // === v0.0.14.1 DAW WAV regression (runs late: extra track shouldn't
  // contaminate count-sensitive earlier assertions) ===
  await player.assertDawWavDecode(ctx);

  // === v0.0.15 column alignment + scroll sync + table alignment ===
  await library.assertColumnAlignmentAfterResize(ctx);
  await library.assertScrollSync(ctx);
  await library.assertTableAlignment(ctx);

  // === v0.0.15 producer rewrite ===
  await editor.assertProducerRewriteMerge(ctx);

  // === v0.0.15.1 real-audio regression (opt-in via BEATOS_REAL_AUDIO) ===
  await player.assertRealAudioRegression(ctx);

  // === v0.0.22 sidebar order (appended last — non-mutating DOM check) ===
  await sidebar.assertSidebarOrder(ctx);

  // === v0.0.23 handshake.pid + /mcp HTTP transport (read-only, safe to append last) ===
  await mcp.assertHandshakePid(ctx);
  await mcp.assertMcpInitialize(ctx);
}
