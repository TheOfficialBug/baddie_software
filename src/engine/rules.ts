// Scoring presets and score validation (BWF Laws 7, 8, 16 + common club formats).
import type { GameScore, ID, Match, ResultType, RulesId, Side, SlotSource } from './types';

export interface ScoringRules {
  id: RulesId;
  label: string;
  short: string;
  bestOf: 1 | 3 | 5;
  pointsToWin: number;
  /** At cap, the next point wins. cap === pointsToWin means no deuce. */
  cap: number;
  intervalAt: number | null;
  note: string;
}

export const RULES: Record<RulesId, ScoringRules> = {
  BWF_3x21: {
    id: 'BWF_3x21',
    label: 'BWF 3×21',
    short: '3×21',
    bestOf: 3,
    pointsToWin: 21,
    cap: 30,
    intervalAt: 11,
    note: 'Best of 3 games to 21. At 20-all a 2-point lead wins; at 29-all the 30th point wins.',
  },
  BWF_3x15: {
    id: 'BWF_3x15',
    label: 'BWF 3×15',
    short: '3×15',
    bestOf: 3,
    pointsToWin: 15,
    cap: 21,
    intervalAt: 8,
    note: 'Best of 3 games to 15. At 14-all a 2-point lead wins; at 20-all the 21st point wins. BWF standard from 4 Jan 2027.',
  },
  ONE_21: {
    id: 'ONE_21',
    label: '1 game to 21',
    short: '1×21',
    bestOf: 1,
    pointsToWin: 21,
    cap: 30,
    intervalAt: 11,
    note: 'One game to 21 with BWF deuce and a cap at 30.',
  },
  ONE_15: {
    id: 'ONE_15',
    label: '1 game to 15',
    short: '1×15',
    bestOf: 1,
    pointsToWin: 15,
    cap: 21,
    intervalAt: 8,
    note: 'One game to 15 with deuce from 14-all and a cap at 21.',
  },
  ONE_30: {
    id: 'ONE_30',
    label: '1 game to 30',
    short: '1×30',
    bestOf: 1,
    pointsToWin: 30,
    cap: 30,
    intervalAt: 15,
    note: 'One game, first to 30 points wins.',
  },
  ONE_31: {
    id: 'ONE_31',
    label: '1 game to 31',
    short: '1×31',
    bestOf: 1,
    pointsToWin: 31,
    cap: 31,
    intervalAt: 16,
    note: 'One game to 31, first to 31 wins (common for recreational flights).',
  },
  ONE_11: {
    id: 'ONE_11',
    label: '1 game to 11',
    short: '1×11',
    bestOf: 1,
    pointsToWin: 11,
    cap: 15,
    intervalAt: 6,
    note: 'One game to 11 with deuce from 10-all and a cap at 15.',
  },
};

/** BWF switches its standard to 3×15 on Monday 4 January 2027. */
export const BWF_3X15_FROM = '2027-01-04';

export function defaultRulesForDate(isoDate: string): RulesId {
  return isoDate >= BWF_3X15_FROM ? 'BWF_3x15' : 'BWF_3x21';
}

export const gamesToWin = (r: ScoringRules) => Math.ceil(r.bestOf / 2);

export interface GameCheck {
  complete: boolean;
  valid: boolean;
  winner?: Side;
  message?: string;
}

