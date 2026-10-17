// Dev-only player preview (`npm run dev:player`): the sample tournament already on match day, kept moving
// so the public pages can be checked the way players will see them: live points ticking up, results coming
// in, courts refilling (with call-up notifications) and the odd announcement. Nothing here ships in the
// production build: src/app/main.tsx loads it only on the dev server in "player" mode.
import { mulberry32 } from '@/engine/rng';
import type { ID, Side } from '@/engine/types';

import { adjustLive, rulesOfMatch, saveResult, uid } from '@/data/ops';
import { buildIowaOpen } from '@/data/seed/iowaOpen';
import { drawAll, simulateMatches, simulateTick } from '@/data/simulate';
import type { DB, Notice } from '@/data/types';

export const PREVIEW_SLUG = 'iowa-open-test-26';

const ANNOUNCEMENTS: Pick<Notice, 'title' | 'body'>[] = [
  { title: 'Welcome to the Iowa Open', body: 'Follow every court live here. Check your next match on your player page.' },
  { title: 'Courts 7 and 8 run 10 minutes late', body: 'We’ll call the next matches there as soon as the courts free up.' },
  { title: 'Lunch break at 12:30', body: 'Matches already on court finish; the next calls resume at 1:15.' },
  { title: 'Semi-finals from 3 pm', body: 'Check the draws for who you play. Results update live.' },
];

const announce = (db: DB, tid: ID, now: number, i: number): DB => ({
  ...db,
  notices: [
    ...db.notices,
    {
      id: uid('n'),
      tournamentId: tid,
      at: now,
      kind: 'announcement',
      audience: 'all',
      channels: ['app'],
      ...ANNOUNCEMENTS[i % ANNOUNCEMENTS.length],
    },
  ],
});

/** The sample tournament on match day: entries accepted, every draw made, ~30 results in, courts busy with live scores. */
export function buildPreview(now = Date.now(), seed = 7): DB {
  const rand = mulberry32(seed);
  let db = buildIowaOpen(now);
  const t = db.tournaments.find((x) => x.slug === PREVIEW_SLUG) ?? db.tournaments[0];
  const tid = t.id;
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tid).map((e) => e.id));
  db = {
    ...db,
    entries: db.entries.map((e) => (evIds.has(e.eventId) && e.status === 'pending' ? { ...e, status: 'accepted' } : e)),
    tournaments: db.tournaments.map((x) => (x.id === tid ? { ...x, status: 'closed' } : x)),
  };
  db = drawAll(db, tid, seed);
  db = { ...db, tournaments: db.tournaments.map((x) => (x.id === tid ? { ...x, status: 'live' } : x)) };
  // the morning so far: results spread over the last two hours, then courts filled for now
  db = simulateMatches(db, tid, 30, now - 2 * 60 * 60_000, rand, 4).db;
  db = simulateTick(db, tid, now, rand, 0).db;
  // matches on court are mid-game
  for (const m of db.matches.filter((x) => evIds.has(x.eventId) && x.status === 'on_court')) {
    db = { ...db, matches: db.matches.map((x) => (x.id === m.id ? { ...x, startedAt: now - Math.round(rand() * 15) * 60_000 } : x)) };
    for (let k = Math.floor(rand() * 24); k > 0; k--) {
      const r = adjustLive(db, m.id, rand() < 0.5 ? 'a' : 'b', 1, rulesOfMatch(db, m), now);
      if (r.db) db = r.db;
    }
  }
  return announce(db, tid, now - 90 * 60_000, 0);
}

/**
 * One moment of match day: usually a point on a random court; sometimes a match ends (and the court gets
 * its next call-up); now and then an announcement. Pure: returns the next snapshot.
 */
export function previewStep(db: DB, tid: ID, now: number, rand: () => number, step: number): DB {
  if (step > 0 && step % 25 === 0) return announce(db, tid, now, step / 25);
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tid).map((e) => e.id));
  const onCourt = db.matches.filter((m) => evIds.has(m.eventId) && m.status === 'on_court');
  if (!onCourt.length || rand() < 0.08) return simulateTick(db, tid, now, rand).db;
  const m = onCourt[Math.floor(rand() * onCourt.length)];
  const side: Side = rand() < 0.5 ? 'a' : 'b';
  const r = adjustLive(db, m.id, side, 1, rulesOfMatch(db, m), now);
  if (r.db) return r.db;
  // the match is decided: the desk confirms the result, then the court is refilled
  const done = saveResult(db, m.id, { games: m.games, result: 'normal' }, now);
  return done.db ? simulateTick(done.db, tid, now, rand, 0).db : simulateTick(db, tid, now, rand).db;
}

/** Start the preview in the running app (dev server only). Returns a stop function. */
export async function startPlayerPreview(
  opts: { build: () => DB; slug: string; isCurrent?: (db: DB) => boolean; simulate?: boolean } = {
    build: () => buildPreview(),
    slug: PREVIEW_SLUG,
  },
): Promise<() => void> {
  const [{ useStore }, { mountPreviewBar }] = await Promise.all([import('@/data/store'), import('@/dev/mountPreviewBar')]);
  const reset = () => useStore.setState({ ...opts.build(), noticesSeenAt: 0 });
  const rand = mulberry32(Date.now() % 2_147_483_647);
  const tid = () => useStore.getState().tournaments.find((t) => t.slug === opts.slug)?.id;
  // a reload carries on with the same match day (links stay valid); Reset starts a fresh one
  if (!tid() || (opts.isCurrent && !opts.isCurrent(useStore.getState()))) reset();
  let step = 0;
  let paused = false;
  const timer = setInterval(() => {
    const id = tid();
    if (paused || !id || opts.simulate === false) return;
    const s = useStore.getState();
    useStore.setState(previewStep(s, id, Date.now(), rand, ++step));
  }, 1500);
  const unmount = mountPreviewBar({
    slug: opts.slug,
    togglePause: () => (paused = !paused),
    reset,
  });
  return () => {
    clearInterval(timer);
    unmount();
  };
}
