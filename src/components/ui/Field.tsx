import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

import { cn } from '@/lib/cn';

import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  help,
  required,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
  help?: ReactNode;
  /** Marks the label with an asterisk (validation is up to the form). */
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[14px] font-semibold">
          {label}
          {required && (
            <>
              <span className="ml-0.5 text-live" aria-hidden>
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </label>
        {help && <HelpTip label={label}>{help}</HelpTip>}
      </div>
      {children(id)}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-live">
          <Icon name="alert" size={15} /> {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('field', props.className)} />;
}
