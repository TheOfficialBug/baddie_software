import { useState } from 'react';
import { Link } from 'react-router';

import { rulesSummary } from '@/engine/rules';
import type { Entry, TEvent, Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

import { eligibility, isDoubles } from '@/data/eligibility';
import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { modeSummary } from '@/components/draw/modeLabels';
import { GLOSSARY } from '@/components/help/glossary';
import { EventChip, Pill, SeedTag } from '@/components/tournament/Badges';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Tabs';

import { AddEntryDialog } from '@/features/admin/entries/AddEntryDialog';

const seedHelp = GLOSSARY.find((g) => g.term === 'Seed')?.body;

export function EventEntries({ lk, t, ev, onEdit }: { lk: Lookup; t: Tournament; ev: TEvent; onEdit: () => void }) {
  const updatePlayer = useStore((s) => s.updatePlayer);
  const setStatus = useStore((s) => s.setEntryStatus);
  const [filter, setFilter] = useState<'all' | Entry['status']>('all');
  const [adding, setAdding] = useState(false);
  const entries = lk.entriesOf(ev.id);
  const shown = entries
    .filter((e) => filter === 'all' || e.status === filter)
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.createdAt - b.createdAt);
  const locked = ev.drawState === 'published';
  const accepted = entries.filter((e) => e.status === 'accepted').length;
  const pending = entries.filter((e) => e.status === 'pending').length;

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={ev.name}>
      <div className="panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <EventChip kind={ev.kind} />
              <h2 className="min-w-0 truncate font-display text-[clamp(20px,2.4vw,24px)] font-extrabold leading-tight">{ev.name}</h2>
            </div>
            <p className="mt-1.5 text-[14px] text-muted">{modeSummary(ev)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone="muted">{rulesSummary(ev)}</Pill>
              <Pill tone="muted">
                <span className="num">{money(ev.fee)}</span>
              </Pill>
              {ev.maxAge ? <Pill tone="muted">Under {ev.maxAge}</Pill> : null}
              {ev.minAge ? <Pill tone="muted">{ev.minAge}+</Pill> : null}
              {locked && <Pill tone="ok">Draw published</Pill>}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button icon={<Icon name="edit" size={18} />} onClick={onEdit}>
              Edit event
            </Button>
            <ButtonLink
              to={`/admin/t/${t.id}/draws/${ev.id}`}
              variant={locked ? 'secondary' : 'primary'}
              icon={<Icon name="draws" size={18} />}
            >
              {locked ? 'View draw' : 'Make the draw'}
            </ButtonLink>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px] text-muted">
            <span>Accepted</span>
            <span className="num">
              {accepted} / {ev.cap}
            </span>
          </div>
          <ProgressBar value={accepted} max={ev.cap} tone="ink" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Entry status"
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'all', label: 'All', count: entries.length },
            { value: 'accepted', label: 'Accepted', count: accepted },
            { value: 'pending', label: 'To confirm', count: pending },
            { value: 'withdrawn', label: 'Withdrawn', count: entries.filter((e) => e.status === 'withdrawn').length },
          ]}
        />
        <Button className="ml-auto" icon={<Icon name="userAdd" size={18} />} onClick={() => setAdding(true)} disabled={locked}>
          Add entry
        </Button>
      </div>

      {locked && (
        <p className="flex items-start gap-2 rounded-2xl bg-sunken p-4 text-[14px] text-muted">
          <Icon name="info" size={18} className="mt-0.5 text-fg" />
          <span>
            The draw is published, so entries are locked. If someone pulls out now, give their opponent a walkover on the{' '}
            <Link to={`/admin/t/${t.id}/scores`} className="font-semibold text-fg underline underline-offset-2">
              Scores
            </Link>{' '}
            page.
          </span>
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          icon="users"
          title={filter === 'pending' ? 'Nothing to confirm' : 'No entries here'}
          body={filter === 'all' ? 'Players appear here when they register, or you can add them yourself.' : 'Try another filter.'}
        />
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden">
          <li className="hidden items-center gap-3 bg-sunken/60 px-5 py-2 sm:flex">
            <span className="eyebrow flex flex-1 items-center gap-1">
              {isDoubles(ev.kind) ? 'Pair' : 'Player'}
              {seedHelp && (
                <HelpTip label="Seed" className="-my-1">
                  {seedHelp}
                </HelpTip>
              )}
            </span>
            <span className="eyebrow">Status</span>
          </li>
          {shown.map((e) => {
            const ps = lk.playersOfEntry(e.id);
            const warn = ps.map((p) => eligibility(ev, t, p)).find(Boolean);
            return (
              <li
                key={e.id}
                className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5', e.status === 'withdrawn' && 'opacity-60')}
              >
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="flex min-w-0 items-center font-semibold">
                    <span className="truncate">{lk.entryName(e.id)}</span>
                    <SeedTag seed={e.seed} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {ps.map((p) => (
                      <label
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pl-2.5 pr-1 text-[12px] font-semibold"
                        title={`${p.name}'s skill level (used for pairing)`}
                      >
                        {ps.length > 1 ? p.name.split(' ')[0] : 'Level'}
                        <Select
                          aria-label={`Skill level for ${p.name}`}
                          value={p.level}
                          disabled={locked}
                          onChange={(ev2) => updatePlayer(p.id, { level: ev2.target.value as typeof p.level })}
                          className="min-h-7 w-auto gap-1 rounded-full border-0 bg-surface px-2.5 py-0 text-[12px] font-bold"
                        >
                          {(['A', 'B', 'C', 'D'] as const).map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ))}
                  </div>
                  <div className="mt-1 truncate text-[13px] text-muted">
                    {lk.entryClub(e.id)}
                    {warn && (
                      <span className="ml-2 inline-flex items-center gap-1 font-semibold text-warn">
                        <Icon name="alert" size={14} /> {warn}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {e.status === 'pending' && <Pill tone="warn">To confirm</Pill>}
                  {e.status === 'withdrawn' && <Pill tone="muted">Withdrawn</Pill>}
                  {e.status === 'accepted' && <Pill tone="ok">Accepted</Pill>}
                  {!locked && (
                    <>
                      {e.status !== 'accepted' && (
                        <Button
                          size="sm"
                          variant="soft"
                          className="min-h-11 sm:min-h-9"
                          icon={<Icon name="check" size={16} />}
                          onClick={() => setStatus(e.id, 'accepted')}
                        >
                          Accept
                        </Button>
                      )}
                      {e.status !== 'withdrawn' && (
                        <IconButton label={`Withdraw ${lk.entryName(e.id)}`} onClick={() => setStatus(e.id, 'withdrawn')}>
                          <Icon name="close" size={18} />
                        </IconButton>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <AddEntryDialog lk={lk} t={t} ev={ev} onClose={() => setAdding(false)} />}
    </section>
  );
}
