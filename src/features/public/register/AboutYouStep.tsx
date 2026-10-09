import { useId, useMemo } from 'react';

import type { Gender, Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';

import { CLUBS } from '@/data/demo';
import { useStore } from '@/data/store';

import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';

import type { Registrant, RegistrantErrors } from '@/features/public/register/registrationTypes';

const NO_CLUB = 'No club';

const GENDERS: { value: Gender; label: string; hint: string }[] = [
  { value: 'F', label: "Women's events", hint: "Women's / girls' singles & doubles, mixed" },
  { value: 'M', label: "Men's events", hint: "Men's / boys' singles & doubles, mixed" },
];

type Props = {
  t: Tournament;
  me: Registrant;
  setMe: (me: Registrant) => void;
  /** Errors to show (only after the player tried to continue). */
  errors: RegistrantErrors;
  /** The email is the signed-in account's and can't be changed here. */
  emailLocked?: boolean;
};

/** Step 1: who is entering. Every field is required. */
export function AboutYouStep({ t, me, setMe, errors, emailLocked }: Props) {
  const players = useStore((s) => s.players);
  const clubOptions = useMemo<ComboOption[]>(() => {
    const counts = new Map<string, number>();
    for (const c of CLUBS) counts.set(c, 0);
    for (const p of players) if (p.club && p.club !== NO_CLUB) counts.set(p.club, (counts.get(p.club) ?? 0) + 1);
    return [
      ...[...counts].map(([c, n]) => ({ value: c, hint: n ? `${n} player${n === 1 ? '' : 's'}` : undefined, icon: 'users' as const })),
      { value: NO_CLUB, hint: 'I play independently', icon: 'user' as const },
    ];
  }, [players]);
  const year = Number(t.startDate.slice(0, 4));
  const genderName = useId();

  return (
    <section aria-labelledby="step-about">
      <h2 id="step-about" className="mb-1 font-display text-[clamp(20px,2.4vw,24px)] font-extrabold">
        About you
      </h2>
      <p className="mb-4 text-[14px] text-muted">We use this to check which events you can enter and to keep clubmates apart early on.</p>
      <div className="panel grid gap-5 p-4 sm:grid-cols-2 sm:p-6">
        <Field label="Full name" required error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={me.name}
              onChange={(e) => setMe({ ...me, name: e.target.value })}
              autoComplete="name"
              placeholder="e.g. Rhea Kapoor"
              aria-invalid={!!errors.name || undefined}
            />
          )}
        </Field>
        <Field
          label="Email"
          required
          hint={emailLocked ? 'Your account email. Receipts and match times go here.' : 'For your receipt and match times.'}
          error={errors.email}
        >
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              value={me.email}
              onChange={(e) => setMe({ ...me, email: e.target.value })}
              autoComplete="email"
              placeholder="you@example.com"
              readOnly={emailLocked}
              className={emailLocked ? 'bg-sunken text-muted' : undefined}
              aria-invalid={!!errors.email || undefined}
            />
          )}
        </Field>

        <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1.5 text-[14px] font-semibold">
            You play in
            <span className="ml-0.5 text-live" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required)</span>
          </legend>
          <div className="grid gap-2 xs:grid-cols-2">
            {GENDERS.map((g) => {
              const on = me.gender === g.value;
              return (
                <label
                  key={g.value}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-4 py-2.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-info/40',
                    on ? 'border-fg bg-surface' : cn('hover:border-fg/40', errors.gender ? 'border-live/50' : 'border-line'),
                  )}
                >
                  <input
                    type="radio"
                    name={genderName}
                    className="sr-only"
                    checked={on}
                    onChange={() => setMe({ ...me, gender: g.value })}
                  />
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px]',
                      on ? 'border-fg bg-fg text-bg' : 'border-line-strong',
                    )}
                  >
                    {on && <span className="h-2 w-2 rounded-full bg-bg" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{g.label}</span>
                    <span className="block text-[12.5px] text-muted">{g.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.gender && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-live">
              <Icon name="alert" size={15} /> {errors.gender}
            </p>
          )}
        </fieldset>

        <Field label="Year of birth" required hint={`Age groups use your age on Dec 31, ${year}.`} error={errors.birthYear}>
          {(id) => (
            <Select
              id={id}
              value={me.birthYear ?? ''}
              onChange={(e) => setMe({ ...me, birthYear: Number(e.target.value) || undefined })}
              className={errors.birthYear ? 'border-live/70' : undefined}
            >
              {Array.from({ length: 70 }, (_, i) => year - 8 - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Club"
          required
          hint="Pick from the list or type your club's name. Clubmates are kept apart in the first round."
          error={errors.club}
        >
          {(id) => (
            <Combobox
              id={id}
              value={me.club}
              onChange={(club) => setMe({ ...me, club })}
              options={clubOptions}
              placeholder="Search or type a club"
              invalid={!!errors.club}
              customLabel={(text) => (
                <>
                  Use <span className="font-semibold">“{text}”</span> as a new club
                </>
              )}
            />
          )}
        </Field>
      </div>
    </section>
  );
}
