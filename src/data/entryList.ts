// Entry lists in and out of a tournament, as spreadsheets laid out like the "Players" export of
// tournamentsoftware.com: one row per player with their club, levels, the events they entered and
// an "Entry Info" cell naming each doubles partner ("Men's Doubles Jane Doe (12345)").
// Partners are typed by hand, so they are matched by name with some tolerance for typos and
// short names, preferring pairs where each player names the other.
import type { Entry, EventKind, Gender, ID, Player, SkillLevel, TEvent } from '@/engine/types';

import { KIND_LABEL } from '@/data/catalog';
import { isDoubles } from '@/data/eligibility';
import { uid } from '@/data/ops';
import type { DB } from '@/data/types';

/** One event line from a player's row. */
export interface ListLine {
  event: string;
  /** Partner as typed (doubles), '' when none was given. */
  partner: string;
  withdrawn: boolean;
}

export interface ListPlayer {
  /** Spreadsheet row number (1-based), for messages. */
  row: number;
  first: string;
  last: string;
  name: string;
  gender: Gender;
  club: string;
  birthYear?: number;
  singlesLevel?: SkillLevel;
  doublesLevel?: SkillLevel;
  lines: ListLine[];
}

export interface EntryList {
  players: ListPlayer[];
  /** Rows that could not be read. */
  skipped: string[];
}

export interface ImportSummary {
  eventId: ID;
  name: string;
  /** Entries taking part (not withdrawn). */
  entries: number;
  withdrawn: number;
  /** Doubles entries whose partner is not a player on the list. */
  namedPartners: number;
}

export interface ImportPlan {
  /** Why the import can't go ahead (nothing changes). */
  blocked?: string;
  /** Every player on the list, existing records reused. */
  players: Player[];
  newPlayers: number;
  updatedPlayers: number;
  /** The tournament's entries after the import. */
  entries: Entry[];
  /** Current entries that the list no longer has. */
  removedEntries: number;
  events: ImportSummary[];
  warnings: string[];
}

/** Column headings, as tournamentsoftware.com writes them. */
export const LIST_COLUMNS = [
  'No.',
  'Name',
  'Firstname',
  'City',
  'State',
  'Country',
  'DOB',
  'Gender',
  'Club',
  'Level1',
  'Level2',
  'Ev.',
  'Events',
  'Entry Info',
] as const;

const PARTNER_TBC = 'Partner to be confirmed';
const NO_CLUB = new Set(['', '-', 'n/a', 'na', 'none', 'no club', 'no', 'nil']);

// ---------- names ----------

/** Lower-case words without accents or punctuation. */
const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const norm = (s: string) => words(s).join(' ');

/** Edit distance where swapping two neighbouring letters counts once. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** How well one typed word matches one word of a name: 1 the same, less for short forms and typos. */
function wordScore(typed: string, word: string): number {
  if (typed === word) return 1;
  const shorter = Math.min(typed.length, word.length);
  if (shorter >= 3 && (word.startsWith(typed) || typed.startsWith(word))) return 0.8; // Ben → Benjamin
  if (shorter >= 4) {
    const d = distance(typed, word);
    if (d <= 1) return 0.8;
    if (d <= 2 && shorter >= 6) return 0.6;
  }
  return 0;
}

/** How well a typed partner name matches a player: about 1 per matching word (0 = not them). */
export function nameScore(typed: string, name: string): number {
  const have = words(name);
  let score = 0;
  for (const w of words(typed).filter((x) => x.length > 1)) {
    let best = -1;
    have.forEach((h, i) => {
      if (best < 0 || wordScore(w, h) > wordScore(w, have[best])) best = i;
    });
    if (best >= 0 && wordScore(w, have[best]) > 0) {
      score += wordScore(w, have[best]);
      have.splice(best, 1);
    }
  }
  return score;
}

/** A typed name this good is clearly that player even if they didn't list the event. */
const CERTAIN = 1.6;

// ---------- reading a list ----------

