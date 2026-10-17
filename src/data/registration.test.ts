import { describe, expect, it } from 'vitest';

import { registrationOpen } from '@/data/registration';

describe('registrationOpen', () => {
  it('is open through the closing day, then closed', () => {
    expect(registrationOpen({ status: 'registration', regCloses: '2026-10-17' }, '2026-10-17')).toBe(true);
    expect(registrationOpen({ status: 'registration', regCloses: '2026-10-17' }, '2026-10-18')).toBe(false);
    expect(registrationOpen({ status: 'registration' }, '2030-01-01')).toBe(true);
    expect(registrationOpen({ status: 'closed', regCloses: '2030-01-01' }, '2026-10-17')).toBe(false);
  });
});
