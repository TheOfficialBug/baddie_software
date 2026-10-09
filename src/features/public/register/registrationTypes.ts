import type { EventKind, Gender, ID, SkillLevel, TEvent } from '@/engine/types';

import { isDoubles } from '@/data/eligibility';
import type { RegistrationPick } from '@/data/types';

export const STEPS = ['About you', 'Events', 'Levels & partners', 'Review & pay'];

/** The registering player's details from step 1. Empty until the player fills them in. */
export interface Registrant {
  name: string;
  email: string;
  gender?: Gender;
  birthYear?: number;
  club: string;
}

export const emptyRegistrant = (): Registrant => ({ name: '', email: '', club: '' });

/** What the player tells us for one chosen event (step 3). */
export interface EventDetails {
  myLevel?: SkillLevel;
  /** Doubles: name a partner, or ask the organizer to find one. */
  partnerMode: 'named' | 'find';
  partnerName: string;
  /** Set when the partner was picked from registered players. */
  partnerId?: ID;
  partnerEmail: string;
  partnerLevel?: SkillLevel;
}

export const emptyDetails = (): EventDetails => ({ partnerMode: 'named', partnerName: '', partnerEmail: '' });

/** Chosen events keyed by event id. */
export type Picks = Record<ID, EventDetails>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RegistrantErrors {
  name?: string;
  email?: string;
  gender?: string;
  birthYear?: string;
  club?: string;
}

export function registrantErrors(me: Registrant): RegistrantErrors {
  return {
    name: me.name.trim().length < 2 ? 'Enter your full name.' : undefined,
    email: !EMAIL.test(me.email.trim()) ? 'Enter an email we can send your schedule to.' : undefined,
    gender: !me.gender ? 'Choose which events you play in.' : undefined,
    birthYear: !me.birthYear ? 'Choose your year of birth.' : undefined,
    club: !me.club.trim() ? 'Enter your club, or choose “No club”.' : undefined,
  };
}

export interface DetailErrors {
  myLevel?: string;
  partnerName?: string;
  partnerEmail?: string;
  partnerLevel?: string;
}

export function detailErrors(kind: EventKind, d: EventDetails): DetailErrors {
  const doubles = isDoubles(kind);
  const named = doubles && d.partnerMode === 'named';
  return {
    myLevel: !d.myLevel ? 'Choose your level to continue.' : undefined,
    partnerName: named && d.partnerName.trim().length < 2 ? "Enter your partner's name." : undefined,
    partnerEmail:
      named && !d.partnerId && d.partnerEmail.trim() && !EMAIL.test(d.partnerEmail.trim()) ? 'Check the email address.' : undefined,
    partnerLevel: named && !d.partnerLevel ? "Choose your partner's level." : undefined,
  };
}

export const hasErrors = (e: object) => Object.values(e).some(Boolean);

/** "Singles", "Doubles" or "Mixed doubles" — the format words used in this wizard. */
export const formatOf = (kind: EventKind) => (kind === 'XD' ? 'Mixed doubles' : isDoubles(kind) ? 'Doubles' : 'Singles');

/** Turn the wizard's answers into what the store records for each event. */
export function toRegistrationPick(ev: TEvent, d: EventDetails): RegistrationPick {
  const mine = d.myLevel!;
  if (!isDoubles(ev.kind) || d.partnerMode === 'find') return { eventId: ev.id, levels: [mine] };
  if (d.partnerId) return { eventId: ev.id, partnerId: d.partnerId, levels: [mine, d.partnerLevel!] };
  return {
    eventId: ev.id,
    levels: [mine],
    pendingPartner: { name: d.partnerName.trim(), email: d.partnerEmail.trim() || undefined, level: d.partnerLevel! },
  };
}