const LEVELS = new Set(['A', 'B', 'C', 'D']);
const level = (s?: string): SkillLevel | undefined => {
  const l = s?.trim().toUpperCase();
  return l && LEVELS.has(l) ? (l as SkillLevel) : undefined;
};

/** Year of birth from a date cell: a spreadsheet date number, a year, or text like 3/14/1994. */
function birthYearOf(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (Number.isFinite(n)) {
    if (n >= 1900 && n <= 2100) return Math.round(n);
    if (n > 0 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).getUTCFullYear();
    return undefined;
  }
  const y = /\b(19|20)\d{2}\b/.exec(t);
  return y ? Number(y[0]) : undefined;
}

function genderOf(s: string): Gender | undefined {
  const g = s.trim().toLowerCase();
  if (g === 'm' || g === 'male' || g === 'man' || g === 'men') return 'M';
  if (g === 'f' || g === 'w' || g === 'female' || g === 'woman' || g === 'women') return 'F';
  return undefined;
}

/** The event a line or name refers to, from its words (men's / women's / mixed, singles / doubles). */
export function kindOfName(name: string): EventKind | undefined {
  const n = norm(name);
  const exact = (['MS', 'WS', 'MD', 'WD', 'XD'] as const).find((k) => n === k.toLowerCase());
  if (exact) return exact;
  const singles = /\bsingles?\b/.test(n);
  const doubles = /\bdoubles?\b/.test(n);
  if (/\bmixed\b/.test(n)) return 'XD';
  if (/\b(women|womens|ladies|girls)\b/.test(n)) return singles ? 'WS' : doubles ? 'WD' : undefined;
  if (/\b(men|mens|boys)\b/.test(n)) return singles ? 'MS' : doubles ? 'MD' : undefined;
  return undefined;
}

/** Split one "Entry Info" line into event, partner and withdrawn flag. */
function parseLine(line: string, eventNames: string[]): ListLine | undefined {
  let rest = line.trim();
  if (!rest) return undefined;
  const withdrawn = /\[withdrawn\]/i.test(rest);
  rest = rest.replace(/\[[^\]]*\]/g, '').trim();
  const lower = rest.toLowerCase();
  let event = eventNames.find((e) => lower === e.toLowerCase() || lower.startsWith(e.toLowerCase() + ' '));
  if (!event) event = /^(.*?\b(?:singles?|doubles?))\b/i.exec(rest)?.[1];
  if (!event) return undefined;
  // partner, without the member number in brackets: "Jane Doe (12345)"
  const partner = rest
    .slice(event.length)
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { event: event.trim(), partner, withdrawn };
}

