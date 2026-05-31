// Single source of truth for site metadata, shared between the App Router
// Metadata API (layout.tsx) and next-seo (<NextSeo> on the main page).

export const siteUrl = 'https://lazarux.vercel.app';

export const siteName = 'Lazarux';

export const defaultTitle = 'Lazarux — tmux-resurrect session editor';

export const titleTemplate = '%s · Lazarux';

export const description =
  'Lazarux is a browser-based GUI for editing tmux-resurrect session state. ' +
  'Upload your sessions.txt, reshape sessions, windows, and panes visually, ' +
  'then export a ready-to-restore state file. Fully client-side — nothing ' +
  'leaves your machine.';

export const keywords = [
  'tmux',
  'tmux-resurrect',
  'tmux resurrect',
  'tmux session manager',
  'tmux session editor',
  'sessions.txt',
  'terminal multiplexer',
  'tmux GUI',
  'tmux config',
  'developer tools',
];

export const twitterHandle = '@aeksco';

export const ogImage = {
  url: `${siteUrl}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: 'Lazarux — raise your tmux sessions from the dead',
};
