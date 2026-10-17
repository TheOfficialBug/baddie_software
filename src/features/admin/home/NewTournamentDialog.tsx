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

const TEMPLATES: Record<string, { label: string; events: { kind: EventKind; name?: string; mode: TEvent['mode']; maxAge?: number }[] }> = {
  open: {
    label: 'Open: MS, WS, MD, WD, XD',
    events: [
      { kind: 'MS', mode: 'drop_flight' },
      { kind: 'WS', mode: 'round_robin' },
      { kind: 'MD', mode: 'knockout' },
      { kind: 'WD', mode: 'round_robin' },
      { kind: 'XD', mode: 'drop_flight' },
    ],
  },
  juniors: {
    label: 'Juniors: U15 and U17 singles',
    events: [
      { kind: 'MS', name: "Boys' Singles U15", mode: 'round_robin', maxAge: 15 },
      { kind: 'WS', name: "Girls' Singles U15", mode: 'round_robin', maxAge: 15 },
      { kind: 'MS', name: "Boys' Singles U17", mode: 'knockout', maxAge: 17 },
      { kind: 'WS', name: "Girls' Singles U17", mode: 'knockout', maxAge: 17 },
    ],
  },
  empty: { label: 'Start empty', events: [] },
};

/** `orgId`: the organization that will run the tournament (its staff get access). */
export function NewTournamentDialog({ open, orgId, onClose }: { open: boolean; orgId: string; onClose: () => void }) {
  const create = useStore((s) => s.createTournament);
  const nav = useNavigate();
  const start0 = addDaysISO(todayISO(), 30);
  const [f, setF] = useState({
    name: 'Harvest Doubles 2026',
    venue: 'Riverside Sports Center',
    city: 'Ames, IA',
    start: start0,
    end: start0,
    courts: 6,
    template: 'open',
    firstRound: 'ONE_30' as RulesId | 'same',
    rules: 'BWF_3x21' as RulesId,
  });
  const rules: RulesId = f.rules;
  const firstRound = f.firstRound === 'same' ? undefined : f.firstRound;
  const err = !f.name.trim() ? 'Give the tournament a name.' : f.end < f.start ? 'The end date is before the start date.' : null;

  const submit = () => {
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
        venue: f.venue,
        city: f.city,
        startDate: f.start,
        endDate: f.end,
        status: 'registration',
        regCloses: addDaysISO(f.start, -7),
        rules,
        firstRound,
        restMinutes: 20,
        courts: Array.from({ length: f.courts }, (_, i) => ({ id: `c${i + 1}-${slug}`, name: `Court ${i + 1}` })),
      },
      TEMPLATES[f.template].events.map((e) => ({
        kind: e.kind,
        name: e.name ?? KIND_LABEL[e.kind],
        maxAge: e.maxAge,
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
          <Button variant="primary" onClick={submit} disabled={!!err}>
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
        <Field label="Name" className="sm:col-span-2" error={err ?? undefined}>
          {(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <Field label="Venue">{(id) => <Input id={id} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />}</Field>
        <Field label="City">{(id) => <Input id={id} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
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
        <Field label="Events" hint="A starting set. Add or remove events later.">
          {(id) => (
            <Select id={id} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
              {Object.entries(TEMPLATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
