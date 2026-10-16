import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { rulesOfMatch } from '@/data/ops';
import { useStore } from '@/data/store';

import { ScoreForm } from '@/components/match/ScoreEntry';

import { buildSampleData } from '@/test/fixtures/sampleTournaments';

const db = buildSampleData(Date.UTC(2026, 9, 10, 15, 0));
const playable = (m: (typeof db.matches)[number]) => (m.status === 'ready' || m.status === 'on_court') && m.a !== 'BYE' && m.b !== 'BYE';
const oneGame = db.matches.find((m) => playable(m) && rulesOfMatch(db, m).bestOf === 1)!;
const bestOf3 = db.matches.find((m) => playable(m) && rulesOfMatch(db, m).bestOf === 3)!;
const gameBoxes = () => screen.getAllByRole('textbox', { name: /^Game \d/ });

beforeEach(() => {
  useStore.setState(buildSampleData(Date.UTC(2026, 9, 10, 15, 0)));
});

describe('score slip', () => {
  it('has one row per game of the match format', () => {
    const { unmount } = render(<ScoreForm matchId={oneGame.id} onDone={() => {}} />);
    expect(gameBoxes()).toHaveLength(2);
    unmount();
    render(<ScoreForm matchId={bestOf3.id} onDone={() => {}} />);
    expect(gameBoxes()).toHaveLength(6);
  });

  it('fits a slip saved under another format to the match format', () => {
    // a best-of-3 slip started before this match became a one-game match
    localStorage.setItem(
      `smashboard.ui.score:${oneGame.id}`,
      JSON.stringify({
        at: Date.now(),
        value: {
          cells: [
            ['12', '10'],
            ['', ''],
            ['', ''],
          ],
          result: 'normal',
        },
      }),
    );
    render(<ScoreForm matchId={oneGame.id} onDone={() => {}} />);
    expect(gameBoxes()).toHaveLength(2);
    expect(gameBoxes()[0]).toHaveValue('12');
  });
});
