import type { Tournament } from '@/engine/types';

import { fmtDate } from '@/lib/format';

import { ButtonLink } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';

import type { Registrant } from '@/features/public/register/registrationTypes';

/** Shown instead of the wizard when the tournament isn't accepting entries. */
export function RegistrationClosed({ t }: { t: Tournament }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Empty
        icon="calendar"
        title="Registration is closed"
        body={`${t.name} isn't taking entries right now.`}
        action={
          <ButtonLink to={`/t/${t.slug}`} icon={<Icon name="left" size={18} />}>
            Back to the tournament
          </ButtonLink>
        }
      />
    </div>
  );
}

/** Confirmation screen after a successful entry. */
export function RegistrationDone({ t, me, partnersNamed }: { t: Tournament; me: Registrant; partnersNamed: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center sm:py-16">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-fg">
        <Icon name="check" size={30} strokeWidth={2.4} />
      </span>
      <div className="eyebrow">Entry received</div>
      <h1 className="font-display text-[clamp(28px,5vw,40px)] font-extrabold leading-[1.05]">
        You're entered, {me.name.trim().split(' ')[0]}
      </h1>
      <p className="text-[15px] text-muted">
        We sent a receipt to <span className="break-all font-semibold text-fg">{me.email}</span>. The organizer confirms entries after
        registration closes on {fmtDate(t.regCloses ?? t.startDate)}.
        {partnersNamed && ' Partners you named get an email to confirm (if you gave one), or the organizer links them when they register.'}
      </p>
      <div className="mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
        <ButtonLink to="/me" variant="primary" size="lg">
          See my matches
        </ButtonLink>
        <ButtonLink to={`/t/${t.slug}`} size="lg">
          Back to {t.name}
        </ButtonLink>
      </div>
    </div>
  );
}
