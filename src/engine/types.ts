// Core domain types shared by the engines, the store and the UI.

export type ID = string;
export type Side = 'a' | 'b';
export type Gender = 'M' | 'F';
/** Self-reported standard: A advanced … D beginner. Drives level-balanced draws. */
export type SkillLevel = 'A' | 'B' | 'C' | 'D';

export type EventKind = 'MS' | 'WS' | 'MD' | 'WD' | 'XD';
export type Mode = 'round_robin' | 'drop_flight' | 'knockout';
export type FlightLabel = 'A' | 'B' | 'C' | 'D';
export type DropVariant = 'AB' | 'ABCD';
export type ResultType = 'normal' | 'retired' | 'walkover' | 'dq';
export type RulesId = 'BWF_3x21' | 'BWF_3x15' | 'ONE_21' | 'ONE_15' | 'ONE_30' | 'ONE_31' | 'ONE_11';

/** pending: waiting on earlier results · ready: both sides known · on_court: called to a court
 *  finished: result saved · bye: resolved automatically (one or both sides are byes) */
export type MatchStatus = 'pending' | 'ready' | 'on_court' | 'finished' | 'bye';

export type GameScore = [number, number];

export type SlotSource =
  | { kind: 'entry'; entryId: ID }
  | { kind: 'bye' }
  | { kind: 'winner'; matchId: ID }
  | { kind: 'loser'; matchId: ID }
  | { kind: 'group'; groupId: ID; rank: number };

/** A resolved slot: an entry id, a bye, or not yet known (null). */
export type Slot = ID | 'BYE' | null;

export interface Player {
  id: ID;
  name: string;
  gender: Gender;
  club: string;
  birthYear: number;
  /** General level (singles level when the player entered singles). Entries can carry a level per event. */
  level: SkillLevel;
  email?: string;
  /** Account that owns this player record (signed-in players see their own matches). */
  userId?: ID;
  /** hidden strength used only by the demo simulator */
  strength?: number;
}

/** A doubles partner known by name only, until they register or the organizer links them. */
export interface PendingPartner {
  name: string;
  email?: string;
  level: SkillLevel;
}

export interface Entry {
  id: ID;
  eventId: ID;
  playerIds: ID[]; // 1 for singles, 2 for doubles
  status: 'accepted' | 'pending' | 'withdrawn';
  seed?: number;
  /** Each player's level for this event, in playerIds order (e.g. doubles can differ from singles). */
  levels?: SkillLevel[];
  /** Doubles partner named at registration who has not registered (yet). */
  pendingPartner?: PendingPartner;
  createdAt: number;
}

export interface EventConfig {
  /** Round robin */
  groupSize: number;
  advance: 0 | 1 | 2;
  /** Drop flight */
  variant: DropVariant;
  /** Knockout */
  thirdPlace: boolean;
  plate: boolean;
  /** Seeds (0 = BWF default for the entry count) */
  seeds: number;
  /** How unseeded entries are paired: by skill level (balanced/classic) or BWF draw by lot. Default balanced. */
  pairing?: 'balanced' | 'classic' | 'random';
  /** Scoring for the opening round only (e.g. one game to 30); later rounds use the event's rules. */
  firstRound?: RulesId;
}

export interface TEvent {
  id: ID;
  tournamentId: ID;
  kind: EventKind;
  name: string;
  minAge?: number; // masters: age reached this calendar year >= minAge
  maxAge?: number; // juniors: "U15" -> under 15 all calendar year
  level?: string;
  fee: number;
  cap: number;
  rules: RulesId;
  mode: Mode;
  config: EventConfig;
  drawState: 'none' | 'published';
  drawSeed?: number;
}

export interface Stage {
  id: ID;
  eventId: ID;
  kind: 'group' | 'knockout';
  name: string; // "Groups", "A flight", "Main draw", "Plate", "3rd place"
  flight?: FlightLabel;
  order: number;
  size: number; // draw size (knockout lines) or 0 for groups
  rounds: number;
}

export interface Group {
  id: ID;
  stageId: ID;
  eventId: ID;
  name: string; // "Group A"
  entryIds: ID[];
}

export interface Match {
  id: ID;
  eventId: ID;
  stageId: ID;
  groupId?: ID;
  number: number; // tournament-wide match number (0 for byes)
  round: number; // 1-based
  index: number; // 0-based position within the round
  srcA: SlotSource;
  srcB: SlotSource;
  a: Slot;
  b: Slot;
  status: MatchStatus;
  courtId?: ID;
  calledAt?: number;
  /** when play actually began (first point, or "Start" on the court card); duration = finishedAt - startedAt */
  startedAt?: number;
  finishedAt?: number;
  games: GameScore[];
  live?: GameScore | null;
  result?: ResultType;
  winner?: Side;
  /** Hints for the UI, e.g. "Loser → C flight" */
  loserTo?: string;
}

export interface Court {
  id: ID;
  name: string;
}

export interface Tournament {
  id: ID;
  slug: string;
  name: string;
  venue: string;
  city: string;
  startDate: string; // ISO date
  endDate: string;
  /** draft → registration (open) → closed (entries frozen, draws being made) → live → completed */
  status: 'draft' | 'registration' | 'closed' | 'live' | 'completed';
  regCloses?: string;
  rules: RulesId;
  /** default opening-round scoring for new events (e.g. one game to 30) */
  firstRound?: RulesId;
  restMinutes: number;
  courts: Court[];
  nextMatchNumber: number;
  /** Organization that runs it; its members are the tournament staff. */
  organizationId: ID;
  accent?: string;
  about?: string;
}

export interface MatchUpdate {
  id: ID;
  matchId: ID;
  at: number;
  label: string;
  before: Pick<Match, 'status' | 'games' | 'live' | 'result' | 'winner' | 'courtId' | 'finishedAt' | 'calledAt' | 'startedAt'>;
}

/** A generated (not yet published) draw. */
export interface DrawPlan {
  stages: Stage[];
  groups: Group[];
  matches: Match[];
  warnings: string[];
}
