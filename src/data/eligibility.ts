import type { Player, TEvent, Tournament } from '@/engine/types';

/** Age reached in the tournament's calendar year (GCR 8). */
export const ageInYear = (p: Player, isoDate: string) => Number(isoDate.slice(0, 4)) - p.birthYear;

export function eligibility(ev: TEvent, t: Tournament, p: Player): string | null {
  const needs: Record<TEvent['kind'], 'M' | 'F' | 'X'> = { MS: 'M', MD: 'M', WS: 'F', WD: 'F', XD: 'X' };
  const n = needs[ev.kind];
  if (n === 'M' && p.gender !== 'M') return 'Men only';
  if (n === 'F' && p.gender !== 'F') return 'Women only';
  const age = ageInYear(p, t.startDate);
  if (ev.maxAge && age >= ev.maxAge) return `Under ${ev.maxAge} only (you turn ${age} in ${t.startDate.slice(0, 4)})`;
  if (ev.minAge && age < ev.minAge) return `${ev.minAge}+ only`;
  return null;
}

export const isDoubles = (k: TEvent['kind']) => k === 'MD' || k === 'WD' || k === 'XD';
