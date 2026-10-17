import { describe, expect, it } from 'vitest';

import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { importTsDraws, parseTsDrawFile, TS_DRAWS_FORMAT, type TsDrawFile } from '@/data/tsDraws';

const p = (tsId: string, name: string, club?: string) => ({ tsId, name, club });

const file: TsDrawFile = {
  format: TS_DRAWS_FORMAT,
  events: [
    {
      kind: 'MS',
      name: "Men's Singles",
      lines: [
        [p('1', 'Ari Bell', 'Ames BC')],
        'BYE',
        [p('2', 'Cy Dunn')],
        [p('3', 'Eli Fox', 'N/A')],
        [p('4', 'Gus Hart')],
        null,
        null,
        [p('5', 'Ivo Jay')],
      ],
    },
    {
      kind: 'XD',
      name: 'Mixed Doubles',
      lines: [
        [p('1', 'Ari Bell'), p('9', 'Kim Lee', 'Ames BC')],
        [p('2', 'Cy Dunn'), p('8', 'Mo Ng')],
        'BYE',
        [p('5', 'Ivo Jay'), p('7', 'Pia Qu')],
      ],
    },
  ],
};

describe('importing tournamentsoftware draws', () => {
  it('keeps every first-round line where it was drawn', () => {
    const r = importTsDraws(buildIowaOpen(), IOWA_OPEN_ID, file, 0);
    expect(r.error).toBeUndefined();
    const db = r.db!;
    const nameOf = (entryId: string | null) =>
      db.entries
        .find((e) => e.id === entryId)
        ?.playerIds.map((id) => db.players.find((x) => x.id === id)!.name)
        .join(' / ') ?? null;

    const ms = db.events.find((e) => e.tournamentId === IOWA_OPEN_ID && e.kind === 'MS')!;
    expect(ms).toMatchObject({ drawState: 'published', mode: 'drop_flight', config: { variant: 'ABCD' } });
    const main = db.stages.find((s) => s.eventId === ms.id && s.order === 0)!;
    const r1 = db.matches.filter((m) => m.stageId === main.id && m.round === 1).sort((a, b) => a.index - b.index);
    expect(r1.map((m) => [m.srcA.kind, m.srcB.kind])).toEqual([
      ['entry', 'bye'],
      ['entry', 'entry'],
      ['entry', 'bye'],
      ['bye', 'entry'],
    ]);
    expect(r1.map((m) => [nameOf(m.a), nameOf(m.b === 'BYE' ? null : m.b)])).toEqual([
      ['Ari Bell', null],
      ['Cy Dunn', 'Eli Fox'],
      ['Gus Hart', null],
      [null, 'Ivo Jay'],
    ]);
    expect(db.entries.filter((e) => e.eventId === ms.id)).toHaveLength(6 - 1);

    // mixed: man first, the same player record as in singles
    const xd = db.events.find((e) => e.tournamentId === IOWA_OPEN_ID && e.kind === 'XD')!;
    const pairs = db.entries.filter((e) => e.eventId === xd.id).map((e) => e.playerIds.map((id) => db.players.find((x) => x.id === id)!));
    expect(pairs.map((ps) => ps.map((x) => x.gender))).toEqual([
      ['M', 'F'],
      ['M', 'F'],
      ['M', 'F'],
    ]);
    const ari = db.players.filter((x) => x.name === 'Ari Bell');
    expect(ari).toHaveLength(1);
    expect(ari[0].club).toBe('Ames BC');
    expect(db.players.find((x) => x.name === 'Eli Fox')!.club).toBe('No club');
    expect(r.newPlayers).toBe(8);
  });

  it('refuses once matches have been played', () => {
    const first = importTsDraws(buildIowaOpen(), IOWA_OPEN_ID, file, 0).db!;
    const played = { ...first, matches: first.matches.map((m, i) => (i === 0 ? { ...m, status: 'finished' as const } : m)) };
    expect(importTsDraws(played, IOWA_OPEN_ID, file).error).toMatch(/already been played/);
  });

  it('rejects files that are not draws', () => {
    expect(() => parseTsDrawFile('{"format":"x"}')).toThrow(/not a tournamentsoftware draws file/);
    expect(() =>
      parseTsDrawFile(JSON.stringify({ format: TS_DRAWS_FORMAT, events: [{ kind: 'MS', name: 'MS', lines: ['BYE', 'BYE', 'BYE'] }] })),
    ).toThrow(/2, 4, 8, 16/);
  });
});
