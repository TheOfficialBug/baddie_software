import { describe, expect, it } from 'vitest';

import { checkGame, checkMatch, groupRulesId, isFirstMatchSlot, RULES, rulesIdForMatch, rulesSummary } from './rules';
import type { Match, SlotSource } from './types';

const ko = { kind: 'knockout' as const, name: 'Main draw' };
const flightC = { kind: 'knockout' as const, name: 'C flight' };
const third = { kind: 'knockout' as const, name: '3rd place' };
const group = { kind: 'group' as const, name: 'Groups' };

describe('opening-round scoring', () => {
  const ev = (mode: 'knockout' | 'drop_flight' | 'round_robin', firstRound?: 'ONE_30') => ({
    rules: 'BWF_3x21' as const,
    mode,
    config: { firstRound },
  });

  // A small bracket. Round 1: #1 e1 v e2 (played), #2 e3 v bye, #3 e5 v e6 (played), #4 e7 v bye.
  const entry = (entryId: string): SlotSource => ({ kind: 'entry', entryId });
  const bye: SlotSource = { kind: 'bye' };
  const winner = (matchId: string): SlotSource => ({ kind: 'winner', matchId });
  const loser = (matchId: string): SlotSource => ({ kind: 'loser', matchId });
  const link = (srcA: SlotSource, srcB: SlotSource) => ({
    srcA,
    srcB,
    a: srcA.kind === 'bye' ? ('BYE' as const) : null,
    b: srcB.kind === 'bye' ? ('BYE' as const) : null,
  });
  const bracket: Record<string, Pick<Match, 'srcA' | 'srcB' | 'a' | 'b'>> = {
    m1: link(entry('e1'), entry('e2')),
    m2: link(entry('e3'), bye),
    m3: link(entry('e5'), entry('e6')),
    m4: link(entry('e7'), bye),
    // lower flight: a loser of #1 drops into a bye (the bye match #2 has no loser)
    b1: link(loser('m1'), loser('m2')),
  };
  bracket.b1 = { ...bracket.b1, b: 'BYE' };
  const find = (id: string) => bracket[id];
  const rulesOf = (mode: 'knockout' | 'drop_flight', srcA: SlotSource, srcB: SlotSource, st = ko) =>
    rulesIdForMatch(ev(mode, 'ONE_30'), st, link(srcA, srcB), find);

  it("uses the first-match format in every player's first match", () => {
    expect(rulesOf('knockout', entry('e1'), entry('e2'))).toBe('ONE_30');
  });

  it('a player who had a bye plays their first real match in it, even against someone who has played', () => {
    expect(rulesOf('knockout', winner('m1'), winner('m2'))).toBe('ONE_30');
    // two players who both had byes
    expect(rulesOf('knockout', winner('m2'), winner('m4'))).toBe('ONE_30');
    expect(isFirstMatchSlot(winner('m2'), find)).toBe(true);
  });

  it('after both players have played, the main rules apply', () => {
    expect(rulesOf('knockout', winner('m1'), winner('m3'))).toBe('BWF_3x21');
  });

  it('players who drop to a lower flight or the plate have played, so the main rules apply', () => {
    expect(rulesOf('drop_flight', loser('m1'), loser('m3'), flightC)).toBe('BWF_3x21');
    // the winner of a bye in a lower flight is a dropped player, not a new one
    expect(isFirstMatchSlot(winner('b1'), find)).toBe(false);
    expect(rulesOf('drop_flight', winner('b1'), loser('m3'), flightC)).toBe('BWF_3x21');
  });

  it('never applies to the 3rd place match', () => {
    expect(rulesOf('knockout', loser('m1'), loser('m3'), third)).toBe('BWF_3x21');
  });

  it('round robin: all group matches use it, the knockout after the groups does not', () => {
    const fromGroups = link({ kind: 'group', groupId: 'g1', rank: 1 }, { kind: 'group', groupId: 'g2', rank: 2 });
    expect(rulesIdForMatch(ev('round_robin', 'ONE_30'), group, link(entry('e1'), entry('e2')), find)).toBe('ONE_30');
    expect(rulesIdForMatch(ev('round_robin', 'ONE_30'), ko, fromGroups, find)).toBe('BWF_3x21');
    expect(groupRulesId(ev('round_robin', 'ONE_30'))).toBe('ONE_30');
    expect(groupRulesId(ev('knockout', 'ONE_30'))).toBe('BWF_3x21');
  });

  it('without an opening format everything uses the main rules', () => {
    expect(rulesIdForMatch(ev('knockout'), ko, link(entry('e1'), entry('e2')), find)).toBe('BWF_3x21');
    expect(rulesSummary(ev('knockout'))).toBe('3×21');
    expect(rulesSummary(ev('knockout', 'ONE_30'))).toBe('1×30 first match, then 3×21');
    expect(rulesSummary(ev('round_robin', 'ONE_30'))).toBe('1×30 groups, then 3×21');
  });

  it('one game to 30: first to 30 wins, one game decides the match', () => {
    const r = RULES.ONE_30;
    expect(checkGame([30, 28], r)).toMatchObject({ complete: true, valid: true, winner: 'a' });
    expect(checkGame([29, 30], r)).toMatchObject({ complete: true, valid: true, winner: 'b' });
    expect(checkGame([29, 29], r)).toMatchObject({ complete: false, valid: true });
    expect(checkGame([31, 29], r).valid).toBe(false);
    expect(checkMatch([[30, 21]], r)).toMatchObject({ ok: true, winner: 'a' });
    expect(
      checkMatch(
        [
          [30, 21],
          [30, 10],
        ],
        r,
      ).ok,
    ).toBe(false);
  });
});
