// Test fixture: three fictional tournaments (live today, registration open, completed), built with the
// real draw engine and progressed with simulated results. Tests use it for a realistic mid-tournament state;
// the app itself starts from data/seed/iowaOpen.ts.
import { DEMO_ACCOUNTS, DEMO_ORG } from '@/config/demo';
import { bwfSeedCount, generateDraw } from '@/engine/draws';
import { LEVEL_VALUE } from '@/engine/pairing';
import { mulberry32, shuffle } from '@/engine/rng';
import { defaultRulesForDate } from '@/engine/rules';
import type { Entry, EventConfig, EventKind, GameScore, ID, Mode, Player, TEvent, Tournament } from '@/engine/types';

import { addDaysISO, todayISO } from '@/lib/format';

import { KIND_LABEL } from '@/data/catalog';
import { callToCourt, publishPlan, resolveTournament, rulesOfMatch } from '@/data/ops';
import { simulateResult } from '@/data/simulate';
import { type DB, emptyDB } from '@/data/types';

const MEN = [
  'Aarav',
  'Ben',
  'Chen',
  'Daniel',
  'Eli',
  'Farhan',
  'Gabe',
  'Hiro',
  'Ishaan',
  'Jonah',
  'Kai',
  'Liam',
  'Marco',
  'Nikhil',
  'Owen',
  'Pranav',
  'Quinn',
  'Rohan',
  'Sami',
  'Theo',
  'Uday',
  'Victor',
  'Wei',
  'Xavier',
  'Yusuf',
  'Zane',
  'Arjun',
  'Felix',
  'Jae',
  'Mateo',
  'Leo',
  'Ravi',
  'Tomas',
  'Kenji',
  'Dev',
  'Omar',
  'Niko',
  'Sven',
  'Aditya',
  'Lucas',
];
const WOMEN = [
  'Aisha',
  'Bella',
  'Chloe',
  'Diya',
  'Emma',
  'Fatima',
  'Grace',
  'Hana',
  'Isla',
  'Jia',
  'Kavya',
  'Lena',
  'Maya',
  'Nora',
  'Olivia',
  'Priya',
  'Rina',
  'Sofia',
  'Tara',
  'Uma',
  'Vera',
  'Wen',
  'Yuki',
  'Zara',
  'Mei',
  'Ana',
  'Leah',
  'Nina',
  'Sana',
  'Ingrid',
  'Meera',
  'Lucia',
];
const LAST = [
  'Rao',
  'Brooks',
  'Lin',
  'Okafor',
  'Nguyen',
  'Patel',
  'Kim',
  'Haddad',
  'Silva',
  'Tanaka',
  'Fischer',
  'Mehta',
  'Reyes',
  'Larsen',
  'Cho',
  'Iyer',
  'Novak',
  'Ortiz',
  'Shah',
  'Wong',
  'Bauer',
  'Kapoor',
  'Diaz',
  'Sato',
  'Hughes',
  'Park',
  'Ahmed',
  'Rossi',
  'Chandra',
  'Lund',
  'Gupta',
  'Moreno',
  'Yamada',
  'Ali',
  'Becker',
  'Das',
  'Holm',
  'Varga',
  'Mendes',
  'Quist',
];
export const CLUBS = [
  'Ames Shuttle Club',
  'Cedar Valley BC',
  'Des Moines Smash',
  'Iowa City Feathers',
  'Quad Cities BC',
  'Prairie Juniors',
];

const baseConfig: EventConfig = { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: false, plate: false, seeds: 0 };

