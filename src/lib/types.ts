/*
 * lib/types.ts
 * Shared type definitions for the structured tmux-resurrect model.
 */

export interface Pane {
  index: number;
  title: string;
  /** Working directory of the pane. */
  path: string;
  /** 1 if this is the active pane in its window, otherwise 0. */
  active: number;
  /** Foreground command (e.g. "zsh", "node"). */
  command: string;
  /** Full command line, or "" for an interactive shell. */
  fullCommand: string;
}

export interface TmuxWindow {
  index: number;
  name: string;
  /** 1 if this is the active window in its session, otherwise 0. */
  active: number;
  /** tmux window flags (e.g. "*", "-", "Z"). */
  flags: string;
  /** tmux layout string describing pane geometry. */
  layout: string;
  /** "on" / "off" / ":" (inherit) — controls tmux automatic-rename. */
  automaticRename: string;
  panes: Pane[];
}

export interface Session {
  name: string;
  windows: TmuxWindow[];
}

export interface ResurrectDoc {
  sessions: Session[];
  /** Name of the attached session (the tmux-resurrect `state` line). */
  activeSession: string;
  /** Whether the source file ended with a newline (preserved on round-trip). */
  hasTrailingNewline: boolean;
}

export interface PrefixCollision {
  /** The session name that is a prefix of `longer`. */
  prefix: string;
  /** A session name that begins with `prefix`. */
  longer: string;
}
