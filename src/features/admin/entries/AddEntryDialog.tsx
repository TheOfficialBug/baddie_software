import { useMemo, useState } from 'react';

import type { TEvent, Tournament } from '@/engine/types';

import { eligibility, isDoubles } from '@/data/eligibility';
import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';

export function AddEntryDialog({ lk, t, ev, onClose }: { lk: Lookup; t: Tournament; ev: TEvent; onClose: () => void }) {
  const players = useStore((s) => s.players);
  const addEntry = useStore((s) => s.addEntry);
  const taken = useMemo(
    () =>
      new Set(
        lk
          .entriesOf(ev.id)
          .filter((e) => e.status !== 'withdrawn')
          .flatMap((e) => e.playerIds),
      ),
    [lk, ev.id],
  );
  const pool = useMemo(() => players.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)), [players, taken]);
  const men = pool.filter((p) => p.gender === 'M');
  const women = pool.filter((p) => p.gender === 'F');
  const listA = ev.kind === 'WS' || ev.kind === 'WD' ? women : men;
  const listB = ev.kind === 'XD' ? women : listA;
  const [a, setA] = useState(listA[0]?.id ?? '');
  const [b, setB] = useState(listB.find((p) => p.id !== listA[0]?.id)?.id ?? '');
  const doubles = isDoubles(ev.kind);
  const warn = [a, doubles ? b : undefined]
    .filter(Boolean)
    .map((id) => eligibility(ev, t, lk.player(id)!))
    .find(Boolean);

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
          <Button
            variant="primary"
            disabled={!a || (doubles && (!b || a === b))}
            onClick={() => {
              addEntry(ev.id, doubles ? [a, b] : [a], 'accepted');
              toast('Entry added');
              onClose();
            }}
          >
            Add entry
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={doubles ? 'Player 1' : 'Player'}>
          {(id) => (
            <Select id={id} value={a} onChange={(e) => setA(e.target.value)}>
              {listA.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.club}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {doubles && (
          <Field label="Partner">
            {(id) => (
              <Select id={id} value={b} onChange={(e) => setB(e.target.value)}>
                {listB
                  .filter((p) => p.id !== a)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.club}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
        {warn && (
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[13px] font-medium text-warn">
            <Icon name="alert" size={16} className="mt-0.5" /> Heads up: {warn}. You can still add them.
          </p>
        )}
      </div>
    </Dialog>
  );
}
