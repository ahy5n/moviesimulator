import { GENRES, LANGUAGES, type Film, type GameState, type Genre, type Language, type TVChannel } from '@/lib/types';
import { talent } from '@/lib/talentDb';

export const TV_CHANNELS: TVChannel[] = [
  { id: 'crown', name: 'Crown+', color: '#d8b35a', genres: ['Drama','Crime','Romance','Fantasy'] as Genre[], languages: ['English','French','German'] as Language[], prestige: 82, ratePerEpisode: 1_450_000 },
  { id: 'pulse', name: 'Pulse Network', color: '#fb7185', genres: ['Comedy','Romance','Family'] as Genre[], languages: ['English','Spanish','Portuguese'] as Language[], prestige: 58, ratePerEpisode: 760_000 },
  { id: 'orbit', name: 'Orbit Stream', color: '#60a5fa', genres: ['Sci-Fi','Fantasy','Animation','Action','Documentary'] as Genre[], languages: ['English','Japanese','Korean','Mandarin'] as Language[], prestige: 72, ratePerEpisode: 1_100_000 },
  { id: 'world', name: 'WorldView', color: '#4ade80', genres: [...GENRES], languages: [...LANGUAGES], prestige: 64, ratePerEpisode: 880_000 },
];

export const STREAMERS = [
  { id: 'crown-stream', name: 'Crown+', color: '#d8b35a', genres: ['Drama','Crime','Romance','Fantasy'] as Genre[], languages: ['English','French','German'] as Language[], prestige: 88, ratePerEpisode: 1_800_000 },
  { id: 'orbit-stream', name: 'Orbit Stream', color: '#60a5fa', genres: ['Sci-Fi','Fantasy','Animation','Action','Documentary'] as Genre[], languages: ['English','Japanese','Korean','Mandarin'] as Language[], prestige: 78, ratePerEpisode: 1_350_000 },
  { id: 'world-stream', name: 'WorldView Play', color: '#4ade80', genres: [...GENRES], languages: [...LANGUAGES], prestige: 68, ratePerEpisode: 980_000 },
];

export function channelOffer(s: GameState, f: Film, channel: TVChannel) {
  const genreFit = channel.genres.includes(f.primaryGenre) ? 1.12 : 0.78;
  const languageFit = channel.languages.includes(f.language ?? 'English') ? 1.12 : 0.82;
  const castFit = f.cast.length ? f.cast.reduce((sum, slot) => sum + (talent(s, slot.talentId)?.attrs.overall ?? 50), 0) / f.cast.length : 50;
  const quality = Math.round(Math.min(95, 45 + channel.prestige * 0.35 + castFit * 0.2));
  const rate = Math.round(channel.ratePerEpisode * genreFit * languageFit * (0.72 + quality / 200));
  return { quality, rate, advance: rate * (f.tv?.episodes ?? 8) };
}
