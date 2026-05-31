import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import {
  defaultTitle,
  description,
  keywords,
  siteName,
  siteUrl,
  titleTemplate,
  twitterHandle,
} from '@/lib/seo';
import './globals.css';

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: titleTemplate,
  },
  description,
  keywords,
  applicationName: siteName,
  authors: [{ name: 'aeksco', url: 'https://x.com/aeksco' }],
  creator: 'aeksco',
  publisher: 'aeksco',
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName,
    title: defaultTitle,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description,
    creator: twitterHandle,
    site: twitterHandle,
  },
  icons: {
    icon: '/icon.svg',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plexMono.variable} ${plexSans.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
