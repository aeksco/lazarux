'use client';

/*
 * Editor.tsx
 * GUI for the whole structured tmux-resurrect model. Every session is rendered
 * as a collapsible group; each window inside is a collapsible card with a drag
 * handle. Windows can be dragged to reorder within a session OR moved to another
 * session entirely. It never mutates props directly: every change clones `data`,
 * applies the change, and hands the new object back through `onChange`.
 */

import { useEffect, useState } from 'react';
import type { DragEvent as RDragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Circle,
  GripVertical,
  Move,
  Plus,
  RefreshCw,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import {
  baseIndexOf,
  newPane,
  newSession,
  newWindow,
  normalizeActive,
  renumberWindows,
  uniqueSessionName,
} from '@/lib/model';
import type { PrefixCollision, ResurrectDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  mono?: boolean;
  placeholder?: string;
  className?: string;
}

// A labelled input. Defined at module scope so it keeps a stable identity
// across renders (inputs don't lose focus while typing).
function Field({ label, value, onChange, mono, placeholder, className }: FieldProps) {
  return (
    <label className={cn('flex min-w-0 flex-1 flex-col gap-1.5', className)}>
      <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Input
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(mono && 'font-mono text-xs')}
      />
    </label>
  );
}

function ActiveRadio({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-3.5 cursor-pointer accent-primary"
      />
      active
    </label>
  );
}

// Swap membership of two indexes in a Set keyed by session index.
function swapIndexSet(set: Set<number>, i: number, j: number): Set<number> {
  const next = new Set(set);
  const hasI = set.has(i);
  const hasJ = set.has(j);
  next.delete(i);
  next.delete(j);
  if (hasI) next.add(j);
  if (hasJ) next.add(i);
  return next;
}

// Swap the session-index prefix of keys (`${sessionIndex}:${windowIndex}`).
function swapWindowKeys(set: Set<string>, i: number, j: number): Set<string> {
  const next = new Set<string>();
  for (const key of set) {
    const [head, rest] = key.split(/:(.+)/);
    const sIdx = Number(head);
    if (sIdx === i) next.add(`${j}:${rest}`);
    else if (sIdx === j) next.add(`${i}:${rest}`);
    else next.add(key);
  }
  return next;
}

type DragPos = { s: number; w: number };
type OverPos = { s: number; w: number | 'end' };

interface EditorProps {
  data: ResurrectDoc;
  onChange: (data: ResurrectDoc) => void;
  startCollapsed?: boolean;
  collisions?: PrefixCollision[];
}

