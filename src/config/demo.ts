// Demo mode (no Supabase project configured): one organization and ready-made accounts,
// so every role can be tried on a preview. Never used when Supabase is configured.

export const DEMO_ORG = { id: 'org-demo', name: 'Prairie Badminton Association', slug: 'prairie-badminton' } as const;

/** Password for the ready-made demo accounts (shown on the sign-in page in demo mode only). */
export const DEMO_PASSWORD = 'smashboard';

export interface DemoAccount {
  id: string;
  email: string;
  name: string;
  /** What the account shows off on the sign-in page. */
  label: string;
  description: string;
  role?: 'owner' | 'admin' | 'scorer';
  /** Player record this account is linked to. */
  playerId?: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'u-alex',
    email: 'alex@smashboard.demo',
    name: 'Alex Morgan',
    label: 'Organizer',
    description: 'Owner: runs tournaments, draws and the team',
    role: 'owner',
  },
  {
    id: 'u-sam',
    email: 'sam@smashboard.demo',
    name: 'Sam Lee',
    label: 'Scorer',
    description: 'Match-day desk: courts and scores only',
    role: 'scorer',
  },
  {
    id: 'u-player',
    email: 'player@smashboard.demo',
    name: 'Demo Player',
    label: 'Player',
    description: 'Sees their own matches and registrations',
    playerId: 'p-M5',
  },
];
