import { describe, expect, it } from 'vitest';

import type { EventKind } from '@/engine/types';

import { saveResult } from '@/data/ops';
import { drawPlaces, heldEntries, movedEntries, movesByes, rearrangeDraw, type Seating, seatingOf } from '@/data/placements';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { drawAll } from '@/data/simulate';
import type { DB } from '@/data/types';

const NOW = Date.UTC(2026, 9, 17, 14, 0);
const drawn = () => drawAll(buildIowaOpen(NOW), IOWA_OPEN_ID, 7);
const eventOf = (db: DB, kind: EventKind) => db.events.find((e) => e.tournamentId === IOWA_OPEN_ID && e.kind === kind)!;

/** Swap the entries in two places of a seating. */
const swap = (s: Seating, k1: string, k2: string): Seating => ({ ...s, [k1]: s[k2], [k2]: s[k1] });

describe('starting places', () => {
  it('lists the first-round lines of a knockout, byes fixed', () => {
    const db = drawn();
    const md = eventOf(db, 'MD');
    const p = drawPlaces(db, md.id);
    const entries = db.entries.filter((e) => e.eventId === md.id && e.status === 'accepted');
    const seating = seatingOf(p);
    expect(Object.values(seating).filter(Boolean)).toHaveLength(entries.length);
    // before any play, bye places are editable too (empty)
    expect(p.byesMovable).toBe(true);
    expect(Object.values(seating).filter((e) => e === null).length).toBe(
      p.boxes.flatMap((b) => b.places).filter((x) => x.entryId === 'BYE').length,
    );
    expect(p.boxes.every((b) => b.kind === 'line' && b.places.length === 2)).toBe(true);
    expect(p.locked.size).toBe(0);
  });

  it('lists the group seats of a round robin', () => {
    const db = drawn();
    const ws = eventOf(db, 'WS');
    const p = drawPlaces(db, ws.id);
    expect(p.boxes.some((b) => b.kind === 'group')).toBe(true);
    expect(p.boxes.filter((b) => b.kind === 'group').flatMap((b) => b.places)).toHaveLength(
      db.groups.filter((g) => g.eventId === ws.id).flatMap((g) => g.entryIds).length,
    );
  });
});

describe('rearranging a published draw', () => {
  it('swaps two players between first-round lines, keeping every match and number', () => {
    const db = drawn();
    const md = eventOf(db, 'MD');
    const p = drawPlaces(db, md.id);
    const [l1, l2] = p.boxes.filter((b) => b.places.every((x) => x.entryId !== 'BYE'));
    const seating = seatingOf(p);
    const k1 = l1.places[0].key;
    const k2 = l2.places[1].key;
    const r = rearrangeDraw(db, md.id, swap(seating, k1, k2));
    expect(r.error).toBeUndefined();
    const before = db.matches.filter((m) => m.eventId === md.id);
    const after = r.db!.matches.filter((m) => m.eventId === md.id);
    expect(after.map((m) => [m.id, m.number])).toEqual(before.map((m) => [m.id, m.number]));
    expect(after.find((m) => m.id === l1.id)!.a).toBe(seating[k2]);
    expect(after.find((m) => m.id === l2.id)!.b).toBe(seating[k1]);
  });

  it('moving a player off a bye sends the new occupant through instead', () => {
    const db = drawn();
    const ms = eventOf(db, 'MS');
    const p = drawPlaces(db, ms.id);
    const byeLine = p.boxes.find((b) => b.places.some((x) => x.entryId === 'BYE'))!;
    const real = p.boxes.find((b) => b.title !== 'Bye' && b.places.every((x) => x.entryId !== 'BYE'))!;
    const kBye = byeLine.places.find((x) => x.entryId !== 'BYE')!.key;
    const kReal = real.places[0].key;
    const seating = seatingOf(p);
    const r = rearrangeDraw(db, ms.id, swap(seating, kBye, kReal));
    const next = r.db!.matches.find((m) => m.id === byeLine.id)!;
    expect(next.status).toBe('bye');
    expect(next[next.winner!]).toBe(seating[kReal]);
    // the bye winner shows up in the next round
    const r2 = r.db!.matches.filter((m) => m.eventId === ms.id && m.round === 2);
    expect(r2.some((m) => m.a === seating[kReal] || m.b === seating[kReal])).toBe(true);
    expect(r2.some((m) => m.a === seating[kBye] || m.b === seating[kBye])).toBe(false);
  });

  it('moves a player to another group with all their group matches', () => {
    const db = drawn();
    const ws = eventOf(db, 'WS');
    const p = drawPlaces(db, ws.id);
    const [g1, g2] = p.boxes.filter((b) => b.kind === 'group');
    const seating = seatingOf(p);
    const k1 = g1.places[0].key;
    const k2 = g2.places[0].key;
    const r = rearrangeDraw(db, ws.id, swap(seating, k1, k2));
    const groups = r.db!.groups.filter((g) => g.eventId === ws.id);
    expect(groups.find((g) => g.id === g1.id)!.entryIds).toContain(seating[k2]);
    expect(groups.find((g) => g.id === g2.id)!.entryIds).toContain(seating[k1]);
    // every group match is between members of its group
    for (const m of r.db!.matches.filter((x) => x.groupId)) {
      const members = groups.find((g) => g.id === m.groupId)?.entryIds;
      if (!members) continue;
      expect(members).toContain(m.a);
      expect(members).toContain(m.b);
    }
  });

  it('keeps players who have played where they are', () => {
    let db = drawn();
    const md = eventOf(db, 'MD');
    const m = db.matches.find((x) => x.eventId === md.id && x.status === 'ready')!;
    // opening round is one game to 30
    db = saveResult(db, m.id, { games: [[30, 12]], result: 'normal' }, NOW).db!;
    const p = drawPlaces(db, md.id);
    expect(p.locked.has(m.a as string)).toBe(true);
    const seating = seatingOf(p);
    const k1 = `${m.id}:a`;
    const k2 = Object.keys(seating).find((k) => !k.startsWith(m.id))!;
    expect(rearrangeDraw(db, md.id, swap(seating, k1, k2)).error).toMatch(/already played/);
  });

  it('refuses while someone is still in the holding area', () => {
    const db = drawn();
    const md = eventOf(db, 'MD');
    const seating = seatingOf(drawPlaces(db, md.id));
    const k = Object.keys(seating)[0];
    const draft = { ...seating, [k]: null };
    expect(heldEntries(seating, draft)).toEqual([seating[k]]);
    expect(rearrangeDraw(db, md.id, draft).error).toMatch(/holding area/);
  });

  it('reports who moved where', () => {
    const seating: Seating = { 'm1:a': 'e1', 'm1:b': 'e2', 'm2:a': 'e3' };
    expect(movedEntries(seating, swap(seating, 'm1:a', 'm2:a'))).toEqual([
      { entryId: 'e1', from: 'm1:a', to: 'm2:a' },
      { entryId: 'e3', from: 'm2:a', to: 'm1:a' },
    ]);
  });
});