/** Is (x, y) a legal finished game, a legal in-progress game, or impossible? */
export function checkGame([x, y]: GameScore, r: ScoringRules): GameCheck {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
    return { complete: false, valid: false, message: 'Scores must be whole numbers.' };
  }
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  const winner: Side = x > y ? 'a' : 'b';
  const { pointsToWin: P, cap: C } = r;

  if (hi > C) return { complete: false, valid: false, message: `No game can go past ${C}.` };

  if (C === P) {
    if (hi === P && lo < P) return { complete: true, valid: true, winner };
    if (hi === P) return { complete: false, valid: false, message: `${P}-${P} can't happen. The first to ${P} wins.` };
    return { complete: false, valid: true };
  }
  if (hi < P) return { complete: false, valid: true };
  if (hi === P) {
    if (lo <= P - 2) return { complete: true, valid: true, winner };
    // P-(P-1): still in deuce, game continues
    return { complete: false, valid: true };
  }
  // hi > P: we are past deuce
  const d = hi - lo;
  if (hi === C) {
    if (d === 1 || d === 2) return { complete: true, valid: true, winner };
    return { complete: false, valid: false, message: `${hi}-${lo} can't happen. At ${C - 1}-all the next point wins.` };
  }
  if (d === 2) return { complete: true, valid: true, winner };
  if (d <= 1) return { complete: false, valid: true };
  return {
    complete: false,
    valid: false,
    message: `${hi}-${lo} can't happen. Past ${P - 1}-all the game ends at a 2-point lead (e.g. ${lo + 2}-${lo}).`,
  };
}

export interface MatchCheck {
  ok: boolean;
  winner?: Side;
  errors: string[];
  /** Per-game messages, indexed like the input */
  gameErrors: (string | undefined)[];
  summary?: string;
}

/**
 * Validate a full match result.
 * - normal: every game must be a finished game and the match must be decided.
 * - retired: the retiring side loses; the last game may be unfinished.
 * - walkover / dq: games are optional; `declaredWinner` decides.
 */
export function checkMatch(games: GameScore[], r: ScoringRules, result: ResultType = 'normal', declaredWinner?: Side): MatchCheck {
  const need = gamesToWin(r);
  const gameErrors: (string | undefined)[] = [];
  const errors: string[] = [];
  let wa = 0;
  let wb = 0;
  let decidedAt = -1;

  games.forEach((g, i) => {
    const c = checkGame(g, r);
    if (!c.valid) {
      gameErrors[i] = c.message;
      return;
    }
    const isLast = i === games.length - 1;
    if (!c.complete) {
      if (result === 'retired' && isLast) return;
      if (result === 'dq' && isLast) return;
      gameErrors[i] =
        g[0] === g[1] && g[0] === 0
          ? 'Enter this game or remove it.'
          : `${Math.max(...g)}-${Math.min(...g)} isn't a finished game${suggest(g, r)}`;
      return;
    }
    if (decidedAt >= 0) {
      gameErrors[i] = 'The match was already decided before this game.';
      return;
    }
    if (c.winner === 'a') wa++;
    else wb++;
    if (wa === need || wb === need) decidedAt = i;
  });

  if (gameErrors.some(Boolean)) errors.push('Fix the highlighted games.');

  if (result === 'normal') {
    if (!errors.length && decidedAt < 0) {
      errors.push(games.length === 0 ? 'Enter the game scores.' : `Nobody has won ${need} game${need > 1 ? 's' : ''} yet.`);
    }
    const winner = wa > wb ? 'a' : 'b';
    return {
      ok: errors.length === 0,
      winner: errors.length ? undefined : winner,
      errors,
      gameErrors,
      summary: `${Math.max(wa, wb)}–${Math.min(wa, wb)}`,
    };
  }

  if (!declaredWinner) errors.push(result === 'retired' ? 'Choose who retired.' : 'Choose the winner.');
  if (result === 'retired' && decidedAt >= 0) errors.push('The match was already decided, so this is a normal result.');
  return { ok: errors.length === 0, winner: declaredWinner, errors, gameErrors };
}

function suggest([x, y]: GameScore, r: ScoringRules): string {
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  if (r.cap === r.pointsToWin) return '.';
  if (hi === r.pointsToWin && lo === r.pointsToWin - 1) {
    const fixed = Math.min(lo + 2, r.cap);
    return `. Did you mean ${fixed}-${lo}?`;
  }
  if (hi < r.pointsToWin) return ` (first to ${r.pointsToWin}).`;
  return '.';
}

