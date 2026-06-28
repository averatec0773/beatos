import React from "react";

/**
 * Dependency-free, XSS-safe markdown renderer scoped to what the AI Agent emits:
 * paragraphs, bullet (`-`/`*`) and ordered (`1.`) lists with nested bullets,
 * **bold**, and `inline code`. It builds React elements directly (never
 * dangerouslySetInnerHTML), so model output can't inject markup. Anything it
 * doesn't recognize renders as plain text. For richer markdown (tables, code
 * fences, links) swap in react-markdown — this is deliberately minimal.
 *
 * Ordered lists auto-number by position from the first item's ordinal, and
 * bullets that immediately follow an ordered item attach as that item's children
 * (not a sibling list). That keeps a "1. beat / - attrs / 2. beat / - attrs"
 * block as ONE list that numbers 1, 2, 3… — correct whether the model writes
 * sequential numbers or the lazy all-"1." convention.
 */

const BOLD = /\*\*([^*]+)\*\*/;
const CODE = /`([^`]+)`/;

// Split one line into bold / inline-code / plain spans.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length > 0) {
    const bold = rest.match(BOLD);
    const code = rest.match(CODE);
    const candidates = [bold, code].filter((m): m is RegExpMatchArray => m != null);
    if (candidates.length === 0) {
      out.push(rest);
      break;
    }
    const next = candidates.reduce((a, b) => ((a.index ?? 0) <= (b.index ?? 0) ? a : b));
    const at = next.index ?? 0;
    if (at > 0) out.push(rest.slice(0, at));
    if (next === bold) {
      out.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-text-primary">
          {next[1]}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-text-primary"
        >
          {next[1]}
        </code>,
      );
    }
    rest = rest.slice(at + next[0].length);
    i += 1;
  }
  return out;
}

type OrderedItem = { text: string; children: string[] };
type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; start: number; items: OrderedItem[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*(\d+)\.\s+(.*)$/;

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let blank = false;
  const flushPara = (): void => {
    if (para.length) {
      blocks.push({ kind: "p", lines: para });
      para = [];
    }
  };
  for (const line of src.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flushPara();
      blank = true;
      continue;
    }
    const ordered = line.match(ORDERED);
    const bullet = line.match(BULLET);
    if (ordered) {
      flushPara();
      const item: OrderedItem = { text: ordered[2], children: [] };
      const last = blocks[blocks.length - 1];
      // A blank line doesn't break the ordered list — beats are separated by
      // blanks but stay one list — so append across the gap.
      if (last && last.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", start: parseInt(ordered[1], 10), items: [item] });
    } else if (bullet) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ol" && !blank && last.items.length > 0) {
        // Bullets directly under an ordered item are its children (nested).
        last.items[last.items.length - 1].children.push(bullet[1]);
      } else if (last && last.kind === "ul") {
        last.items.push(bullet[1]);
      } else {
        blocks.push({ kind: "ul", items: [bullet[1]] });
      }
    } else {
      para.push(line);
    }
    blank = false;
  }
  flushPara();
  return blocks;
}

function BulletList({ items, keyPrefix }: { items: string[]; keyPrefix: string }): React.JSX.Element {
  return (
    <ul className="space-y-1 pl-1">
      {items.map((it, j) => (
        <li key={j} className="flex gap-2">
          <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
          <span className="min-w-0">{renderInline(it, `${keyPrefix}-${j}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export function MarkdownLite({ text }: { text: string }): React.JSX.Element {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.kind === "ul") {
          return <BulletList key={i} items={b.items} keyPrefix={`ul-${i}`} />;
        }
        if (b.kind === "ol") {
          return (
            <ol key={i} className="space-y-2">
              {b.items.map((it, j) => (
                <li key={j}>
                  <div className="flex gap-2.5">
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-tertiary mt-[0.15em]">
                      {b.start + j}.
                    </span>
                    <span className="min-w-0">{renderInline(it.text, `${i}-${j}`)}</span>
                  </div>
                  {it.children.length > 0 && (
                    <div className="mt-1 pl-[1.4em]">
                      <BulletList items={it.children} keyPrefix={`${i}-${j}`} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {b.lines.map((ln, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(ln, `${i}-${j}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
