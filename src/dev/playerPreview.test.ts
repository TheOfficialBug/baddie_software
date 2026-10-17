import { describe, expect, it } from 'vitest';

import { mulberry32 } from '@/engine/rng';

import { buildPreview, PREVIEW_SLUG, previewStep } from '@/dev/playerPreview';

const NOW = new Date('2026-10-18T11:00:00').getTime();

describe('player preview: a simulated match day', () => {
  const db = buildPreview(NOW);
  const t = db.tournaments.find((x) => x.slug === PREVIEW_SLUG)!;
  const evIds = new Set(db.events.filter((e) => e.tournamentId === t.id).map((e) => e.id));
  const mine = (d = db) => d.matches.filter((m) => evIds.has(m.eventId));

  it('starts live, with every draw published, results in and courts busy', () => {
    expect(t.status).toBe('live');
    expect(db.events.filter((e) => evIds.has(e.id)).every((e) => e.drawState === 'published')).toBe(true);
    expect(mine().filter((m) => m.status === 'finished').length).toBeGreaterThanOrEqual(25);
    expect(mine().filter((m) => m.status === 'on_court').length).toBe(t.courts.length);
  });

  it('has live scores in progress and players called to court', () => {
    expect(mine().some((m) => m.status === 'on_court' && m.live && m.live[0] + m.live[1] > 0)).toBe(true);
    expect(db.notices.some((n) => n.tournamentId === t.id && n.kind === 'call')).toBe(true);
    expect(db.notices.some((n) => n.tournamentId === t.id && n.kind === 'announcement')).toBe(true);
  });

  it('keeps moving: points, results, new call-ups and announcements, never two matches on one court', () => {
    const rand = mulberry32(1);
    let d = db;
    const finishedBefore = mine().filter((m) => m.status === 'finished').length;
    const noticesBefore = d.notices.length;
    for (let step = 1; step <= 200; step++) {
      d = previewStep(d, t.id, NOW + step * 1500, rand, step);
      const courts = mine(d)
        .filter((m) => m.status === 'on_court')
        .map((m) => m.courtId);
      expect(new Set(courts).size).toBe(courts.length);
    }
    expect(mine(d).filter((m) => m.status === 'finished').length).toBeGreaterThan(finishedBefore);
    const fresh = d.notices.slice(noticesBefore);
    expect(fresh.some((n) => n.kind === 'call')).toBe(true);
    expect(fresh.some((n) => n.kind === 'announcement')).toBe(true);
  });
});
