import { describe, expect, it } from 'vitest';

import type { TEvent } from '@/engine/types';

import {
  detailErrors,
  emptyDetails,
  emptyRegistrant,
  hasErrors,
  registrantErrors,
  toRegistrationPick,
} from '@/features/public/register/registrationTypes';

const ev = (kind: TEvent['kind']) => ({ id: `ev-${kind}`, kind }) as TEvent;

describe('registrant', () => {
  it('requires every field', () => {
    const e = registrantErrors(emptyRegistrant());
    expect(Object.keys(e).filter((k) => e[k as keyof typeof e])).toEqual(['name', 'email', 'gender', 'birthYear', 'club']);
  });

  it('accepts a complete registrant, including a club typed by hand', () => {
    const e = registrantErrors({ name: 'Maya Chen', email: 'maya@example.com', gender: 'F', birthYear: 2010, club: 'Lincoln Shuttlers' });
    expect(hasErrors(e)).toBe(false);
  });
});

describe('event details', () => {
  it('singles needs only your level', () => {
    expect(detailErrors('WS', emptyDetails())).toMatchObject({ myLevel: expect.any(String), partnerName: undefined });
    expect(hasErrors(detailErrors('WS', { ...emptyDetails(), myLevel: 'B' }))).toBe(false);
  });

  it("doubles needs your partner's name and both levels", () => {
    const e = detailErrors('XD', emptyDetails());
    expect(e.myLevel && e.partnerName && e.partnerLevel).toBeTruthy();
    expect(hasErrors(detailErrors('XD', { ...emptyDetails(), myLevel: 'B', partnerName: 'Sam Ortiz', partnerLevel: 'C' }))).toBe(false);
  });

  it('doubles without a partner only needs your level', () => {
    expect(hasErrors(detailErrors('MD', { ...emptyDetails(), partnerMode: 'find', myLevel: 'A' }))).toBe(false);
  });

  it('checks an optional partner email only when given', () => {
    const d = { ...emptyDetails(), myLevel: 'B' as const, partnerName: 'Sam Ortiz', partnerLevel: 'C' as const };
    expect(detailErrors('MD', { ...d, partnerEmail: 'nope' }).partnerEmail).toBeTruthy();
    expect(detailErrors('MD', { ...d, partnerEmail: 'sam@example.com' }).partnerEmail).toBeUndefined();
  });
});

describe('toRegistrationPick', () => {
  it('records the level for singles', () => {
    expect(toRegistrationPick(ev('WS'), { ...emptyDetails(), myLevel: 'C' })).toEqual({ eventId: 'ev-WS', levels: ['C'] });
  });

  it('links a registered partner with both levels', () => {
    const d = { ...emptyDetails(), myLevel: 'B' as const, partnerName: 'Aarav', partnerId: 'p-1', partnerLevel: 'A' as const };
    expect(toRegistrationPick(ev('XD'), d)).toEqual({ eventId: 'ev-XD', partnerId: 'p-1', levels: ['B', 'A'] });
  });

  it('keeps an unregistered partner as pending', () => {
    const d = { ...emptyDetails(), myLevel: 'B' as const, partnerName: ' Sam Ortiz ', partnerEmail: '', partnerLevel: 'C' as const };
    expect(toRegistrationPick(ev('MD'), d)).toEqual({
      eventId: 'ev-MD',
      levels: ['B'],
      pendingPartner: { name: 'Sam Ortiz', email: undefined, level: 'C' },
    });
  });
});
