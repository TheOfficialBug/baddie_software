import { useState } from 'react';
import { useParams } from 'react-router';

import { RULES } from '@/engine/rules';
import type { RulesId, Tournament } from '@/engine/types';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { GLOSSARY } from '@/components/help/glossary';
import { NotFound } from '@/components/NotFound';
import { Pill } from '@/components/tournament/Badges';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHead } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

import { TeamSection } from '@/features/admin/settings/TeamSection';

const restHelp = GLOSSARY.find((g) => g.term === 'Rest time')?.body;

export function Settings() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  if (!t) return <NotFound what="tournament" />;
  return (
    <SettingsForm
      key={t.id}
      t={t}
      busyCourts={
        new Set(
          lk
            .matchesOf(t.id)
            .filter((m) => m.status === 'on_court')
            .map((m) => m.courtId!),
        )
      }
    />
  );
}

function SettingsForm({ t, busyCourts }: { t: Tournament; busyCourts: Set<string> }) {
  const update = useStore((s) => s.updateTournament);
  const reset = useStore((s) => s.resetDemo);
  const [f, setF] = useState(t);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(t);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <PageHeader eyebrow={t.name} title="Settings" description="Tournament details, courts, your team and how this device looks." />

      <section aria-labelledby="set-details">
        <SectionHead title={<span id="set-details">Tournament details</span>} description="Players see these on the public page." />
        <div className="panel grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Name" className="sm:col-span-2">
            {(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
          </Field>
          <Field label="Venue">{(id) => <Input id={id} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />}</Field>
          <Field label="City">{(id) => <Input id={id} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
          <Field label="Status" hint="Controls what the public page shows.">
            {(id) => (
              <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Tournament['status'] })}>
                <option value="draft">Draft (hidden)</option>
                <option value="registration">Registration open</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
              </Select>
            )}
          </Field>
          <Field label="Minimum rest between matches" hint="BWF minimum is 60 min; clubs often use 20–30." help={restHelp}>
            {(id) => (
              <Select id={id} value={f.restMinutes} onChange={(e) => setF({ ...f, restMinutes: Number(e.target.value) })}>
                {[0, 10, 15, 20, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'No minimum' : `${n} minutes`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Default scoring for new events" className="sm:col-span-2" hint={RULES[f.rules].note}>
            {(id) => (
              <Select id={id} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value as RulesId })}>
                {Object.values(RULES).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-5 sm:col-span-2">
            <Button
              variant="primary"
              disabled={!dirty}
              icon={<Icon name="check" size={18} />}
              onClick={() => {
                update(t.id, f);
                toast('Settings saved');
              }}
            >
              Save changes
            </Button>
            {dirty ? (
              <>
                <Button variant="ghost" onClick={() => setF(t)}>
                  Discard
                </Button>
                <span className="text-[13px] text-warn">You have unsaved changes.</span>
              </>
            ) : (
              <span className="text-[13px] text-muted">All changes saved.</span>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="set-courts">
        <SectionHead
          title={<span id="set-courts">Courts</span>}
          eyebrow={
            <>
              <span className="num">{t.courts.length}</span> {t.courts.length === 1 ? 'court' : 'courts'}
            </>
          }
          description="Rename courts to match the signs in the hall. Changes save when you leave the box."
        />
        <ul className="panel divide-y divide-line">
          {t.courts.map((c, i) => {
            const busy = busyCourts.has(c.id);
            return (
              <li key={c.id} className="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
                <span className="num hidden w-6 shrink-0 text-[13px] text-faint xs:inline">{i + 1}</span>
                <Input
                  aria-label={`Court ${i + 1} name`}
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== c.name) update(t.id, { courts: t.courts.map((x) => (x.id === c.id ? { ...x, name } : x)) });
                  }}
                  className="min-w-0 flex-1 sm:max-w-xs"
                />
                {busy && <Pill tone="live">In use</Pill>}
                <IconButton
                  label={busy ? `${c.name} is in use` : `Remove ${c.name}`}
                  className="ml-auto"
                  disabled={busy || t.courts.length <= 1}
                  onClick={() => update(t.id, { courts: t.courts.filter((x) => x.id !== c.id) })}
                >
                  <Icon name="delete" size={19} />
                </IconButton>
              </li>
            );
          })}
          <li className="px-4 py-3 sm:px-5">
            <Button
              icon={<Icon name="add" size={18} />}
              onClick={() =>
                update(t.id, { courts: [...t.courts, { id: `${t.id}-c${Date.now().toString(36)}`, name: `Court ${t.courts.length + 1}` }] })
              }
            >
              Add court
            </Button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="set-look">
        <SectionHead title={<span id="set-look">Appearance</span>} />
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">Theme on this device</div>
            <div className="text-[13px] text-muted">Auto follows your device's light or dark setting.</div>
          </div>
          <ThemeToggle labels className="w-full sm:w-auto" />
        </div>
      </section>

      <TeamSection orgId={t.organizationId} />

      <section aria-labelledby="set-demo">
        <SectionHead title={<span id="set-demo">Demo data</span>} />
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">Start over</div>
            <div className="text-[13px] text-muted">Puts every tournament back to the starting demo state. This can't be undone.</div>
          </div>
          <Button
            variant={confirm ? 'danger' : 'secondary'}
            icon={<Icon name="refresh" size={18} />}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              reset();
              setConfirm(false);
            }}
          >
            {confirm ? 'Tap again to reset' : 'Reset demo data'}
          </Button>
        </div>
      </section>
    </div>
  );
}
