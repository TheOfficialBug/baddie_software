import { useState } from 'react';

import { RULES } from '@/engine/rules';
import type { EventKind, Mode, RulesId, TEvent, Tournament } from '@/engine/types';

import { KIND_LABEL } from '@/data/catalog';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { MODE_LABEL, modeSummary } from '@/components/draw/modeLabels';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Tabs';

const NEW_CONFIG: TEvent['config'] = { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: false, plate: false, seeds: 0 };

const MODES: { value: Mode; label: string }[] = [
  { value: 'drop_flight', label: 'Drop flight' },
  { value: 'round_robin', label: 'Round robin' },
  { value: 'knockout', label: 'Knockout' },
];

export function EventDialog({ t, ev, onClose }: { t: Tournament; ev: TEvent | null; onClose: (id?: string) => void }) {
  const addEvent = useStore((s) => s.addEvent);
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const [f, setF] = useState(() => ({
    kind: ev?.kind ?? ('MS' as EventKind),
    name: ev?.name ?? KIND_LABEL.MS,
    mode: ev?.mode ?? ('knockout' as Mode),
    fee: ev?.fee ?? 30,
    cap: ev?.cap ?? 32,
    maxAge: ev?.maxAge ?? 0,
    minAge: ev?.minAge ?? 0,
    rules: ev?.rules ?? t.rules,
    firstRound: (ev ? ev.config.firstRound : t.firstRound) ?? ('same' as RulesId | 'same'),
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = ev?.drawState === 'published';

  const save = () => {
    const base = {
      kind: f.kind,
      name: f.name.trim() || KIND_LABEL[f.kind],
      mode: f.mode,
      fee: f.fee,
      cap: f.cap,
      maxAge: f.maxAge || undefined,
      minAge: f.minAge || undefined,
      rules: f.rules as RulesId,
    };
    const firstRound = f.firstRound === 'same' ? undefined : f.firstRound;
    if (ev) {
      updateEvent(ev.id, { ...base, config: { ...ev.config, firstRound } });
      toast('Event updated');
      onClose(ev.id);
    } else {
      const id = addEvent(t.id, {
        ...base,
        config: { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: false, plate: false, seeds: 0, firstRound },
        drawState: 'none',
      });
      toast(`${base.name} added`);
      onClose(id);
    }
  };

  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={ev ? `Edit ${ev.name}` : 'Add event'}
      subtitle={ev ? undefined : 'Players can enter it as soon as you save.'}
      footer={
        <>
          {ev && !locked && (
            <Button
              variant={confirmDelete ? 'danger' : 'ghost'}
              className="mr-auto"
              icon={<Icon name="delete" size={18} />}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteEvent(ev.id);
                toast('Event deleted');
                onClose();
              }}
            >
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {ev ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event type">
          {(id) => (
            <Select
              id={id}
              value={f.kind}
              disabled={locked}
              onChange={(e) =>
                setF({
                  ...f,
                  kind: e.target.value as EventKind,
                  name: f.name === KIND_LABEL[f.kind] ? KIND_LABEL[e.target.value as EventKind] : f.name,
                })
              }
            >
              {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
                <option key={k} value={k}>
                  {k} · {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name shown to players">
          {(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <div className="text-[14px] font-semibold">Format</div>
          {locked ? (
            <p className="text-[13px] text-muted">{MODE_LABEL[f.mode]}. Unpublish the draw to change the format.</p>
          ) : (
            <>
              <Segmented label="Format" value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={MODES} className="self-start" />
              <p className="text-[13px] text-muted">{modeSummary({ mode: f.mode, config: ev?.config ?? NEW_CONFIG } as TEvent)}</p>
            </>
          )}
        </div>
        <Field label="Entry fee ($ per player)">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              value={f.fee}
              onChange={(e) => setF({ ...f, fee: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Maximum entries">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={2}
              value={f.cap}
              onChange={(e) => setF({ ...f, cap: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="Age group" hint="Juniors: under N all calendar year. Masters: N or older this year.">
          {(id) => (
            <Select
              id={id}
              value={f.maxAge ? `u${f.maxAge}` : f.minAge ? `o${f.minAge}` : ''}
              onChange={(e) => {
                const v = e.target.value;
                setF({ ...f, maxAge: v.startsWith('u') ? Number(v.slice(1)) : 0, minAge: v.startsWith('o') ? Number(v.slice(1)) : 0 });
              }}
            >
              <option value="">Open (any age)</option>
              {[11, 13, 15, 17, 19].map((a) => (
                <option key={a} value={`u${a}`}>
                  Under {a}
                </option>
              ))}
              {[35, 40, 45, 50, 55, 60].map((a) => (
                <option key={a} value={`o${a}`}>
                  {a}+
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="First round scoring"
          hint={
            f.firstRound === 'same'
              ? 'Same as the other rounds.'
              : f.mode === 'round_robin'
                ? 'Used for every group match.'
                : 'Used when both players are playing their first match. A player coming off a bye who meets someone who has played, and players who drop to a lower flight or the plate, play the normal format.'
          }
        >
          {(id) => (
            <Select
              id={id}
              value={f.firstRound}
              disabled={locked}
              onChange={(e) => setF({ ...f, firstRound: e.target.value as RulesId | 'same' })}
            >
              <option value="same">Same as other rounds</option>
              {Object.values(RULES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Other rounds" hint={RULES[f.rules].note}>
          {(id) => (
            <Select id={id} value={f.rules} disabled={locked} onChange={(e) => setF({ ...f, rules: e.target.value as RulesId })}>
              {Object.values(RULES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
