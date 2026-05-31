'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { SoftwareApplicationJsonLd } from 'next-seo';
import {
  Code,
  Download,
  Pencil,
  RotateCcw,
  Skull,
  SquareTerminal,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  defaultTitle,
  description as seoDescription,
  ogImage,
  siteUrl,
} from '@/lib/seo';
import { parseResurrect, serializeResurrect } from '@/lib/resurrect';
import { emptyDoc, exampleDoc, prefixCollisions } from '@/lib/model';
import type { ResurrectDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import Editor from './components/Editor';
import Preview from './components/Preview';

type View = 'editor' | 'preview' | 'json';

const STORAGE_KEY = 'tmux-resurrect-configurator:doc';

const VIEWS: { id: View; label: string; icon: typeof Pencil }[] = [
  { id: 'editor', label: 'Editor', icon: Pencil },
  { id: 'preview', label: 'Preview', icon: SquareTerminal },
  { id: 'json', label: 'JSON', icon: Code },
];

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-card/40 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<ResurrectDoc | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('editor');
  const [lockNames, setLockNames] = useState(true);
  const [loadId, setLoadId] = useState(0);
  const [startCollapsed, setStartCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstPersist = useRef(true);

  // Restore the last edited config from localStorage on first mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setData(JSON.parse(saved) as ResurrectDoc);
        setStartCollapsed(true);
        setLoadId((n) => n + 1);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Persist on every change (skipping the first run so we don't clobber stored
  // data before the restore effect reads it).
  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    try {
      if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore quota / disabled storage
    }
  }, [data]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setData(parseResurrect(text));
      setFilename(file.name);
      setStartCollapsed(true);
      setLoadId((n) => n + 1);
      setView('editor');
    } catch (err) {
      setData(null);
      setFilename(null);
      setError(
        `Could not parse "${file.name}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    e.target.value = '';
  }

  function handleNew() {
    setError(null);
    setFilename(null);
    setData(emptyDoc());
    setStartCollapsed(false);
    setLoadId((n) => n + 1);
    setView('editor');
  }

  function handleExample() {
    setError(null);
    setFilename(null);
    setData(exampleDoc());
    setStartCollapsed(false);
    setLoadId((n) => n + 1);
    setView('editor');
  }

  function handleReset() {
    if (
      !window.confirm(
        'Reset and discard the current config? This cannot be undone.'
      )
    ) {
      return;
    }
    setData(null);
    setFilename(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function handleExport() {
    if (!data) return;
    const text = serializeResurrect(data, { lockWindowNames: lockNames });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sessions.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const windowCount = data
    ? data.sessions.reduce((n, s) => n + s.windows.length, 0)
    : 0;
  const paneCount = data
    ? data.sessions.reduce(
        (n, s) => n + s.windows.reduce((m, w) => m + w.panes.length, 0),
        0
      )
    : 0;
  const names = data ? data.sessions.map((s) => s.name) : [];
  const hasDuplicateNames = new Set(names).size !== names.length;
  const collisions = data ? prefixCollisions(data.sessions) : [];

  return (
    <div className="mx-auto max-w-[1120px] px-6 pt-12 pb-28">
      {/* next-seo structured data — surfaces Lazarux as a rich result and
          complements the meta tags defined via the Metadata API in layout.tsx. */}
      <SoftwareApplicationJsonLd
        type="DeveloperApplication"
        name={defaultTitle}
        description={seoDescription}
        url={siteUrl}
        image={ogImage.url}
        applicationCategory="DeveloperApplication"
        operatingSystem="Any (web browser)"
        offers={{
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
        }}
        author={{ '@type': 'Person', name: 'aeksco', url: 'https://x.com/aeksco' }}
      />
      <header className="mb-8 animate-rise">
        <div className="flex items-center gap-3">
          <Skull className="size-8 text-primary phosphor" strokeWidth={1.75} />
          <h1 className="phosphor font-mono text-4xl font-bold tracking-[0.18em] text-primary uppercase">
            Lazarux
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Raise your tmux sessions from the dead — upload a{' '}
          <a
            href="https://github.com/tmux-plugins/tmux-resurrect"
            target="_blank"
            rel="noreferrer"
            className="text-primary/90 underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary"
          >
            tmux-resurrect
          </a>{' '}
          state file, edit its sessions with the GUI, and export it back to a{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            sessions.txt
          </code>
          .
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={handleFile}
          className="hidden"
        />
        <Button onClick={() => fileInputRef.current?.click()}>
          <Upload /> Upload state file
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download /> Export
        </Button>
        <Button variant="destructive" onClick={handleReset} disabled={!data}>
          <RotateCcw /> Reset
        </Button>
        <label
          className="ml-1 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none"
          title="Write automatic_rename=off for every window so restored names aren't overwritten by tmux's automatic-rename. Trade-off: those windows stop auto-renaming to their running command."
        >
          <Checkbox
            checked={lockNames}
            onCheckedChange={(v) => setLockNames(v === true)}
          />
          Lock window names
        </label>

        <div className="ml-auto flex items-center gap-3">
          {filename && (
            <span className="text-xs text-muted-foreground">
              Loaded:{' '}
              <span className="font-mono text-foreground">{filename}</span>
            </span>
          )}
          {data && (
            <div className="inline-flex rounded-md border border-border bg-card/40 p-0.5">
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
                    view === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary stats — hidden for now; uncomment to re-enable.
      {data && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Stat label="Sessions" value={data.sessions.length} />
          <Stat label="Windows" value={windowCount} />
          <Stat label="Panes" value={paneCount} />
          <Stat label="Attached" value={data.activeSession || '—'} />
        </div>
      )}
      */}

      {data && hasDuplicateNames && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-term-amber/30 bg-term-amber/10 p-4 text-sm text-term-amber">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Two sessions share a name — tmux session names must be unique, and
            the export will merge them.
          </span>
        </div>
      )}

      {data && collisions.length > 0 && (
        <div className="mb-5 rounded-lg border border-term-amber/30 bg-term-amber/10 p-4 text-sm text-term-amber">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              Session names collide under tmux&apos;s prefix matching — on
              restore, tmux-resurrect will merge the shorter session into the
              longer one:
              <ul className="mt-2 ml-1 list-disc space-y-1 pl-4">
                {collisions.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold">{c.prefix || '(empty)'}</span>{' '}
                    is a prefix of{' '}
                    <span className="font-semibold">{c.longer}</span>, so “
                    {c.prefix}” may be absorbed into “{c.longer}”.
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                Rename one so that no session name is a prefix of another.
              </div>
            </div>
          </div>
        </div>
      )}

      {data ? (
        view === 'editor' ? (
          <Editor
            key={loadId}
            data={data}
            onChange={setData}
            startCollapsed={startCollapsed}
            collisions={collisions}
          />
        ) : view === 'preview' ? (
          <Preview key={loadId} data={data} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              JSON
            </div>
            <pre className="max-h-[78vh] overflow-auto p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/30 p-16 text-center text-sm text-muted-foreground">
          Upload a{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            sessions.txt
          </code>{' '}
          file,{' '}
          <button
            onClick={handleExample}
            className="cursor-pointer font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            open an example
          </button>
          , or{' '}
          <button
            onClick={handleNew}
            className="cursor-pointer font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            start a new file
          </button>{' '}
          to begin editing.
        </div>
      )}

      <footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-8 text-center text-sm text-muted-foreground">
        <a
          href="https://github.com/aeksco/lazarux"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 transition-colors hover:text-primary"
        >
          <GithubMark className="size-4" />
          github.com/aeksco/lazarux
        </a>
        <p>
          Built with ❤️ by{' '}
          <a
            href="https://x.com/aeksco"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground transition-colors hover:text-primary"
          >
            aeksco
          </a>
        </p>
      </footer>
    </div>
  );
}

