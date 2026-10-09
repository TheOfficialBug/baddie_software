// Fixing a published draw by hand: where each entry starts (first-round lines or group places),
// who can still be moved, and applying a rearrangement.
//   • Moving entries between starting places keeps every match, number and bye; who meets whom
//     later is worked out again from the new places.
//   • Before any match of the event is played, bye places can be filled too (a bye becomes a real
//     match and the emptied place becomes a bye). The draw's structure is then rebuilt from the new
//     first-round lines, keeping match numbers inside the event's range where they fit.
import { generateDraw } from '@/engine/draws';
import { assignNumbers, resolveMatches } from '@/engine/progression';
import { groupRulesId, RULES } from '@/engine/rules';
import type { ID, Match, SlotSource } from '@/engine/types';

import { entryClub } from '@/data/clubs';
import { type OpResult, resolveTournament } from '@/data/ops';
import type { DB } from '@/data/types';

/** One starting place: a side of a first-round line, or a seat in a group. */
export interface Place {
  key: string;
  /** The entry there now, or 'BYE' (can take a player only while `byesMovable`). */
  entryId: ID | 'BYE';
}

/** A first-round line (two places) or a group (several). */
export interface PlaceBox {
  id: ID;
  kind: 'line' | 'group';
  /** "#6", "Bye" or "Group A" */
  title: string;
  /** Stage name for drop-flight / multi-stage draws, e.g. "A flight". */
  stage?: string;
  places: Place[];
}

export interface DrawPlaces {
  boxes: PlaceBox[];
  /** Entries that have played or are on court in this event: they stay where they are. */
  locked: Set<ID>;
  /** Nothing in the event has been played yet, so byes can move (bye places can take a player). */
  byesMovable: boolean;
}

const started = (m: Match) => m.status === 'finished' || m.status === 'on_court';

/** Starting places of an event's published draw. */
export function drawPlaces(db: DB, eventId: ID): DrawPlaces {
  const matches = db.matches.filter((m) => m.eventId === eventId);
  const stages = db.stages.filter((s) => s.eventId === eventId).sort((a, b) => a.order - b.order);
  const locked = new Set<ID>();
  for (const m of matches) if (started(m)) for (const e of [m.a, m.b]) if (e && e !== 'BYE') locked.add(e);

  const boxes: PlaceBox[] = [];
  for (const g of db.groups.filter((x) => x.eventId === eventId))
    boxes.push({ id: g.id, kind: 'group', title: g.name, places: g.entryIds.map((e, i) => ({ key: `${g.id}:${i}`, entryId: e })) });

  // first-round lines of the starting bracket (main draw or A flight); later stages fill from results
  const seeded = (s: SlotSource) => s.kind === 'entry' || s.kind === 'bye';
  for (const s of stages.filter((x) => x.kind === 'knockout' && x.order === 0)) {
    const lines = matches
      .filter((m) => m.stageId === s.id && m.round === 1 && !m.groupId && seeded(m.srcA) && seeded(m.srcB))
      .sort((a, b) => a.index - b.index);
    for (const m of lines)
      boxes.push({
        id: m.id,
        kind: 'line',
        // bye lines have no match number: name them by their line in the round
        title: m.number > 0 ? `#${m.number}` : `Line ${m.index + 1} (bye)`,
        stage: s.name,
        places: (['a', 'b'] as const).map((side) => {
          const src = side === 'a' ? m.srcA : m.srcB;
          return { key: `${m.id}:${side}`, entryId: src.kind === 'entry' ? src.entryId : 'BYE' };
        }),
      });
  }
  // name the stage only when starting places span more than one (e.g. a plate as well as the main draw)
  const named = new Set(boxes.map((b) => b.stage).filter(Boolean)).size > 1;
  const byesMovable = locked.size === 0 && !matches.some((m) => m.games.length > 0);
  return { boxes: named ? boxes : boxes.map((b) => ({ ...b, stage: undefined })), locked, byesMovable };
}

/** Who sits where: place key → entry, or null for an empty place (a bye if left empty). */
export type Seating = Record<string, ID | null>;

/** The editable places and who is in them. Bye places are included (empty) only while byes can move. */
export function seatingOf(p: DrawPlaces): Seating {
  return Object.fromEntries(
    p.boxes.flatMap((b) =>
      b.places.filter((x) => x.entryId !== 'BYE' || p.byesMovable).map((x) => [x.key, x.entryId === 'BYE' ? null : x.entryId]),
    ),
  );
}

/** Does this seating move byes (a bye place filled, or a player's place left empty)? */
export const movesByes = (original: Seating, draft: Seating) => Object.keys(original).some((k) => !original[k] !== !draft[k]);

/** Entries taken out and not placed again yet. */
export function heldEntries(original: Seating, draft: Seating): ID[] {
  const seated = new Set(Object.values(draft).filter(Boolean));
  return Object.values(original).filter((e): e is ID => !!e && !seated.has(e));
}

/** Entries whose starting place differs from the published draw. */
export function movedEntries(original: Seating, draft: Seating): { entryId: ID; from: string; to: string }[] {
  const where = (s: Seating) => new Map(Object.entries(s).flatMap(([k, e]) => (e ? [[e, k] as const] : [])));
  const before = where(original);
  const after = where(draft);
  return [...before].filter(([e, k]) => after.get(e) !== k).map(([entryId, from]) => ({ entryId, from, to: after.get(entryId) ?? '' }));
}

