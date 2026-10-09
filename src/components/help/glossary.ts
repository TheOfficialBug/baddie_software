import { type ReactNode } from 'react';

/** Plain-language explanations of every term a first-time player or organizer meets. */
export const GLOSSARY: { term: string; body: ReactNode }[] = [
  {
    term: 'Seed',
    body: 'A top-ranked player placed so the strongest players meet as late as possible. Seed 1 starts at the top of the draw, seed 2 at the bottom.',
  },
  {
    term: 'Bye',
    body: 'A free pass to the next round. Draws need 4, 8, 16 or 32 players, so when there are fewer, the top seeds skip round 1.',
  },
  { term: 'Walkover (W/O)', body: 'The opponent did not play, so the match is given to the player who turned up.' },
  {
    term: 'Retired (Ret.)',
    body: 'A player stopped during the match, usually through injury. The other player wins; the score at that moment is kept.',
  },
  {
    term: 'Rest time',
    body: 'The minimum break a player gets between matches. The desk will not call someone back to court before it is over.',
  },
  { term: 'Plate', body: 'A second-chance knockout for players who lose their first match.' },
  { term: 'Qualifies (Q)', body: 'In round robin groups, the players marked Q go through to the knockout stage.' },
];
