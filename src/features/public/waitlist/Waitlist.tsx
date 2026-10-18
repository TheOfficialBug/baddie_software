import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { env } from '@/config/env';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { reportError } from '@/lib/monitoring';
import { getSupabase } from '@/lib/supabase';

import { useLookup } from '@/data/lookup';

import { EMAIL_RE } from '@/auth/types';

import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';

type Role = 'player' | 'organizer' | 'club';

const PERKS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'userAdd', title: 'Enter in a minute', body: 'Pick your events and doubles partner on your phone. No forms, no spreadsheets.' },
  { icon: 'bell', title: 'Know when you play', body: 'A ping when you’re called to court, with the court number and your opponent.' },
  { icon: 'whistle', title: 'Run it from one desk', body: 'Organizers: entries, fair draws, courts and live scores in one place.' },
];

/** Early access sign-up: the full player and organizer features open to the waitlist first. Live scores and draws stay public. */
export function Waitlist() {
  useDocumentTitle('Join the waitlist');
  const [params] = useSearchParams();
  const lk = useLookup();
  const live = lk.tournaments.find((t) => t.status === 'live') ?? lk.tournaments.find((t) => t.status !== 'draft');
  const [f, setF] = useState({ name: '', email: '', club: '', city: '' });
  const [role, setRole] = useState<Role>((['player', 'organizer', 'club'] as const).find((r) => r === params.get('as')) ?? 'player');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const errors = {
    name: !f.name.trim() ? 'Enter your name.' : undefined,
    email: !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address.' : undefined,
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.name || errors.email || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      if (env.supabase) {
        const sb = await getSupabase();
        const { error } = await sb.rpc('join_waitlist', {
          p_name: f.name.trim(),
          p_email: f.email.trim(),
          p_role: role,
          p_club: f.club.trim() || null,
          p_city: f.city.trim() || null,
          p_source: params.get('from') ?? (document.referrer ? new URL(document.referrer).hostname : null),
        });
        if (error) throw error;
      }
      setDone(true);
    } catch (err) {
      reportError(err, { source: 'waitlist.join' });
      setFailed('We couldn’t add you just now. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <section className="flex flex-col gap-5 pt-2">
        <span className="eyebrow">Early access</span>
        <h1 className="font-display text-[clamp(30px,5vw,48px)] font-extrabold leading-[1.02]">
          Badminton tournaments, without the chaos.
        </h1>
        <p className="max-w-xl text-[16px] text-muted">
          Live scores and draws are open to everyone today. Player accounts, online entries and the organizer desk are opening to the
          waitlist first. Join to be among the first in.
        </p>
        <ul className="flex flex-col gap-3">
          {PERKS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken">
                <Icon name={p.icon} size={20} />
              </span>
              <div>
                <div className="font-semibold">{p.title}</div>
                <div className="text-[14px] text-muted">{p.body}</div>
              </div>
            </li>
          ))}
        </ul>
        {live && (
          <Link
            to={`/t/${live.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold underline-offset-4 hover:underline"
          >
            <Icon name="live" size={18} /> Follow {live.name} live now <Icon name="right" size={16} />
          </Link>
        )}
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="waitlist-form">
        {done ? (
          <div role="status" className="flex flex-col items-start gap-3 py-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-fg">
              <Icon name="check" size={24} />
            </span>
            <h2 className="font-display text-[24px] font-extrabold">You’re on the list</h2>
            <p className="text-[15px] text-muted">
              Thanks, {f.name.trim().split(' ')[0]}! We’ll email {f.email.trim()} when your access is ready.
              {live ? ' Meanwhile, the live scores are one tap away.' : ''}
            </p>
            {live && (
              <Link to={`/t/${live.slug}`} className="font-semibold underline underline-offset-4">
                Open {live.name}
              </Link>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
            <h2 id="waitlist-form" className="font-display text-[22px] font-extrabold">
              Join the waitlist
            </h2>
            <Segmented
              label="I am"
              stretch
              value={role}
              onChange={setRole}
              options={[
                { value: 'player', label: 'Player' },
                { value: 'organizer', label: 'Organizer' },
                { value: 'club', label: 'Club' },
              ]}
            />
            <Field label="Name" error={tried ? errors.name : undefined}>
              {(id) => (
                <Input
                  id={id}
                  autoComplete="name"
                  value={f.name}
                  placeholder="Your full name"
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  aria-invalid={(tried && !!errors.name) || undefined}
                />
              )}
            </Field>
            <Field label="Email" error={tried ? errors.email : undefined}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={f.email}
                  placeholder="name@example.com"
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                  aria-invalid={(tried && !!errors.email) || undefined}
                />
              )}
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={role === 'player' ? 'Club (optional)' : 'Club or organization (optional)'}>
                {(id) => (
                  <Input
                    id={id}
                    value={f.club}
                    placeholder="e.g. ISU Badminton Club"
                    onChange={(e) => setF({ ...f, club: e.target.value })}
                  />
                )}
              </Field>
              <Field label="City (optional)">
                {(id) => (
                  <Input
                    id={id}
                    autoComplete="address-level2"
                    value={f.city}
                    placeholder="e.g. Ames, IA"
                    onChange={(e) => setF({ ...f, city: e.target.value })}
                  />
                )}
              </Field>
            </div>
            {failed && (
              <p role="alert" className="text-[14px] font-semibold text-live">
                {failed}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? 'Adding you…' : 'Get early access'}
            </Button>
            <p className="text-[12.5px] text-muted">We only use your email to tell you when your access is ready. No spam.</p>
          </form>
        )}
      </section>
    </div>
  );
}
