import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export function NotFound({ what = 'page' }: { what?: string }) {
  useDocumentTitle('Not found');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-1 py-14 text-center sm:py-20">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-sunken text-muted">
        <Icon name="search" size={28} />
      </span>
      <div className="eyebrow mt-2">Not found</div>
      <h1 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-[1.05]">We couldn't find that {what}</h1>
      <p className="max-w-sm text-[15px] text-muted">
        The link may be out of date, or it was renamed or removed. Try starting from the list of tournaments.
      </p>
      <div className="mt-3 flex w-full flex-col gap-2.5 xs:w-auto xs:flex-row">
        <ButtonLink to="/" variant="primary" icon={<Icon name="left" size={18} />}>
          Go to tournaments
        </ButtonLink>
        <ButtonLink to="/me" variant="secondary">
          My matches
        </ButtonLink>
      </div>
    </div>
  );
}
