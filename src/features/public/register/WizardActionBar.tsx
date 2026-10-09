import { money } from '@/lib/format';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

type Props = {
  step: number;
  /** On the final step the main button pays. */
  last: boolean;
  count: number;
  total: number;
  onCancel: () => void;
  onBack: () => void;
  onNext: () => void;
  onPay: () => void;
};

/** Running total plus Back/Continue/Pay controls: fixed to the bottom on phones, inline from tablets up. */
export function WizardActionBar({ step, last, count, total, onCancel, onBack, onNext, onPay }: Props) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur md:static md:z-auto md:mt-8 md:border-0 md:bg-transparent md:backdrop-blur-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3 md:rounded-[18px] md:border md:border-line md:bg-surface md:px-5">
        <div className="min-w-0 flex-1 text-[13px] leading-tight text-muted">
          <div className="truncate">
            <span className="num">{count}</span> event{count === 1 ? '' : 's'}
          </div>
          <div className="num text-[17px] font-semibold text-fg">{money(total)}</div>
        </div>
        {step === 0 ? (
          <Button variant="ghost" onClick={onCancel} className="hidden xs:inline-flex">
            Cancel
          </Button>
        ) : (
          <Button onClick={onBack} icon={<Icon name="left" size={18} />}>
            Back
          </Button>
        )}
        {!last ? (
          <Button variant="primary" onClick={onNext} iconRight={<Icon name="right" size={18} />}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={onPay} icon={<Icon name="card" size={18} />}>
            Pay <span className="num">{money(total)}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
