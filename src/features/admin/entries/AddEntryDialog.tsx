import { useMemo, useState } from 'react';

import type { Gender, ID, Player, SkillLevel, TEvent, Tournament } from '@/engine/types';

import { eligibility, isDoubles } from '@/data/eligibility';
import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { SKILL_LEVELS } from '@/components/tournament/skillLevels';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';

/** One player slot: an existing player, or a new (walk-in) player typed by name. */
interface Slot {
  name: string;
  playerId?: ID;
  club: string;
  level: SkillLevel;
}
const emptySlot = (): Slot => ({ name: '', club: '', level: 'C' });

function SlotFields({
  label,
  slot,
  onChange,
  options,
  clubs,
  players,
}: {
  label: string;
  slot: Slot;
  onChange: (s: Slot) => void;
  options: ComboOption[];
  clubs: ComboOption[];
  players: Player[];
}) {
  const isNew = !slot.playerId && slot.name.trim().length > 1;
  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={isNew ? 'New player: added to the tournament with this entry.' : 'Pick a player, or type a new name.'}>
        {(id) => (
          <Combobox
            id={id}
            value={slot.name}
            onChange={(name) => onChange({ ...slot, name, playerId: undefined })}
            onPick={(o) => {
              const p = players.find((x) => x.name === o.value);
              onChange({ ...slot, name: o.value, playerId: p?.id, club: p?.club ?? slot.club, level: p?.level ?? slot.level });
            }}
            options={options}
            placeholder="Search players or type a name"
            customLabel={(t) => (
              <>
                Add <span className="font-semibold">{t}</span> as a new player
              </>
            )}
          />
        )}
      </Field>
      {isNew && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Club">
            {(id) => (
              <Combobox
                id={id}
                value={slot.club}
                onChange={(club) => onChange({ ...slot, club })}
                options={clubs}
                placeholder="Club or “No club”"
                customLabel={(t) => <>Use “{t}”</>}
              />
            )}
          </Field>
          <Field label="Level">
            {(id) => (
              <Select id={id} value={slot.level} onChange={(e) => onChange({ ...slot, level: e.target.value as SkillLevel })}>
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
    </div>
  );
}

/** Organizer adds an entry: any player (rules can be overridden after a warning), or a walk-in. */
export function AddEntryDialog({ lk, t, ev, onClose }: { lk: Lookup; t: Tournament; ev: TEvent; onClose: () => void }) {
  const players = useStore((s) => s.players);
  const addEntry = useStore((s) => s.addEntry);
  const addPlayer = useStore((s) => s.addPlayer);
  const doubles = isDoubles(ev.kind);
  const genderOf = (slot: 0 | 1): Gender =>
    ev.kind === 'WS' || ev.kind === 'WD' ? 'F' : ev.kind === 'XD' ? (slot === 0 ? 'M' : 'F') : 'M';

  const live = lk.entriesOf(ev.id).filter((e) => e.status !== 'withdrawn');
  const taken = useMemo(() => new Set(live.flatMap((e) => e.playerIds)), [live]);
  const optionsFor = (slot: 0 | 1): ComboOption[] =>
    players
      .filter((p) => p.gender === genderOf(slot) && !taken.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ value: p.name, hint: `${p.club} · level ${p.level}`, icon: 'user' as const, keywords: p.club }));
  const clubs = useMemo<ComboOption[]>(
    () =>
      [...new Set(players.map((p) => p.club))]
        .filter((c) => c && c !== 'No club')
        .sort()
        .concat('No club')
        .map((c) => ({ value: c })),
    [players],
  );

  const [a, setA] = useState<Slot>(emptySlot);
  const [b, setB] = useState<Slot>(emptySlot);
  const slots = doubles ? [a, b] : [a];
  const filled = slots.every((s) => s.playerId || s.name.trim().length > 1);
  const same = doubles && a.playerId && a.playerId === b.playerId;

  // Rules the organizer may override: eligibility (age/gender), the event's entry limit, closed registration.
  const warnings = [
    ...slots.map((s) => (s.playerId ? eligibility(ev, t, lk.player(s.playerId)!) : null)).filter((w): w is string => !!w),
    live.length >= ev.cap ? `${ev.name} is full (${ev.cap} entries)` : null,
    t.status !== 'registration' && t.status !== 'draft' ? 'registration is closed' : null,
  ].filter((w): w is string => !!w);

  const save = () => {
    const ids = slots.map((s, i) =>
      s.playerId
        ? s.playerId
        : addPlayer({
            name: s.name.trim(),
            gender: genderOf(i as 0 | 1),
            club: s.club.trim() || 'No club',
            level: s.level,
            birthYear: Number(t.startDate.slice(0, 4)) - 25,
          }),
    );
    addEntry(ev.id, ids, 'accepted');
    toast('Entry added', { detail: warnings.length ? `Added despite: ${warnings.join('; ')}.` : undefined });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add entry to ${ev.name}`}
      subtitle="Entries you add are accepted straight away."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!filled || !!same} onClick={save}>
            {warnings.length ? 'Add anyway' : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <SlotFields
          label={doubles ? 'Player 1' : 'Player'}
          slot={a}
          onChange={setA}
          options={optionsFor(0)}
          clubs={clubs}
          players={players}
        />
        {doubles && <SlotFields label="Partner" slot={b} onChange={setB} options={optionsFor(1)} clubs={clubs} players={players} />}
        {same && <p className="text-[13px] font-medium text-live">Pick two different players.</p>}
        {warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[13px] font-medium text-warn">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <div>Heads up: {warnings.join('; ')}. As an organizer you can still add this entry.</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
