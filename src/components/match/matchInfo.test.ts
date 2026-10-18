import { describe, expect, it } from 'vitest';

import type { Match, TEvent } from '@/engine/types';

import { makeLookup } from '@/data/lookup';
import { emptyDB } from '@/data/types';

import { matchContext } from '@/components/match/matchInfo';

describe('matchContext', () => {
  it('works while the match’s stage is missing (live data arrives record by record)', () => {
    const ev = { id: 'ev', tournamentId: 't1', kind: 'MS', name: 'Men’s singles' } as TEvent;
    const m = { id: 'm1', eventId: 'ev', stageId: 'gone', round: 1, index: 0, number: 1, games: [] } as unknown as Match;
    const lk = makeLookup({ ...emptyDB(), events: [ev], matches: [m] });
    expect(matchContext(lk, m)).toMatchObject({ ev, round: '', label: '', flight: undefined });
  });
});
