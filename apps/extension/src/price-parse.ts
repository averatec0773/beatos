export interface ParsedTier {
  name: string;
  amounts: Record<string, number>;
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

export function parsePrice(input: string): ParsedTier[] {
  if (!input) return [];
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, rest] = splitOnce(line, ":");
      const amounts: Record<string, number> = {};
      for (const seg of rest.split("/").map((s) => s.trim()).filter(Boolean)) {
        const cny = seg.match(/^¥\s*([\d.]+)$/);
        if (cny) {
          amounts["CNY"] = parseFloat(cny[1]);
          continue;
        }
        const cur = seg.match(/^([A-Z]{3})\s+([\d.]+)$/);
        if (cur) amounts[cur[1]] = parseFloat(cur[2]);
      }
      return { name: namePart.trim(), amounts };
    })
    .filter((t) => t.name);
}