export function buildSampleData(now = Date.now()): DB {
  const rand = mulberry32(20261008);
  let db = emptyDB();
  const today = todayISO();
  const year = Number(today.slice(0, 4));

  // ---------- players ----------
  const men = shuffle(MEN, rand);
  const women = shuffle(WOMEN, rand);
  const last = shuffle(LAST, rand);
  const mkPlayer = (first: string, i: number, gender: 'M' | 'F', junior = false): Player => {
    const strength = Math.round((2 + rand() * 8) * 10) / 10;
    return {
      id: `p-${gender}${junior ? 'j' : ''}${i}`,
      name: `${first} ${last[(i * 7 + (gender === 'F' ? 3 : 0) + (junior ? 11 : 0)) % last.length]}`,
      gender,
      club: junior ? CLUBS[Math.floor(rand() * 6)] : CLUBS[Math.floor(rand() * 5)],
      birthYear: junior ? 2011 + Math.floor(rand() * 4) : year - 19 - Math.floor(rand() * 30),
      level: strength > 7.5 ? 'A' : strength > 5.5 ? 'B' : strength > 3.5 ? 'C' : 'D',
      strength,
    };
  };
  const M = men.slice(0, 32).map((n, i) => mkPlayer(n, i, 'M'));
  const F = women.slice(0, 22).map((n, i) => mkPlayer(n, i, 'F'));
  const JM = men
    .slice(32)
    .concat(men.slice(0, 6))
    .map((n, i) => mkPlayer(n, i, 'M', true));
  const JF = women
    .slice(22)
    .concat(women.slice(0, 4))
    .map((n, i) => mkPlayer(n, i, 'F', true));
  db.players = [...M, ...F, ...JM, ...JF];
  const strength = new Map(db.players.map((p) => [p.id, p.strength ?? 5]));

  // ---------- helpers ----------
  const mkTournament = (t: Omit<Tournament, 'courts' | 'nextMatchNumber' | 'organizationId'> & { courts: number }): Tournament => ({
    ...t,
    courts: Array.from({ length: t.courts }, (_, i) => ({ id: `${t.id}-c${i + 1}`, name: `Court ${i + 1}` })),
    nextMatchNumber: 1,
    organizationId: DEMO_ORG.id,
  });
  const mkEvent = (t: Tournament, kind: EventKind, mode: Mode, cfg: Partial<EventConfig> = {}, extra: Partial<TEvent> = {}): TEvent => {
    const ev: TEvent = {
      id: `${t.id}-${kind}${extra.maxAge ? `u${extra.maxAge}` : ''}`,
      tournamentId: t.id,
      kind,
      name: KIND_LABEL[kind],
      fee: kind.endsWith('S') ? 30 : 25,
      cap: 32,
      rules: t.rules,
      mode,
      config: { ...baseConfig, firstRound: t.firstRound, ...cfg },
      drawState: 'none',
      ...extra,
    };
    db.events.push(ev);
    return ev;
  };
  const addEntries = (ev: TEvent, groups: ID[][], status: Entry['status'] = 'accepted') => {
    const es = groups.map((pids, i) => ({
      id: `${ev.id}-e${i}`,
      eventId: ev.id,
      playerIds: pids,
      status,
      createdAt: now - (groups.length - i) * 3600_000,
    }));
    db.entries.push(...es);
    return es;
  };
  const entryStrength = (e: Entry) => e.playerIds.reduce((s, p) => s + (strength.get(p) ?? 5), 0) / e.playerIds.length;
  const clubOf = (entryId: ID) => {
    const e = db.entries.find((x) => x.id === entryId);
    const clubs = new Set(e?.playerIds.map((p) => db.players.find((x) => x.id === p)?.club));
    return clubs.size === 1 ? [...clubs][0] : undefined;
  };
  const draw = (ev: TEvent) => {
    const es = db.entries.filter((e) => e.eventId === ev.id && e.status === 'accepted').sort((a, b) => entryStrength(b) - entryStrength(a));
    const seeds =
      ev.mode === 'round_robin' ? Math.min(es.length, Math.max(2, Math.ceil(es.length / ev.config.groupSize))) : bwfSeedCount(es.length);
    es.forEach((e, i) => (e.seed = i < seeds ? i + 1 : undefined));
    const seed = Math.floor(rand() * 1e9);
    const levelOf = (entryId: ID) => {
      const e = db.entries.find((x) => x.id === entryId);
      const ps = e?.playerIds.map((p) => db.players.find((x) => x.id === p)!) ?? [];
      return ps.reduce((s, p) => s + LEVEL_VALUE[p.level], 0) / Math.max(1, ps.length);
    };
    const plan = generateDraw({ event: ev, entryIds: es.map((e) => e.id), seeds, rngSeed: seed, clubOf, levelOf });
    db = publishPlan(db, ev.id, plan, seed);
    ev.config.seeds = seeds;
  };
  const pairs = (a: Player[], b: Player[], n: number) => Array.from({ length: n }, (_, i) => [a[i].id, b[i].id]);

  // ---------- T1: live today ----------
  const t1 = mkTournament({
    id: 't-fall',
    slug: 'prairie-fall-open',
    name: 'Prairie Fall Open 2026',
    venue: 'Riverside Sports Center',
    city: 'Ames, IA',
    startDate: today,
    endDate: addDaysISO(today, 1),
    status: 'live',
    rules: 'BWF_3x21',
    firstRound: 'ONE_30',
    restMinutes: 20,
    courts: 8,
    about:
      "Open singles and doubles for all levels. Men's singles and mixed doubles use drop flights, so everyone plays at least three (or two) matches at their level.",
  });
  db.tournaments.push(t1);
  const ms = mkEvent(t1, 'MS', 'drop_flight', { variant: 'ABCD' });
  addEntries(
    ms,
    M.slice(0, 24).map((p) => [p.id]),
  );
  const ws = mkEvent(t1, 'WS', 'round_robin', { groupSize: 5, advance: 2 });
  addEntries(
    ws,
    F.slice(0, 10).map((p) => [p.id]),
  );
  const md = mkEvent(t1, 'MD', 'knockout', { plate: true, thirdPlace: false });
  addEntries(
    md,
    pairs(
      M.slice(8, 32).filter((_, i) => i % 2 === 0),
      M.slice(8, 32).filter((_, i) => i % 2 === 1),
      12,
    ),
  );
  const wd = mkEvent(t1, 'WD', 'round_robin', { groupSize: 5, advance: 0 });
  addEntries(
    wd,
    pairs(
      F.slice(10, 20).filter((_, i) => i % 2 === 0),
      F.slice(10, 20).filter((_, i) => i % 2 === 1),
      5,
    ),
  );
  const xd = mkEvent(t1, 'XD', 'drop_flight', { variant: 'AB' });
  addEntries(xd, pairs(M.slice(4, 20), [...F.slice(2, 18)], 16));
  [ms, ws, md, wd, xd].forEach(draw);
  db = resolveTournament(db, t1.id);
  db = progress(db, t1.id, { MS: 0.42, WS: 0.6, MD: 0.5, WD: 0.7, XD: 0.3 }, now, rand, strength, 6);

  // Announcements and court calls the desk already sent today
  const called = db.matches.filter((m) => m.eventId.startsWith('t-fall') && m.status === 'on_court');
  db.notices = [
    {
      id: 'n-welcome',
      tournamentId: t1.id,
      at: now - 5 * 3600_000,
      kind: 'announcement',
      audience: 'all',
      channels: ['app', 'email'],
      title: 'Welcome to the Prairie Fall Open',
      body: 'Check-in is at the front desk. Warm-up courts 7 and 8 are open until 9:00.',
    },
    {
      id: 'n-delay',
      tournamentId: t1.id,
      at: now - 95 * 60000,
      kind: 'delay',
      audience: 'all',
      channels: ['app', 'sms'],
      title: 'Running about 15 minutes behind',
      body: 'Matches after lunch will start roughly 15 minutes later than listed.',
    },
    ...called.map((m, i) => {
      const court = t1.courts.find((c) => c.id === m.courtId)?.name ?? 'court';
      const ev = db.events.find((e) => e.id === m.eventId)!;
      return {
        id: `n-call-${i}`,
        tournamentId: t1.id,
        at: m.calledAt ?? now,
        kind: 'call' as const,
        audience: 'players' as const,
        eventId: ev.id,
        channels: ['app', 'sms'] as ('app' | 'sms')[],
        playerIds: [m.a, m.b].flatMap((e) => db.entries.find((x) => x.id === e)?.playerIds ?? []),
        title: `Match #${m.number} called to ${court}`,
        body: `${ev.name}. Please head to ${court} now.`,
      };
    }),
  ];

  // ---------- T2: registration open (3×15 because it starts after 4 Jan 2027) ----------
  const t2 = mkTournament({
    id: 't-winter',
    slug: 'winter-juniors-2027',
    name: 'Winter Juniors 2027',
    venue: 'Northside Community Gym',
    city: 'Des Moines, IA',
    startDate: '2027-01-16',
    endDate: '2027-01-17',
    status: 'registration',
    regCloses: '2027-01-08',
    rules: defaultRulesForDate('2027-01-16'),
    restMinutes: 30,
    courts: 6,
    about: 'Junior singles and mixed doubles, U15 and U17. First event on the new BWF 3×15 scoring.',
  });
  db.tournaments.push(t2);
  const bs15 = mkEvent(t2, 'MS', 'round_robin', { groupSize: 4, advance: 2 }, { name: "Boys' Singles U15", maxAge: 15, fee: 20 });
  addEntries(
    bs15,
    JM.filter((p) => 2027 - p.birthYear < 15)
      .slice(0, 7)
      .map((p) => [p.id]),
  );
  const gs15 = mkEvent(t2, 'WS', 'round_robin', { groupSize: 4, advance: 2 }, { name: "Girls' Singles U15", maxAge: 15, fee: 20 });
  addEntries(
    gs15,
    JF.filter((p) => 2027 - p.birthYear < 15)
      .slice(0, 5)
      .map((p) => [p.id]),
  );
  const bs17 = mkEvent(t2, 'MS', 'knockout', { plate: true }, { name: "Boys' Singles U17", maxAge: 17, fee: 20 });
  addEntries(
    bs17,
    JM.slice(4, 13).map((p) => [p.id]),
  );
  const xd17 = mkEvent(t2, 'XD', 'drop_flight', { variant: 'AB' }, { name: 'Mixed Doubles U17', maxAge: 17, fee: 15 });
  addEntries(xd17, pairs(JM.slice(0, 5), JF.slice(0, 5), 5));
  db.entries.filter((e) => e.eventId.startsWith('t-winter')).forEach((e, i) => (e.status = i % 4 === 3 ? 'pending' : 'accepted'));

  // ---------- T3: completed ----------
  const t3 = mkTournament({
    id: 't-summer',
    slug: 'summer-club-classic',
    name: 'Summer Club Classic 2026',
    venue: 'Cedar Valley Rec Hall',
    city: 'Cedar Falls, IA',
    startDate: '2026-08-15',
    endDate: '2026-08-15',
    status: 'completed',
    rules: 'BWF_3x21',
    restMinutes: 20,
    courts: 6,
    about: 'One-day club classic.',
  });
  db.tournaments.push(t3);
  const ms3 = mkEvent(t3, 'MS', 'knockout', { thirdPlace: true });
  addEntries(
    ms3,
    M.slice(2, 18).map((p) => [p.id]),
  );
  const ws3 = mkEvent(t3, 'WS', 'drop_flight', { variant: 'AB' });
  addEntries(
    ws3,
    F.slice(4, 12).map((p) => [p.id]),
  );
  const xd3 = mkEvent(t3, 'XD', 'round_robin', { groupSize: 4, advance: 1 });
  addEntries(xd3, pairs(M.slice(10, 18), F.slice(8, 16), 8));
  [ms3, ws3, xd3].forEach(draw);
  db = resolveTournament(db, t3.id);
  const summerEnd = new Date('2026-08-15T18:30:00').getTime();
  db = progress(db, t3.id, 1, summerEnd, rand, strength, 0);

  // ---------- organization, staff and demo accounts ----------
  const linked = new Map(DEMO_ACCOUNTS.filter((a) => a.playerId).map((a) => [a.playerId!, a]));
  db = {
    ...db,
    organizations: [{ ...DEMO_ORG }],
    profiles: DEMO_ACCOUNTS.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.playerId ? (db.players.find((p) => p.id === a.playerId)?.name ?? a.name) : a.name,
    })),
    members: DEMO_ACCOUNTS.filter((a) => a.role).map((a) => ({ orgId: DEMO_ORG.id, userId: a.id, role: a.role! })),
    orgInvites: [],
    players: db.players.map((p) => (linked.has(p.id) ? { ...p, userId: linked.get(p.id)!.id, email: linked.get(p.id)!.email } : p)),
  };
  return db;
}

