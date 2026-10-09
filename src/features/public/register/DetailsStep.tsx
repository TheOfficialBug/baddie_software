import { type Dispatch, type SetStateAction, useMemo } from 'react';

import type { Gender, Player, TEvent, Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';

import { eligibility, isDoubles } from '@/data/eligibility';
import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { EventChip } from '@/components/tournament/Badges';
import { LevelPicker } from '@/components/tournament/LevelPicker';
import { levelInfo } from '@/components/tournament/skillLevels';
import { Combobox } from '@/components/ui/Combobox';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

import { detailErrors, type EventDetails, formatOf, type Picks, type Registrant } from '@/features/public/register/registrationTypes';

type Props = {
  t: Tournament;
  me: Registrant;
  chosen: TEvent[];
  picked: Picks;
  setPicked: Dispatch<SetStateAction<Picks>>;
  /** Show validation messages (after the player tried to continue). */
  touched: boolean;
};

/** Step 3: your level for each event and, for doubles, who you play with. */
export function DetailsStep({ t, me, chosen, picked, setPicked, touched }: Props) {
  const update = (id: string, patch: Partial<EventDetails>) => setPicked((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  return (
    <section aria-labelledby="step-details" className="flex flex-col gap-4">
      <div>
        <h2 id="step-details" className="mb-1 font-display text-[18px] font-extrabold sm:text-[20px]">
          Levels &amp; partners
        </h2>
        <p className="text-[14px] text-muted">
          Your level can differ between singles and doubles. We use it to give everyone close, fair first matches.
        </p>
      </div>
      {chosen.map((ev) => (
        <EventDetailsCard
          key={ev.id}
          t={t}
          me={me}
          ev={ev}
          d={picked[ev.id]}
          touched={touched}
          onChange={(patch) => update(ev.id, patch)}
        />
      ))}
    </section>
  );
}

function EventDetailsCard({
  t,
  me,
  ev,
  d,
  touched,
  onChange,
}: {
  t: Tournament;
  me: Registrant;
  ev: TEvent;
  d: EventDetails;
  touched: boolean;
  onChange: (patch: Partial<EventDetails>) => void;
}) {
  const doubles = isDoubles(ev.kind);
  const format = formatOf(ev.kind);
  const errors = touched ? detailErrors(ev.kind, d) : {};
  const partnerFirst = d.partnerName.trim().split(/\s+/)[0];

  return (
    <article className="panel overflow-visible">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <EventChip kind={ev.kind} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{ev.name}</h3>
          <p className="text-[13px] text-muted">{format}</p>
        </div>
      </header>
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {doubles && <PartnerFields t={t} me={me} ev={ev} d={d} errors={errors} onChange={onChange} />}
        <LevelPicker
          label={doubles ? `Your ${format.toLowerCase()} level` : 'Your singles level'}
          value={d.myLevel}
          onChange={(myLevel) => onChange({ myLevel })}
          error={errors.myLevel}
        />
        {doubles && d.partnerMode === 'named' && (
          <LevelPicker
            label={partnerFirst ? `${partnerFirst}'s level` : "Your partner's level"}
            value={d.partnerLevel}
            onChange={(partnerLevel) => onChange({ partnerLevel })}
            error={errors.partnerLevel}
            hint={d.partnerId ? 'Filled in from their profile. Change it if it’s not right.' : undefined}
          />
        )}
        {d.myLevel && (!doubles || d.partnerMode === 'find' || d.partnerLevel) && (
          <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-muted">
            <Icon name="info" size={16} className="shrink-0" />
            {doubles && d.partnerMode === 'named'
              ? `Your pair plays as ${levelInfo(d.myLevel).title.toLowerCase()} + ${levelInfo(d.partnerLevel!).title.toLowerCase()}.`
              : `You'll be drawn against players around the ${levelInfo(d.myLevel).title.toLowerCase()} level first.`}
          </p>
        )}
      </div>
    </article>
  );
}

function PartnerFields({
  t,
  me,
  ev,
  d,
  errors,
  onChange,
}: {
  t: Tournament;
  me: Registrant;
  ev: TEvent;
  d: EventDetails;
  errors: ReturnType<typeof detailErrors>;
  onChange: (patch: Partial<EventDetails>) => void;
}) {
  const lk = useLookup();
  const players = useStore((s) => s.players);
  const options = useMemo(() => {
    const need: Gender | null = ev.kind === 'MD' ? 'M' : ev.kind === 'WD' ? 'F' : ev.kind === 'XD' ? (me.gender === 'M' ? 'F' : 'M') : null;
    return players
      .filter(
        (p: Player) => (!need || p.gender === need) && !eligibility(ev, t, p) && !lk.entriesOfPlayer(p.id).some((e) => e.eventId === ev.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ value: p.name, hint: `${p.club} · ${levelInfo(p.level).title}`, icon: 'user' as const, keywords: p.club, id: p.id }));
  }, [players, lk, ev, t, me.gender]);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={`Partner for ${ev.name}`} className="grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
        {(
          [
            ['named', 'I have a partner', 'users'],
            ['find', 'Find me one', 'search'],
          ] as const
        ).map(([mode, label, icon]) => {
          const on = d.partnerMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ partnerMode: mode })}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold transition-colors',
                on ? 'bg-surface text-fg shadow-lift' : 'text-muted hover:text-fg',
              )}
            >
              <Icon name={icon} size={16} /> {label}
            </button>
          );
        })}
      </div>

      {d.partnerMode === 'find' ? (
        <p className="text-[13.5px] text-muted">
          You'll be listed as looking for a partner. The organizer pairs players of a similar level before the draw.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Partner's name" required error={errors.partnerName} className={d.partnerId ? 'sm:col-span-2' : undefined}>
            {(id) => (
              <Combobox
                id={id}
                value={d.partnerName}
                onChange={(partnerName) => onChange({ partnerName, partnerId: undefined })}
                onPick={(o) => {
                  const p = options.find((x) => x.value === o.value);
                  const player = p && players.find((x) => x.id === p.id);
                  onChange({ partnerName: o.value, partnerId: p?.id, partnerLevel: d.partnerLevel ?? player?.level });
                }}
                options={options}
                placeholder="Type a name"
                invalid={!!errors.partnerName}
                autoComplete="off"
                customLabel={(text) => (
                  <>
                    <span className="font-semibold">{text}</span> isn't registered yet: add them
                  </>
                )}
              />
            )}
          </Field>
          {!d.partnerId && (
            <Field label="Partner's email" hint="Optional. We'll invite them to confirm." error={errors.partnerEmail}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  value={d.partnerEmail}
                  onChange={(e) => onChange({ partnerEmail: e.target.value })}
                  placeholder="partner@example.com"
                  aria-invalid={!!errors.partnerEmail || undefined}
                />
              )}
            </Field>
          )}
          {d.partnerId && (
            <p className="-mt-2 flex items-center gap-1.5 text-[13px] text-ok sm:col-span-2">
              <Icon name="check" size={15} strokeWidth={2.4} /> Already registered: you'll be entered as a pair.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
