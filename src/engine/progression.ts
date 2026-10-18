// Resolves who plays in each match from its slot sources, auto-completes byes,
// numbers matches, and finds downstream matches affected by a result change.
import type { ScoringRules } from './rules';
import { computeStandings } from './standings';
import type { Group, ID, Match, Slot, SlotSource, Stage } from './types';

export interface ResolveContext {
  groups: Group[];
  rulesFor: (eventId: ID) => ScoringRules;
}

/** Returns new match objects with a/b/status/winner brought up to date. Pure. */
export function resolveMatches(matches: Match[], ctx: ResolveContext): Match[] {
  const byId = new Map(matches.map((m) => [m.id, { ...m }]));
  const parent = parentMap(matches);
  const groupMatches = new Map<ID, Match[]>();
  const groupById = new Map(ctx.groups.map((g) => [g.id, g]));
  const groupRankCache = new Map<ID, ID[] | null>();

  const groupRanking = (gid: ID): ID[] | null => {
    if (groupRankCache.has(gid)) return groupRankCache.get(gid)!;
    const g = groupById.get(gid);
    const ms = groupMatches.get(gid) ?? [];
    if (!g || !ms.length || !ms.every((m) => m.status === 'finished')) {
      groupRankCache.set(gid, null);
      return null;
    }
    const st = computeStandings(gid, g.entryIds, ms, ctx.rulesFor(g.eventId));
    const ids = st.rows.map((r) => r.entryId);
    groupRankCache.set(gid, ids);
    return ids;
  };

  const out = (m: Match | undefined, want: 'winner' | 'loser'): Slot => {
    if (!m) return null;
    if (m.status === 'bye') {
      if (want === 'loser') return 'BYE';
      return m.winner ? (m[m.winner] as Slot) : 'BYE';
    }
    if (m.status !== 'finished' || !m.winner) return null;
    const side = want === 'winner' ? m.winner : m.winner === 'a' ? 'b' : 'a';
    return m[side];
  };

  const resolve = (s: SlotSource): Slot => {
    switch (s.kind) {
      case 'entry':
        return s.entryId;
      case 'bye':
        return 'BYE';
      case 'winner':
        return out(byId.get(s.matchId), 'winner');
      case 'loser': {
        const m = byId.get(s.matchId);
        const l = out(m, 'loser');
        if (!s.nth || !m || l === null || l === 'BYE') return l;
        // how many real matches the loser had played in this flight, this one included
        let n = 1;
        for (const x of byId.values())
          if (
            x.stageId === m.stageId &&
            x.round < m.round &&
            x.status === 'finished' &&
            x.a !== 'BYE' &&
            x.b !== 'BYE' &&
            (x.a === l || x.b === l)
          )
            n++;
        return n === s.nth ? l : 'BYE';
      }
      case 'drop':
        return dropOf(s.matchId, s.nth);
      case 'group': {
        const r = groupRanking(s.groupId);
        if (!r) return null;
        return r[s.rank - 1] ?? 'BYE';
      }
    }
  };

  /** Follow the players of first-round match `origin` up its bracket: who loses their nth real match there. */
  const dropOf = (origin: ID, nth: number): Slot => {
    let cur = byId.get(origin);
    if (!cur) return null;
    if (cur.a === null || cur.b === null) return null;
    let alive = [cur.a, cur.b].filter((x): x is ID => x !== 'BYE');
    if (!alive.length) return 'BYE';
    const played = new Map<ID, number>();
    while (cur) {
      const here = alive.filter((c) => c === cur!.a || c === cur!.b);
      if (!here.length) return cur.a === null || cur.b === null ? null : 'BYE';
      alive = here;
      if (cur.a === null || cur.b === null) return null;
      if (cur.a !== 'BYE' && cur.b !== 'BYE') {
        if (cur.status !== 'finished' || !cur.winner) return null;
        const w = cur[cur.winner] as ID;
        const l = cur[cur.winner === 'a' ? 'b' : 'a'] as ID;
        for (const c of alive) played.set(c, (played.get(c) ?? 0) + 1);
        if (alive.includes(l) && played.get(l) === nth) return l;
        alive = alive.filter((c) => c === w);
        if (!alive.length || (played.get(w) ?? 0) >= nth) return 'BYE';
      }
      const up = parent.get(cur.id);
      cur = up ? byId.get(up) : undefined;
    }
    return 'BYE';
  };

  for (let pass = 0; pass < matches.length + 2; pass++) {
    groupMatches.clear();
    groupRankCache.clear();
    for (const m of byId.values()) if (m.groupId) groupMatches.set(m.groupId, [...(groupMatches.get(m.groupId) ?? []), m]);

    let changed = false;
    for (const m of byId.values()) {
      const a = resolve(m.srcA);
      const b = resolve(m.srcB);
      const before = `${m.a}|${m.b}|${m.status}|${m.winner}`;
      m.a = a;
      m.b = b;
      if (m.status === 'finished' || m.status === 'on_court') {
        // keep; edits upstream are guarded by `dependents`
      } else if (a !== null && b !== null && (a === 'BYE' || b === 'BYE')) {
        m.status = 'bye';
        m.winner = a !== 'BYE' ? 'a' : b !== 'BYE' ? 'b' : undefined;
        m.number = 0;
      } else if (a !== null && b !== null) {
        m.status = 'ready';
        m.winner = undefined;
      } else {
        m.status = 'pending';
        m.winner = undefined;
      }
      if (`${m.a}|${m.b}|${m.status}|${m.winner}` !== before) changed = true;
    }
    if (!changed) break;
  }
  return matches.map((m) => byId.get(m.id)!);
}

