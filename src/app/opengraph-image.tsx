import { ImageResponse } from 'next/og';

// Route segment config / static metadata for the generated social card.
export const alt = 'Lazarux — raise your tmux sessions from the dead';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'radial-gradient(circle at 25% 15%, #14201b 0%, #0e1311 55%, #090d0b 100%)',
          padding: '80px',
          fontFamily: 'monospace',
          position: 'relative',
        }}
      >
        {/* faint scanline grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(94,240,138,0.05) 0px, rgba(94,240,138,0.05) 1px, transparent 1px, transparent 28px)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {/* skull glyph */}
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#5ef08a" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="m12.5 17-.5-1-.5 1h1z" />
            <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="9" cy="12" r="1" />
          </svg>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#5ef08a',
              textTransform: 'uppercase',
            }}
          >
            Lazarux
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: 46,
              fontWeight: 600,
              color: '#e8f3ec',
              lineHeight: 1.15,
              maxWidth: '900px',
            }}
          >
            Raise your tmux sessions from the dead.
          </div>
          <div style={{ fontSize: 30, color: '#7c948a', maxWidth: '940px' }}>
            A browser GUI for editing tmux-resurrect session state — upload,
            reshape, export.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: 26,
            color: '#5ef08a',
          }}
        >
          <div
            style={{
              background: 'rgba(94,240,138,0.12)',
              border: '1px solid rgba(94,240,138,0.35)',
              borderRadius: '8px',
              padding: '8px 18px',
            }}
          >
            lazarux.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
