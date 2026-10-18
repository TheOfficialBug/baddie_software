import { describe, expect, it } from 'vitest';

import { fillFreeCourts } from '@/data/assign';
import { rulesOfMatch, setEntryLevel } from '@/data/ops';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { drawAll } from '@/data/simulate';

const NOW = Date.UTC(2026, 9, 17, 14, 0);

describe('fill free courts', () => {
  const drawn = () => {
    const db = drawAll(buildIowaOpen(NOW), IOWA_OPEN_ID, 42);
    return { ...db, tournaments: db.tournaments.map((t) => (t.id === IOWA_OPEN_ID ? { ...t, status: 'live' as const } : t)) };
  };

  it('puts a match on every free court, nobody twice, events sharing the courts', () => {
    const before = drawn();
    const t = before.tournaments.find((x) => x.id === IOWA_OPEN_ID)!;
    const { db, called } = fillFreeCourts(before, IOWA_OPEN_ID, NOW);
    expect(called).toHaveLength(t.courts.length);
    expect(new Set(called.map((c) => c.courtId)).size).toBe(t.courts.length);
    const onCourt = db.matches.filter((m) => m.status === 'on_court');
    const players = onCourt.flatMap((m) => [m.a, m.b].flatMap((e) => db.entries.find((x) => x.id === e)!.playerIds));
    expect(new Set(players).size).toBe(players.length);
    expect(new Set(onCourt.map((m) => m.eventId)).size).toBeGreaterThan(1);
    // players get the same court call notice as a manual call
    expect(db.notices.length).toBe(before.notices.length + called.length);
  });

  it('never calls a match of a withdrawn entry (the desk enters the walkover)', () => {
    const before = drawn();
    const first = fillFreeCourts(before, IOWA_OPEN_ID, NOW).called;
    const out = before.matches.find((m) => m.id === first[0].matchId)!.a;
    const withdrawn = { ...before, entries: before.entries.map((e) => (e.id === out ? { ...e, status: 'withdrawn' as const } : e)) };
    const { db, called } = fillFreeCourts(withdrawn, IOWA_OPEN_ID, NOW);
    expect(called.length).toBeGreaterThan(0);
    for (const c of called)
      expect([db.matches.find((m) => m.id === c.matchId)!.a, db.matches.find((m) => m.id === c.matchId)!.b]).not.toContain(out);
  });

  it('does nothing when every court is busy', () => {
    const once = fillFreeCourts(drawn(), IOWA_OPEN_ID, NOW).db;
    expect(fillFreeCourts(once, IOWA_OPEN_ID, NOW + 60_000).called).toEqual([]);
  });
});

describe('correcting a level given at registration', () => {
  const db = buildIowaOpen(NOW);

  it('changes the level for that event only', () => {
    const e = db.entries.find((x) => x.playerIds.length === 2 && !x.pendingPartner)!;
    const next = setEntryLevel(db, e.id, 1, 'A');
    const fixed = next.entries.find((x) => x.id === e.id)!;
    expect(fixed.levels?.[1]).toBe('A');
    expect(fixed.levels).toHaveLength(2);
    // the player's own level (used for their other events) is untouched
    expect(next.players).toBe(db.players);
    expect(next.entries.filter((x) => x.id !== e.id)).toEqual(db.entries.filter((x) => x.id !== e.id));
  });

  it("changes a named partner's level", () => {
    const solo = db.entries.find((x) => x.playerIds.length === 2)!;
    const e = { ...solo, id: 'e-solo', playerIds: solo.playerIds.slice(0, 1), pendingPartner: { name: 'Robin Vale', level: 'B' as const } };
    const next = setEntryLevel({ ...db, entries: [...db.entries, e] }, e.id, 1, 'D');
    expect(next.entries.find((x) => x.id === e.id)!.pendingPartner!.level).toBe('D');
  });
});

describe('first-match scoring on a real draw', () => {
  // Iowa Open: one game to 30 for each player's first match, then best of 3 to 21.
  // Mixed doubles is an ABCD drop flight with an odd number of pairs, so flight A has a round-1 bye.
  const db = drawAll(buildIowaOpen(NOW), IOWA_OPEN_ID, 42);
  const ms = db.events.find((e) => e.tournamentId === IOWA_OPEN_ID && e.kind === 'XD')!;
  const stages = db.stages.filter((s) => s.eventId === ms.id);
  const flightA = stages.find((s) => s.flight === 'A')!;
  const ms_ = db.matches.filter((m) => m.eventId === ms.id);
  const byId = new Map(ms_.map((m) => [m.id, m]));
  const rules = (m: (typeof ms_)[number]) => rulesOfMatch(db, m).id;
  const isBye = (id: string) => {
    const f = byId.get(id)!;
    return f.a === 'BYE' || f.b === 'BYE';
  };
  const fedByBye = (m: (typeof ms_)[number]) => [m.srcA, m.srcB].some((s) => s.kind === 'winner' && isBye(s.matchId));

  it('every played opening match in flight A uses one game to 30', () => {
    const r1 = ms_.filter((m) => m.stageId === flightA.id && m.round === 1 && m.a !== 'BYE' && m.b !== 'BYE');
    expect(r1.length).toBeGreaterThan(0);
    expect(new Set(r1.map(rules))).toEqual(new Set(['ONE_30']));
  });

  it('round 2: two bye holders play to 30, a bye holder against a round-1 winner plays full sets; later rounds are best of 3', () => {
    const r2 = ms_.filter((m) => m.stageId === flightA.id && m.round === 2);
    const bothByes = r2.filter((m) => [m.srcA, m.srcB].every((s) => s.kind === 'winner' && isBye(s.matchId)));
    const oneBye = r2.filter((m) => fedByBye(m) && !bothByes.includes(m));
    expect(oneBye.length).toBeGreaterThan(0);
    expect(new Set(oneBye.map(rules))).toEqual(new Set(['BWF_3x21']));
    expect(new Set(bothByes.map(rules))).toEqual(new Set(bothByes.length ? ['ONE_30'] : []));
    const later = ms_.filter((m) => m.stageId === flightA.id && m.round >= 3);
    expect(later.length).toBeGreaterThan(0);
    expect(new Set(later.map(rules))).toEqual(new Set(['BWF_3x21']));
  });

  it('players who drop to flights B, C and D play best of 3 to 21', () => {
    const lower = ms_.filter((m) => m.stageId !== flightA.id && m.a !== 'BYE' && m.b !== 'BYE');
    expect(lower.length).toBeGreaterThan(0);
    expect(new Set(lower.map(rules))).toEqual(new Set(['BWF_3x21']));
  });
});