/** Depth of each match in the dependency graph (entries/byes = 0). Used for chronological numbering. */
function layers(matches: Match[], groups: Group[]): Map<ID, number> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const groupLayer = new Map<ID, number>();
  const memo = new Map<ID, number>();
  const srcLayer = (s: SlotSource): number => {
    if (s.kind === 'winner' || s.kind === 'loser') return layerOf(byId.get(s.matchId)!);
    if (s.kind === 'drop') return layerOf(byId.get(s.matchId)!) + s.nth;
    if (s.kind === 'group') {
      if (!groupLayer.has(s.groupId)) {
        const ms = matches.filter((m) => m.groupId === s.groupId);
        groupLayer.set(s.groupId, Math.max(0, ...ms.map(layerOf)));
      }
      return groupLayer.get(s.groupId)!;
    }
    return 0;
  };
  const layerOf = (m: Match): number => {
    if (memo.has(m.id)) return memo.get(m.id)!;
    const l = 1 + Math.max(srcLayer(m.srcA), srcLayer(m.srcB));
    memo.set(m.id, l);
    return l;
  };
  matches.forEach(layerOf);
  void groups;
  return memo;
}

/** Give every playable match a tournament-wide number, in a sensible order of play. Byes get 0. */
export function assignNumbers(matches: Match[], stages: Stage[], groups: Group[], start: number): { matches: Match[]; next: number } {
  const L = layers(matches, groups);
  const stageOrder = new Map(stages.map((s) => [s.id, s.order]));
  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const sorted = matches
    // matches with a structural bye (e.g. "Group A winner vs bye") never get played
    .filter((m) => m.status !== 'bye' && m.srcA.kind !== 'bye' && m.srcB.kind !== 'bye')
    .sort(
      (x, y) =>
        L.get(x.id)! - L.get(y.id)! ||
        (stageOrder.get(x.stageId) ?? 0) - (stageOrder.get(y.stageId) ?? 0) ||
        (x.groupId ? x.index : x.round * 1000 + x.index) - (y.groupId ? y.index : y.round * 1000 + y.index) ||
        (groupOrder.get(x.groupId ?? '') ?? 0) - (groupOrder.get(y.groupId ?? '') ?? 0),
    );
  let n = start;
  const num = new Map(sorted.map((m) => [m.id, n++]));
  return { matches: matches.map((m) => ({ ...m, number: num.get(m.id) ?? 0 })), next: n };
}

/** Match → the match its winner moves on to. */
function parentMap(matches: Match[]): Map<ID, ID> {
  const up = new Map<ID, ID>();
  for (const m of matches) for (const s of [m.srcA, m.srcB]) if (s.kind === 'winner') up.set(s.matchId, m.id);
  return up;
}

/** The matches a drop source watches: its first-round match and every match its winner can reach. */
export function dropPath(origin: ID, matches: Match[]): ID[] {
  const up = parentMap(matches);
  const path: ID[] = [];
  for (let id: ID | undefined = origin; id; id = up.get(id)) path.push(id);
  return path;
}

/** Matches whose participants depend on this match's result (directly or through byes / groups). */
export function dependents(matchId: ID, matches: Match[]): Match[] {
  const target = matches.find((m) => m.id === matchId);
  const watches = (s: SlotSource) => s.kind === 'drop' && dropPath(s.matchId, matches).includes(matchId);
  const direct = matches.filter(
    (m) =>
      ((m.srcA.kind === 'winner' || m.srcA.kind === 'loser') && m.srcA.matchId === matchId) ||
      ((m.srcB.kind === 'winner' || m.srcB.kind === 'loser') && m.srcB.matchId === matchId) ||
      watches(m.srcA) ||
      watches(m.srcB) ||
      (!!target?.groupId &&
        ((m.srcA.kind === 'group' && m.srcA.groupId === target.groupId) || (m.srcB.kind === 'group' && m.srcB.groupId === target.groupId))),
  );
  const out = [...direct];
  for (const d of direct) if (d.status === 'bye') out.push(...dependents(d.id, matches));
  return out;
}

/** Downstream matches that have started or finished (these block editing a result). */
export function blockingDependents(matchId: ID, matches: Match[]): Match[] {
  return dependents(matchId, matches).filter((m) => m.status === 'finished' || m.status === 'on_court');
}
