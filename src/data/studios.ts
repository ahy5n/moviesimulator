// All real studio names live here (plain text only — no logos or brand imagery) so they can be renamed instantly.
import type { StudioPersonality } from '@/lib/types';

export type RivalConfig = {
  id: string; name: string; color: string; initials: string; hq: string;
  cash: number; prestige: number; streamName?: string; startSubs?: number;
  personality: StudioPersonality;
};

export const RIVAL_STUDIOS: RivalConfig[] = [
  { id: 'disney', name: 'Disney', color: '#3B6FD8', initials: 'DIS', hq: 'LA', cash: 9e9, prestige: 70, streamName: 'Disney+', startSubs: 125e6,
    personality: { slate: 12, genres: { Animation: 3, Superhero: 3, Family: 3, Fantasy: 2, 'Sci-Fi': 1.5, Musical: 1.5 }, risk: 0.3, prestige: 0.35, budgetBias: ['High', 'Tentpole', 'Tentpole'], streamingFirst: 0.15, regions: {}, aggression: 0.8 } },
  { id: 'wb', name: 'Warner Bros', color: '#2E6BB0', initials: 'WB', hq: 'LA', cash: 5e9, prestige: 68, streamName: 'Max', startSubs: 115e6,
    personality: { slate: 13, genres: { Superhero: 2, Fantasy: 2, Horror: 2, Drama: 1.5, Crime: 1.5, Action: 1.5 }, risk: 0.55, prestige: 0.5, budgetBias: ['Mid', 'High', 'Tentpole'], streamingFirst: 0.1, regions: {}, aggression: 0.7 } },
  { id: 'universal', name: 'Universal', color: '#5A5A9E', initials: 'UNI', hq: 'LA', cash: 6e9, prestige: 64, streamName: 'Peacock', startSubs: 40e6,
    personality: { slate: 15, genres: { Action: 2, Horror: 2, Animation: 2, Comedy: 1.5, Thriller: 1.5 }, risk: 0.5, prestige: 0.4, budgetBias: ['Low', 'Mid', 'High', 'Tentpole'], streamingFirst: 0.1, regions: {}, aggression: 0.7 } },
  { id: 'paramount', name: 'Paramount', color: '#1E88E5', initials: 'PAR', hq: 'LA', cash: 2.5e9, prestige: 58, streamName: 'Paramount+', startSubs: 75e6,
    personality: { slate: 10, genres: { Action: 2.5, 'Sci-Fi': 1.5, Thriller: 1.5, Comedy: 1.2, Family: 1.2 }, risk: 0.5, prestige: 0.3, budgetBias: ['Mid', 'High', 'Tentpole'], streamingFirst: 0.1, regions: {}, aggression: 0.6 } },
  { id: 'sony', name: 'Sony Pictures', color: '#B0B0B0', initials: 'SPE', hq: 'LA', cash: 3e9, prestige: 60,
    personality: { slate: 10, genres: { Superhero: 2, Animation: 2, Action: 1.5, Comedy: 1.5, Thriller: 1.2 }, risk: 0.5, prestige: 0.35, budgetBias: ['Mid', 'High'], streamingFirst: 0, regions: { JP: 1.1 }, aggression: 0.6 } },
  { id: 'lionsgate', name: 'Lionsgate', color: '#C8A04A', initials: 'LGF', hq: 'LA', cash: 1e9, prestige: 50,
    personality: { slate: 12, genres: { Action: 2, Horror: 2, Thriller: 2, Crime: 1.5 }, risk: 0.6, prestige: 0.25, budgetBias: ['Low', 'Mid', 'Mid'], streamingFirst: 0.05, regions: {}, aggression: 0.5 } },
  { id: 'a24', name: 'A24', color: '#E6E6E6', initials: 'A24', hq: 'LA', cash: 4e8, prestige: 78,
    personality: { slate: 14, genres: { Horror: 3, Drama: 3, Comedy: 1.2, Thriller: 1.2, 'Sci-Fi': 0.8 }, risk: 0.85, prestige: 0.9, budgetBias: ['Micro', 'Low', 'Low'], streamingFirst: 0, regions: {}, aggression: 0.35 } },
  { id: 'netflix', name: 'Netflix', color: '#E50914', initials: 'NFX', hq: 'LA', cash: 8e9, prestige: 62, streamName: 'Netflix', startSubs: 300e6,
    personality: { slate: 26, genres: { Action: 1.5, Thriller: 1.5, Comedy: 1.5, Romance: 1.5, Documentary: 1.5, Drama: 1.2 }, risk: 0.6, prestige: 0.45, budgetBias: ['Low', 'Mid', 'Mid', 'High'], streamingFirst: 0.92, regions: {}, aggression: 0.85 } },
  { id: 'amazon', name: 'Amazon MGM', color: '#FF9900', initials: 'AMZ', hq: 'LA', cash: 7e9, prestige: 58, streamName: 'Prime Video', startSubs: 200e6,
    personality: { slate: 12, genres: { Action: 2, Thriller: 1.5, Drama: 1.5, Fantasy: 1.2 }, risk: 0.5, prestige: 0.45, budgetBias: ['Mid', 'High', 'High'], streamingFirst: 0.55, regions: {}, aggression: 0.75 } },
  { id: 'apple', name: 'Apple Original Films', color: '#A0A0A8', initials: 'APL', hq: 'LA', cash: 6e9, prestige: 70, streamName: 'Apple TV+', startSubs: 45e6,
    personality: { slate: 7, genres: { Drama: 2.5, 'Sci-Fi': 1.5, Thriller: 1.5, Documentary: 1.2 }, risk: 0.45, prestige: 0.8, budgetBias: ['Mid', 'High'], streamingFirst: 0.6, regions: {}, aggression: 0.8 } },
  { id: 'neon', name: 'Neon', color: '#FF4FA3', initials: 'NEO', hq: 'LA', cash: 2e8, prestige: 74,
    personality: { slate: 8, genres: { Drama: 3, Thriller: 2, Horror: 1.5, Documentary: 1.5 }, risk: 0.8, prestige: 0.9, budgetBias: ['Micro', 'Low'], streamingFirst: 0, regions: { EU: 1.1, KR: 1.1 }, aggression: 0.3 } },
  { id: 'yrf', name: 'Yash Raj Films', color: '#C62828', initials: 'YRF', hq: 'Mumbai', cash: 6e8, prestige: 55,
    personality: { slate: 6, genres: { Action: 2.5, Romance: 2.5, Musical: 2, Drama: 1.5 }, risk: 0.5, prestige: 0.3, budgetBias: ['Low', 'Mid', 'Mid'], streamingFirst: 0.05, regions: { IN: 1.6, ME: 1.3, UK: 1.1 }, aggression: 0.6 } },
];

/** Streaming services that buy finished films outright. */
export const STREAMER_BUYERS = ['netflix', 'amazon', 'apple', 'disney', 'wb'];

/** Fictional co-financing partners (Hard mode). */
export const COFINANCIERS = ['Silverline Capital', 'Northstar Media Fund', 'Pacific Slate Partners', 'Gilded Frame Ventures', 'Harbourlight Entertainment'];
