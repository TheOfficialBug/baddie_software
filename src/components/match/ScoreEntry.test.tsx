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

describe('score slip autofill', () => {
  // a best-of-3 match with nothing typed or played yet (a live score would rightly be kept)
  const fresh = db.matches.find(
    (m) => playable(m) && rulesOfMatch(db, m).bestOf === 3 && !m.games.length && !(m.live && (m.live[0] || m.live[1])),
  )!;
  // boxes in order: game 1 side a, game 1 side b, game 2 side a, … (one column per game)
  const box = (game: number, side: 'a' | 'b') =>
    gameBoxes().find(
      (b) =>
        b.getAttribute('aria-label')!.startsWith(`Game ${game},`) &&
        gameBoxes()
          .filter((x) => x.getAttribute('aria-label')!.startsWith(`Game ${game},`))
          .indexOf(b) === (side === 'a' ? 0 : 1),
    )! as HTMLInputElement;

  beforeEach(() => {
    localStorage.clear();
  });

  it('typing the loser’s score fills the winner’s, and follows the typing', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<ScoreForm matchId={fresh.id} onDone={() => {}} />);
    fireEvent.change(box(1, 'a'), { target: { value: '15' } });
    expect(box(1, 'b').value).toBe('21');
    // "2" then "20": the filled box follows (21 → 22)
    fireEvent.change(box(2, 'b'), { target: { value: '2' } });
    expect(box(2, 'a').value).toBe('21');
    fireEvent.change(box(2, 'b'), { target: { value: '20' } });
    expect(box(2, 'a').value).toBe('22');
    // clearing the typed score takes the guess back
    fireEvent.change(box(2, 'b'), { target: { value: '' } });
    expect(box(2, 'a').value).toBe('');
  });

  it('never changes a score typed by hand, and leaves a typed 21 alone', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<ScoreForm matchId={fresh.id} onDone={() => {}} />);
    fireEvent.change(box(1, 'b'), { target: { value: '21' } });
    expect(box(1, 'a').value).toBe('');
    fireEvent.change(box(1, 'a'), { target: { value: '18' } });
    expect(box(1, 'b').value).toBe('21');
    // overwrite the filled box by hand, then change the other side: the hand-typed score stays
    fireEvent.change(box(1, 'b'), { target: { value: '25' } });
    fireEvent.change(box(1, 'a'), { target: { value: '23' } });
    expect(box(1, 'b').value).toBe('25');
  });
});
