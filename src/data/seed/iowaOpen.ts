// Starting data: "Iowa Open Test 26", modelled on the Iowa Open 2026 field (Badminton Club at Iowa State, Ames,
// Oct 17–18): 121 players and their entries in the five Open events, with invented names and clubs (see
// iowaOpenEntries). Every event is a drop flight. Load the real entry list with Entries → Import.
import { DEMO_ACCOUNTS, DEMO_ORG } from '@/config/demo';
import { mulberry32 } from '@/engine/rng';
import type { Entry, EventKind, Player, SkillLevel, TEvent, Tournament } from '@/engine/types';

import { BASE_EVENT_CONFIG, KIND_LABEL } from '@/data/catalog';
import { IOWA_ENTRIES, IOWA_PLAYERS } from '@/data/seed/iowaOpenEntries';
import { type DB, emptyDB } from '@/data/types';

export const IOWA_OPEN_ID = 't-iowa-26';

const EVENTS: { kind: EventKind; fee: number }[] = [
  { kind: 'MS', fee: 30 },
  { kind: 'WS', fee: 30 },
  { kind: 'MD', fee: 25 },
  { kind: 'WD', fee: 25 },
  { kind: 'XD', fee: 25 },
];
const SINGLES = new Set<EventKind>(['MS', 'WS']);

/** Hidden playing strength for the simulator, from the level (A strongest). */
const STRENGTH: Record<SkillLevel, number> = { A: 8.5, B: 6.5, C: 4.5, D: 2.5 };

/** Iowa Open Test 26 with registration open: the real 2026 field, no draws yet. */
export function buildIowaOpen(now = Date.now()): DB {
  const rand = mulberry32(20261017);
  const db = emptyDB();

  // ---------- players ----------
  // no birth dates in the seed: like the entry-list import, players are taken to be 25 in the tournament year
  db.players = IOWA_PLAYERS.map(([id, name, gender, club, singles, doubles]): Player => {
    const level = singles ?? doubles ?? 'C';
    return {
      id,
      name,
      gender,
      club,
      birthYear: 2026 - 25,
      level,
      strength: Math.round((STRENGTH[level] + (rand() - 0.5) * 1.5) * 10) / 10,
    };
  });
  const levelsOf = new Map(IOWA_PLAYERS.map(([id, , , , singles, doubles]) => [id, { singles, doubles }]));

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
      'Test run of the Iowa Open 2026: Open singles, doubles and mixed over two days, all drop flights. First round is one game to 30; after that, best of three to 21.',
  };
  db.tournaments = [t];

  // ---------- events and entries ----------
  const opens = Date.parse('2026-09-14T05:00:00Z');
  const closes = Math.min(now, Date.parse('2026-10-10T04:59:00Z'));
  const enteredAt = () => opens + Math.floor(rand() * Math.max(1, closes - opens));

  for (const plan of EVENTS) {
    const ev: TEvent = {
      id: `${IOWA_OPEN_ID}-${plan.kind}`,
      tournamentId: t.id,
      kind: plan.kind,
      name: `Open ${KIND_LABEL[plan.kind]}`,
      fee: plan.fee,
      cap: 64,
      rules: t.rules,
      mode: 'drop_flight',
      config: { ...BASE_EVENT_CONFIG, firstRound: t.firstRound, pairing: 'balanced' },
      drawState: 'none',
    };
    db.events.push(ev);

    const singles = SINGLES.has(plan.kind);
    const level = (id: string): SkillLevel => {
      const l = levelsOf.get(id)!;
      return (singles ? (l.singles ?? l.doubles) : (l.doubles ?? l.singles)) ?? 'C';
    };
    const entries = IOWA_ENTRIES.filter((e) => e.kind === plan.kind).map((e, i): Entry => {
      const levels = e.ids.map(level);
      const entry: Entry = {
        id: `${ev.id}-e${i + 1}`,
        eventId: ev.id,
        playerIds: e.ids,
        // a doubles player with no partner given waits for the organizer to find one
        status: e.partner === '' ? 'pending' : 'accepted',
        levels,
        createdAt: enteredAt(),
      };
      // the partner's level isn't known: taken to be the player's own
      if (e.partner) entry.pendingPartner = { name: e.partner, level: levels[0] };
      return entry;
    });
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