/**
 * Publish a new seating. Every entry must be placed exactly once and entries that have played stay
 * put. Without moving byes, matches keep their ids and numbers and later rounds are worked out
 * again; when byes move, the structure is rebuilt (see rebuildFromLines).
 */
export function rearrangeDraw(db: DB, eventId: ID, draft: Seating): OpResult {
  const p = drawPlaces(db, eventId);
  const original = seatingOf(p);
  const keys = Object.keys(original);
  if (heldEntries(original, draft).length) return { error: 'Place everyone from the holding area first.' };
  const placed = keys.map((k) => draft[k]).filter(Boolean);
  if (new Set(placed).size !== placed.length) return { error: 'Each player can only be in one place.' };
  const changed = keys.filter((k) => draft[k] !== original[k]);
  if (changed.some((k) => [original[k], draft[k]].some((e) => e && p.locked.has(e))))
    return { error: 'Players who have already played stay where they are.' };
  if (!changed.length) return { db };
  if (movesByes(original, draft)) {
    if (!p.byesMovable) return { error: "Byes can't move once matches have been played." };
    return rebuildFromLines(db, eventId, draft);
  }

  // place key → new entry, applied to the line's slot source or the group's seat
  const swap = (s: SlotSource, key: string): SlotSource =>
    s.kind === 'entry' && key in draft ? { kind: 'entry', entryId: draft[key]! } : s;
  // group matches name their players directly: whoever takes a seat takes over its matches
  const seats = p.boxes.filter((b) => b.kind === 'group').flatMap((b) => b.places.map((x) => x.key));
  const byOld = new Map(seats.map((k) => [original[k]!, draft[k]!]));
  const rename = (s: SlotSource): SlotSource =>
    s.kind === 'entry' && byOld.has(s.entryId) ? { kind: 'entry', entryId: byOld.get(s.entryId)! } : s;

  const next: DB = {
    ...db,
    groups: db.groups.map((g) => (g.eventId !== eventId ? g : { ...g, entryIds: g.entryIds.map((e, i) => draft[`${g.id}:${i}`] ?? e) })),
    matches: db.matches.map((m) => {
      if (m.eventId !== eventId || started(m)) return m;
      if (m.groupId) return { ...m, srcA: rename(m.srcA), srcB: rename(m.srcB) };
      return { ...m, srcA: swap(m.srcA, `${m.id}:a`), srcB: swap(m.srcB, `${m.id}:b`) };
    }),
  };
  const ev = db.events.find((e) => e.id === eventId);
  return { db: ev ? resolveTournament(next, ev.tournamentId) : next };
}

/**
 * Rebuild an event's knockout / drop-flight structure from edited first-round lines (empty places
 * become byes). Match ids stay the same where the structure does; numbers are reassigned inside
 * the event's existing range when they fit, otherwise from the tournament's next free number.
 */
function rebuildFromLines(db: DB, eventId: ID, draft: Seating): OpResult {
  const ev = db.events.find((e) => e.id === eventId);
  const t = ev && db.tournaments.find((x) => x.id === ev.tournamentId);
  const start = db.stages.find((s) => s.eventId === eventId && s.kind === 'knockout' && s.order === 0);
  if (!ev || !t || !start || ev.mode === 'round_robin') return { error: 'This draw has no byes to move.' };
  const r1 = db.matches.filter((m) => m.stageId === start.id && m.round === 1).sort((a, b) => a.index - b.index);
  const lines = r1.flatMap((m) => [draft[`${m.id}:a`] ?? 'BYE', draft[`${m.id}:b`] ?? 'BYE']);
  const playersOf = (id: ID) =>
    (db.entries.find((e) => e.id === id)?.playerIds ?? []).flatMap((pid) => db.players.find((x) => x.id === pid) ?? []);
  const plan = generateDraw({
    event: ev,
    entryIds: lines.filter((x): x is ID => x !== 'BYE'),
    seeds: 0,
    rngSeed: ev.drawSeed ?? 1,
    clubOf: (id) => entryClub(playersOf(id)),
    lines,
  });
  const resolved = resolveMatches(plan.matches, { groups: plan.groups, rulesFor: () => RULES[groupRulesId(ev)] });
  const count = assignNumbers(resolved, plan.stages, plan.groups, 0).next;
  const old = db.matches.filter((m) => m.eventId === eventId && m.number > 0).map((m) => m.number);
  const fits = old.length > 0 && count <= old.length;
  const { matches, next } = assignNumbers(resolved, plan.stages, plan.groups, fits ? Math.min(...old) : t.nextMatchNumber);
  const oldIds = new Set(db.matches.filter((m) => m.eventId === eventId).map((m) => m.id));
  const rebuilt: DB = {
    ...db,
    tournaments: fits ? db.tournaments : db.tournaments.map((x) => (x.id === t.id ? { ...x, nextMatchNumber: next } : x)),
    stages: [...db.stages.filter((s) => s.eventId !== eventId), ...plan.stages],
    matches: [...db.matches.filter((m) => m.eventId !== eventId), ...matches],
    updates: db.updates.filter((u) => !oldIds.has(u.matchId)),
  };
  return { db: resolveTournament(rebuilt, t.id) };
}
