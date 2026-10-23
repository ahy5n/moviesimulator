// Fictional awards bodies modelled loosely on real ones. Turns are within-year (0–25).

export type AwardBody = { id: string; name: string; short: string; nomTurn: number; ceremonyTurn: number; weight: number; critics: number };
export const AWARD_BODIES: AwardBody[] = [
  { id: 'lens', name: 'Golden Lens Awards', short: 'Golden Lens', nomTurn: 0, ceremonyTurn: 1, weight: 0.6, critics: 0.4 },
  { id: 'brit', name: 'British Screen Awards', short: 'BSA', nomTurn: 1, ceremonyTurn: 3, weight: 0.7, critics: 0.6 },
  { id: 'sac', name: "Screen Actors' Circle", short: 'SAC', nomTurn: 1, ceremonyTurn: 4, weight: 0.7, critics: 0.5 },
  { id: 'academy', name: 'The Academy Honours', short: 'Academy', nomTurn: 2, ceremonyTurn: 5, weight: 1, critics: 0.6 },
];

export type Festival = { id: string; name: string; turn: number; month: string; prestige: number; indie: boolean };
export const FESTIVALS: Festival[] = [
  { id: 'summit', name: 'Summit Film Festival', turn: 1, month: 'January', prestige: 0.6, indie: true },
  { id: 'riviera', name: 'Riviera Film Festival', turn: 9, month: 'May', prestige: 1, indie: false },
  { id: 'lido', name: 'Lido Film Festival', turn: 17, month: 'September', prestige: 0.9, indie: false },
];

export const CATEGORIES_STANDARD = [
  'Best Picture', 'Best Director', 'Best Actor', 'Best Actress', 'Best Supporting Actor', 'Best Supporting Actress',
  'Best Screenplay', 'Best Animated Feature', 'Best International Feature',
];
export const CATEGORIES_CREW = ['Best Score', 'Best Cinematography', 'Best Editing'];

/** Which categories each body hands out. SAC is acting only. */
export function categoriesFor(bodyId: string, fullCrew: boolean): string[] {
  if (bodyId === 'sac') return ['Best Ensemble', 'Best Actor', 'Best Actress', 'Best Supporting Actor', 'Best Supporting Actress'];
  const base = CATEGORIES_STANDARD.filter((c) => !(bodyId === 'lens' && c === 'Best International Feature'));
  return fullCrew ? [...base, ...CATEGORIES_CREW] : base;
}