/** In-progress (live) score: must be reachable and not finished. */
export function checkLive(g: GameScore, r: ScoringRules): { valid: boolean; complete: boolean } {
  const c = checkGame(g, r);
  return { valid: c.valid, complete: c.complete };
}

/** "21-15 18-21, 21:19" → [[21,15],[18,21],[21,19]] */
export function parseQuickScore(text: string): GameScore[] {
  const out: GameScore[] = [];
  const re = /(\d{1,2})\s*[-–—:/]\s*(\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

export function formatGames(games: GameScore[], perspective: Side = 'a'): string {
  return games.map(([x, y]) => (perspective === 'a' ? `${x}-${y}` : `${y}-${x}`)).join(', ');
}

/** Walkover score some local events record: pointsToWin-0 per game needed. */
export function walkoverGames(r: ScoringRules, winner: Side): GameScore[] {
  return Array.from({ length: gamesToWin(r) }, () => (winner === 'a' ? [r.pointsToWin, 0] : [0, r.pointsToWin]) as GameScore);
}

type MatchLink = Pick<Match, 'srcA' | 'srcB' | 'a' | 'b'>;

/** A match nobody played: one or both sides were byes. */
const isByeMatch = (m: MatchLink) => m.srcA.kind === 'bye' || m.srcB.kind === 'bye' || m.a === 'BYE' || m.b === 'BYE';

/**
 * Whether the player who fills a slot hasn't played a match in the event before: they start here,
 * or got here only through byes. Winners and losers of a played match, and players coming out of
 * the groups, have already played.
 */
export function isFirstMatchSlot(src: SlotSource, match: (id: ID) => MatchLink | undefined, depth = 0): boolean {
  if (src.kind === 'entry') return true;
  if (src.kind !== 'winner' || depth > 8) return false;
  const from = match(src.matchId);
  if (!from || !isByeMatch(from)) return false;
  // the bye match's winner is whoever was on its real side
  const real = from.srcA.kind !== 'bye' && from.a !== 'BYE' ? from.srcA : from.srcB.kind !== 'bye' && from.b !== 'BYE' ? from.srcB : null;
  return !!real && isFirstMatchSlot(real, match, depth + 1);
}

/**
 * Which scoring a match uses. Events can play each player's first match shorter (e.g. one game
 * to 30) and everything after it best of 3 to 21.
 *  - Knockout / drop flight: a match uses the first-match format when either player hasn't played
 *    in the event yet, so a player with a bye still gets it in their first real match (even when
 *    their opponent has played). Players who drop to a lower flight or the plate, and the 3rd-place
 *    match, use the main rules.
 *  - Round robin: every group match; the knockout after the groups uses the main rules.
 */
export function rulesIdForMatch(
  ev: { rules: RulesId; mode: 'round_robin' | 'drop_flight' | 'knockout'; config: { firstRound?: RulesId } },
  stage: { kind: 'group' | 'knockout'; name: string } | undefined,
  m: MatchLink,
  match: (id: ID) => MatchLink | undefined,
): RulesId {
  const fr = ev.config.firstRound;
  if (!fr || !stage) return ev.rules;
  if (ev.mode === 'round_robin') return stage.kind === 'group' ? fr : ev.rules;
  return isFirstMatchSlot(m.srcA, match) || isFirstMatchSlot(m.srcB, match) ? fr : ev.rules;
}

/** Scoring used in round-robin groups (for standings). */
export function groupRulesId(ev: { rules: RulesId; mode: string; config: { firstRound?: RulesId } }): RulesId {
  return ev.mode === 'round_robin' && ev.config.firstRound ? ev.config.firstRound : ev.rules;
}

/** "1×30 first round, then 3×21" or just "3×21". */
export function rulesSummary(ev: { rules: RulesId; mode: string; config: { firstRound?: RulesId } }): string {
  const fr = ev.config.firstRound;
  if (!fr || fr === ev.rules) return RULES[ev.rules].short;
  return `${RULES[fr].short} ${ev.mode === 'round_robin' ? 'groups' : 'first match'}, then ${RULES[ev.rules].short}`;
}
