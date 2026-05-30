/*
 * lib/resurrect.ts
 *
 * Pure (no filesystem) conversion between the tmux-resurrect tab-separated
 * state format and a structured, JSON-friendly object. Shared by the CLI
 * scripts and the Next.js web app.
 *
 * Format reference (tab-separated fields):
 *
 *   pane    <session> <win_idx> <win_active> <win_flags> <pane_idx>
 *           <title> <path> <pane_active> <command> <full_command>
 *
 *   window  <session> <win_idx> <name> <active> <flags> <layout> <auto_rename>
 *
 *   state   <session>       (the attached/"current" session)
 *
 * A state file can describe MANY sessions — the session name is a field on
 * every pane/window line. The single `state` line records which session was
 * attached.
 *
 * tmux-resurrect prefixes certain fields with a ':' guard (protecting empty /
 * dash-leading values). We strip it for the JSON and re-add it on output, so
 * the round-trip is lossless.
 */

import type { Pane, ResurrectDoc, Session, TmuxWindow } from './types';

// Remove a single leading ':' guard character if present.
function unguard(value: string): string {
  return value.startsWith(':') ? value.slice(1) : value;
}

// Re-add the leading ':' guard character.
function guard(value: string): string {
  return ':' + value;
}

// In-progress window record: window-level fields are filled lazily from the
// first pane line and then the window line, so they start null.
interface WindowBuild {
  index: number;
  name: string | null;
  active: number | null;
  flags: string | null;
  layout: string | null;
  automaticRename: string | null;
  panes: Pane[];
}

interface SessionBuild {
  name: string;
  windowsByIndex: Map<string, WindowBuild>;
  paneList: Array<Pane & { windowIndex: number }>;
}

/** Parse a tmux-resurrect state string into a structured object. */
export function parseResurrect(raw: string): ResurrectDoc {
  const lines = raw.split('\n');

  // Detect a trailing newline so we can faithfully reproduce it later.
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  if (hasTrailingNewline) lines.pop();

  // Sessions keyed by name, preserving first-seen order.
  const sessionsByName = new Map<string, SessionBuild>();
  let activeSession: string | null = null;

  function getSession(name: string): SessionBuild {
    let sess = sessionsByName.get(name);
    if (!sess) {
      sess = { name, windowsByIndex: new Map(), paneList: [] };
      sessionsByName.set(name, sess);
    }
    return sess;
  }

  // Lazily create / fetch a window record by its index within a session.
  function getWindow(sess: SessionBuild, index: string): WindowBuild {
    let win = sess.windowsByIndex.get(index);
    if (!win) {
      win = {
        index: Number(index),
        name: null,
        active: null,
        flags: null,
        layout: null,
        automaticRename: null,
        panes: [],
      };
      sess.windowsByIndex.set(index, win);
    }
    return win;
  }

  for (const line of lines) {
    if (line === '') continue;
    const f = line.split('\t');
    const type = f[0];

    if (type === 'pane') {
      const sess = getSession(f[1]);
      const win = getWindow(sess, f[2]);
      // window-level fields are duplicated on every pane line; capture them.
      if (win.active === null) win.active = Number(f[3]);
      if (win.flags === null) win.flags = unguard(f[4]);
      sess.paneList.push({
        windowIndex: Number(f[2]),
        index: Number(f[5]),
        title: f[6],
        path: unguard(f[7]),
        active: Number(f[8]),
        command: f[9],
        fullCommand: unguard(f[10]),
      });
    } else if (type === 'window') {
      const sess = getSession(f[1]);
      const win = getWindow(sess, f[2]);
      win.name = unguard(f[3]);
      win.active = Number(f[4]);
      win.flags = unguard(f[5]);
      win.layout = f[6];
      win.automaticRename = f[7];
    } else if (type === 'state') {
      activeSession = f[1];
    }
  }

  // Nest panes under their windows and emit fully-typed, ordered structures.
  const sessions: Session[] = [];
  for (const sess of sessionsByName.values()) {
    for (const pane of sess.paneList) {
      const win = getWindow(sess, String(pane.windowIndex));
      const { windowIndex, ...rest } = pane;
      win.panes.push(rest);
    }
    const windows: TmuxWindow[] = [...sess.windowsByIndex.values()]
      .sort((a, b) => a.index - b.index)
      .map((w) => ({
        index: w.index,
        name: w.name ?? '',
        active: w.active ?? 0,
        flags: w.flags ?? '',
        layout: w.layout ?? '',
        automaticRename: w.automaticRename ?? 'off',
        panes: w.panes.sort((a, b) => a.index - b.index),
      }));
    sessions.push({ name: sess.name, windows });
  }

  return {
    sessions,
    activeSession: activeSession ?? sessions[0]?.name ?? '',
    hasTrailingNewline,
  };
}

/**
 * Serialize a structured object back into a tmux-resurrect state string.
 * The output is byte-for-byte identical to the original input.
 *
 * With { lockWindowNames: true }, every window's automatic_rename field is
 * written as "off". tmux restores window names but then re-applies any window
 * whose automatic-rename is on (or inherited from a global "on"), overwriting
 * the saved name with the running command. Forcing "off" makes restored names
 * stick regardless of the user's global tmux setting.
 */
export function serializeResurrect(
  data: ResurrectDoc,
  options: { lockWindowNames?: boolean } = {}
): string {
  const { lockWindowNames = false } = options;
  const { sessions, activeSession } = data;
  const lines: string[] = [];

  // tmux-resurrect dumps every pane line first (across all sessions), then
  // every window line, then the single state line.
  for (const sess of sessions) {
    for (const win of sess.windows) {
      for (const pane of win.panes) {
        lines.push(
          [
            'pane',
            sess.name,
            win.index,
            win.active,
            guard(win.flags),
            pane.index,
            pane.title,
            guard(pane.path),
            pane.active,
            pane.command,
            guard(pane.fullCommand),
          ].join('\t')
        );
      }
    }
  }

  for (const sess of sessions) {
    for (const win of sess.windows) {
      lines.push(
        [
          'window',
          sess.name,
          win.index,
          guard(win.name),
          win.active,
          guard(win.flags),
          win.layout,
          lockWindowNames ? 'off' : win.automaticRename,
        ].join('\t')
      );
    }
  }

  // state line carries a trailing tab in the resurrect format.
  lines.push(['state', activeSession, ''].join('\t'));

  let out = lines.join('\n');
  if (data.hasTrailingNewline) out += '\n';
  return out;
}