/** Finish matches event by event up to a fraction of each event (number or per-event map), then fill courts. */
function progress(
  db: DB,
  tid: ID,
  fraction: number | Record<string, number>,
  now: number,
  rand: () => number,
  strength: Map<ID, number>,
  onCourt: number,
): DB {
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tid).map((e) => e.id));
  const cutoffOf = new Map<ID, number>();
  for (const id of evIds) {
    const nums = db.matches
      .filter((m) => m.eventId === id && m.number > 0)
      .map((m) => m.number)
      .sort((a, b) => a - b);
    const f = typeof fraction === 'number' ? fraction : (fraction[db.events.find((e) => e.id === id)!.kind] ?? 0.5);
    cutoffOf.set(id, f >= 1 ? Infinity : (nums[Math.max(0, Math.round(nums.length * f) - 1)] ?? 0));
  }
  const entryStrength = (id: ID | null) => {
    const e = db.entries.find((x) => x.id === id);
    return e ? e.playerIds.reduce((s, p) => s + (strength.get(p) ?? 5), 0) / e.playerIds.length : 5;
  };
  const finishOrder: ID[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const ready = db.matches
      .filter((m) => evIds.has(m.eventId) && m.status === 'ready' && m.number <= cutoffOf.get(m.eventId)!)
      .sort((a, b) => a.number - b.number);
    if (!ready.length) break;
    for (const m of ready) {
      const r = rulesOfMatch(db, m);
      const res = simulateResult(r, entryStrength(m.a), entryStrength(m.b), rand);
      const walkover = rand() < 0.015;
      db = {
        ...db,
        matches: db.matches.map((x) =>
          x.id === m.id
            ? {
                ...x,
                status: 'finished',
                games: walkover ? [] : res.games,
                winner: res.winner,
                result: walkover ? 'walkover' : 'normal',
                courtId: `${tid}-c${1 + (finishOrder.length % 6)}`,
              }
            : x,
        ),
      };
      finishOrder.push(m.id);
    }
    db = resolveTournament(db, tid);
  }
  // Spread finish times over the session that led up to `now` (about one result every 5–6 minutes).
  const gap = 5.5 * 60000;
  const finishedAt = new Map(finishOrder.map((id, i) => [id, now - 4 * 60000 - (finishOrder.length - 1 - i) * gap]));
  // Each match lasted 18–48 minutes (start = finish − duration), so cards can show durations.
  db = {
    ...db,
    matches: db.matches.map((m) => {
      if (!finishedAt.has(m.id)) return m;
      const end = finishedAt.get(m.id)!;
      const dur = m.result === 'walkover' ? 0 : (18 + Math.floor(rand() * 30) + (m.games.length === 3 ? 10 : 0)) * 60000;
      return {
        ...m,
        finishedAt: end,
        startedAt: m.result === 'walkover' ? undefined : end - dur,
        calledAt: m.result === 'walkover' ? undefined : end - dur - 3 * 60000,
      };
    }),
  };

  // Put some ready matches on court, never double-booking a player.
  if (onCourt > 0) {
    const t = db.tournaments.find((x) => x.id === tid)!;
    const busy = new Set<ID>();
    const playersOf = (m: (typeof db.matches)[number]) => [m.a, m.b].flatMap((e) => db.entries.find((x) => x.id === e)?.playerIds ?? []);
    const ready = db.matches.filter((m) => evIds.has(m.eventId) && m.status === 'ready').sort((a, b) => a.number - b.number);
    let court = 0;
    for (const m of ready) {
      if (court >= onCourt) break;
      const ps = playersOf(m);
      if (ps.some((p) => busy.has(p))) continue;
      ps.forEach((p) => busy.add(p));
      const res = callToCourt(db, m.id, t.courts[court].id, now - (3 + Math.floor(rand() * 26)) * 60000, { rest: true });
      if (res.db) db = res.db;
      // Live progress on most courts
      const r = rulesOfMatch(db, m);
      const stage = r.bestOf === 1 ? 1 + (court % 2) : court % 3;
      const sim = simulateResult(r, entryStrength(m.a), entryStrength(m.b), rand);
      const live: { games: GameScore[]; live: GameScore | null } =
        stage === 0
          ? { games: [sim.games[0]], live: [Math.floor(rand() * (r.pointsToWin - 6)), Math.floor(rand() * (r.pointsToWin - 6))] }
          : stage === 1
            ? { games: [], live: [Math.floor(rand() * (r.pointsToWin - 2)), Math.floor(rand() * (r.pointsToWin - 2))] }
            : { games: [], live: null };
      db = {
        ...db,
        matches: db.matches.map((x) =>
          x.id === m.id ? { ...x, ...live, startedAt: live.live ? (x.calledAt ?? now) + 3 * 60000 : undefined } : x,
        ),
      };
      court++;
    }
  }
  return db;
}
