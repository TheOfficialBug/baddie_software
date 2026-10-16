import { describe, expect, it } from 'vitest';

import type { EventKind, Player, TEvent } from '@/engine/types';

import { BASE_EVENT_CONFIG, KIND_LABEL } from '@/data/catalog';
import { applyImport, exportRows, kindOfName, LIST_COLUMNS, nameScore, parseEntryList, planImport } from '@/data/entryList';
import { type DB, emptyDB } from '@/data/types';

const T = 't1';

/** A tournament with the five Open events, named the way the seed names them. */
function tournament(): DB {
  const db = emptyDB();
  db.tournaments = [
    {
      id: T,
      slug: 'open',
      name: 'Test Open',
      venue: '',
      city: '',
      startDate: '2026-10-17',
      endDate: '2026-10-18',
      status: 'registration',
      rules: 'BWF_3x21',
      restMinutes: 20,
      courts: [],
      nextMatchNumber: 1,
      organizationId: 'o1',
    },
  ];
  db.events = (['MS', 'WS', 'MD', 'WD', 'XD'] as EventKind[]).map((kind): TEvent => ({
    id: `ev-${kind}`,
    tournamentId: T,
    kind,
    name: `Open ${KIND_LABEL[kind]}`,
    fee: 25,
    cap: 64,
    rules: 'BWF_3x21',
    mode: 'knockout',
    config: { ...BASE_EVENT_CONFIG },
    drawState: 'none',
  }));
  return db;
}

type Row = Partial<Record<(typeof LIST_COLUMNS)[number], string>>;
/** A sheet laid out like the tournamentsoftware.com Players export. */
const sheet = (...rows: Row[]) => [
  ['Test Open'],
  ['Players'],
  ['Badminton Tournament Planner'],
  [...LIST_COLUMNS],
  ...rows.map((r) => LIST_COLUMNS.map((c) => r[c] ?? '')),
];
const person = (first: string, last: string, gender: 'M' | 'F', events: string, info: string, extra: Row = {}): Row => ({
  Firstname: first,
  Name: last,
  Gender: gender,
  Events: events,
  'Entry Info': info,
  Level1: 'B',
  Level2: 'C',
  ...extra,
});

const names = (db: DB, eventId: string) => {
  const p = new Map(db.players.map((x) => [x.id, x.name]));
  return db.entries
    .filter((e) => e.eventId === eventId)
    .map((e) => [...e.playerIds.map((id) => p.get(id)), ...(e.pendingPartner ? [`(${e.pendingPartner.name})`] : [])].join(' / '))
    .sort();
};

const importSheet = (db: DB, rows: string[][]) => {
  const plan = planImport(
    db,
    T,
    parseEntryList(
      rows,
      db.events.map((e) => e.name),
    ),
  );
  return { plan, db: applyImport(db, T, plan) };
};

describe('name matching', () => {
  it('scores full names, short names and small typos, but not other people', () => {
    expect(nameScore('Jo Lindqvist', 'Jo Lindqvist')).toBe(2);
    expect(nameScore('Ben Okafor', 'Benjamin Okafor')).toBeGreaterThan(1.6);
    expect(nameScore('Tomas Rydberrg', 'Tomas Rydberg')).toBeGreaterThan(1.6);
    expect(nameScore('Mira Nakamura-Ost', 'Mira Nakamura Ost')).toBe(3);
    expect(nameScore('Zoe Ferris', 'Ana Ortega')).toBe(0);
    expect(nameScore('', 'Ana Ortega')).toBe(0);
  });

  it('knows events by their usual names', () => {
    expect(kindOfName("Women's Doubles")).toBe('WD');
    expect(kindOfName("Open Men's Singles")).toBe('MS');
    expect(kindOfName('Mixed Doubles')).toBe('XD');
    expect(kindOfName('XD')).toBe('XD');
    expect(kindOfName('Team event')).toBeUndefined();
  });
});

