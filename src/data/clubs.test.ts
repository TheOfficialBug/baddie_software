import { describe, expect, it } from 'vitest';

import { generateDraw } from '@/engine/draws';

import { entryClub, realClub } from '@/data/clubs';
import { makeLookup } from '@/data/lookup';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';

describe('clubs for separation', () => {
  it('"No club" and blanks are not clubs', () => {
    expect(realClub('No club')).toBeUndefined();
    expect(realClub('  ')).toBeUndefined();
    expect(realClub(' ISUBC ')).toBe('ISUBC');
  });

  it('an entry represents the club its players share', () => {
    expect(entryClub([{ club: 'ISUBC' }])).toBe('ISUBC');
    expect(entryClub([{ club: 'ISUBC' }, { club: 'No club' }])).toBe('ISUBC');
    expect(entryClub([{ club: 'ISUBC' }, { club: 'MCBC' }])).toBeUndefined();
    expect(entryClub([{ club: 'No club' }, { club: 'No club' }])).toBeUndefined();
  });

  it('players without a club are never flagged as clubmates in a draw', () => {
    const db = buildIowaOpen(Date.UTC(2026, 9, 9));
    const lk = makeLookup(db);
    for (const ev of db.events.filter((e) => e.tournamentId === IOWA_OPEN_ID && e.mode !== 'round_robin')) {
      const ids = db.entries.filter((e) => e.eventId === ev.id && e.status === 'accepted').map((e) => e.id);
      for (let seed = 1; seed <= 5; seed++) {
        const plan = generateDraw({
          event: ev,
          entryIds: ids,
          seeds: 4,
          rngSeed: seed,
          clubOf: (id) => entryClub(lk.playersOfEntry(id)),
          nameOf: (id) => lk.entryName(id),
        });
        for (const w of plan.warnings.filter((x) => x.includes('round 1'))) expect(w).not.toMatch(/No club|the same club/);
      }
    }
  });
});
