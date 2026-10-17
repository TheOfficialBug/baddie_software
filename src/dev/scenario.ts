// Dev-only scenarios from a real tournamentsoftware draws file kept in local/ (git-ignored): every category
// as an A/B/C/D drop flight (tournamentsoftware's Triple Plate) with the site's first round.
//   dev:organizer – in draft, nothing played, for running the tournament from the desk;
//   dev:scenario  – a match day in progress (everything through the semi-finals played, finals on court).
// Nothing here ships in a build.
import { DEMO_ORG } from '@/config/demo';
import { mulberry32 } from '@/engine/rng';
import type { ID, Match } from '@/engine/types';

import { addDaysISO, todayISO } from '@/lib/format';

import { adjustLive, callToCourt, resolveTournament, rulesOfMatch, saveResult, uid } from '@/data/ops';
import { buildIowaOpen } from '@/data/seed/iowaOpen';
import { simulateResult } from '@/data/simulate';
import { importTsDraws, type TsDrawFile } from '@/data/tsDraws';
import type { DB } from '@/data/types';

export const SCENARIO_SLUG = 'iowa-open-2026';

// every category on the site (Mixed Doubles included)
const KINDS = new Set(['MS', 'WS', 'MD', 'WD', 'XD']);

const isFinal = (db: DB, m: Match) => {
  const st = db.stages.find((s) => s.id === m.stageId);
  if (!st || st.kind !== 'knockout') return false;
  return m.round === st.rounds || /3rd/i.test(st.name);
};