describe('reading an entry list', () => {
  it('finds the headings below the title rows and reads each player', () => {
    const list = parseEntryList(
      sheet(
        person('Ana', 'Ortega', 'F', "Women's Singles", "Women's Singles\n", { DOB: '36526', Club: 'N/A', Level1: 'a', Level2: '' }),
        person('Kiri', '-', 'M', "Men's Singles", "Men's Singles\n", { DOB: '1990', Club: 'Riverside BC' }),
      ),
    );
    expect(list.skipped).toEqual([]);
    expect(list.players).toMatchObject([
      { row: 5, name: 'Ana Ortega', gender: 'F', club: 'No club', birthYear: 2000, singlesLevel: 'A', doublesLevel: undefined },
      { row: 6, name: 'Kiri', gender: 'M', club: 'Riverside BC', birthYear: 1990 },
    ]);
  });

  it('reads partners, member numbers and withdrawals from the entry info, and adds events it leaves out', () => {
    const [p] = parseEntryList(
      sheet(
        person(
          'Jo',
          'Lin',
          'M',
          "Men's Doubles, Mixed Doubles",
          "Men's Singles [Withdrawn]\nMen's Doubles Tomas Rydberg (12345)\nMixed Doubles  ()\n",
        ),
      ),
    ).players;
    expect(p.lines).toEqual([
      { event: "Men's Singles", partner: '', withdrawn: true },
      { event: "Men's Doubles", partner: 'Tomas Rydberg', withdrawn: false },
      { event: 'Mixed Doubles', partner: '', withdrawn: false },
    ]);
    const [q] = parseEntryList(sheet(person('Ana', 'Ortega', 'F', "Women's Singles, Mixed Doubles", ''))).players;
    expect(q.lines.map((l) => l.event)).toEqual(["Women's Singles", 'Mixed Doubles']);
  });

  it('skips rows without a gender and refuses sheets without headings', () => {
    const list = parseEntryList(sheet(person('Ana', 'Ortega', 'X' as 'F', '', '')));
    expect(list.players).toEqual([]);
    expect(list.skipped).toEqual(['Row 5: Ana Ortega has no gender (M or F).']);
    expect(() => parseEntryList([['just', 'some', 'cells']])).toThrow(/column headings/);
  });
});

describe('importing an entry list', () => {
  const rows = sheet(
    person(
      'Jo',
      'Lin',
      'M',
      "Men's Singles, Men's Doubles, Mixed Doubles",
      "Men's Singles\nMen's Doubles Tom Rydberg\nMixed Doubles Ana Ortega",
    ),
    person('Tomas', 'Rydberg', 'M', "Men's Doubles", "Men's Doubles Jo Lin (99)"),
    person('Ana', 'Ortega', 'F', 'Mixed Doubles', "Women's Singles [Withdrawn]\nMixed Doubles Jo Lin"),
    // only one side names the other
    person('Benjamin', 'Okafor', 'M', 'Mixed Doubles', 'Mixed Doubles  ()'),
    person('Mira', 'Sato', 'F', 'Mixed Doubles', 'Mixed Doubles Ben Okafor'),
    // partner not on the list, and no partner at all
    person('Lea', 'Varga', 'F', "Women's Doubles", "Women's Doubles Nina Brandt (n.b)"),
    person('Ida', 'Holm', 'F', "Women's Doubles", "Women's Doubles  ()", { Level2: 'D' }),
  );

  it('pairs partners, keeps unknown partners by name and counts each event', () => {
    const { plan, db } = importSheet(tournament(), rows);
    expect(plan.blocked).toBeUndefined();
    expect(plan.newPlayers).toBe(7);
    expect(names(db, 'ev-MS')).toEqual(['Jo Lin']);
    expect(names(db, 'ev-MD')).toEqual(['Jo Lin / Tomas Rydberg']);
    expect(names(db, 'ev-XD')).toEqual(['Benjamin Okafor / Mira Sato', 'Jo Lin / Ana Ortega']);
    expect(names(db, 'ev-WD')).toEqual(['Ida Holm / (Partner to be confirmed)', 'Lea Varga / (Nina Brandt)']);
    expect(db.entries.find((e) => e.eventId === 'ev-WS')?.status).toBe('withdrawn');
    expect(
      db.entries.find((e) => e.eventId === 'ev-WD' && e.pendingPartner?.name === 'Partner to be confirmed')?.pendingPartner?.level,
    ).toBe('D');
    expect(plan.events.find((e) => e.eventId === 'ev-WD')).toMatchObject({ entries: 2, withdrawn: 0, namedPartners: 2 });
    expect(plan.warnings).toEqual([
      "Lea Varga (Open Women's Doubles): partner “Nina Brandt” isn’t a player on the list (or is already paired), so they’re kept as a named partner.",
      "Ida Holm (Open Women's Doubles): no partner given.",
    ]);
  });

  it('uses the singles level in singles and the doubles level in doubles', () => {
    const { db } = importSheet(tournament(), rows);
    const jo = db.players.find((p) => p.name === 'Jo Lin')!;
    expect(jo.level).toBe('B');
    expect(db.entries.find((e) => e.eventId === 'ev-MS')?.levels).toEqual(['B']);
    expect(db.entries.find((e) => e.eventId === 'ev-MD')?.levels).toEqual(['C', 'C']);
  });

  it('warns when someone named a different partner than the one who named them', () => {
    const { plan, db } = importSheet(
      tournament(),
      sheet(
        person('Jo', 'Lin', 'M', 'Mixed Doubles', 'Mixed Doubles Ana Ortega'),
        person('Ana', 'Ortega', 'F', 'Mixed Doubles', 'Mixed Doubles Tomas Rydberg'),
        person('Tomas', 'Rydberg', 'M', 'Mixed Doubles', 'Mixed Doubles Ana Ortega'),
      ),
    );
    expect(names(db, 'ev-XD')).toEqual(['Jo Lin / (Ana Ortega)', 'Tomas Rydberg / Ana Ortega']);
    expect(plan.warnings[0]).toMatch(/^Jo Lin .*partner “Ana Ortega”/);
  });

  it('pairs with a named player who forgot to list the event', () => {
    const { plan, db } = importSheet(
      tournament(),
      sheet(person('Jo', 'Lin', 'M', 'Mixed Doubles', 'Mixed Doubles Ana Ortega'), person('Ana', 'Ortega', 'F', "Women's Singles", '')),
    );
    expect(names(db, 'ev-XD')).toEqual(['Jo Lin / Ana Ortega']);
    expect(plan.warnings).toEqual(['Jo Lin (Open Mixed Doubles): paired with Ana Ortega, who didn’t list Open Mixed Doubles.']);
  });

  it('leaves out events the tournament does not have, and says so', () => {
    const db = tournament();
    db.events = db.events.filter((e) => e.kind !== 'WS');
    const { plan } = importSheet(db, rows);
    expect(plan.warnings[0]).toBe(
      "This tournament has no “Women's Singles” event, so 1 entry was left out. Add the event, then import again.",
    );
  });

  it('replaces the old entries and removes players who are no longer entered (but not account holders)', () => {
    const db = tournament();
    const old = (id: string, userId?: string): Player => ({
      id,
      name: id,
      gender: 'M',
      club: 'No club',
      birthYear: 1990,
      level: 'C',
      userId,
    });
    db.players = [old('p-old'), old('p-account', 'u1'), old('p-elsewhere')];
    db.entries = [
      { id: 'e1', eventId: 'ev-MS', playerIds: ['p-old'], status: 'accepted', createdAt: 0 },
      { id: 'e2', eventId: 'ev-MS', playerIds: ['p-account'], status: 'pending', createdAt: 0 },
      { id: 'e3', eventId: 'other-event', playerIds: ['p-elsewhere'], status: 'accepted', createdAt: 0 },
    ];
    db.registrations = [{ id: 'r1', tournamentId: T, playerId: 'p-old', entryIds: ['e1'], total: 25, at: 0 }];
    db.checkIns = [{ tournamentId: T, playerId: 'p-old', at: 1 }];
    const { plan, db: next } = importSheet(db, rows);
    expect(plan.removedEntries).toBe(2);
    expect(next.players.map((p) => p.id)).toEqual(expect.arrayContaining(['p-account', 'p-elsewhere']));
    expect(next.players.some((p) => p.id === 'p-old')).toBe(false);
    expect(next.entries.some((e) => e.id === 'e3')).toBe(true);
    expect(next.entries.some((e) => e.id === 'e1' || e.id === 'e2')).toBe(false);
    expect(next.registrations).toEqual([]);
    expect(next.checkIns).toEqual([]);
  });

  it('is refused once draws are made', () => {
    const db = tournament();
    db.events[0] = { ...db.events[0], drawState: 'published' };
    const { plan, db: next } = importSheet(db, rows);
    expect(plan.blocked).toMatch(/reset the draws/);
    expect(next).toBe(db);
  });
});

