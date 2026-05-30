/*
 * lib/model.ts
 * Factory + normalization helpers for the structured session model, shared by
 * the page and the editor. Pure functions, no React.
 */

import type {
  Pane,
  PrefixCollision,
  ResurrectDoc,
  Session,
  TmuxWindow,
} from './types';

export function newPane(active = 1): Pane {
  return { index: 1, title: '', path: '', active, command: 'zsh', fullCommand: '' };
}

export function newWindow({
  index = 1,
  name = 'new-window',
  active = 0,
}: { index?: number; name?: string; active?: number } = {}): TmuxWindow {
  return {
    index,
    name,
    active,
    flags: active ? '*' : '-',
    layout: '',
    automaticRename: 'off',
    panes: [newPane(1)],
  };
}

export function newSession(name: string): Session {
  return { name, windows: [newWindow({ index: 1, name: 'window', active: 1 })] };
}

// A minimal blank document for starting from scratch.
export function emptyDoc(): ResurrectDoc {
  return {
    sessions: [newSession('main')],
    activeSession: 'main',
    hasTrailingNewline: true,
  };
}

// Generate a session name not already taken.
export function uniqueSessionName(sessions: Session[], base: string): string {
  const taken = new Set(sessions.map((s) => s.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Renumber windows so their `index` matches their position in the array.
// With no `base`, the session's current lowest index is kept (so a reorder
// doesn't disturb 0- vs 1-based numbering). Pass an explicit `base` to force a
// fresh sequence — e.g. the "Reindex windows" button collapses leftover gaps
// like 4,5 back down to 1,2. tmux restores windows by index, so reordering the
// list only takes effect once the indexes are rewritten.
export function renumberWindows(windows: TmuxWindow[], base?: number): void {
  if (!windows.length) return;
  const start = base ?? Math.min(...windows.map((w) => w.index));
  windows.forEach((w, i) => {
    w.index = start + i;
  });
}

// Detect session names that collide under tmux's prefix matching. tmux resolves
// a session target by exact match first, then by PREFIX — so `has-session -t
// "automation"` matches an existing session "automation - home". During restore this makes
// tmux-resurrect skip creating the shorter-named session and merge its windows
// into the longer one. Returns [{ prefix, longer }] pairs to warn about.
export function prefixCollisions(sessions: Session[]): PrefixCollision[] {
  const names = sessions.map((s) => s.name).filter((n) => n.length > 0);
  const collisions: PrefixCollision[] = [];
  for (const a of names) {
    for (const b of names) {
      if (a !== b && b.startsWith(a)) {
        collisions.push({ prefix: a, longer: b });
      }
    }
  }
  return collisions;
}

// Detect a document's tmux base-index: 0 if any window anywhere is index 0
// (0-based setup), otherwise 1. Used to reindex a session to a clean sequence
// without guessing from a session that has lost its low-numbered windows.
export function baseIndexOf(doc: ResurrectDoc): number {
  const hasZero = doc.sessions.some((s) => s.windows.some((w) => w.index === 0));
  return hasZero ? 0 : 1;
}

// Enforce exactly one active window per session, keeping its flag in sync
// (active window gets '*', any other stray '*' is downgraded to '-').
export function normalizeActive(windows: TmuxWindow[]): void {
  if (!windows.length) return;
  let activeIdx = windows.findIndex((w) => w.active === 1);
  if (activeIdx === -1) activeIdx = 0;
  windows.forEach((w, i) => {
    if (i === activeIdx) {
      w.active = 1;
      w.flags = '*';
    } else {
      w.active = 0;
      if (w.flags === '*') w.flags = '-';
    }
  });
}