describe('filling a bye before play starts', () => {
  /** Take the first player of a real first-round line and put them against a bye-holder. */
  const fillBye = (db: DB, kind: EventKind) => {
    const ev = eventOf(db, kind);
    const p = drawPlaces(db, ev.id);
    const seating = seatingOf(p);
    const real = p.boxes.find((b) => b.places.every((x) => x.entryId !== 'BYE'))!;
    const byeLine = p.boxes.find((b) => b.places.some((x) => x.entryId === 'BYE') && b.places.some((x) => x.entryId !== 'BYE'))!;
    const from = real.places[0].key;
    const into = byeLine.places.find((x) => x.entryId === 'BYE')!.key;
    const holder = byeLine.places.find((x) => x.entryId !== 'BYE')!.entryId;
    const mover = seating[from]!;
    const draft = { ...seating, [from]: null, [into]: mover };
    return { ev, real, byeLine, mover, holder, draft, original: seating };
  };
  const numbersOf = (db: DB) => db.matches.filter((m) => m.number > 0).map((m) => m.number);

  it.each(['MD', 'MS'] as const)('%s: the bye becomes a real match and the emptied place becomes a bye', (kind) => {
    const db = drawn();
    const { ev, real, byeLine, mover, holder, draft, original } = fillBye(db, kind);
    expect(movesByes(original, draft)).toBe(true);
    const r = rearrangeDraw(db, ev.id, draft);
    expect(r.error).toBeUndefined();
    const after = r.db!;
    const line = after.matches.find((m) => m.id === byeLine.id)!;
    expect([line.a, line.b].sort()).toEqual([holder, mover].sort());
    expect(line.status).toBe('ready');
    expect(line.number).toBeGreaterThan(0);
    const emptied = after.matches.find((m) => m.id === real.id)!;
    expect(emptied.status).toBe('bye');
    // every match number in the tournament is still unique, and this event stays inside its range
    const nums = numbersOf(after);
    expect(new Set(nums).size).toBe(nums.length);
    const before = db.matches.filter((m) => m.eventId === ev.id && m.number > 0).map((m) => m.number);
    const evNums = after.matches.filter((m) => m.eventId === ev.id && m.number > 0).map((m) => m.number);
    expect(Math.min(...evNums)).toBeGreaterThanOrEqual(Math.min(...before));
    expect(Math.max(...evNums)).toBeLessThanOrEqual(Math.max(...before));
  });

  it('drop flight: lower flights are rebuilt from the new real matches', () => {
    const db = drawn();
    const { ev, draft } = fillBye(db, 'MS');
    const after = rearrangeDraw(db, ev.id, draft).db!;
    const ms = after.matches.filter((m) => m.eventId === ev.id);
    const byId = new Map(ms.map((m) => [m.id, m]));
    for (const m of ms)
      for (const src of [m.srcA, m.srcB])
        if (src.kind === 'loser') {
          const feeder = byId.get(src.matchId)!;
          // nobody drops from a bye
          expect(feeder.srcA.kind !== 'bye' && feeder.srcB.kind !== 'bye').toBe(true);
        }
  });

  it("can't move byes once a match in the event has been played", () => {
    let db = drawn();
    const md = eventOf(db, 'MD');
    const m = db.matches.find((x) => x.eventId === md.id && x.status === 'ready')!;
    db = saveResult(db, m.id, { games: [[30, 12]], result: 'normal' }, NOW).db!;
    const p = drawPlaces(db, md.id);
    expect(p.byesMovable).toBe(false);
    expect(Object.values(seatingOf(p)).every(Boolean)).toBe(true);
  });
});