/** The organizer's starting point: Iowa Open 2026 in draft (hidden from the public) with tournamentsoftware's draws laid out as Triple Plates. Nothing played. */
export function buildDraws(file: TsDrawFile, now = Date.now(), seed = 26): DB {
  const rand = mulberry32(seed);
  // the demo organization and accounts, none of the sample tournaments
  const base = buildIowaOpen(now);
  let db: DB = {
    ...base,
    tournaments: [],
    players: [],
    events: [],
    entries: [],
    stages: [],
    groups: [],
    matches: [],
    updates: [],
    registrations: [],
    notices: [],
    drawDrafts: [],
    checkIns: [],
  };
  const tid = uid('t');
  const today = todayISO();
  db.tournaments.push({
    id: tid,
    slug: SCENARIO_SLUG,
    name: 'Iowa Open 2026',
    venue: 'Lied Recreation Center',
    city: 'Ames, IA',
    startDate: today,
    endDate: addDaysISO(today, 1),
    status: 'draft',
    regCloses: addDaysISO(today, -3),
    rules: 'BWF_3x21',
    restMinutes: 15,
    courts: Array.from({ length: 10 }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}` })),
    nextMatchNumber: 1,
    organizationId: DEMO_ORG.id,
    about: 'Iowa Open 2026, run on Smashboard with the draws from tournamentsoftware.',
  });

  const events = { ...file, events: file.events.filter((e) => KINDS.has(e.kind)) };
  const r = importTsDraws(db, tid, events, now);
  if (!r.db) throw new Error(r.error ?? 'Import failed');
  db = r.db;
  // a hidden playing strength per player, so results look like real badminton rather than coin flips
  db = { ...db, players: db.players.map((p) => ({ ...p, strength: Math.round((2 + rand() * 7) * 10) / 10 })) };

  // the importer lays every category out as tournamentsoftware's Triple Plate, keeping its first round and
  // numbering matches 1, 2, 3… like the score slips
  return resolveTournament(db, tid);
}

/** A match day in progress on the same draws: published, everything through the semi-finals played, finals on court. */
export function buildScenario(file: TsDrawFile, now = Date.now(), seed = 26): DB {
  const rand = mulberry32(seed + 1);
  let db = buildDraws(file, now, seed);
  const tid = db.tournaments.find((t) => t.slug === SCENARIO_SLUG)!.id;
  db = { ...db, tournaments: db.tournaments.map((t) => (t.id === tid ? { ...t, status: 'live' } : t)) };

  // the day so far: everything up to and including the semi-finals, spread over the morning on 10 courts
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tid).map((e) => e.id));
  const courts = db.tournaments.find((t) => t.id === tid)!.courts;
  const strength = (entryId: ID | null) => {
    const e = db.entries.find((x) => x.id === entryId);
    const v = (e?.playerIds ?? []).map((p) => db.players.find((x) => x.id === p)?.strength ?? 5);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 5;
  };
  const todo = () =>
    db.matches
      .filter((m) => evIds.has(m.eventId) && m.status === 'ready' && !isFinal(db, m))
      .sort((a, b) => a.round - b.round || a.number - b.number);
  let clock = now - 7 * 60 * 60_000;
  let court = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const m = todo()[0];
    if (!m) break;
    const c = courts[court % courts.length];
    court++;
    if (court % courts.length === 0) clock += 26 * 60_000;
    const called = callToCourt(db, m.id, c.id, clock, { busy: true, rest: true });
    if (!called.db) break;
    db = called.db;
    const dur = Math.round((16 + rand() * 24) * 60_000);
    db = { ...db, matches: db.matches.map((x) => (x.id === m.id ? { ...x, startedAt: clock + 3 * 60_000 } : x)) };
    const sim = simulateResult(rulesOfMatch(db, m), strength(m.a as ID), strength(m.b as ID), rand);
    const saved = saveResult(
      db,
      m.id,
      { games: sim.games, result: rand() < 0.01 ? 'walkover' : 'normal', winner: sim.winner },
      clock + 3 * 60_000 + dur,
    );
    if (saved.db) db = saved.db;
  }
  db = resolveTournament(db, tid);
  // now: finals (and 3rd place) on court, a few points in
  const finals = db.matches.filter((m) => evIds.has(m.eventId) && m.status === 'ready');
  finals.forEach((m, i) => {
    if (i >= courts.length) return;
    const called = callToCourt(db, m.id, courts[i].id, now - 6 * 60_000, { busy: true, rest: true });
    if (!called.db) return;
    db = { ...called.db, matches: called.db.matches.map((x) => (x.id === m.id ? { ...x, startedAt: now - 4 * 60_000 } : x)) };
    for (let k = 3 + Math.floor(rand() * 12); k > 0; k--) {
      const res = adjustLive(db, m.id, rand() < 0.5 ? 'a' : 'b', 1, rulesOfMatch(db, m), now);
      if (res.db) db = res.db;
    }
  });
  const announce = (title: string, body: string, at: number) => ({
    id: uid('n'),
    tournamentId: tid,
    at,
    kind: 'announcement' as const,
    audience: 'all' as const,
    channels: ['app' as const],
    title,
    body,
  });
  db = {
    ...db,
    notices: [
      ...db.notices,
      announce(
        'Welcome to the Iowa Open 2026',
        'Every event is an A/B/C/D drop flight: lose in A and you drop to the Plate (B), Special Plate (C) or Consolation Plate (D). Follow every court live here.',
        now - 7 * 60 * 60_000,
      ),
      announce('Semi-finals are done', 'Finals are on court now. Come watch on courts 1 to 6!', now - 5 * 60_000),
    ],
  };
  return db;
}

async function loadDrawsFile() {
  const files = import.meta.glob('/local/*.json', { query: '?raw', import: 'default' });
  const first = Object.keys(files).sort()[0];
  if (!first) {
    console.warn('dev scenario: put a tournamentsoftware draws file at local/<name>.json');
    return null;
  }
  const { parseTsDrawFile } = await import('@/data/tsDraws');
  return parseTsDrawFile((await files[first]()) as string);
}

const isOurs = (db: DB, status: (s: string) => boolean) =>
  db.tournaments.some((t) => t.slug === SCENARIO_SLUG && status(t.status)) &&
  db.events.some((e) => e.config.layout === 'tournamentsoftware') &&
  // saved before Mixed Doubles was included, or numbered from 304 by an older version: start again
  db.events.some((e) => e.kind === 'XD') &&
  db.matches.some((m) => m.number === 1);

/** `npm run dev:scenario`: a match day in progress on the real draws, kept moving. */
export async function startScenario(): Promise<void> {
  const file = await loadDrawsFile();
  if (!file) return;
  const { startPlayerPreview } = await import('@/dev/playerPreview');
  await startPlayerPreview({ build: () => buildScenario(file), slug: SCENARIO_SLUG, isCurrent: (db) => isOurs(db, (s) => s !== 'draft') });
}

/** `npm run dev:organizer`: the tournament in draft with the real draws, nothing played; the organizer takes it from there. */
export async function startOrganizer(): Promise<void> {
  const file = await loadDrawsFile();
  if (!file) return;
  const { startPlayerPreview } = await import('@/dev/playerPreview');
  // the organizer's own progress (publishing, results) is kept across reloads; Reset starts over from the draws
  await startPlayerPreview({
    build: () => buildDraws(file),
    slug: SCENARIO_SLUG,
    simulate: false,
    isCurrent: (db) => isOurs(db, () => true),
  });
}
