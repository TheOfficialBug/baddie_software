import { describe, expect, it } from 'vitest';

import { playedCount, resetEventDraw, resetEventResults, resetMatch, resetTournamentDraws, resetTournamentResults } from '@/data/resets';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { drawAll, simulateMatches } from '@/data/simulate';
import type { DB } from '@/data/types';

const NOW = Date.UTC(2026, 9, 17, 14, 0);
let seed = 1;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
/** Iowa Open, drawn and live, with `n` results in. */
const played = (n: number): DB => {
  const db = drawAll(buildIowaOpen(NOW), IOWA_OPEN_ID, 3);
  const live = { ...db, tournaments: db.tournaments.map((t) => (t.id === IOWA_OPEN_ID ? { ...t, status: 'live' as const } : t)) };
  return simulateMatches(live, IOWA_OPEN_ID, n, NOW, rand).db;
};
const evIds = (db: DB) => db.events.filter((e) => e.tournamentId === IOWA_OPEN_ID).map((e) => e.id);

describe('resetting one match', () => {
  it('puts a finished match back to not played and takes the winner out of the next round', () => {
    const db = played(20);
    // a finished match whose next match hasn't started
    const m = db.matches.find((x) => x.status === 'finished' && resetMatch(db, x.id).db)!;
    const winner = m[m.winner!];
    const r = resetMatch(db, m.id).db!;
    const after = r.matches.find((x) => x.id === m.id)!;
    expect(after.status).toBe('ready');
    expect(after.games).toEqual([]);
    expect(after.winner).toBeUndefined();
    const next = r.matches.filter((x) => x.srcA.kind === 'winner' && x.srcA.matchId === m.id);
    for (const x of next) expect(x.a).not.toBe(winner);
  });

  it('refuses while a later match already depends on the result', () => {
    const db = played(60);
    const blocked = db.matches.find((x) => x.status === 'finished' && resetMatch(db, x.id).error?.includes('depends'));
    expect(blocked).toBeDefined();
  });

  it('frees the court when a match on court is reset', () => {
    const db = played(5);
    const m = db.matches.find((x) => x.status === 'on_court')!;
    const after = resetMatch(db, m.id).db!.matches.find((x) => x.id === m.id)!;
    expect(after.courtId).toBeUndefined();
    expect(after.status).toBe('ready');
  });
});

describe('resetting events and tournaments', () => {
  it('clears one event, keeps its draw and the other events', () => {
    const db = played(40);
    const ev = db.events.find((e) => e.tournamentId === IOWA_OPEN_ID && playedCount(db, [e.id]) > 0)!;
    const others = evIds(db).filter((id) => id !== ev.id);
    const r = resetEventResults(db, ev.id);
    expect(playedCount(r, [ev.id])).toBe(0);
    expect(playedCount(r, others)).toBe(playedCount(db, others));
    expect(r.matches.filter((m) => m.eventId === ev.id).length).toBe(db.matches.filter((m) => m.eventId === ev.id).length);
  });

  it('removes one draw with its results', () => {
    const db = played(40);
    const ev = db.events.find((e) => e.tournamentId === IOWA_OPEN_ID)!;
    const r = resetEventDraw(db, ev.id);
    expect(r.events.find((e) => e.id === ev.id)!.drawState).toBe('none');
    expect(r.matches.some((m) => m.eventId === ev.id)).toBe(false);
  });

  it('clears every result and goes back to the draws stage', () => {
    const r = resetTournamentResults(played(40), IOWA_OPEN_ID);
    expect(playedCount(r, evIds(r))).toBe(0);
    expect(r.tournaments.find((t) => t.id === IOWA_OPEN_ID)!.status).toBe('closed');
    expect(r.events.filter((e) => e.tournamentId === IOWA_OPEN_ID).every((e) => e.drawState === 'published')).toBe(true);
  });

  it('goes back to open registration with entries kept', () => {
    const db = played(40);
    const r = resetTournamentDraws(db, IOWA_OPEN_ID);
    const t = r.tournaments.find((x) => x.id === IOWA_OPEN_ID)!;
    expect(t.status).toBe('registration');
    expect(t.nextMatchNumber).toBe(1);
    expect(r.matches.some((m) => evIds(r).includes(m.eventId))).toBe(false);
    expect(r.entries).toEqual(db.entries);
  });
});

describe('saved, unpublished draw changes', () => {
  const withDraft = (db: DB, eventId: string): DB => ({
    ...db,
    drawDrafts: [{ eventId, base: '{}', seating: {}, savedAt: NOW }],
  });

  it('are cleared when the draw is reset', () => {
    const db = played(0);
    const ev = evIds(db)[0];
    expect(resetEventDraw(withDraft(db, ev), ev).drawDrafts).toEqual([]);
    expect(resetTournamentDraws(withDraft(db, ev), IOWA_OPEN_ID).drawDrafts).toEqual([]);
  });

  it('stay when only results are cleared (the starting places are unchanged)', () => {
    const db = played(10);
    const ev = evIds(db)[0];
    expect(resetEventResults(withDraft(db, ev), ev).drawDrafts).toHaveLength(1);
  });
});
