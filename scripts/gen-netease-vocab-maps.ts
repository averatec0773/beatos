// Regenerates the NetEase en->zh vocab maps from the renderer's canonical TS vocab.
// Run: npx tsx scripts/gen-netease-vocab-maps.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BEATOS_GENRES } from "../apps/desktop/src/renderer/src/data/genres";
import { BEATOS_MOODS } from "../apps/desktop/src/renderer/src/data/moods";

const __dirname = dirname(fileURLToPath(import.meta.url));

const out = (kind: string) =>
  resolve(
    __dirname,
    `../packages/beatos-platforms/beatos_platforms/data/netease/${kind}-map.json`,
  );

const genreMap: Record<string, string> = {};
for (const g of BEATOS_GENRES) genreMap[g.en] = g.zh ?? g.en; // null zh -> en verbatim

const moodMap: Record<string, string> = {};
for (const m of BEATOS_MOODS) moodMap[m.en] = m.zh;

writeFileSync(out("genre"), JSON.stringify(genreMap, null, 2) + "\n");
writeFileSync(out("mood"), JSON.stringify(moodMap, null, 2) + "\n");
console.log(`wrote ${Object.keys(genreMap).length} genres, ${Object.keys(moodMap).length} moods`);
