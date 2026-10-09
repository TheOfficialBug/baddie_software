import { describe, expect, it } from 'vitest';

import { fillFreeCourts } from '@/data/assign';
import { setEntryLevel } from '@/data/ops';
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
