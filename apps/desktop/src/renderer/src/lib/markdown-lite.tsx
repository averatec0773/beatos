import React from "react";

/**
 * Dependency-free, XSS-safe markdown renderer scoped to what the AI Agent emits:
 * paragraphs, bullet (`-`/`*`) and ordered (`1.`) lists, **bold**, and `inline
 * code`. It builds React elements directly (never dangerouslySetInnerHTML), so
 * model output can't inject markup. Anything it doesn't recognize renders as
 * plain text. For richer markdown (tables, code fences, links) swap in
 * react-markdown — this is deliberately minimal.
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
    // Pick whichever marker comes first in the remaining string.
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

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = (): void => {
    if (para.length) {
      blocks.push({ kind: "p", lines: para });
      para = [];
    }
  };
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw;
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    const bullet = line.match(BULLET);
    const ordered = line.match(ORDERED);
    if (bullet) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else if (ordered) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ol") last.items.push(ordered[1]);
      else blocks.push({ kind: "ol", items: [ordered[1]] });
    } else {
      para.push(line);
    }
  }
  flushPara();
  return blocks;
}

export function MarkdownLite({ text }: { text: string }): React.JSX.Element {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.kind === "ul") {
          return (
            <ul key={i} className="space-y-1 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
                  <span className="min-w-0">{renderInline(it, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={i} className="space-y-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-tertiary mt-[0.15em]">
                    {j + 1}.
                  </span>
                  <span className="min-w-0">{renderInline(it, `${i}-${j}`)}</span>
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
