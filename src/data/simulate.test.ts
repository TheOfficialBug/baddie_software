import { describe, expect, it } from 'vitest';

import { mulberry32 } from '@/engine/rng';

import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { drawAll, matchDayStats, simulateMatches, simulateTick } from '@/data/simulate';
import type { DB } from '@/data/types';

const NOW = Date.UTC(2026, 9, 17, 14, 0);

describe('Iowa Open Test 26 seed', () => {
  const db = buildIowaOpen(NOW);

  it('holds the real 2026 field: 178 entries from 121 players, every event a drop flight', () => {
    expect(db.tournaments.map((t) => [t.name, t.status])).toEqual([['Iowa Open Test 26', 'registration']]);
    expect(db.players).toHaveLength(121);
    const count = (kind: string) => db.entries.filter((e) => e.eventId === `${IOWA_OPEN_ID}-${kind}`).length;
    expect([count('MS'), count('WS'), count('MD'), count('WD'), count('XD')]).toEqual([48, 24, 35, 21, 50]);
    expect(db.entries).toHaveLength(178);
    expect(db.events.every((e) => e.mode === 'drop_flight' && e.config.variant === 'ABCD')).toBe(true);
    expect(db.matches).toHaveLength(0);
  });

  it('has valid entries: right genders, nobody twice in an event, unpartnered doubles waiting', () => {
    const p = new Map(db.players.map((x) => [x.id, x]));
    for (const e of db.entries) {
      const kind = e.eventId.split('-').at(-1)!;
      const g = e.playerIds
        .map((id) => p.get(id)!.gender)
        .sort()
        .join('');
      if (kind === 'MS' || kind === 'WS' || e.playerIds.length === 2)
        expect(g).toBe({ MS: 'M', WS: 'F', MD: 'MM', WD: 'FF', XD: 'FM' }[kind]);
      // a doubles player without a registered partner: the partner is named, or the entry waits for one
      else expect(!!e.pendingPartner || e.status === 'pending', e.id).toBe(true);
      expect(e.levels).toHaveLength(e.playerIds.length);
    }
    for (const ev of db.events) {
      const ids = db.entries.filter((e) => e.eventId === ev.id).flatMap((e) => e.playerIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(db.entries.filter((e) => e.status === 'pending')).toHaveLength(9);
    expect(new Set(db.players.map((x) => x.name)).size).toBe(121);
  });

  it('links the demo player account and keeps the staff accounts', () => {
    expect(db.players.find((x) => x.userId === 'u-player')?.id).toBe('p-28');
    expect(db.entries.some((e) => e.playerIds.includes('p-28'))).toBe(true);
    expect(db.members.map((m) => m.role)).toEqual(['owner', 'scorer']);
  });
});

describe('simulation', () => {
  function readyToPlay(): DB {
    const db = buildIowaOpen(NOW);
    const accepted = { ...db, entries: db.entries.map((e) => ({ ...e, status: 'accepted' as const })) };
    const drawn = drawAll(accepted, IOWA_OPEN_ID, 42);
    return { ...drawn, tournaments: drawn.tournaments.map((t) => ({ ...t, status: 'live' as const })) };
  }

  it('draws every event with every accepted entry', () => {
    const db = readyToPlay();
    expect(db.events.every((e) => e.drawState === 'published')).toBe(true);
    const stats = matchDayStats(db, IOWA_OPEN_ID);
    expect(stats.total).toBeGreaterThan(150);
    expect(stats.ready).toBeGreaterThan(0);
    // seeds were given per event
    expect(db.entries.filter((e) => e.seed === 1)).toHaveLength(5);
  });

  it('a tick calls matches to free courts without double-booking anyone', () => {
    const db = readyToPlay();
    const r = simulateTick(db, IOWA_OPEN_ID, NOW, mulberry32(1));
    const onCourt = r.db.matches.filter((m) => m.status === 'on_court');
    expect(onCourt.length).toBe(8);
    const players = onCourt.flatMap((m) => [m.a, m.b].flatMap((e) => r.db.entries.find((x) => x.id === e)!.playerIds));
    expect(new Set(players).size).toBe(players.length);
    expect(r.db.notices.filter((n) => n.kind === 'call')).toHaveLength(8);
  });

  it('runs events in parallel: several events share the courts at once', () => {
    const db = readyToPlay();
    const r = simulateMatches(db, IOWA_OPEN_ID, 30, NOW, mulberry32(3));
    const onCourt = r.db.matches.filter((m) => m.status === 'on_court');
    const events = new Set(onCourt.map((m) => m.eventId));
    expect(onCourt.length).toBeGreaterThan(4);
    expect(events.size).toBeGreaterThanOrEqual(3);
    // and every event has made progress, not one after another
    const finishedEvents = new Set(r.db.matches.filter((m) => m.status === 'finished').map((m) => m.eventId));
    expect(finishedEvents.size).toBeGreaterThanOrEqual(3);
  });

  it('plays the whole tournament to the end with valid results', () => {
    const db = readyToPlay();
    const r = simulateMatches(db, IOWA_OPEN_ID, 10_000, NOW, mulberry32(7));
    const stats = matchDayStats(r.db, IOWA_OPEN_ID);
    expect(stats.finished).toBe(stats.total);
    expect(stats.onCourt + stats.ready + stats.pending).toBe(0);
    for (const m of r.db.matches.filter((x) => x.status === 'finished')) {
      expect(m.winner).toBeDefined();
      expect(m.finishedAt! - (m.startedAt ?? m.finishedAt!)).toBeLessThanOrEqual(45 * 60_000);
    }
  }, 30_000);
});
