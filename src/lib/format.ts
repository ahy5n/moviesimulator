export function money(n: number, digits = 1): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(digits + 1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : digits)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${Math.round(n)}`;
}
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