export default function Editor({
  data,
  onChange,
  startCollapsed = false,
  collisions = [],
}: EditorProps) {
  const [collapsedSessions, setCollapsedSessions] = useState<Set<number>>(() =>
    startCollapsed ? new Set(data.sessions.map((_, i) => i)) : new Set()
  );
  // Windows always start collapsed so the session list stays scannable.
  const [collapsedWindows, setCollapsedWindows] = useState<Set<string>>(
    () =>
      new Set(
        data.sessions.flatMap((sess, si) =>
          sess.windows.map((w) => `${si}:${w.index}`)
        )
      )
  );
  const [drag, setDrag] = useState<DragPos | null>(null);
  const [over, setOver] = useState<OverPos | null>(null);
  const [moveDialog, setMoveDialog] = useState<DragPos | null>(null);
  const [moveTarget, setMoveTarget] = useState(0);

  // Auto-scroll the page while dragging near the viewport edges (native HTML5
  // drag only fires `dragover` on movement, so drive it from a rAF loop).
  useEffect(() => {
    if (!drag) return;
    const EDGE = 90;
    const MAX_SPEED = 16;
    let pointerY: number | null = null;
    let raf = 0;
    let running = true;

    function onDragOver(e: DragEvent) {
      pointerY = e.clientY;
    }
    function step() {
      if (!running) return;
      if (pointerY != null) {
        const h = window.innerHeight;
        let dy = 0;
        if (pointerY < EDGE) dy = -MAX_SPEED * (1 - pointerY / EDGE);
        else if (pointerY > h - EDGE)
          dy = MAX_SPEED * (1 - (h - pointerY) / EDGE);
        if (dy !== 0) window.scrollBy(0, dy);
      }
      raf = requestAnimationFrame(step);
    }

    window.addEventListener('dragover', onDragOver);
    raf = requestAnimationFrame(step);
    return () => {
      running = false;
      window.removeEventListener('dragover', onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [drag]);

  function update(mutator: (d: ResurrectDoc) => void) {
    const next = structuredClone(data);
    mutator(next);
    onChange(next);
  }

  // --- sessions ------------------------------------------------------------

  function addSession() {
    update((d) => {
      d.sessions.push(newSession(uniqueSessionName(d.sessions, 'session')));
    });
  }

  function removeSession(s: number) {
    update((d) => {
      const [removed] = d.sessions.splice(s, 1);
      if (d.activeSession === removed.name) {
        d.activeSession = d.sessions[0]?.name ?? '';
      }
    });
  }

  function setSessionName(s: number, value: string) {
    update((d) => {
      const sess = d.sessions[s];
      const old = sess.name;
      sess.name = value;
      if (d.activeSession === old) d.activeSession = value;
    });
  }

  function setAttached(s: number) {
    update((d) => {
      d.activeSession = d.sessions[s].name;
    });
  }

  function moveSession(i: number, j: number) {
    if (j < 0 || j >= data.sessions.length) return;
    update((d) => {
      const tmp = d.sessions[i];
      d.sessions[i] = d.sessions[j];
      d.sessions[j] = tmp;
    });
    setCollapsedSessions((prev) => swapIndexSet(prev, i, j));
    setCollapsedWindows((prev) => swapWindowKeys(prev, i, j));
  }

  // --- windows -------------------------------------------------------------

  function setWindowField(
    s: number,
    w: number,
    field: 'name' | 'flags' | 'layout' | 'automaticRename',
    value: string
  ) {
    update((d) => {
      d.sessions[s].windows[w][field] = value;
    });
  }

  function setActiveWindow(s: number, w: number) {
    update((d) => {
      d.sessions[s].windows.forEach((win, i) => {
        win.active = i === w ? 1 : 0;
        if (i === w) win.flags = '*';
        else if (win.flags === '*') win.flags = '-';
      });
    });
  }

  function addWindow(s: number) {
    update((d) => {
      const windows = d.sessions[s].windows;
      const nextIndex = windows.reduce((m, w) => Math.max(m, w.index), 0) + 1;
      windows.push(newWindow({ index: nextIndex }));
      renumberWindows(windows);
    });
  }

  function removeWindow(s: number, w: number) {
    update((d) => {
      const windows = d.sessions[s].windows;
      windows.splice(w, 1);
      normalizeActive(windows);
      renumberWindows(windows);
    });
  }

  function reindexWindows(s: number) {
    update((d) => {
      renumberWindows(d.sessions[s].windows, baseIndexOf(d));
    });
  }

  function moveWindow(fromS: number, fromW: number, toS: number, toW: number) {
    update((d) => {
      if (fromS === toS) {
        const windows = d.sessions[fromS].windows;
        if (fromW === toW) return;
        const [moved] = windows.splice(fromW, 1);
        const insert = fromW < toW ? toW - 1 : toW;
        windows.splice(Math.min(insert, windows.length), 0, moved);
        renumberWindows(windows);
      } else {
        const src = d.sessions[fromS].windows;
        if (src.length <= 1) return;
        const [moved] = src.splice(fromW, 1);
        moved.active = 0;
        if (moved.flags === '*') moved.flags = '-';
        const dst = d.sessions[toS].windows;
        dst.splice(Math.min(toW, dst.length), 0, moved);
        normalizeActive(src);
        normalizeActive(dst);
        renumberWindows(src);
        renumberWindows(dst);
      }
    });
  }

  function openMove(s: number, w: number) {
    const firstOther = data.sessions.findIndex((_, i) => i !== s);
    setMoveTarget(firstOther === -1 ? s : firstOther);
    setMoveDialog({ s, w });
  }

  function confirmMove() {
    if (!moveDialog) return;
    const { s, w } = moveDialog;
    const to = Number(moveTarget);
    if (to !== s) moveWindow(s, w, to, data.sessions[to].windows.length);
    setMoveDialog(null);
  }

  // --- panes ---------------------------------------------------------------

  function setPaneField(
    s: number,
    w: number,
    p: number,
    field: 'command' | 'title' | 'path' | 'fullCommand',
    value: string
  ) {
    update((d) => {
      d.sessions[s].windows[w].panes[p][field] = value;
    });
  }

  function setActivePane(s: number, w: number, p: number) {
    update((d) => {
      d.sessions[s].windows[w].panes.forEach((pane, i) => {
        pane.active = i === p ? 1 : 0;
      });
    });
  }

  function addPane(s: number, w: number) {
    update((d) => {
      const win = d.sessions[s].windows[w];
      const nextIndex = win.panes.reduce((m, p) => Math.max(m, p.index), 0) + 1;
      win.panes.push({ ...newPane(0), index: nextIndex });
    });
  }

  function removePane(s: number, w: number, p: number) {
    update((d) => {
      d.sessions[s].windows[w].panes.splice(p, 1);
    });
  }

  // --- collapse ------------------------------------------------------------

  function toggleSession(s: number) {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function windowKey(s: number, win: { index: number }) {
    return `${s}:${win.index}`;
  }
  function toggleWindow(s: number, win: { index: number }) {
    const key = windowKey(s, win);
    setCollapsedWindows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- drag & drop ---------------------------------------------------------

  function onWindowDragStart(e: RDragEvent<HTMLElement>, s: number, w: number) {
    setDrag({ s, w });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${s}:${w}`);
  }
  function onWindowDragOver(e: RDragEvent<HTMLElement>, s: number, w: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!over || over.s !== s || over.w !== w) setOver({ s, w });
  }
  function onWindowDrop(e: RDragEvent<HTMLElement>, s: number, w: number) {
    e.preventDefault();
    e.stopPropagation();
    if (drag) moveWindow(drag.s, drag.w, s, w);
    setDrag(null);
    setOver(null);
  }
  function onSessionDragOver(e: RDragEvent<HTMLElement>, s: number) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!over || over.s !== s || over.w !== 'end') setOver({ s, w: 'end' });
  }
  function onSessionDrop(e: RDragEvent<HTMLElement>, s: number) {
    e.preventDefault();
    if (drag) moveWindow(drag.s, drag.w, s, data.sessions[s].windows.length);
    setDrag(null);
    setOver(null);
  }
  function onDragEnd() {
    setDrag(null);
    setOver(null);
  }

  const moveName =
    moveDialog &&
    (data.sessions[moveDialog.s]?.windows[moveDialog.w]?.name || '(unnamed)');

  return (
    <div className="flex flex-col gap-4">
      {data.sessions.map((sess, s) => {
        const sessionCollapsed = collapsedSessions.has(s);
        const isAttached = sess.name === data.activeSession;
        const showEndDrop = drag && over?.s === s && over?.w === 'end';
        const conflicts = collisions.filter((c) => c.prefix === sess.name);

        return (
          <div
            key={s}
            onDragOver={(e) => onSessionDragOver(e, s)}
            onDrop={(e) => onSessionDrop(e, s)}
            className={cn(
              'overflow-hidden rounded-lg border border-border bg-card transition-shadow',
              showEndDrop && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between gap-3 bg-secondary/30 px-3 py-2.5',
                !sessionCollapsed && 'border-b border-border'
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleSession(s)}
                  title={sessionCollapsed ? 'Expand' : 'Collapse'}
                >
                  {sessionCollapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
                <span className="truncate font-mono text-base font-semibold">
                  {sess.name || '(unnamed)'}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  · {sess.windows.length} window
                  {sess.windows.length !== 1 ? 's' : ''}
                </span>
                {isAttached && (
                  <Circle
                    className="size-2 shrink-0 fill-primary text-primary phosphor"
                    aria-label="attached session"
                  />
                )}
                {conflicts.length > 0 && (
                  <Badge
                    variant="warning"
                    title={`"${sess.name}" is a prefix of ${conflicts
                      .map((c) => `"${c.longer}"`)
                      .join(', ')} — on restore its windows get merged into ${
                      conflicts.length > 1 ? 'those sessions' : 'that session'
                    }. Rename this session so it isn't a prefix of another.`}
                  >
                    <TriangleAlert /> name collision
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => moveSession(s, s - 1)}
                  disabled={s === 0}
                  title="Move session up"
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => moveSession(s, s + 1)}
                  disabled={s === data.sessions.length - 1}
                  title="Move session down"
                >
                  <ArrowDown />
                </Button>
                {isAttached ? (
                  <Badge
                    variant="success"
                    className="h-8 w-[7.5rem] justify-center text-sm"
                  >
                    ✓ attached
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-[7.5rem]"
                    onClick={() => setAttached(s)}
                  >
                    Set attached
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeSession(s)}
                  disabled={data.sessions.length === 1}
                  title={
                    data.sessions.length === 1
                      ? 'There must be at least one session'
                      : 'Remove session'
                  }
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>

            {!sessionCollapsed && (
              <div className="flex flex-col gap-4 p-4">
                <Field
                  label="Session name"
                  value={sess.name}
                  onChange={(v) => setSessionName(s, v)}
                />

                <div className="flex flex-col gap-3">
                  {sess.windows.map((win, w) => {
                    const windowCollapsed = collapsedWindows.has(
                      windowKey(s, win)
                    );
                    const isDragging = drag?.s === s && drag?.w === w;
                    const isDropTarget =
                      drag &&
                      over?.s === s &&
                      over?.w === w &&
                      !(drag.s === s && drag.w === w);

                    return (
                      <div
                        key={w}
                        onDragOver={(e) => onWindowDragOver(e, s, w)}
                        onDrop={(e) => onWindowDrop(e, s, w)}
                        className={cn(
                          'rounded-md border border-border bg-background/40 transition',
                          isDragging && 'opacity-40',
                          isDropTarget && 'ring-2 ring-primary'
                        )}
                      >
                        <div
                          className={cn(
                            'flex items-center justify-between gap-3 px-3 py-2',
                            !windowCollapsed && 'border-b border-border'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              draggable
                              onDragStart={(e) => onWindowDragStart(e, s, w)}
                              onDragEnd={onDragEnd}
                              title="Drag to reorder or move to another session"
                              className="cursor-grab text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
                            >
                              <GripVertical className="size-4" />
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 text-muted-foreground hover:text-foreground"
                              onClick={() => toggleWindow(s, win)}
                              title={windowCollapsed ? 'Expand' : 'Collapse'}
                            >
                              {windowCollapsed ? (
                                <ChevronRight />
                              ) : (
                                <ChevronDown />
                              )}
                            </Button>
                            <span className="truncate font-mono text-sm">
                              {win.name || '(unnamed)'}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              · win {win.index} · {win.panes.length} pane
                              {win.panes.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <ActiveRadio
                              name={`active-window-${s}`}
                              checked={win.active === 1}
                              onChange={() => setActiveWindow(s, w)}
                            />
                            {/* Move button — hidden for now; uncomment to re-enable.
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openMove(s, w)}
                              disabled={
                                data.sessions.length === 1 ||
                                sess.windows.length === 1
                              }
                              title={
                                data.sessions.length === 1
                                  ? 'No other session to move to'
                                  : sess.windows.length === 1
                                    ? 'A session needs at least one window'
                                    : 'Move this window to another session'
                              }
                            >
                              <Move /> Move
                            </Button>
                            */}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeWindow(s, w)}
                              disabled={sess.windows.length === 1}
                              title={
                                sess.windows.length === 1
                                  ? 'A session needs at least one window'
                                  : 'Remove window'
                              }
                            >
                              <Trash2 /> Remove
                            </Button>
                          </div>
                        </div>

                        {!windowCollapsed && (
                          <div className="flex flex-col gap-3 p-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <Field
                                label="Name"
                                value={win.name}
                                onChange={(v) => setWindowField(s, w, 'name', v)}
                              />
                              <Field
                                label="Flags"
                                className="flex-none w-24"
                                value={win.flags}
                                onChange={(v) => setWindowField(s, w, 'flags', v)}
                              />
                              <label className="flex w-32 flex-none flex-col gap-1.5">
                                <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                                  Auto-rename
                                </span>
                                <Select
                                  value={win.automaticRename}
                                  onValueChange={(v) =>
                                    setWindowField(s, w, 'automaticRename', v)
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="off">off</SelectItem>
                                    <SelectItem value="on">on</SelectItem>
                                  </SelectContent>
                                </Select>
                              </label>
                            </div>
                            <Field
                              label="Layout"
                              mono
                              value={win.layout}
                              onChange={(v) => setWindowField(s, w, 'layout', v)}
                              placeholder="e.g. b9fe,187x52,0,0,1"
                            />

                            <div className="flex flex-col gap-3 border-t border-border pt-3">
                              {win.panes.map((pane, p) => (
                                <div
                                  key={p}
                                  className="flex flex-col gap-2.5 rounded-md border border-border bg-card/50 p-3"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono text-xs text-muted-foreground">
                                      Pane {pane.index}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <ActiveRadio
                                        name={`active-pane-${s}-${w}`}
                                        checked={pane.active === 1}
                                        onChange={() => setActivePane(s, w, p)}
                                      />
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => removePane(s, w, p)}
                                        disabled={win.panes.length === 1}
                                        title={
                                          win.panes.length === 1
                                            ? 'A window needs at least one pane'
                                            : 'Remove pane'
                                        }
                                      >
                                        <Trash2 /> Remove
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-end gap-3">
                                    <Field
                                      label="Command"
                                      className="flex-none w-36"
                                      value={pane.command}
                                      onChange={(v) =>
                                        setPaneField(s, w, p, 'command', v)
                                      }
                                    />
                                    <Field
                                      label="Title"
                                      value={pane.title}
                                      onChange={(v) =>
                                        setPaneField(s, w, p, 'title', v)
                                      }
                                    />
                                  </div>
                                  <Field
                                    label="Path"
                                    mono
                                    value={pane.path}
                                    onChange={(v) =>
                                      setPaneField(s, w, p, 'path', v)
                                    }
                                    placeholder="/Users/you/code/project"
                                  />
                                  <Field
                                    label="Full command"
                                    mono
                                    value={pane.fullCommand}
                                    onChange={(v) =>
                                      setPaneField(s, w, p, 'fullCommand', v)
                                    }
                                    placeholder="(empty for an interactive shell)"
                                  />
                                </div>
                              ))}
                              <div className="flex">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addPane(s, w)}
                                >
                                  <Plus /> Add pane
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addWindow(s)}
                    >
                      <Plus /> Add window
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reindexWindows(s)}
                      disabled={sess.windows.length < 2}
                      title="Renumber windows to match their current order"
                    >
                      <RefreshCw /> Reindex windows
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex">
        <Button variant="outline" onClick={addSession}>
          <Plus /> Add session
        </Button>
      </div>

      <Dialog
        open={moveDialog !== null}
        onOpenChange={(open) => {
          if (!open) setMoveDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move window</DialogTitle>
            <DialogDescription>
              Move{' '}
              <span className="font-mono font-medium text-foreground">
                {moveName}
              </span>{' '}
              to which session?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              Destination session
            </span>
            <Select
              value={String(moveTarget)}
              onValueChange={(v) => setMoveTarget(Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.sessions.map((s2, i) =>
                  i === moveDialog?.s ? null : (
                    <SelectItem key={i} value={String(i)}>
                      {s2.name || '(unnamed)'} ({s2.windows.length} window
                      {s2.windows.length !== 1 ? 's' : ''})
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoveDialog(null)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={confirmMove}>
              <Move /> Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
