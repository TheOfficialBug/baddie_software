// Import draws exactly as published on tournamentsoftware.com: every event's first-round lines
// (who starts where, and the byes) are kept as they are, and the rest of the structure (later
// rounds, A/B/C/D flights) comes from our own engine. The file is made from the public draw pages.
import { generateDraw } from '@/engine/draws';
import type { Entry, EventKind, ID, Player, TEvent } from '@/engine/types';

import { BASE_EVENT_CONFIG, KIND_LABEL } from '@/data/catalog';
import { entryClub } from '@/data/clubs';
import { norm } from '@/data/entryList';
import { clearDraw, drawPublishedNotice, publishPlan, resolveTournament, uid } from '@/data/ops';
import type { DB } from '@/data/types';

export const TS_DRAWS_FORMAT = 'tournamentsoftware-draws/1';

export interface TsPlayer {
  /** tournamentsoftware's player number within the tournament */
  tsId: string;
  name: string;
  club?: string;
}

export interface TsEvent {
  kind: EventKind;
  name: string;
  /** first-round lines from the top: a team, 'BYE', or null for an empty line (played as a bye) */
  lines: (TsPlayer[] | 'BYE' | null)[];
}

export interface TsDrawFile {
  format: typeof TS_DRAWS_FORMAT;
  source?: string;
  events: TsEvent[];
}

const KINDS: EventKind[] = ['MS', 'WS', 'MD', 'WD', 'XD'];
const isPow2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/** Check a draws file and return it typed, or throw a message for the organizer. */
export function parseTsDrawFile(text: string): TsDrawFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a draws file (it is not valid JSON).');
  }
  const f = raw as Partial<TsDrawFile>;
  if (f?.format !== TS_DRAWS_FORMAT || !Array.isArray(f.events)) throw new Error('This file is not a tournamentsoftware draws file.');
  for (const ev of f.events) {
    if (!KINDS.includes(ev.kind)) throw new Error(`Unknown event type “${String(ev.kind)}”.`);
    if (!Array.isArray(ev.lines) || !isPow2(ev.lines.length))
      throw new Error(`${ev.name}: a draw needs 2, 4, 8, 16… lines (this one has ${ev.lines?.length ?? 0}).`);
    const size = ev.kind === 'MS' || ev.kind === 'WS' ? 1 : 2;
    for (const line of ev.lines)
      if (Array.isArray(line) && (line.length !== size || line.some((p) => !p.tsId || !p.name)))
        throw new Error(`${ev.name}: every line must be ${size === 1 ? 'one player' : 'a pair'}.`);
  }
  return f as TsDrawFile;
}

const genderIn = (kind: EventKind, slot: number): Player['gender'] =>
  kind === 'MS' || kind === 'MD' ? 'M' : kind === 'WS' || kind === 'WD' ? 'F' : slot === 0 ? 'M' : 'F';

const clubName = (c?: string) => {
  const s = c?.trim();
  return !s || /^n\/?a$/i.test(s) ? 'No club' : s;
};

export interface TsImportResult {
  db?: DB;
  error?: string;
  players: number;
  newPlayers: number;
  events: { name: string; entries: number }[];
  warnings: string[];
}

/**
 * Put a tournamentsoftware draws file into a tournament: players (matched by name and gender, so an
 * earlier Players import is reused), one entry per line, events (an existing event of the same type is
 * reused and its draw replaced) and a published A/B/C/D drop-flight draw with the same first round, laid out
 * like tournamentsoftware's Triple Plate (B = Plate, C = Special Plate, D = Consolation Plate).
 */
