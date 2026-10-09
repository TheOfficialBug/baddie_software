// Choices offered when composing a notification, and who each audience reaches.
import type { ID, Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import type { NoticeKind } from '@/data/types';

import type { IconName } from '@/components/ui/Icon';

export type Audience = 'all' | 'event' | 'court' | 'next';
export type Channel = 'app' | 'sms' | 'email';

export const TEMPLATES: { kind: NoticeKind; label: string; icon: IconName; title: string; body: string }[] = [
  { kind: 'announcement', label: 'Announcement', icon: 'megaphone', title: '', body: '' },
  {
    kind: 'delay',
    label: 'Running late',
    icon: 'clock',
    title: 'Running about 15 minutes behind',
    body: 'Matches will start roughly 15 minutes later than listed. Thanks for your patience.',
  },
  {
    kind: 'announcement',
    label: 'Next round',
    icon: 'draws',
    title: 'Next round starting soon',
    body: 'Please stay close to the courts and listen for your match number.',
  },
  {
    kind: 'announcement',
    label: 'Prize giving',
    icon: 'trophy',
    title: 'Prize giving at 6:30 PM',
    body: 'Finals winners and runners-up, please come to Court 1 for photos.',
  },
];

export const CHANNELS: { id: Channel; label: string; icon: IconName }[] = [
  { id: 'app', label: 'In the app', icon: 'bell' },
  { id: 'sms', label: 'Text message', icon: 'phone' },
  { id: 'email', label: 'Email', icon: 'mail' },
];

export const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'event', label: 'One event' },
  { value: 'court', label: 'On court now' },
  { value: 'next', label: 'Up next' },
];

/** Player ids reached by an audience (withdrawn entries excluded for everyone / one event). */
export function notifyRecipients(lk: Lookup, t: Tournament, audience: Audience, eventId: ID): ID[] {
  const matches = lk.matchesOf(t.id);
  const playersOf = (ids: (string | null)[]) => ids.flatMap((e) => lk.entry(e)?.playerIds ?? []);
  if (audience === 'all')
    return [
      ...new Set(
        lk.eventsOf(t.id).flatMap((e) =>
          lk
            .entriesOf(e.id)
            .filter((x) => x.status !== 'withdrawn')
            .flatMap((x) => x.playerIds),
        ),
      ),
    ];
  if (audience === 'event')
    return [
      ...new Set(
        lk
          .entriesOf(eventId)
          .filter((x) => x.status !== 'withdrawn')
          .flatMap((x) => x.playerIds),
      ),
    ];
  if (audience === 'court')
    return [...new Set(playersOf(matches.filter((m) => m.status === 'on_court').flatMap((m) => [m.a, m.b] as (string | null)[])))];
  return [...new Set(playersOf(matches.filter((m) => m.status === 'ready').flatMap((m) => [m.a, m.b] as (string | null)[])))];
}
