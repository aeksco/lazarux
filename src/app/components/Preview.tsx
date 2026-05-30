'use client';

/*
 * Preview.tsx
 * A dummy terminal that previews a single session. A dropdown above switches
 * sessions; a tmux-style status bar below lists the session's windows and
 * clicking one "opens" it. The active window's panes are laid out by parsing
 * its tmux layout string into real rectangles (falling back to a simple stack
 * when there's no layout, e.g. a freshly added window).
 */

import { useState } from 'react';
import type { Pane, ResurrectDoc, TmuxWindow } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LayoutCell {
  w: number;
  h: number;
  x: number;
  y: number;
  type: 'leaf' | 'h' | 'v';
  children?: LayoutCell[];
}

// Parse a tmux layout string (after its checksum) into a rectangle tree.
// Grammar: cell = "WxH,X,Y" ( ",paneId" | "{" cells "}" | "[" cells "]" )
function parseLayout(layout: string): LayoutCell | null {
  const comma = layout.indexOf(',');
  if (comma === -1) return null;
  const body = layout.slice(comma + 1);
  let pos = 0;

  function parseCell(): LayoutCell {
    const m = /^(\d+)x(\d+),(\d+),(\d+)/.exec(body.slice(pos));
    if (!m) throw new Error('bad layout');
    pos += m[0].length;
    const cell: LayoutCell = {
      w: +m[1],
      h: +m[2],
      x: +m[3],
      y: +m[4],
      type: 'leaf',
    };
    const ch = body[pos];
    if (ch === ',') {
      pos++; // skip the comma before the pane id
      const idm = /^\d+/.exec(body.slice(pos));
      if (idm) pos += idm[0].length; // consume (and ignore) the pane id
    } else if (ch === '{' || ch === '[') {
      const close = ch === '{' ? '}' : ']';
      cell.type = ch === '{' ? 'h' : 'v';
      pos++; // skip the open bracket
      cell.children = [parseCell()];
      while (body[pos] === ',') {
        pos++; // skip the separator between children
        cell.children.push(parseCell());
      }
      if (body[pos] === close) pos++; // skip the close bracket
    }
    return cell;
  }

  try {
    return parseCell();
  } catch {
    return null;
  }
}

function flattenLeaves(cell: LayoutCell, out: LayoutCell[] = []): LayoutCell[] {
  if (cell.type === 'leaf') out.push(cell);
  else cell.children?.forEach((c) => flattenLeaves(c, out));
  return out;
}

function shortPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}

function PaneBox({ pane, active }: { pane?: Pane; active: boolean }) {
  return (
    <div
      className={cn(
        'h-full w-full overflow-hidden rounded border p-2 font-mono text-xs leading-relaxed',
        active
          ? 'border-primary/70 bg-primary/5 ring-1 ring-primary/50'
          : 'border-border/60 bg-black/25'
      )}
    >
      {pane ? (
        <>
          <div className="truncate text-term-blue">
            {shortPath(pane.path) || '~'}
          </div>
          <div className="truncate text-foreground/90">
            <span className="text-term-green">❯</span>{' '}
            {pane.fullCommand || pane.command || ''}
          </div>
        </>
      ) : null}
    </div>
  );
}

function WindowView({ win }: { win: TmuxWindow }) {
  const root = win.layout ? parseLayout(win.layout) : null;

  if (!root) {
    return (
      <div className="absolute inset-0 flex flex-col gap-[2px] p-[2px]">
        {win.panes.map((p, i) => (
          <div key={i} className="flex-1">
            <PaneBox pane={p} active={p.active === 1} />
          </div>
        ))}
      </div>
    );
  }

  const leaves = flattenLeaves(root);
  const W = root.w || 1;
  const H = root.h || 1;

  return (
    <div className="absolute inset-0">
      {leaves.map((leaf, i) => {
        const pane = win.panes[i];
        return (
          <div
            key={i}
            className="absolute p-[2px]"
            style={{
              left: `${(leaf.x / W) * 100}%`,
              top: `${(leaf.y / H) * 100}%`,
              width: `${(leaf.w / W) * 100}%`,
              height: `${(leaf.h / H) * 100}%`,
            }}
          >
            <PaneBox pane={pane} active={pane?.active === 1} />
          </div>
        );
      })}
    </div>
  );
}

export default function Preview({ data }: { data: ResurrectDoc }) {
  const initialSession = Math.max(
    0,
    data.sessions.findIndex((s) => s.name === data.activeSession)
  );
  const [sessionIdx, setSessionIdx] = useState(initialSession);
  const [windowIdx, setWindowIdx] = useState(0);

  if (data.sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/30 p-12 text-center text-sm text-muted-foreground">
        No sessions to preview.
      </div>
    );
  }

  const si = Math.min(sessionIdx, data.sessions.length - 1);
  const session = data.sessions[si];
  const wi = Math.min(windowIdx, session.windows.length - 1);
  const win = session.windows[wi];

  function selectSession(value: number) {
    setSessionIdx(value);
    const active = data.sessions[value].windows.findIndex((w) => w.active === 1);
    setWindowIdx(active === -1 ? 0 : active);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex w-full max-w-xs flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
          Preview session
        </span>
        <Select
          value={String(si)}
          onValueChange={(v) => selectSession(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.sessions.map((s, i) => (
              <SelectItem key={i} value={String(i)}>
                {s.name || '(unnamed)'} ({s.windows.length} window
                {s.windows.length !== 1 ? 's' : ''})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="overflow-hidden rounded-lg border border-border bg-term-bg shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3.5 py-2.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
            {session.name} — {win.name || '(unnamed)'}
          </span>
        </div>

        <div className="scanlines relative h-[460px] bg-term-bg">
          <WindowView key={`${si}:${wi}`} win={win} />
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t border-black/40 bg-primary/85 px-2 py-1.5 font-mono text-xs">
          <span className="px-1.5 font-bold text-black">[{session.name}]</span>
          {session.windows.map((w, i) => (
            <button
              key={i}
              onClick={() => setWindowIdx(i)}
              title={`Open window ${w.index}: ${w.name || '(unnamed)'}`}
              className={cn(
                'rounded px-2 py-0.5 transition-colors',
                i === wi
                  ? 'bg-term-bg text-term-green'
                  : 'text-black/85 hover:bg-black/15'
              )}
            >
              {w.index}:{w.name || '(unnamed)'}
              {w.active === 1 ? '*' : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
