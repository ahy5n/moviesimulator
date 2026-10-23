import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700', '800'] });
const marquee = Bebas_Neue({ subsets: ['latin'], variable: '--font-marquee', weight: '400' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Studio Head Sim',
  description: 'Run a Hollywood studio in 2026. Buy scripts, cast real actors, chase Oscars, keep your job.',
};
export const viewport: Viewport = { themeColor: '#0B0B0F', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${marquee.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-ink">{children}</body>
    </html>
  );
}