/** Read the rows of an entry list. Throws when the column headings can't be found. */
export function parseEntryList(rows: string[][], knownEvents: string[] = []): EntryList {
  const at = rows.findIndex((r) => {
    const h = r.map((c) => norm(c ?? ''));
    return h.includes('gender') && (h.includes('firstname') || h.includes('first name')) && h.includes('name');
  });
  if (at < 0) throw new Error('No column headings found. The sheet needs at least Name, Firstname and Gender columns.');
  const head = rows[at].map((c) => norm(c ?? ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const c = {
    last: col('name', 'last name', 'surname', 'lastname'),
    first: col('firstname', 'first name'),
    dob: col('dob', 'date of birth', 'birth year', 'year of birth'),
    gender: col('gender', 'sex'),
    club: col('club'),
    level1: col('level1', 'level 1', 'singles level'),
    level2: col('level2', 'level 2', 'doubles level'),
    events: col('events'),
    info: col('entry info', 'entries'),
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  // event names used on the list, longest first so "Mixed Doubles" wins over shorter prefixes
  const names = new Set([...knownEvents, ...Object.values(KIND_LABEL)]);
  for (const r of rows.slice(at + 1)) for (const e of cell(r, c.events).split(',')) if (e.trim()) names.add(e.trim());
  const eventNames = [...names].sort((a, b) => b.length - a.length);

  const players: ListPlayer[] = [];
  const skipped: string[] = [];
  rows.slice(at + 1).forEach((r, i) => {
    const row = at + i + 2;
    let last = cell(r, c.last);
    let first = cell(r, c.first);
    if (last === '-') last = '';
    if (!first && !last) {
      if (r.some((x) => x?.trim())) skipped.push(`Row ${row}: no name.`);
      return;
    }
    if (!first) [first, last] = [last, ''];
    const name = `${first} ${last}`.trim().replace(/\s+/g, ' ');
    const gender = genderOf(cell(r, c.gender));
    if (!gender) {
      skipped.push(`Row ${row}: ${name} has no gender (M or F).`);
      return;
    }
    const lines = cell(r, c.info)
      .split(/\r?\n/)
      .map((l) => parseLine(l, eventNames))
      .filter((l): l is ListLine => !!l);
    // events listed but missing from Entry Info still count, without a partner
    for (const e of cell(r, c.events).split(',')) {
      const ev = e.trim();
      if (ev && !lines.some((l) => !l.withdrawn && norm(l.event) === norm(ev))) lines.push({ event: ev, partner: '', withdrawn: false });
    }
    const club = cell(r, c.club);
    players.push({
      row,
      first,
      last,
      name,
      gender,
      club: NO_CLUB.has(club.toLowerCase()) ? 'No club' : club,
      birthYear: birthYearOf(cell(r, c.dob)),
      singlesLevel: level(cell(r, c.level1)),
      doublesLevel: level(cell(r, c.level2)),
      lines,
    });
  });
  return { players, skipped };
}

// ---------- planning an import ----------

/** The tournament event a list's event name means: same name, else the only event of that kind. */
function findEvent(events: TEvent[], name: string): TEvent | undefined {
  const n = norm(name);
  const same = events.find((e) => norm(e.name) === n);
  if (same) return same;
  const kind = kindOfName(name);
  const ofKind = events.filter((e) => e.kind === kind);
  return ofKind.length === 1 ? ofKind[0] : ofKind.find((e) => norm(e.name).includes(n));
}

const pairOk = (kind: EventKind, a: Gender, b: Gender) =>
  kind === 'MD' ? a === 'M' && b === 'M' : kind === 'WD' ? a === 'F' && b === 'F' : a !== b;

interface Wanted {
  ev: TEvent;
  players: number[]; // indexes into the list
  levels: SkillLevel[];
  pending?: Entry['pendingPartner'];
  withdrawn: boolean;
}

/** What importing a list into a tournament would do. Nothing is changed. */
export function planImport(db: DB, tournamentId: ID, list: EntryList): ImportPlan {
  const events = db.events.filter((e) => e.tournamentId === tournamentId);
  const eventIds = new Set(events.map((e) => e.id));
  const current = db.entries.filter((e) => eventIds.has(e.eventId));
  const warnings: string[] = [...list.skipped];
  const plan: ImportPlan = { players: [], newPlayers: 0, updatedPlayers: 0, entries: [], removedEntries: 0, events: [], warnings };

  if (events.some((e) => e.drawState === 'published') || db.matches.some((m) => eventIds.has(m.eventId)))
    return {
      ...plan,
      blocked: 'Some draws are already made. Importing replaces the entries, so reset the draws first (Settings → Reset).',
    };
  if (!list.players.length) return { ...plan, blocked: 'No players found in this file.' };

  // players: reuse a record with the same name and gender (e.g. from an earlier import)
  const t = db.tournaments.find((x) => x.id === tournamentId);
  const defaultBirthYear = Number((t?.startDate ?? new Date().toISOString()).slice(0, 4)) - 25;
  const byName = new Map(db.players.map((p) => [`${norm(p.name)}|${p.gender}`, p]));
  const seen = new Map<string, number>();
  plan.players = list.players.map((lp) => {
    const key = `${norm(lp.name)}|${lp.gender}`;
    if (seen.has(key)) {
      warnings.push(`${lp.name} is on the list twice (rows ${seen.get(key)} and ${lp.row}); their entries are combined.`);
      return byName.get(key)!;
    }
    seen.set(key, lp.row);
    const lvl = lp.singlesLevel ?? lp.doublesLevel;
    const old = byName.get(key);
    if (!old) {
      plan.newPlayers++;
      const p: Player = {
        id: uid('p'),
        name: lp.name,
        gender: lp.gender,
        club: lp.club,
        birthYear: lp.birthYear ?? defaultBirthYear,
        level: lvl ?? 'C',
      };
      byName.set(key, p);
      return p;
    }
    const next = { ...old, club: lp.club, level: lvl ?? old.level, birthYear: lp.birthYear ?? old.birthYear };
    if (next.club !== old.club || next.level !== old.level || next.birthYear !== old.birthYear) plan.updatedPlayers++;
    byName.set(key, next);
    return next;
  });
  // a duplicate row shares the first row's record
  const idOf = (i: number) => byName.get(`${norm(list.players[i].name)}|${list.players[i].gender}`)!.id;
  const singlesLevel = (i: number) => list.players[i].singlesLevel ?? list.players[i].doublesLevel ?? plan.players[i].level;
  const doublesLevel = (i: number) => list.players[i].doublesLevel ?? list.players[i].singlesLevel ?? plan.players[i].level;

  // event lines, grouped by tournament event
  const lines = new Map<ID, { i: number; line: ListLine }[]>();
  const missing = new Map<string, number>();
  list.players.forEach((lp, i) =>
    lp.lines.forEach((line) => {
      const ev = findEvent(events, line.event);
      if (!ev) missing.set(line.event, (missing.get(line.event) ?? 0) + 1);
      else lines.set(ev.id, [...(lines.get(ev.id) ?? []), { i, line }]);
    }),
  );
  for (const [name, n] of missing)
    warnings.push(
      `This tournament has no “${name}” event, so ${n} ${n === 1 ? 'entry was' : 'entries were'} left out. Add the event, then import again.`,
    );

  const wanted: Wanted[] = [];
  for (const ev of events) {
    const evLines = lines.get(ev.id) ?? [];
    if (!isDoubles(ev.kind)) {
      for (const { i, line } of evLines) wanted.push({ ev, players: [i], levels: [singlesLevel(i)], withdrawn: line.withdrawn });
      continue;
    }
    // pair players who name each other first, then players named by one side only
    const P = list.players;
    const options: { a: number; b: number; score: number }[] = [];
    evLines.forEach((x, ai) =>
      evLines.forEach((y, bi) => {
        if (bi <= ai || x.i === y.i || x.line.withdrawn !== y.line.withdrawn || !pairOk(ev.kind, P[x.i].gender, P[y.i].gender)) return;
        const score = nameScore(x.line.partner, P[y.i].name) + nameScore(y.line.partner, P[x.i].name);
        if (score >= 0.8) options.push({ a: ai, b: bi, score });
      }),
    );
    options.sort((p, q) => q.score - p.score);
    const partnerOf = new Map<number, number>();
    for (const o of options) {
      if (partnerOf.has(o.a) || partnerOf.has(o.b)) continue;
      partnerOf.set(o.a, o.b);
      partnerOf.set(o.b, o.a);
    }
    const label = (i: number) => `${P[i].name} (${ev.name})`;
    const takenInEvent = new Set(evLines.map((x) => x.i));
    evLines.forEach((x, ai) => {
      const bi = partnerOf.get(ai);
      if (bi !== undefined) {
        if (bi < ai) return;
        const y = evLines[bi];
        // one of them named someone else: the other's choice won, worth a check
        for (const [me, them] of [
          [x, y],
          [y, x],
        ])
          if (me.line.partner && nameScore(me.line.partner, P[them.i].name) < 0.8)
            warnings.push(
              `${label(me.i)}: named “${me.line.partner}” but was paired with ${P[them.i].name}, who named them. Check this pair.`,
            );
        // men first in mixed doubles
        const pair = ev.kind === 'XD' && P[x.i].gender === 'F' ? [y.i, x.i] : [x.i, y.i];
        wanted.push({ ev, players: pair, levels: pair.map(doublesLevel), withdrawn: x.line.withdrawn });
        return;
      }
      const typed = x.line.partner;
      // named a player on the list who didn't list this event
      const elsewhere = typed
        ? P.map((p, j) => ({ j, score: nameScore(typed, p.name) }))
            .filter(({ j, score }) => score >= CERTAIN && !takenInEvent.has(j) && pairOk(ev.kind, P[x.i].gender, P[j].gender))
            .sort((p, q) => q.score - p.score)[0]
        : undefined;
      if (elsewhere) {
        takenInEvent.add(elsewhere.j);
        const pair = ev.kind === 'XD' && P[x.i].gender === 'F' ? [elsewhere.j, x.i] : [x.i, elsewhere.j];
        wanted.push({ ev, players: pair, levels: pair.map(doublesLevel), withdrawn: x.line.withdrawn });
        warnings.push(`${label(x.i)}: paired with ${P[elsewhere.j].name}, who didn’t list ${ev.name}.`);
        return;
      }
      if (!x.line.withdrawn)
        warnings.push(
          typed
            ? `${label(x.i)}: partner “${typed}” isn’t a player on the list (or is already paired), so they’re kept as a named partner.`
            : `${label(x.i)}: no partner given.`,
        );
      wanted.push({
        ev,
        players: [x.i],
        levels: [doublesLevel(x.i)],
        pending: { name: typed || PARTNER_TBC, level: doublesLevel(x.i) },
        withdrawn: x.line.withdrawn,
      });
    });
  }

  // entries: keep the current record (id, seed, entry time) when the same players are entered
  const keyOf = (eventId: ID, ids: ID[], pending?: string) => `${eventId}|${[...ids].sort().join('+')}|${norm(pending ?? '')}`;
  const existing = new Map(current.map((e) => [keyOf(e.eventId, e.playerIds, e.pendingPartner?.name), e]));
  const now = Date.now();
  const used = new Set<string>();
  for (const w of wanted) {
    const playerIds = w.players.map(idOf);
    const key = keyOf(w.ev.id, playerIds, w.pending?.name);
    if (used.has(key)) continue; // a duplicate row
    used.add(key);
    const old = existing.get(key);
    const status: Entry['status'] = w.withdrawn ? 'withdrawn' : 'accepted';
    const entry: Entry = old
      ? { ...old, playerIds, levels: w.levels, status, pendingPartner: w.pending }
      : { id: uid('e'), eventId: w.ev.id, playerIds, status, levels: w.levels, pendingPartner: w.pending, createdAt: now };
    if (!entry.pendingPartner) delete entry.pendingPartner;
    plan.entries.push(entry);
  }
  plan.removedEntries = current.filter((e) => !used.has(keyOf(e.eventId, e.playerIds, e.pendingPartner?.name))).length;
  plan.events = events.map((ev) => {
    const es = plan.entries.filter((e) => e.eventId === ev.id);
    return {
      eventId: ev.id,
      name: ev.name,
      entries: es.filter((e) => e.status !== 'withdrawn').length,
      withdrawn: es.filter((e) => e.status === 'withdrawn').length,
      namedPartners: es.filter((e) => e.status !== 'withdrawn' && e.pendingPartner).length,
    };
  });
  return plan;
}

/** Replace a tournament's entries with a planned import. Players who drop out of it entirely are removed. */
export function applyImport(db: DB, tournamentId: ID, plan: ImportPlan): DB {
  if (plan.blocked) return db;
  const eventIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const entries = [...db.entries.filter((e) => !eventIds.has(e.eventId)), ...plan.entries];
  const entryIds = new Set(entries.map((e) => e.id));
  const inTournament = new Set(plan.entries.flatMap((e) => e.playerIds));
  const anywhere = new Set(entries.flatMap((e) => e.playerIds));
  // players who were only in this tournament's old entries and aren't on the list
  const before = new Set(db.entries.filter((e) => eventIds.has(e.eventId)).flatMap((e) => e.playerIds));
  const gone = (p: Player) => before.has(p.id) && !anywhere.has(p.id) && !p.userId;

  const updated = new Map(plan.players.map((p) => [p.id, p]));
  const players = db.players.filter((p) => !gone(p)).map((p) => updated.get(p.id) ?? p);
  for (const p of plan.players) if (!players.some((x) => x.id === p.id)) players.push(p);

  return {
    ...db,
    players,
    entries,
    registrations: db.registrations
      .map((r) => ({ ...r, entryIds: r.entryIds.filter((id) => entryIds.has(id)) }))
      .filter((r) => r.entryIds.length > 0),
    checkIns: db.checkIns.filter((c) => c.tournamentId !== tournamentId || inTournament.has(c.playerId)),
  };
}

// ---------- export ----------

/** "Kiara Sta Maria" → first name "Kiara", surname "Sta Maria". */
const splitName = (name: string): [string, string] => {
  const at = name.indexOf(' ');
  return at < 0 ? [name, ''] : [name.slice(0, at), name.slice(at + 1)];
};

/** A tournament's entry list as spreadsheet rows (title, blank line, headings, one row per player). */
export function exportRows(db: DB, tournamentId: ID): (string | number)[][] {
  const t = db.tournaments.find((x) => x.id === tournamentId);
  const events = db.events.filter((e) => e.tournamentId === tournamentId);
  const eventOf = new Map(events.map((e) => [e.id, e]));
  const entries = db.entries.filter((e) => eventOf.has(e.eventId));
  const playerOf = new Map(db.players.map((p) => [p.id, p]));
  const order = new Map(events.map((e, i) => [e.id, i]));

  const ids = [...new Set(entries.flatMap((e) => e.playerIds))].filter((id) => playerOf.has(id));
  const players = ids
    .map((id) => playerOf.get(id)!)
    .sort((a, b) => splitName(a.name)[1].localeCompare(splitName(b.name)[1]) || a.name.localeCompare(b.name));

  const rows: (string | number)[][] = [[t?.name ?? 'Entries'], ['Players'], [...LIST_COLUMNS]];
  players.forEach((p, n) => {
    const mine = entries
      .filter((e) => e.playerIds.includes(p.id))
      .sort(
        (a, b) => order.get(a.eventId)! - order.get(b.eventId)! || (a.status === 'withdrawn' ? 1 : 0) - (b.status === 'withdrawn' ? 1 : 0),
      );
    const active = mine.filter((e) => e.status !== 'withdrawn');
    const levelIn = (e?: Entry) => (e ? (e.levels?.[e.playerIds.indexOf(p.id)] ?? p.level) : '');
    const singles = mine.find((e) => !isDoubles(eventOf.get(e.eventId)!.kind));
    const doubles = mine.find((e) => isDoubles(eventOf.get(e.eventId)!.kind));
    const info = mine.map((e) => {
      const ev = eventOf.get(e.eventId)!;
      const partner = e.playerIds.filter((id) => id !== p.id).map((id) => playerOf.get(id)?.name)[0] ?? e.pendingPartner?.name;
      const named = partner && partner !== PARTNER_TBC ? ` ${partner}` : '';
      return `${ev.name}${isDoubles(ev.kind) ? named : ''}${e.status === 'withdrawn' ? ' [Withdrawn]' : ''}`;
    });
    const [first, last] = splitName(p.name);
    rows.push([
      n + 1,
      last,
      first,
      '',
      '',
      '',
      p.birthYear || '',
      p.gender,
      p.club === 'No club' ? '' : p.club,
      // Level1 also carries the general level of players without singles, so it survives a re-import
      levelIn(singles) || p.level,
      levelIn(doubles),
      active.length,
      active.map((e) => eventOf.get(e.eventId)!.name).join(', '),
      info.join('\n'),
    ]);
  });
  return rows;
}
