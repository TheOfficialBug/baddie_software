import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';

export interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  /** Extra caution shown in an amber box, e.g. "12 results will be lost". */
  warning?: ReactNode;
  confirmLabel: string;
  /** Destructive actions get a red button. */
  danger?: boolean;
  onConfirm: () => void;
}

/** "Are you sure?" for resets and other actions players notice. Cancel is always the safe choice. */
export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!options}
      onClose={onClose}
      title={options?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={options?.danger ? 'danger' : 'primary'}
            onClick={() => {
              options?.onConfirm();
              onClose();
            }}
          >
            {options?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[14px] text-muted">
        {options?.body && <div>{options.body}</div>}
        {options?.warning && (
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 font-medium text-warn">
            <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
            <span>{options.warning}</span>
          </p>
        )}
      </div>
    </Dialog>
  );
}
