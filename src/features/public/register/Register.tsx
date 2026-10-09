import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePersistentState } from '@/hooks/usePersistentState';
import { fmtDate, fmtDateRange } from '@/lib/format';

import { isDoubles } from '@/data/eligibility';
import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { useAccess } from '@/auth/useAccess';

import { NotFound } from '@/components/NotFound';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { AboutYouStep } from '@/features/public/register/AboutYouStep';
import { DetailsStep } from '@/features/public/register/DetailsStep';
import { EventsStep } from '@/features/public/register/EventsStep';
import { RegistrationClosed, RegistrationDone } from '@/features/public/register/RegistrationStatus';
import {
  detailErrors,
  emptyRegistrant,
  hasErrors,
  type Picks,
  type Registrant,
  registrantErrors,
  STEPS,
  toRegistrationPick,
} from '@/features/public/register/registrationTypes';
import { ReviewStep } from '@/features/public/register/ReviewStep';
import { StepProgress } from '@/features/public/register/StepProgress';
import { WizardActionBar } from '@/features/public/register/WizardActionBar';

/** Four-step entry wizard: about you → events → levels & partners → review & pay. */
export function Register() {
  const { slug } = useParams();
  const lk = useLookup();
  const t = lk.bySlug(slug);
  useDocumentTitle('Register', t?.name);
  const nav = useNavigate();
  const addPlayer = useStore((s) => s.addPlayer);
  const register = useStore((s) => s.register);
  const updatePlayer = useStore((s) => s.updatePlayer);
  const { user, playerId } = useAccess();
  const linked = lk.player(playerId ?? undefined);

  const draftKey = (part: string) => (t && user ? `register.${part}:${t.id}:${user.id}` : null);
  const [step, setStep, clearStep] = usePersistentState(draftKey('step'), 0);
  // Start from the account (and its player record, if this person has played before).
  const [me, setMe, clearMe] = usePersistentState<Registrant>(draftKey('me'), () => ({
    ...emptyRegistrant(),
    name: linked?.name ?? user?.name ?? '',
    email: user?.email ?? '',
    gender: linked?.gender,
    birthYear: linked?.birthYear,
    club: linked?.club ?? '',
  }));
  const [picked, setPicked, clearPicked] = usePersistentState<Picks>(draftKey('picks'), {});
  const [done, setDone] = useState(false);
  const { ask, dialog } = useConfirm();
  const [touched, setTouched] = useState(false);

  const events = t ? lk.eventsOf(t.id) : [];
  const chosen = events.filter((e) => e.id in picked);
  const total = chosen.reduce((s, e) => s + e.fee, 0);
  const meErrors = registrantErrors(me);

  if (!t) return <NotFound what="tournament" />;
  if (t.status !== 'registration') return <RegistrationClosed t={t} />;
  if (done)
    return <RegistrationDone t={t} me={me} partnersNamed={chosen.some((e) => isDoubles(e.kind) && picked[e.id].partnerMode === 'named')} />;

  const stepValid = (s: number) =>
    s === 0
      ? !hasErrors(meErrors)
      : s === 1
        ? chosen.length > 0
        : s === 2
          ? chosen.every((e) => !hasErrors(detailErrors(e.kind, picked[e.id])))
          : true;

  const goTo = (s: number) => {
    setTouched(false);
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => {
    if (!stepValid(step)) {
      setTouched(true);
      // bring the first problem into view (phones especially)
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    goTo(step + 1);
  };

  const pay = () => {
    const picks = chosen.map((ev) => toRegistrationPick(ev, picked[ev.id]));
    const singles = chosen.find((e) => !isDoubles(e.kind));
    const general = picked[(singles ?? chosen[0]).id].myLevel!;
    const details = { name: me.name.trim(), gender: me.gender!, birthYear: me.birthYear!, club: me.club.trim(), level: general };
    // one player record per account: reuse it, or create it linked to the account
    const pid = linked
      ? (updatePlayer(linked.id, details), linked.id)
      : addPlayer({ ...details, email: me.email.trim(), userId: user?.id });
    register(t.id, pid, picks, total);
    clearStep();
    clearPicked();
    clearMe();
    setDone(true);
  };

  return (
    <div className="pb-safe-bar mx-auto max-w-3xl">
      <Link
        to={`/t/${t.slug}`}
        className="-ml-1 mb-2 inline-flex min-h-11 max-w-full items-center gap-1 rounded-full pl-1 pr-3 text-[14px] font-semibold text-muted transition-colors hover:text-fg"
      >
        <Icon name="left" size={18} /> <span className="truncate">{t.name}</span>
      </Link>
      <div className="eyebrow">Registration · open until {fmtDate(t.regCloses ?? t.startDate)}</div>
      <h1 className="mt-1.5 font-display text-[clamp(22px,3vw,30px)] font-extrabold leading-[1.1]">Enter {t.name}</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar" size={16} /> {fmtDateRange(t.startDate, t.endDate)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1">
          <Icon name="location" size={16} /> {t.venue}, {t.city}
        </span>
      </p>

      <StepProgress step={step} onStep={(s) => s < step && goTo(s)} />
      {(step > 0 || chosen.length > 0) && (
        <div className="-mt-2 mb-3 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon name="refresh" size={15} />}
            onClick={() =>
              ask({
                title: 'Start your entry over?',
                body: 'The events, levels and partners you picked are cleared and you go back to the first step. Nothing has been sent yet.',
                confirmLabel: 'Start over',
                danger: true,
                onConfirm: () => {
                  clearStep();
                  clearPicked();
                  clearMe();
                  setTouched(false);
                },
              })
            }
          >
            Start over
          </Button>
        </div>
      )}
      {dialog}

      {step === 0 && <AboutYouStep t={t} me={me} setMe={setMe} emailLocked={!!user} errors={touched ? meErrors : {}} />}
      {step === 1 && (
        <EventsStep
          t={t}
          me={me}
          events={events}
          picked={picked}
          setPicked={setPicked}
          error={touched && !chosen.length ? 'Choose at least one event.' : undefined}
        />
      )}
      {step === 2 && <DetailsStep t={t} me={me} chosen={chosen} picked={picked} setPicked={setPicked} touched={touched} />}
      {step === 3 && <ReviewStep t={t} me={me} chosen={chosen} picked={picked} total={total} onEditStep={goTo} />}

      <WizardActionBar
        step={step}
        last={step === STEPS.length - 1}
        count={chosen.length}
        total={total}
        onCancel={() => nav(`/t/${t.slug}`)}
        onBack={() => goTo(step - 1)}
        onNext={next}
        onPay={pay}
      />
    </div>
  );
}