export function importTsDraws(db: DB, tournamentId: ID, file: TsDrawFile, now = Date.now()): TsImportResult {
  const out: TsImportResult = { players: 0, newPlayers: 0, events: [], warnings: [] };
  const t = db.tournaments.find((x) => x.id === tournamentId);
  if (!t) return { ...out, error: 'Tournament not found.' };
  const eventIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  if (db.matches.some((m) => eventIds.has(m.eventId) && (m.status === 'finished' || m.status === 'on_court')))
    return { ...out, error: 'Matches have already been played. Reset the draws first (Settings → Reset), then import.' };

  // players: one per tournamentsoftware number; gender from the events they play
  const gender = new Map<string, Player['gender']>();
  const info = new Map<string, TsPlayer>();
  for (const ev of file.events)
    for (const line of ev.lines)
      if (Array.isArray(line))
        line.forEach((p, i) => {
          const g = genderIn(ev.kind, i);
          if (gender.has(p.tsId) && gender.get(p.tsId) !== g && ev.kind !== 'XD')
            out.warnings.push(`${p.name} plays both men's and women's events; check their gender.`);
          if (!gender.has(p.tsId) || ev.kind !== 'XD') gender.set(p.tsId, g);
          const known = info.get(p.tsId);
          if (!known || (clubName(known.club) === 'No club' && clubName(p.club) !== 'No club')) info.set(p.tsId, p);
        });

  const birthYear = Number(t.startDate.slice(0, 4)) - 25;
  const byName = new Map(db.players.map((p) => [`${norm(p.name)}|${p.gender}`, p]));
  const players = [...db.players];
  const idOf = new Map<string, ID>();
  for (const [tsId, p] of info) {
    const g = gender.get(tsId)!;
    const old = byName.get(`${norm(p.name)}|${g}`);
    if (old) {
      idOf.set(tsId, old.id);
      continue;
    }
    const np: Player = { id: uid('p'), name: p.name.trim(), gender: g, club: clubName(p.club), birthYear, level: 'C' };
    players.push(np);
    byName.set(`${norm(np.name)}|${g}`, np);
    idOf.set(tsId, np.id);
    out.newPlayers++;
  }
  out.players = info.size;
  let next: DB = { ...db, players };

  for (const tev of file.events) {
    // the event: reuse one of the same type, else add it
    const existing = next.events.find((e) => e.tournamentId === tournamentId && e.kind === tev.kind);
    const config = {
      ...(existing?.config ?? { ...BASE_EVENT_CONFIG, firstRound: t.firstRound }),
      variant: 'ABCD' as const,
      layout: 'tournamentsoftware' as const,
      seeds: 0,
    };
    const ev: TEvent = existing
      ? { ...existing, mode: 'drop_flight', config }
      : {
          id: uid('ev'),
          tournamentId,
          kind: tev.kind,
          name: tev.name || KIND_LABEL[tev.kind],
          fee: 0,
          cap: Math.max(64, tev.lines.length),
          rules: t.rules,
          mode: 'drop_flight',
          config,
          drawState: 'none',
        };
    if (existing) next = clearDraw(next, ev.id);
    next = { ...next, events: existing ? next.events.map((e) => (e.id === ev.id ? ev : e)) : [...next.events, ev] };

    // entries: exactly the teams in the draw, in draw order
    const entries: Entry[] = [];
    const lines = tev.lines.map((line): ID | 'BYE' => {
      if (!Array.isArray(line)) return 'BYE';
      const e: Entry = { id: uid('e'), eventId: ev.id, playerIds: line.map((p) => idOf.get(p.tsId)!), status: 'accepted', createdAt: now };
      entries.push(e);
      return e.id;
    });
    const playerOf = new Map(next.players.map((p) => [p.id, p]));
    const entryOf = new Map(entries.map((e) => [e.id, e]));
    const clubOf = (id: ID) => entryClub((entryOf.get(id)?.playerIds ?? []).flatMap((p) => playerOf.get(p) ?? []));
    next = { ...next, entries: [...next.entries.filter((e) => e.eventId !== ev.id), ...entries] };

    const plan = generateDraw({ event: ev, entryIds: entries.map((e) => e.id), seeds: 0, rngSeed: 1, clubOf, lines });
    // clubmates meeting in round 1 are as tournamentsoftware drew them; only structural warnings matter here
    out.warnings.push(...plan.warnings.filter((w) => !w.includes('meet in round 1')).map((w) => `${ev.name}: ${w}`));
    next = publishPlan(next, ev.id, plan, 1);
    next = { ...next, notices: [...next.notices, drawPublishedNotice(ev, now)] };
    out.events.push({ name: ev.name, entries: entries.length });
  }

  return { ...out, db: resolveTournament(next, tournamentId) };
}
