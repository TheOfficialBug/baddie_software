import { useState } from 'react';
import { useNavigate } from 'react-router';

import { BWF_3X15_FROM, RULES } from '@/engine/rules';
import type { EventKind, RulesId, TEvent } from '@/engine/types';

import { addDaysISO, todayISO } from '@/lib/format';

import { KIND_LABEL } from '@/data/catalog';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Stepper } from '@/components/ui/Stepper';

/** Draw format each standard event starts with (changed per event before drawing). */
const STANDARD: { kind: EventKind; mode: TEvent['mode'] }[] = [
  { kind: 'MS', mode: 'drop_flight' },
  { kind: 'WS', mode: 'round_robin' },
  { kind: 'MD', mode: 'knockout' },
  { kind: 'WD', mode: 'round_robin' },
  { kind: 'XD', mode: 'drop_flight' },
];

interface EventChoice {
  key: string;
  kind: EventKind;
  name: string;
  mode: TEvent['mode'];
  on: boolean;
  custom?: boolean;
}

const KINDS = Object.keys(KIND_LABEL) as EventKind[];

/** `orgId`: the organization that will run the tournament (its staff get access). */
export function NewTournamentDialog({ open, orgId, onClose }: { open: boolean; orgId: string; onClose: () => void }) {
  const create = useStore((s) => s.createTournament);
  const nav = useNavigate();
  const start0 = addDaysISO(todayISO(), 30);
  const [f, setF] = useState({
    name: '',
    venue: '',
    city: '',
    start: start0,
    end: start0,
    courts: 6,
    firstRound: 'ONE_30' as RulesId | 'same',
    rules: 'BWF_3x21' as RulesId,
  });
  const [events, setEvents] = useState<EventChoice[]>(() =>
    STANDARD.map((e) => ({ key: e.kind, kind: e.kind, name: KIND_LABEL[e.kind], mode: e.mode, on: true })),
  );
  const [custom, setCustom] = useState<{ name: string; kind: EventKind }>({ name: '', kind: 'MS' });
  const addCustom = () => {
    const name = custom.name.trim();
    if (!name) return;
    setEvents([...events, { key: `custom-${Date.now()}`, kind: custom.kind, name, mode: 'round_robin', on: true, custom: true }]);
    setCustom({ ...custom, name: '' });
  };
  const rules: RulesId = f.rules;
  const firstRound = f.firstRound === 'same' ? undefined : f.firstRound;
  const err = !f.name.trim() ? 'Give the tournament a name.' : f.end < f.start ? 'The end date is before the start date.' : null;
  // problems show once the organizer tries to create, not while the form is still empty
  const [tried, setTried] = useState(false);

  const submit = () => {
    setTried(true);
    if (err) return;
    const slug =
      f.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Math.random().toString(36).slice(2, 5);
    const id = create(
      {
        slug,
        organizationId: orgId,
        name: f.name.trim(),
        venue: f.venue.trim(),
        city: f.city.trim(),
        startDate: f.start,
        endDate: f.end,
        status: 'registration',
        regCloses: addDaysISO(f.start, -7),
        rules,
        firstRound,
        restMinutes: 20,
        courts: Array.from({ length: f.courts }, (_, i) => ({ id: `c${i + 1}-${slug}`, name: `Court ${i + 1}` })),
      },
      events
        .filter((e) => e.on)
        .map((e) => ({
          kind: e.kind,
          name: e.name,
          fee: e.kind.endsWith('S') ? 30 : 25,
          cap: 32,
          rules,
          mode: e.mode,
          config: { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: false, plate: false, seeds: 0, firstRound },
          drawState: 'none',
        })),
    );
    toast(`${f.name} created. Registration is open.`);
    onClose();
    nav(`/admin/t/${id}/entries`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New tournament"
      subtitle="You can change any of this later in Settings."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={tried && !!err}>
            Create tournament
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" className="sm:col-span-2" error={(tried && err) || undefined}>
          {(id) => (
            <Input id={id} value={f.name} placeholder="e.g. Harvest Doubles 2026" onChange={(e) => setF({ ...f, name: e.target.value })} />
          )}
        </Field>
        <Field label="Venue">
          {(id) => (
            <Input
              id={id}
              value={f.venue}
              placeholder="e.g. Riverside Sports Center"
              onChange={(e) => setF({ ...f, venue: e.target.value })}
            />
          )}
        </Field>
        <Field label="City">
          {(id) => <Input id={id} value={f.city} placeholder="e.g. Ames, IA" onChange={(e) => setF({ ...f, city: e.target.value })} />}
        </Field>
        <Field label="First day">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={f.start}
              onChange={(e) => setF({ ...f, start: e.target.value, end: e.target.value > f.end ? e.target.value : f.end })}
            />
          )}
        </Field>
        <Field label="Last day">
          {(id) => <Input id={id} type="date" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} />}
        </Field>
        <Field label="Courts" hint="How many courts you can use at the venue.">
          {(id) => (
            <Stepper
              id={id}
              label="Courts"
              value={f.courts}
              min={1}
              max={40}
              onChange={(v) => setF({ ...f, courts: v })}
              suffix={f.courts === 1 ? 'court' : 'courts'}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-[14px] font-semibold">Events</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {events.map((e) => (
              <label
                key={e.key}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 hover:bg-sunken"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={e.on}
                  onChange={() => setEvents(events.map((x) => (x.key === e.key ? { ...x, on: !x.on } : x)))}
                />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.custom && <span className="text-[12.5px] text-muted">{KIND_LABEL[e.kind]}</span>}
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <Input
              aria-label="Custom event name"
              value={custom.name}
              placeholder="Add a custom event, e.g. Men's Doubles 40+"
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Select
              aria-label="Custom event type"
              value={custom.kind}
              onChange={(e) => setCustom({ ...custom, kind: e.target.value as EventKind })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={addCustom} disabled={!custom.name.trim()}>
              Add event
            </Button>
          </div>
          <p className="text-[13px] text-muted">
            Tick the events you&apos;ll run. The type decides who can enter (men, women, mixed pairs). Fees, caps and draw formats are set
            per event later.
          </p>
        </fieldset>
        <Field
          label="First round scoring"
          hint={
            f.firstRound === 'same'
              ? 'Round 1 uses the same scoring as the other rounds.'
              : `${RULES[f.firstRound].note} Round-robin events use it for all group matches.`
          }
        >
          {(id) => (
            <Select id={id} value={f.firstRound} onChange={(e) => setF({ ...f, firstRound: e.target.value as RulesId | 'same' })}>
              <option value="same">Same as other rounds</option>
              {Object.values(RULES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Other rounds" hint={`${RULES[rules].note} BWF's standard becomes 3×15 on ${BWF_3X15_FROM}.`}>
          {(id) => (
            <Select id={id} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value as RulesId })}>
              {Object.values(RULES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id === 'BWF_3x21'
                    ? 'Best of 3 games to 21 (BWF 3×21)'
                    : r.id === 'BWF_3x15'
                      ? 'Best of 3 games to 15 (BWF 3×15)'
                      : r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
