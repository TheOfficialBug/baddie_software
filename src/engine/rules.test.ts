import { describe, expect, it } from 'vitest';

import { checkGame, checkMatch, defaultRulesForDate, parseQuickScore, RULES, type ScoringRules } from './rules';
import type { GameScore } from './types';

// ---------------------------------------------------------------------------
// checkGame: finished / in-progress / impossible, per scoring preset.
// Scores are listed winner-first; every case is also checked mirrored (b wins).
// ---------------------------------------------------------------------------

interface GameTable {
  rules: ScoringRules;
  complete: GameScore[];
  inProgress: GameScore[];
  invalid: GameScore[];
}

const GAME_TABLES: GameTable[] = [
  {
    rules: RULES.BWF_3x21,
    complete: [
      [21, 0],
      [21, 19],
      [22, 20],
      [29, 27],
      [30, 28],
      [30, 29],
    ],
    inProgress: [
      [21, 20],
      [20, 20],
      [25, 25],
      [29, 29],
    ],
    invalid: [
      [23, 20],
      [31, 29],
      [30, 27],
    ],
  },
  {
    rules: RULES.BWF_3x15,
    complete: [
      [15, 13],
      [16, 14],
      [21, 20],
      [21, 19],
    ],
    inProgress: [
      [15, 14],
      [20, 20],
    ],
    invalid: [
      [22, 20],
      [21, 18],
    ],
  },
  {
    rules: RULES.ONE_31,
    complete: [[31, 30]],
    inProgress: [[30, 30]],
    invalid: [
      [31, 31],
      [32, 30],
    ],
  },
];

const flip = ([x, y]: GameScore): GameScore => [y, x];

for (const { rules, complete, inProgress, invalid } of GAME_TABLES) {
  describe(`checkGame · ${rules.id}`, () => {
    it.each(complete)('%i-%i is a finished game', (x, y) => {
      expect(checkGame([x, y], rules)).toMatchObject({ valid: true, complete: true, winner: 'a' });
      expect(checkGame(flip([x, y]), rules)).toMatchObject({ valid: true, complete: true, winner: 'b' });
    });

    it.each(inProgress)('%i-%i is a legal score but the game is not over', (x, y) => {
      for (const g of [[x, y], flip([x, y])] as GameScore[]) {
        const c = checkGame(g, rules);
        expect(c).toMatchObject({ valid: true, complete: false });
        expect(c.winner).toBeUndefined();
      }
    });

    it.each(invalid)('%i-%i is impossible', (x, y) => {
      for (const g of [[x, y], flip([x, y])] as GameScore[]) {
        const c = checkGame(g, rules);
        expect(c).toMatchObject({ valid: false, complete: false });
        expect(c.message).toMatch(/\S/);
      }
    });
  });
}

describe('checkGame · malformed input', () => {
  it.each([
    [-1, 21],
    [21.5, 10],
    [Number.NaN, 0],
  ])('%s-%s is rejected', (x, y) => {
    expect(checkGame([x, y], RULES.BWF_3x21)).toMatchObject({ valid: false, message: 'Scores must be whole numbers.' });
  });
});

// ---------------------------------------------------------------------------
// checkMatch
// ---------------------------------------------------------------------------

