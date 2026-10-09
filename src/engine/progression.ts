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
      case 'loser':
        return out(byId.get(s.matchId), 'loser');
      case 'group': {
        const r = groupRanking(s.groupId);
        if (!r) return null;
        return r[s.rank - 1] ?? 'BYE';
      }
    }
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

/** Matches whose participants depend on this match's result (directly or through byes / groups). */
export function dependents(matchId: ID, matches: Match[]): Match[] {
  const target = matches.find((m) => m.id === matchId);
  const direct = matches.filter(
    (m) =>
      ((m.srcA.kind === 'winner' || m.srcA.kind === 'loser') && m.srcA.matchId === matchId) ||
      ((m.srcB.kind === 'winner' || m.srcB.kind === 'loser') && m.srcB.matchId === matchId) ||
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
