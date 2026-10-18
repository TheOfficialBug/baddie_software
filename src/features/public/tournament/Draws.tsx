import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { RULES, rulesSummary } from '@/engine/rules';
import type { Match } from '@/engine/types';

import { useNow } from '@/hooks/useNow';

import { useAccess } from '@/auth/useAccess';

import { EventDraw } from '@/components/draw/EventDraw';
import { modeSummary } from '@/components/draw/modeLabels';
import { MatchRow } from '@/components/match/Match';
import { matchContext } from '@/components/match/matchInfo';
import { NotFound } from '@/components/NotFound';
import { EventChip, Pill } from '@/components/tournament/Badges';
import { EventCard } from '@/components/tournament/EventCard';
import { ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { FilterChips } from '@/components/ui/Tabs';

import { useT } from '@/features/public/tournament/tournamentContext';

export function DrawsIndex() {
  const { t, lk } = useT();
  return (
    <section>
      <SectionHead title="Draws" description="Pick an event to see its bracket, groups or flights." />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {lk.eventsOf(t.id).map((ev) => (
          <EventCard key={ev.id} lk={lk} t={t} ev={ev} />
        ))}
      </div>
    </section>
  );
}

export function EventPage() {
  const { t, lk } = useT();
  const { eventId } = useParams();
  const nav = useNavigate();
  const ev = lk.event(eventId);
  const now = useNow();
  const { playerId: personaId } = useAccess();
  const [follow, setFollow] = useState<string>(() =>
    personaId && ev && lk.entriesOfPlayer(personaId).some((e) => e.eventId === ev.id) ? personaId : '',
  );
  const [open, setOpen] = useState<Match | null>(null);
  // stable, so bracket boxes can skip re-rendering on a live point elsewhere
  const openMatch = useCallback((m: Match) => m.number && setOpen(m), []);
  const players = useMemo(
    () =>
      ev
        ? lk
            .entriesOf(ev.id)
            .filter((e) => e.status === 'accepted')
            .flatMap((e) => e.playerIds)
            .flatMap((id) => lk.player(id) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [ev, lk],
  );
  if (!ev || ev.tournamentId !== t.id) return <NotFound what="event" />;
  const events = lk.eventsOf(t.id);
  const om = open ? (lk.match(open.id) ?? open) : null;

  return (
    <div className="flex flex-col gap-6">
      {events.length > 1 && (
        <FilterChips
          label="Choose an event"
          value={ev.id}
          onChange={(id) => nav(`/t/${t.slug}/draws/${id}`)}
          options={events.map((e) => ({
            value: e.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span className="num text-[11.5px] opacity-60">{e.kind}</span>
                {e.name}
              </span>
            ),
          }))}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <EventChip kind={ev.kind} />
            <Pill tone="muted" title={RULES[ev.rules].note}>
              Scoring {rulesSummary(ev)}
            </Pill>
          </div>
          <h2 className="font-display text-[clamp(26px,3.6vw,36px)] font-extrabold leading-tight">{ev.name}</h2>
          <p className="text-[14.5px] text-muted">
            {modeSummary(ev)} · {lk.entriesOf(ev.id).filter((e) => e.status === 'accepted').length} entries
          </p>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-72">
          <label htmlFor="follow" className="text-[13px] font-semibold text-muted">
            Follow a player
          </label>
          <div className="flex gap-2">
            <Select id="follow" value={follow} onChange={(e) => setFollow(e.target.value)} className="rounded-full">
              <option value="">Nobody (show everyone)</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      {follow && (
        <p className="flex items-center gap-2 text-[13.5px] text-muted">
          <Icon name="view" size={16} /> Showing {lk.player(follow)?.name}'s matches. Everything else is faded.
        </p>
      )}

      <EventDraw key={`${ev.id}-${follow}`} lk={lk} ev={ev} highlight={follow || null} onOpen={openMatch} />

      <Dialog
        open={!!om}
        onClose={() => setOpen(null)}
        title={om ? `Match #${om.number}` : ''}
        subtitle={om ? `${ev.name} · ${matchContext(lk, om).label}` : undefined}
      >
        {om && (
          <div className="flex flex-col gap-4">
            <MatchRow lk={lk} m={om} now={now} />
            {om.loserTo && om.status !== 'finished' && (
              <p className="text-[14px] text-muted">The loser of this match drops to the {om.loserTo}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {[om.a, om.b].map((e) =>
                lk.playersOfEntry(e).map((p) => (
                  <ButtonLink
                    key={p.id}
                    to={`/t/${t.slug}/players/${p.id}`}
                    size="sm"
                    onClick={() => setOpen(null)}
                    iconRight={<Icon name="right" size={14} />}
                  >
                    {p.name}
                  </ButtonLink>
                )),
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Link
        to={`/t/${t.slug}/draws`}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] font-semibold text-muted hover:text-fg"
      >
        <Icon name="left" size={16} /> All events
      </Link>
    </div>
  );
}