describe('checkMatch', () => {
  const R = RULES.BWF_3x21;

  it('accepts a straight-games win', () => {
    const c = checkMatch(
      [
        [21, 15],
        [21, 18],
      ],
      R,
    );
    expect(c).toMatchObject({ ok: true, winner: 'a', errors: [], summary: '2–0' });
  });

  it('accepts a three-game win for side b', () => {
    const c = checkMatch(
      [
        [21, 15],
        [18, 21],
        [19, 21],
      ],
      R,
    );
    expect(c).toMatchObject({ ok: true, winner: 'b', errors: [], summary: '2–1' });
  });

  it('accepts a single game in a best-of-1 format', () => {
    expect(checkMatch([[31, 30]], RULES.ONE_31)).toMatchObject({ ok: true, winner: 'a' });
  });

  it.each<[string, GameScore[], string]>([
    ['no games', [], 'Enter the game scores.'],
    ['one game of three', [[21, 15]], 'Nobody has won 2 games yet.'],
    [
      'one game each',
      [
        [21, 15],
        [15, 21],
      ],
      'Nobody has won 2 games yet.',
    ],
  ])('rejects a match that is not decided (%s)', (_label, games, error) => {
    const c = checkMatch(games, R);
    expect(c.ok).toBe(false);
    expect(c.winner).toBeUndefined();
    expect(c.errors).toContain(error);
  });

  it('rejects an extra game after the match was decided', () => {
    const c = checkMatch(
      [
        [21, 15],
        [21, 18],
        [21, 10],
      ],
      R,
    );
    expect(c.ok).toBe(false);
    expect(c.gameErrors[2]).toBe('The match was already decided before this game.');
    expect(c.gameErrors[0]).toBeUndefined();
    expect(c.errors).toContain('Fix the highlighted games.');
  });

  it('flags impossible games with a per-game message', () => {
    const c = checkMatch(
      [
        [23, 20],
        [21, 10],
        [31, 29],
      ],
      R,
    );
    expect(c.ok).toBe(false);
    expect(c.gameErrors[0]).toMatch(/can't happen/);
    expect(c.gameErrors[1]).toBeUndefined();
    expect(c.gameErrors[2]).toMatch(/past 30/);
    expect(c.errors).toEqual(['Fix the highlighted games.']);
  });

  it('suggests 22-20 for an unfinished 21-20 game', () => {
    const c = checkMatch(
      [
        [21, 20],
        [21, 10],
      ],
      R,
    );
    expect(c.ok).toBe(false);
    expect(c.gameErrors[0]).toContain('Did you mean 22-20?');
  });

  it('suggests 16-14 for an unfinished 15-14 game in 3×15', () => {
    const c = checkMatch(
      [
        [15, 14],
        [15, 10],
      ],
      RULES.BWF_3x15,
    );
    expect(c.gameErrors[0]).toContain('Did you mean 16-14?');
  });

  it('asks to fill in or remove a 0-0 game', () => {
    const c = checkMatch(
      [
        [21, 15],
        [21, 15],
        [0, 0],
      ],
      R,
    );
    expect(c.gameErrors[2]).toBe('Enter this game or remove it.');
  });

  describe('retired', () => {
    it('allows an unfinished last game when the winner is declared', () => {
      const c = checkMatch(
        [
          [21, 15],
          [10, 5],
        ],
        R,
        'retired',
        'a',
      );
      expect(c).toMatchObject({ ok: true, winner: 'a', errors: [] });
    });

    it('allows a retirement between games', () => {
      expect(
        checkMatch(
          [
            [21, 15],
            [15, 21],
          ],
          R,
          'retired',
          'b',
        ),
      ).toMatchObject({ ok: true, winner: 'b' });
    });

    it('needs the declared winner', () => {
      const c = checkMatch(
        [
          [21, 15],
          [10, 5],
        ],
        R,
        'retired',
      );
      expect(c.ok).toBe(false);
      expect(c.errors).toContain('Choose who retired.');
    });

    it('only the last game may be unfinished', () => {
      const c = checkMatch(
        [
          [10, 5],
          [21, 15],
        ],
        R,
        'retired',
        'a',
      );
      expect(c.ok).toBe(false);
      expect(c.gameErrors[0]).toMatch(/isn't a finished game/);
    });

    it('is refused when the match was already decided', () => {
      const c = checkMatch(
        [
          [21, 15],
          [21, 15],
        ],
        R,
        'retired',
        'a',
      );
      expect(c.ok).toBe(false);
      expect(c.errors).toContain('The match was already decided, so this is a normal result.');
    });
  });

  describe('walkover', () => {
    it('needs no games, only a winner', () => {
      expect(checkMatch([], R, 'walkover', 'b')).toMatchObject({ ok: true, winner: 'b', errors: [] });
    });

    it('needs the winner', () => {
      const c = checkMatch([], R, 'walkover');
      expect(c.ok).toBe(false);
      expect(c.errors).toContain('Choose the winner.');
    });
  });
});

// ---------------------------------------------------------------------------
// parseQuickScore / defaultRulesForDate
// ---------------------------------------------------------------------------

describe('parseQuickScore', () => {
  it.each<[string, GameScore[]]>([
    [
      '21-15 18-21 21-19',
      [
        [21, 15],
        [18, 21],
        [21, 19],
      ],
    ],
    [
      '21:15, 18–21',
      [
        [21, 15],
        [18, 21],
      ],
    ],
    ['21/15', [[21, 15]]],
    [
      '30 - 29,29—30',
      [
        [30, 29],
        [29, 30],
      ],
    ],
    ['', []],
    ['no scores here', []],
  ])('%j', (text, games) => {
    expect(parseQuickScore(text)).toEqual(games);
  });
});

describe('defaultRulesForDate', () => {
  it.each([
    ['2026-10-08', 'BWF_3x21'],
    ['2027-01-03', 'BWF_3x21'],
    ['2027-01-04', 'BWF_3x15'],
    ['2028-06-01', 'BWF_3x15'],
  ])('%s → %s', (date, rules) => {
    expect(defaultRulesForDate(date)).toBe(rules);
  });
});
