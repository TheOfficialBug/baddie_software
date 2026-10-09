import type { Match, Tournament } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { fmtElapsed } from '@/lib/format';

import { type Lookup } from '@/data/lookup';
import { useQueue } from '@/data/queries';

import { matchContext } from '@/components/match/matchInfo';
import { EventChip, FlightBadge, LiveDot, Pill } from '@/components/tournament/Badges';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export function NextMatchHero({ lk, t, playerId }: { lk: Lookup; t: Tournament; playerId: string }) {
  const now = useNow();
  const queue = useQueue(lk, t, now);
  const involves = (m: Match) => [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(playerId));
  const mine = lk.matchesOf(t.id).filter(involves);
  const onCourt = mine.find((m) => m.status === 'on_court');
  const qIndex = queue.findIndex((q) => involves(q.match));
  const next = onCourt ?? (qIndex >= 0 ? queue[qIndex].match : undefined);

  if (!next) {
    const waiting = mine.some((m) => m.status === 'pending');
    return (
      <div className="panel flex items-start gap-4 p-5 sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sunken text-fg">
          <Icon name={waiting ? 'clock' : 'check'} size={22} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{waiting ? 'Waiting for your next opponent' : 'You’re done for today'}</div>
          <p className="text-[14px] text-muted">
            {waiting
              ? 'They’re still playing. We’ll message you as soon as you’re called to a court.'
              : 'No more matches scheduled for you. Your results are below.'}
          </p>
        </div>
      </div>
    );
  }

  const ctx = matchContext(lk, next);
  const opp = next.a && lk.entry(next.a)?.playerIds.includes(playerId) ? next.b : next.a;
  const resting = qIndex >= 0 ? queue[qIndex].resting : undefined;
  const drawLink = `/t/${t.slug}/draws/${next.eventId}`;

  if (onCourt) {
    const court = lk.courtName(t.id, next.courtId);
    return (
      <section className="hero relative overflow-hidden rounded-[18px] p-4 sm:p-5" aria-label="Your match is on court">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <Pill tone="lime">
              <LiveDot /> You’re on court now
            </Pill>
            <div className="mt-4 font-display text-[clamp(44px,9vw,80px)] font-extrabold leading-[0.95]">{court}</div>
            <p className="mt-3 text-[15px] text-hero-muted">
              Go to <span className="font-semibold text-hero-fg">{court}</span> now. You play
            </p>
            <div className="truncate font-display text-[clamp(22px,3.4vw,30px)] font-extrabold leading-tight">{lk.entryName(opp)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-hero-muted">
              <Pill tone="hero" className="max-w-full overflow-hidden">
                {ctx.ev.name}
              </Pill>
              {ctx.label && (
                <Pill tone="hero" className="max-w-full overflow-hidden">
                  {ctx.label}
                </Pill>
              )}
              <span className="num">Match #{next.number}</span>
              <span aria-hidden>·</span>
              <span className="num">called {fmtElapsed(next.calledAt ?? now, now)} ago</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 md:flex-col md:items-stretch">
            <ButtonLink to={`/t/${t.slug}/courts`} variant="primary" size="lg" icon={<Icon name="live" size={20} />}>
              Live score
            </ButtonLink>
            <ButtonLink to={drawLink} variant="onHero" size="lg">
              See the draw
            </ButtonLink>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel flex flex-col gap-5 p-4 sm:p-5 md:flex-row md:items-center" aria-label="Your next match">
      <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-start md:gap-1 md:border-r md:border-line md:pr-6">
        <span className="eyebrow">Your place in line</span>
        <span className="num text-[clamp(36px,6vw,52px)] font-semibold leading-none">{qIndex === 0 ? 'Next' : `${qIndex + 1}`}</span>
        <span className="text-[13px] text-muted">
          {qIndex === 0 ? 'You’re next to be called' : `${qIndex} match${qIndex === 1 ? '' : 'es'} ahead of you`}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="eyebrow mb-1">Next match</div>
        <div className="text-[14px] text-muted">You play</div>
        <div className="truncate font-display text-[clamp(22px,3.4vw,30px)] font-extrabold leading-tight">{lk.entryName(opp)}</div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <EventChip kind={ctx.ev.kind} />
          {ctx.flight && <FlightBadge flight={ctx.flight} size="sm" />}
          <span className="min-w-0 truncate">{ctx.label || ctx.ev.name}</span>
          <span className="num">· Match #{next.number}</span>
        </div>
        {resting ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn">
            <Icon name="timer" size={16} /> You get at least <span className="num">{resting.minutesLeft}</span> more min of rest
          </p>
        ) : (
          <p className="mt-3 text-[14px] text-muted">Stay close to the courts. We’ll message you with the court number.</p>
        )}
      </div>
      <ButtonLink to={drawLink} variant="secondary" iconRight={<Icon name="right" size={18} />} className="self-start md:self-center">
        See the draw
      </ButtonLink>
    </section>
  );
}
