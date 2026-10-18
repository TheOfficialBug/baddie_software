import { useMemo, useState } from 'react';

import type { Gender, ID, SkillLevel, TEvent, Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';

import { isDoubles } from '@/data/eligibility';
import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { EventChip } from '@/components/tournament/Badges';
import { SKILL_LEVELS } from '@/components/tournament/skillLevels';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Tabs';

/** Who may play an event, by gender (mixed: anyone, the partner is the other gender). */
const FITS: Record<TEvent['kind'], (g: Gender) => boolean> = {
  MS: (g) => g === 'M',
  MD: (g) => g === 'M',
  WS: (g) => g === 'F',
  WD: (g) => g === 'F',
  XD: () => true,
};
/** The partner's gender in a doubles event. */
const partnerGender = (k: TEvent['kind'], g: Gender): Gender => (k === 'XD' ? (g === 'M' ? 'F' : 'M') : g);

/**
 * Organizer enters one player by hand, like a row of the entry list: name, gender, club, singles and doubles
 * levels, and the events they play, with a partner for each doubles event (a player already in the
 * tournament, a name for a partner who hasn't registered, or none yet). Entries are accepted straight away,
 * except doubles with no partner given, which wait for one.
 */
export function AddPlayerDialog({ lk, t, onClose }: { lk: Lookup; t: Tournament; onClose: () => void }) {
  const players = useStore((s) => s.players);
  const addPlayer = useStore((s) => s.addPlayer);
  const addEntry = useStore((s) => s.addEntry);
  const completePair = useStore((s) => s.completePair);
  const events = lk.eventsOf(t.id);

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [club, setClub] = useState('');
  const [singles, setSingles] = useState<SkillLevel>('C');
  const [doubles, setDoubles] = useState<SkillLevel>('C');
  const [picked, setPicked] = useState<ID[]>([]);
  const [partners, setPartners] = useState<Record<ID, string>>({});

  // someone already in the tournament with this name and gender: their new entries are added to them
  const existing = players.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.gender === gender);
  const live = (eventId: ID) => lk.entriesOf(eventId).filter((e) => e.status !== 'withdrawn');
  const enteredIn = (eventId: ID) => !!existing && live(eventId).some((e) => e.playerIds.includes(existing.id));
  const fits = events.filter((e) => FITS[e.kind](gender));

  const clubs = useMemo<ComboOption[]>(
    () =>
      [...new Set(players.map((p) => p.club))]
        .filter((c) => c && c !== 'No club')
        .sort()
        .concat('No club')
        .map((c) => ({ value: c })),
    [players],
  );
  /** Partners for a doubles event: players of the right gender not already in a pair there. */
  const partnerOptions = (ev: TEvent): ComboOption[] => {
    const paired = new Set(
      live(ev.id)
        .filter((e) => e.playerIds.length > 1)
        .flatMap((e) => e.playerIds),
    );
    const solo = new Set(
      live(ev.id)
        .filter((e) => e.playerIds.length === 1)
        .flatMap((e) => e.playerIds),
    );
    return players
      .filter((p) => p.gender === partnerGender(ev.kind, gender) && !paired.has(p.id) && p.id !== existing?.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        value: p.name,
        hint: `${p.club} · level ${p.level}${solo.has(p.id) ? ' · entered, waiting for a partner' : ''}`,
        icon: 'user' as const,
        keywords: p.club,
      }));
  };

  const ok = name.trim().length > 1 && picked.length > 0;
  const toggle = (id: ID) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const save = () => {
    const pid =
      existing?.id ??
      addPlayer({
        name: name.trim(),
        gender,
        club: club.trim() || 'No club',
        // the general level: singles when they play singles (or no doubles), else doubles
        level:
          picked.some((id) => isDoubles(lk.event(id)!.kind)) && !picked.some((id) => !isDoubles(lk.event(id)!.kind)) ? doubles : singles,
        birthYear: Number(t.startDate.slice(0, 4)) - 25,
      });
    let waiting = 0;
    for (const id of picked) {
      const ev = lk.event(id)!;
      if (!isDoubles(ev.kind)) {
        addEntry(id, [pid], 'accepted', { levels: [singles] });
        continue;
      }
      const typed = (partners[id] ?? '').trim();
      const partner = typed ? players.find((p) => p.name === typed && p.gender === partnerGender(ev.kind, gender)) : undefined;
      const theirs = partner && live(id).find((e) => e.playerIds.length === 1 && e.playerIds[0] === partner.id);
      if (theirs) completePair(theirs.id, pid, doubles);
      else if (partner) addEntry(id, [pid, partner.id], 'accepted', { levels: [doubles, partner.level] });
      else if (typed) addEntry(id, [pid], 'accepted', { levels: [doubles], pendingPartner: { name: typed, level: doubles } });
      else {
        addEntry(id, [pid], 'pending', { levels: [doubles] });
        waiting++;
      }
    }
    toast(existing ? `Entries added for ${existing.name}` : `${name.trim()} added`, {
      detail: `${picked.length} ${picked.length === 1 ? 'event' : 'events'}${waiting ? ` · ${waiting} waiting for a partner` : ''}.`,
    });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a player"
      subtitle={`${t.name} · entries you add are accepted straight away`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            Add player
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field
            label="Name"
            hint={existing ? `${existing.name} is already in the tournament: these entries are added to them.` : 'First and last name.'}
          >
            {(id) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Alex Kim" />
            )}
          </Field>
          <Field label="Gender">
            {() => (
              <Segmented
                label="Gender"
                value={gender}
                onChange={(g) => {
                  setGender(g);
                  setPicked([]);
                  setPartners({});
                }}
                options={[
                  { value: 'M', label: 'Male' },
                  { value: 'F', label: 'Female' },
                ]}
              />
            )}
          </Field>
        </div>

        {!existing && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Club">
              {(id) => (
                <Combobox
                  id={id}
                  value={club}
                  onChange={setClub}
                  options={clubs}
                  placeholder="Club or “No club”"
                  customLabel={(c) => <>Use “{c}”</>}
                />
              )}
            </Field>
            <Field label="Singles level">
              {(id) => (
                <Select id={id} value={singles} onChange={(e) => setSingles(e.target.value as SkillLevel)}>
                  {SKILL_LEVELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.title} ({s.value})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Doubles level">
              {(id) => (
                <Select id={id} value={doubles} onChange={(e) => setDoubles(e.target.value as SkillLevel)}>
                  {SKILL_LEVELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.title} ({s.value})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Events</span>
          {fits.length === 0 && <p className="text-[13px] text-muted">No events in this tournament fit this player.</p>}
          <ul className="flex flex-col gap-2">
            {fits.map((ev) => {
              const on = picked.includes(ev.id);
              const already = enteredIn(ev.id);
              return (
                <li key={ev.id} className={cn('rounded-xl border', on ? 'border-fg' : 'border-line')}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={already}
                    onClick={() => toggle(ev.id)}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left disabled:opacity-50"
                  >
                    <Icon name={on ? 'check' : 'plus'} size={16} className={on ? 'text-fg' : 'text-muted'} />
                    <EventChip kind={ev.kind} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ev.name}</span>
                    {already && <span className="text-[12px] text-muted">already entered</span>}
                    {ev.drawState === 'published' && !already && <span className="text-[12px] text-warn">draw published</span>}
                  </button>
                  {on && isDoubles(ev.kind) && (
                    <div className="border-t border-line px-3 py-2.5">
                      <Field
                        label="Partner"
                        hint="Pick a player, type a name for a partner who hasn't registered, or leave empty to add them later."
                      >
                        {(id) => (
                          <Combobox
                            id={id}
                            value={partners[ev.id] ?? ''}
                            onChange={(v) => setPartners((x) => ({ ...x, [ev.id]: v }))}
                            onPick={(o) => setPartners((x) => ({ ...x, [ev.id]: o.value }))}
                            options={partnerOptions(ev)}
                            placeholder="Search players or type a name"
                            customLabel={(v) => (
                              <>
                                Partner <span className="font-semibold">{v}</span> (not registered yet)
                              </>
                            )}
                          />
                        )}
                      </Field>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
