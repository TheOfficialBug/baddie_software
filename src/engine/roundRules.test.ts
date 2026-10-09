import { describe, expect, it } from 'vitest';

import { checkGame, checkMatch, groupRulesId, RULES, rulesIdForMatch, rulesSummary } from './rules';

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

  it('knockout and drop flight: round 1 of every bracket uses the opening format, later rounds the main one', () => {
    expect(rulesIdForMatch(ev('knockout', 'ONE_30'), ko, 1)).toBe('ONE_30');
    expect(rulesIdForMatch(ev('knockout', 'ONE_30'), ko, 2)).toBe('BWF_3x21');
    expect(rulesIdForMatch(ev('drop_flight', 'ONE_30'), flightC, 1)).toBe('ONE_30');
    expect(rulesIdForMatch(ev('drop_flight', 'ONE_30'), flightC, 3)).toBe('BWF_3x21');
  });

  it('never applies to the 3rd place match', () => {
    expect(rulesIdForMatch(ev('knockout', 'ONE_30'), third, 1)).toBe('BWF_3x21');
  });

  it('round robin: all group matches use it, the knockout after the groups does not', () => {
    expect(rulesIdForMatch(ev('round_robin', 'ONE_30'), group, 3)).toBe('ONE_30');
    expect(rulesIdForMatch(ev('round_robin', 'ONE_30'), ko, 1)).toBe('BWF_3x21');
    expect(groupRulesId(ev('round_robin', 'ONE_30'))).toBe('ONE_30');
    expect(groupRulesId(ev('knockout', 'ONE_30'))).toBe('BWF_3x21');
  });

  it('without an opening format everything uses the main rules', () => {
    expect(rulesIdForMatch(ev('knockout'), ko, 1)).toBe('BWF_3x21');
    expect(rulesSummary(ev('knockout'))).toBe('3×21');
    expect(rulesSummary(ev('knockout', 'ONE_30'))).toBe('1×30 round 1, then 3×21');
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