describe('exporting an entry list', () => {
  it('writes one row per player that imports back without changes', () => {
    const rows = sheet(
      person('Jo', 'Lin', 'M', "Men's Singles, Mixed Doubles", "Men's Singles\nMixed Doubles Ana Ortega"),
      person('Ana', 'Sta Ortega', 'F', 'Mixed Doubles', "Women's Singles [Withdrawn]\nMixed Doubles Jo Lin", { DOB: '1999' }),
      person('Ida', 'Holm', 'F', "Women's Doubles", "Women's Doubles Nina Brandt"),
    );
    const { db } = importSheet(tournament(), rows);
    const out = exportRows(db, T);
    expect(out.slice(0, 3)).toEqual([['Test Open'], ['Players'], [...LIST_COLUMNS]]);
    expect(out.slice(3).map((r) => [r[1], r[2], r[6], r[7], r[9], r[10], r[11], r[12], r[13]])).toEqual([
      ['Holm', 'Ida', 2001, 'F', 'B', 'C', 1, "Open Women's Doubles", "Open Women's Doubles Nina Brandt"],
      [
        'Lin',
        'Jo',
        2001,
        'M',
        'B',
        'C',
        2,
        "Open Men's Singles, Open Mixed Doubles",
        "Open Men's Singles\nOpen Mixed Doubles Ana Sta Ortega",
      ],
      ['Sta Ortega', 'Ana', 1999, 'F', 'B', 'C', 1, 'Open Mixed Doubles', "Open Women's Singles [Withdrawn]\nOpen Mixed Doubles Jo Lin"],
    ]);

    const again = importSheet(
      db,
      out.map((r) => r.map(String)),
    );
    expect(again.plan).toMatchObject({ newPlayers: 0, updatedPlayers: 0, removedEntries: 0 });
    expect(again.plan.warnings).toEqual([expect.stringMatching(/^Ida Holm .*“Nina Brandt”/)]);
    expect(again.db.entries.map((e) => e.id).sort()).toEqual(db.entries.map((e) => e.id).sort());
  });
});
