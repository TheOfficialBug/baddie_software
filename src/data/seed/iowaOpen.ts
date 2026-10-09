// Starting data: "Iowa Open Test 26", modelled on the real Iowa Open 2026 (Badminton Club at Iowa
// State, Ames, Oct 17–18): the same five Open events, entry counts (42 MS, 25 WS, 16 MD pairs,
// 11 WD pairs, 26 XD pairs = 120 entries, 114 players), club mix and registration window.
// Player names are invented — the real entrants' names are not copied into the app.
import { DEMO_ACCOUNTS, DEMO_ORG } from '@/config/demo';
import { mulberry32, shuffle } from '@/engine/rng';
import type { Entry, EventKind, ID, Mode, Player, SkillLevel, TEvent, Tournament } from '@/engine/types';

import { BASE_EVENT_CONFIG, KIND_LABEL } from '@/data/catalog';
import { type DB, emptyDB } from '@/data/types';

export const IOWA_OPEN_ID = 't-iowa-26';

const MEN = [
  'Aarav',
  'Adrian',
  'Ahmed',
  'Akira',
  'Alejandro',
  'Amir',
  'Andre',
  'Arjun',
  'Ben',
  'Bilal',
  'Caleb',
  'Carlos',
  'Chen',
  'Daniel',
  'Dev',
  'Diego',
  'Eli',
  'Ethan',
  'Farhan',
  'Felix',
  'Gabe',
  'Hao',
  'Hiro',
  'Ibrahim',
  'Isaac',
  'Ishaan',
  'Jae',
  'Jonah',
  'Jun',
  'Kai',
  'Karan',
  'Kenji',
  'Leo',
  'Liam',
  'Lucas',
  'Malik',
  'Marco',
  'Mateo',
  'Minh',
  'Nathan',
  'Nikhil',
  'Niko',
  'Noah',
  'Omar',
  'Owen',
  'Pablo',
  'Pranav',
  'Quinn',
  'Rafael',
  'Ravi',
  'Rohan',
  'Ryo',
  'Sami',
  'Santiago',
  'Sven',
  'Tariq',
  'Theo',
  'Tomas',
  'Uday',
  'Victor',
  'Wei',
  'Xavier',
  'Yusuf',
  'Zane',
  'Arnav',
  'Hamza',
  'Joel',
  'Kwame',
  'Luis',
  'Vikram',
];
const WOMEN = [
  'Aisha',
  'Alana',
  'Amara',
  'Ana',
  'Bella',
  'Camila',
  'Chloe',
  'Dana',
  'Diya',
  'Elena',
  'Emma',
  'Fatima',
  'Grace',
  'Hana',
  'Ines',
  'Isla',
  'Jia',
  'Julia',
  'Kavya',
  'Keiko',
  'Lena',
  'Leah',
  'Lina',
  'Lucia',
  'Maya',
  'Meera',
  'Mei',
  'Mia',
  'Nadia',
  'Naomi',
  'Nina',
  'Nora',
  'Olivia',
  'Priya',
  'Rina',
  'Rosa',
  'Sana',
  'Sara',
  'Sofia',
  'Tara',
  'Uma',
  'Vera',
  'Wen',
  'Yara',
  'Yuki',
  'Zara',
  'Anika',
  'Ivy',
  'Lila',
  'Noor',
  'Riya',
  'Talia',
];
const LAST = [
  'Abbott',
  'Agarwal',
  'Alvarez',
  'Bauer',
  'Bhatt',
  'Brooks',
  'Castillo',
  'Chandra',
  'Cho',
  'Costa',
  'Dahl',
  'Das',
  'Dorsey',
  'Ekström',
  'Ellis',
  'Farah',
  'Fischer',
  'Gill',
  'Gomez',
  'Gupta',
  'Hale',
  'Hansen',
  'Hayes',
  'Holm',
  'Hughes',
  'Ito',
  'Iyer',
  'Jensen',
  'Joshi',
  'Kang',
  'Kaur',
  'Keller',
  'Khan',
  'Kim',
  'Koh',
  'Kumar',
  'Larsen',
  'Le',
  'Lim',
  'Lindqvist',
  'Lopez',
  'Lund',
  'Mehta',
  'Mendes',
  'Moreno',
  'Mori',
  'Nair',
  'Nguyen',
  'Novak',
  'Ortiz',
  'Park',
  'Patel',
  'Pham',
  'Quist',
  'Rao',
  'Reyes',
  'Rossi',
  'Saito',
  'Santos',
  'Sato',
  'Shah',
  'Silva',
  'Singh',
  'Soto',
  'Sun',
  'Tan',
  'Tanaka',
  'Tran',
  'Varga',
  'Vega',
  'Wang',
  'Weber',
  'Wu',
  'Yamada',
  'Yang',
  'Young',
  'Zhang',
  'Zhou',
];

