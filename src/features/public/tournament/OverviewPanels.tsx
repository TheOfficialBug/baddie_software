import { Link } from 'react-router';

import { RULES } from '@/engine/rules';

import { cn } from '@/lib/cn';
import { fmtDate, money } from '@/lib/format';

import { champions } from '@/data/queries';

import { useAccess } from '@/auth/useAccess';

import { EventChip } from '@/components/tournament/Badges';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';

import { eventStatus } from '@/features/public/tournament/eventStatus';
import { useT } from '@/features/public/tournament/tournamentContext';

/** "Following" card for the signed-in player (design: phone page). */
export function Following() {
  const { t, lk } = useT();
  const { playerId } = useAccess();
  const me = lk.player(playerId ?? undefined);
  if (!me) return null;
  const mine = lk.entriesOfPlayer(me.id, t.id);
  if (!mine.length) return null;
  const statuses = mine.map((e) => ({ ev: lk.event(e.eventId)!, st: eventStatus(lk, lk.event(e.eventId)!, me.id) }));
  const top = statuses.find((s) => s.st.next?.status === 'on_court') ?? statuses.find((s) => s.st.next) ?? statuses[0];
  const onCourt = top.st.next?.status === 'on_court';
  return (
    <Link
      to="/me"
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4 transition-colors',
        onCourt ? 'border-live bg-live-soft' : 'border-fg bg-surface hover:bg-sunken',
      )}
    >
      <Avatar name={me.name} size={44} className="bg-primary text-primary-fg" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="eyebrow">Following · {me.name}</span>
        <strong className={cn('truncate text-[15px]', onCourt && 'text-live')}>
          {top.ev.kind} · {top.st.text}
        </strong>
        {statuses.length > 1 && (
          <span className="truncate text-[13px] text-muted">
            {statuses
              .filter((s) => s !== top)
              .map((s) => `${s.ev.kind}: ${s.st.text}`)
              .join(' · ')}
          </span>
        )}
      </span>
      <Icon name="right" size={18} className="text-muted" />
    </Link>
  );
}

export function ChampionsPanel() {
  const { t, lk } = useT();
  const rows = lk.eventsOf(t.id).flatMap((ev) => champions(lk, ev).map((c) => ({ ev, c })));
  if (!rows.length) return null;
  return (
    <section className="hero rounded-3xl p-5 sm:p-7" aria-label="Champions">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-fg">
          <Icon name="trophy" size={22} />
        </span>
        <h2 className="font-display text-[clamp(22px,3vw,30px)] font-extrabold">Champions</h2>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ ev, c }) => (
          <div key={`${ev.id}-${c.label}`} className="flex min-w-0 flex-col gap-1 rounded-2xl bg-hero-line/[0.07] p-4">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-hero-muted">
              {ev.name} · {c.label}
            </span>
            <span className="truncate text-[16px] font-semibold">{c.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RegistrationOverview() {
  const { t, lk } = useT();
  const events = lk.eventsOf(t.id);
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <SectionHead title="Events" description="Fees are per player. Doubles partners each pay their own entry." />
        <div className="panel divide-y divide-line">
          {events.map((ev) => {
            const n = lk.entriesOf(ev.id).filter((e) => e.status !== 'withdrawn').length;
            const left = ev.cap - n;
            return (
              <div key={ev.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <EventChip kind={ev.kind} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{ev.name}</div>
                  <div className="text-[13px] text-muted">
                    {ev.mode === 'drop_flight'
                      ? `Drop flight ${ev.config.variant === 'ABCD' ? 'A/B/C/D' : 'A/B'}`
                      : ev.mode === 'round_robin'
                        ? 'Round robin'
                        : 'Knockout'}
                    {ev.maxAge ? ` · born ${Number(t.startDate.slice(0, 4)) - ev.maxAge + 1} or later` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">{money(ev.fee)}</div>
                  <div className={cn('text-[12.5px]', left <= 4 ? 'font-semibold text-warn' : 'text-muted')}>
                    {left > 0 ? `${left} spots left` : 'Waitlist'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <div className="panel flex flex-col gap-3 p-5 sm:p-6">
          <span className="eyebrow">Registration</span>
          <div className="font-display text-[24px] font-extrabold leading-tight">
            Closes {fmtDate(t.regCloses ?? t.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <p className="text-[14px] text-muted">
            Pick your events, invite your doubles partner and pay in one go. You'll get a notification when the draw is published.
          </p>
          <ButtonLink to={`/t/${t.slug}/register`} variant="primary" size="lg">
            Register now
          </ButtonLink>
        </div>
        <div className="panel p-5 text-[14px]">
          <span className="eyebrow">Scoring</span>
          <p className="mt-1 font-semibold">{RULES[t.rules].label}</p>
          <p className="mt-1 text-muted">{RULES[t.rules].note}</p>
        </div>
        {t.about && <p className="px-1 text-[14px] text-muted">{t.about}</p>}
      </aside>
    </div>
  );
}
