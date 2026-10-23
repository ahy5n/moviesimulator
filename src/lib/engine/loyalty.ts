// Talent loyalty. People remember the studio they worked with, and separately remember you, the producer.
// Producer loyalty follows you when you move to a new studio.
import { override } from '../talentDb';
import type { GameState, Talent } from '../types';

export const LOYALTY = {
  film: 1,            // made a film together
  nomination: 1,      // you got them nominated
  win: 2,             // you got them a win
  ensembleNom: 0.5,   // cast of a Best Picture / Ensemble nominee
  ensembleWin: 1,     // cast of a Best Picture / Ensemble winner
};

/** Credit loyalty to a studio, and to the player as producer when it is the player's studio. */
export function addLoyalty(s: GameState, talentId: string, studioId: string, points: number) {
  if (!talentId || points <= 0) return;
  const ov = override(s, talentId);
  ov.loyalty = { ...(ov.loyalty ?? {}), [studioId]: (ov.loyalty?.[studioId] ?? 0) + points };
  if (studioId === s.studio.id) ov.producer = (ov.producer ?? 0) + points;
}

export type LoyaltyInfo = { studio: number; producer: number; total: number };

/** How loyal someone is to a studio. For the player, the stronger of studio and producer loyalty counts. */
export function loyaltyTo(s: GameState, talentId: string, studioId: string): LoyaltyInfo {
  const ov = s.talentOverrides[talentId];
  const studio = ov?.loyalty?.[studioId] ?? 0;
  const producer = studioId === s.studio.id ? ov?.producer ?? 0 : 0;
  return { studio, producer, total: Math.max(studio, producer) };
}

/** Fee discount from loyalty. The Loyal trait makes it much bigger. */
export const loyaltyDiscount = (t: Talent, points: number) =>
  t.traits.includes('Loyal') ? Math.min(0.35, points * 0.07) : Math.min(0.15, points * 0.025);

/** Extra willingness to say yes in negotiations. */
export const loyaltyAppeal = (points: number) => Math.min(0.12, points * 0.02);

/** Loyal enough to skip a bidding war and talk to you first. */
export const SKIP_WAR_AT = 4;
/** Loyal enough that a Picky star will consider a non-prestige script. */
export const PICKY_BYPASS_AT = 3;

export function loyaltyLabel(points: number): string {
  if (points >= 6) return 'Devoted';
  if (points >= 4) return 'Very loyal';
  if (points >= 2) return 'Loyal';
  if (points > 0) return 'Friendly';
  return 'No history';
}