/** Club codes as listed by the real entry list, with the same spread (most players list no club). */
const CLUB_SPREAD: [string, number][] = [
  ['ISUBC', 10],
  ['MCBC', 7],
  ['ISU', 5],
  ['UMN', 4],
  ['UIBC', 3],
  ['BBC', 2],
  ['ICM', 1],
  ['MN', 1],
  ['UNL', 1],
  ['HMNBC', 1],
];
export const IOWA_CLUBS = CLUB_SPREAD.map(([c]) => c);

const PLAN: { kind: EventKind; mode: Mode; entries: number; fee: number; cfg?: Partial<TEvent['config']> }[] = [
  { kind: 'MS', mode: 'drop_flight', entries: 42, fee: 30, cfg: { variant: 'ABCD' } },
  { kind: 'WS', mode: 'round_robin', entries: 25, fee: 30, cfg: { groupSize: 4, advance: 2 } },
  { kind: 'MD', mode: 'knockout', entries: 16, fee: 25 },
  { kind: 'WD', mode: 'round_robin', entries: 11, fee: 25, cfg: { groupSize: 4, advance: 2 } },
  { kind: 'XD', mode: 'drop_flight', entries: 26, fee: 25, cfg: { variant: 'AB' } },
];

const level = (r: number): SkillLevel => (r < 0.15 ? 'A' : r < 0.45 ? 'B' : r < 0.8 ? 'C' : 'D');

