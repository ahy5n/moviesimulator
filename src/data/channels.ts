// TV channels and streamers that buy series. Broadcast and cable channels are fictional; streamers belong
// to rival studios and take their (plain text) names from src/data/studios.ts.
import type { Genre, Market } from '@/lib/types';
import type { SeriesFormat } from '@/lib/types';

export type ChannelKind = 'broadcast' | 'cable' | 'premium' | 'streamer';

export type Channel = {
  id: string; name: string; kind: ChannelKind; home: Market; languages: string[];
  /** Typical audience (millions per episode) for a solid show. */
  reach: number;
  maxBudgetPerEp: number;
  /** Share of the budget per episode they usually pay as a licence fee. */
  payRatio: number;
  genres: Partial<Record<Genre, number>>;
  formats: Partial<Record<SeriesFormat, number>>;
  prestige: number;  // 0–1: cares about quality and awards
  boldness: number;  // 0–1: appetite for multi-season commitments
  studioId?: string; // streamers owned by a rival studio
  blurb: string;
};

export const CHANNELS: Channel[] = [
  { id: 'atlas', name: 'Atlas One', kind: 'broadcast', home: 'US', languages: ['en'], reach: 7, maxBudgetPerEp: 6e6, payRatio: 0.85,
    genres: { Crime: 1.6, Comedy: 1.5, Drama: 1.2, Thriller: 1.2, Family: 1.1 }, formats: { Procedural: 1.8, Sitcom: 1.6, Drama: 1, Soap: 1.1, Limited: 0.5 },
    prestige: 0.3, boldness: 0.7, blurb: 'Big network. Loves procedurals and sitcoms that run forever.' },
  { id: 'bluebird', name: 'Bluebird Network', kind: 'broadcast', home: 'US', languages: ['en'], reach: 6, maxBudgetPerEp: 5e6, payRatio: 0.8,
    genres: { Family: 1.6, Comedy: 1.5, Animation: 1.4, Romance: 1.2, Musical: 1.2 }, formats: { Sitcom: 1.7, Animated: 1.6, Drama: 0.9, Soap: 1.2 },
    prestige: 0.25, boldness: 0.55, blurb: 'Family-friendly network with a strong comedy night.' },
  { id: 'crown', name: 'Crown Premium', kind: 'premium', home: 'US', languages: ['en'], reach: 3, maxBudgetPerEp: 20e6, payRatio: 0.95,
    genres: { Drama: 1.7, Fantasy: 1.5, Crime: 1.4, War: 1.4, Western: 1.3, 'Sci-Fi': 1.2, Thriller: 1.2 }, formats: { Drama: 1.6, Limited: 1.7, Anthology: 1.4, Docuseries: 1.1, Sitcom: 0.6, Procedural: 0.3 },
    prestige: 0.95, boldness: 0.5, blurb: 'Prestige pay-cable. Pays top dollar for awards bait.' },
  { id: 'ironside', name: 'Ironside TV', kind: 'cable', home: 'US', languages: ['en'], reach: 2.2, maxBudgetPerEp: 5e6, payRatio: 0.7,
    genres: { Action: 1.6, Crime: 1.6, Thriller: 1.4, Horror: 1.3, Western: 1.4, 'Sci-Fi': 1.1 }, formats: { Drama: 1.4, Procedural: 1.2, Anthology: 1.2, Limited: 1 },
    prestige: 0.5, boldness: 0.45, blurb: 'Gritty basic cable. Crime, action and genre.' },
  { id: 'lantern', name: 'Lantern TV', kind: 'broadcast', home: 'UK', languages: ['en'], reach: 4, maxBudgetPerEp: 4e6, payRatio: 0.65,
    genres: { Crime: 1.6, Drama: 1.5, Comedy: 1.3, War: 1.3, Documentary: 1.3 }, formats: { Drama: 1.4, Limited: 1.6, Procedural: 1.2, Sitcom: 1.2, Docuseries: 1.4 },
    prestige: 0.7, boldness: 0.3, blurb: 'British public broadcaster. Short seasons, high standards.' },
  { id: 'saffron', name: 'Saffron TV', kind: 'broadcast', home: 'IN', languages: ['hi', 'ur', 'pa', 'en'], reach: 12, maxBudgetPerEp: 1.2e6, payRatio: 0.9,
    genres: { Romance: 1.7, Drama: 1.6, Family: 1.6, Musical: 1.3, Crime: 1.1 }, formats: { Soap: 1.9, Drama: 1.3, Sitcom: 1.1 },
    prestige: 0.2, boldness: 0.8, blurb: 'Huge Indian network. Long-running family dramas and romance.' },
  { id: 'hanbit', name: 'Hanbit Broadcasting', kind: 'broadcast', home: 'KR', languages: ['ko'], reach: 5, maxBudgetPerEp: 2.5e6, payRatio: 0.8,
    genres: { Romance: 1.7, Thriller: 1.5, Drama: 1.5, Comedy: 1.2, Fantasy: 1.2 }, formats: { Drama: 1.7, Limited: 1.2, Soap: 1 },
    prestige: 0.55, boldness: 0.35, blurb: 'Korean network. One great 16-episode season beats five average ones.' },
  { id: 'canalsol', name: 'Canal Sol', kind: 'broadcast', home: 'LATAM', languages: ['es', 'pt'], reach: 8, maxBudgetPerEp: 1.5e6, payRatio: 0.85,
    genres: { Romance: 1.7, Drama: 1.5, Crime: 1.4, Comedy: 1.2, Family: 1.1 }, formats: { Soap: 1.9, Drama: 1.4, Sitcom: 1 },
    prestige: 0.25, boldness: 0.7, blurb: 'Latin American network famous for telenovelas.' },
  { id: 'rivegauche', name: 'Rive Gauche TV', kind: 'cable', home: 'EU', languages: ['fr', 'de', 'it', 'es'], reach: 2, maxBudgetPerEp: 3e6, payRatio: 0.7,
    genres: { Drama: 1.6, Crime: 1.5, Thriller: 1.4, Comedy: 1.1, Romance: 1.1 }, formats: { Drama: 1.4, Limited: 1.6, Anthology: 1.2 },
    prestige: 0.8, boldness: 0.3, blurb: 'European arthouse cable. Subtitles welcome.' },
  // Streamers (owned by rival studios).
  { id: 'st-netflix', name: 'Netflix', studioId: 'netflix', kind: 'streamer', home: 'US', languages: ['en', 'es', 'ko', 'hi', 'fr', 'de', 'ja', 'pt', 'tr', 'it'], reach: 10, maxBudgetPerEp: 25e6, payRatio: 1.05,
    genres: { Thriller: 1.4, Crime: 1.4, Drama: 1.3, Comedy: 1.2, 'Sci-Fi': 1.3, Documentary: 1.3, Romance: 1.2 }, formats: { Drama: 1.5, Limited: 1.5, Docuseries: 1.4, Sitcom: 1, Anthology: 1.2, Animated: 1.1 },
    prestige: 0.6, boldness: 0.45, blurb: 'Global volume buyer. Loves bingeable thrillers and anything that travels.' },
  { id: 'st-amazon', name: 'Prime Video', studioId: 'amazon', kind: 'streamer', home: 'US', languages: ['en', 'hi', 'es', 'ja', 'de'], reach: 7, maxBudgetPerEp: 30e6, payRatio: 1,
    genres: { Fantasy: 1.6, Action: 1.5, Superhero: 1.4, Thriller: 1.3, Comedy: 1.1 }, formats: { Drama: 1.6, Limited: 1.2, Sitcom: 0.9, Animated: 1.1 },
    prestige: 0.55, boldness: 0.6, blurb: 'Deep pockets for big genre swings.' },
  { id: 'st-apple', name: 'Apple TV+', studioId: 'apple', kind: 'streamer', home: 'US', languages: ['en', 'ko', 'fr'], reach: 3, maxBudgetPerEp: 25e6, payRatio: 1.15,
    genres: { Drama: 1.5, 'Sci-Fi': 1.6, Comedy: 1.3, Thriller: 1.4, Documentary: 1.2 }, formats: { Drama: 1.6, Limited: 1.5, Sitcom: 1.2, Docuseries: 1.2 },
    prestige: 0.9, boldness: 0.4, blurb: 'Overpays for polish and stars. Small audience.' },
  { id: 'st-max', name: 'Max', studioId: 'wb', kind: 'streamer', home: 'US', languages: ['en'], reach: 5, maxBudgetPerEp: 25e6, payRatio: 1,
    genres: { Drama: 1.6, Fantasy: 1.5, Comedy: 1.3, Crime: 1.3, Horror: 1.2 }, formats: { Drama: 1.6, Limited: 1.5, Sitcom: 1.1, Docuseries: 1.1 },
    prestige: 0.85, boldness: 0.5, blurb: 'Prestige streamer with a famous back catalogue.' },
  { id: 'st-disney', name: 'Disney+', studioId: 'disney', kind: 'streamer', home: 'US', languages: ['en'], reach: 8, maxBudgetPerEp: 25e6, payRatio: 0.95,
    genres: { Family: 1.7, Animation: 1.7, Superhero: 1.6, Fantasy: 1.4, 'Sci-Fi': 1.3, Musical: 1.3 }, formats: { Animated: 1.6, Drama: 1.2, Sitcom: 1.1, Limited: 1 },
    prestige: 0.4, boldness: 0.5, blurb: 'Family and franchise. No R-rated darkness.' },
];

export const channelById = (id?: string) => CHANNELS.find((c) => c.id === id);
