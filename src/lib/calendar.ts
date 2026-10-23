export const START_YEAR = 2026;
export const TURNS_PER_YEAR = 26;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const yearOf = (t: number) => START_YEAR + Math.floor(t / TURNS_PER_YEAR);
export const turnInYear = (t: number) => ((t % TURNS_PER_YEAR) + TURNS_PER_YEAR) % TURNS_PER_YEAR;

/** Day-of-year (0-based) at the start of the fortnight. */
export const dayOfYear = (t: number) => turnInYear(t) * 14;

export function dateOf(t: number): Date {
  const d = new Date(Date.UTC(yearOf(t), 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOfYear(t));
  return d;
}
export const monthOf = (t: number) => dateOf(t).getUTCMonth();

export function formatDate(t: number, withYear = true): string {
  const a = dateOf(t);
  const b = new Date(a);
  b.setUTCDate(b.getUTCDate() + 13);
  const s = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  const e = a.getUTCMonth() === b.getUTCMonth() ? `${b.getUTCDate()}` : `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
  return `${s}–${e}${withYear ? `, ${a.getUTCFullYear()}` : ''}`;
}
export function formatShort(t: number): string {
  const a = dateOf(t);
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} '${String(a.getUTCFullYear()).slice(2)}`;
}
export const monthName = (m: number) => MONTHS[m];

/** Age on the given turn from an ISO birth date. */
export function ageAt(birthDate: string, t: number): number {
  const b = new Date(birthDate + 'T00:00:00Z');
  const d = dateOf(t);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export const isAwardsSeason = (t: number) => { const m = monthOf(t); return m >= 10 || m <= 2; };