/** Iowa Open Test 26 with registration open: 114 players, 120 entries, no draws yet. */
export function buildIowaOpen(now = Date.now()): DB {
  const rand = mulberry32(20261017);
  const db = emptyDB();

  // ---------- players: 64 men, 50 women, unique invented names ----------
  const clubs = shuffle(
    CLUB_SPREAD.flatMap(([c, n]) => Array.from({ length: n }, () => c)).concat(Array.from({ length: 114 - 35 }, () => 'No club')),
    rand,
  );
  const lastNames = shuffle(LAST, rand);
  const mk = (first: string, i: number, gender: 'M' | 'F', k: number): Player => {
    const r = rand();
    return {
      id: `p-${gender}${i + 1}`,
      name: `${first} ${lastNames[(k * 7 + i) % lastNames.length]}`,
      gender,
      club: clubs[k],
      birthYear: 2008 - Math.floor(rand() * 40),
      level: level(r),
      strength: Math.round((9.5 - r * 7 + (rand() - 0.5) * 1.5) * 10) / 10,
    };
  };
  const men = shuffle(MEN, rand)
    .slice(0, 64)
    .map((n, i) => mk(n, i, 'M', i));
  const women = shuffle(WOMEN, rand)
    .slice(0, 50)
    .map((n, i) => mk(n, i, 'F', 64 + i));
  db.players = [...men, ...women];

  // ---------- tournament ----------
  const t: Tournament = {
    id: IOWA_OPEN_ID,
    slug: 'iowa-open-test-26',
    name: 'Iowa Open Test 26',
    venue: 'Forker Building, 534 Wallace Rd',
    city: 'Ames, IA',
    startDate: '2026-10-17',
    endDate: '2026-10-18',
    status: 'registration',
    regCloses: '2026-10-10',
    rules: 'BWF_3x21',
    firstRound: 'ONE_30',
    restMinutes: 20,
    courts: Array.from({ length: 8 }, (_, i) => ({ id: `${IOWA_OPEN_ID}-c${i + 1}`, name: `Court ${i + 1}` })),
    nextMatchNumber: 1,
    organizationId: DEMO_ORG.id,
    about:
      'Test run modelled on the Iowa Open 2026: Open singles, doubles and mixed over two days. First round is one game to 30; after that, best of three to 21.',
  };
  db.tournaments = [t];

  // ---------- events and entries ----------
  const opens = Date.parse('2026-09-14T05:00:00Z');
  const closes = Math.min(now, Date.parse('2026-10-10T04:59:00Z'));
  const enteredAt = () => opens + Math.floor(rand() * Math.max(1, closes - opens));
  const pick = (pool: Player[], n: number, avoid = new Set<ID>()) =>
    shuffle(pool, rand)
      .filter((p) => !avoid.has(p.id))
      .slice(0, n);
  // the demo player account (Chen…) enters men's singles and mixed doubles
  const demoPlayer = DEMO_ACCOUNTS.find((a) => a.playerId)?.playerId;
  const first = (xs: Player[]) => {
    const d = db.players.find((p) => p.id === demoPlayer);
    return d ? [d, ...xs.filter((p) => p.id !== d.id)] : xs;
  };

  for (const plan of PLAN) {
    const ev: TEvent = {
      id: `${IOWA_OPEN_ID}-${plan.kind}`,
      tournamentId: t.id,
      kind: plan.kind,
      name: `Open ${KIND_LABEL[plan.kind]}`,
      fee: plan.fee,
      cap: 64,
      rules: t.rules,
      mode: plan.mode,
      config: { ...BASE_EVENT_CONFIG, firstRound: t.firstRound, pairing: 'balanced', ...plan.cfg },
      drawState: 'none',
    };
    db.events.push(ev);

    const groups: ID[][] = [];
    if (plan.kind === 'MS')
      first(pick(men, plan.entries))
        .slice(0, plan.entries)
        .forEach((p) => groups.push([p.id]));
    if (plan.kind === 'WS') pick(women, plan.entries).forEach((p) => groups.push([p.id]));
    if (plan.kind === 'MD' || plan.kind === 'WD') {
      const ps = pick(plan.kind === 'MD' ? men : women, plan.entries * 2);
      for (let i = 0; i < plan.entries; i++) groups.push([ps[2 * i].id, ps[2 * i + 1].id]);
    }
    if (plan.kind === 'XD') {
      const m = first(pick(men, plan.entries));
      const f = pick(women, plan.entries);
      for (let i = 0; i < plan.entries; i++) groups.push([m[i].id, f[i].id]);
    }
    const entries: Entry[] = groups.map((playerIds, i) => ({
      id: `${ev.id}-e${i + 1}`,
      eventId: ev.id,
      playerIds,
      // a few late entries are still waiting for the organizer to confirm
      status: i >= groups.length - (plan.kind === 'MS' ? 3 : plan.kind === 'XD' ? 2 : 1) ? 'pending' : 'accepted',
      createdAt: enteredAt(),
    }));
    db.entries.push(...entries);
  }

  // ---------- organization, staff and demo accounts ----------
  const linked = new Map(DEMO_ACCOUNTS.filter((a) => a.playerId).map((a) => [a.playerId!, a]));
  return {
    ...db,
    organizations: [{ ...DEMO_ORG }],
    profiles: DEMO_ACCOUNTS.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.playerId ? (db.players.find((p) => p.id === a.playerId)?.name ?? a.name) : a.name,
    })),
    members: DEMO_ACCOUNTS.filter((a) => a.role).map((a) => ({ orgId: DEMO_ORG.id, userId: a.id, role: a.role! })),
    players: db.players.map((p) => (linked.has(p.id) ? { ...p, userId: linked.get(p.id)!.id, email: linked.get(p.id)!.email } : p)),
  };
}
