import { type ReactNode } from 'react';
import { Link } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  crumbs,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  className?: string;
}) {
  useDocumentTitle(typeof title === 'string' ? title : undefined, 'Organizer');
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="flex min-w-0 max-w-3xl flex-col gap-1">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <Icon name="right" size={14} className="text-faint" />}
                {c.to ? (
                  <Link to={c.to} className="rounded font-medium hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="font-display text-[clamp(22px,3vw,30px)] font-extrabold leading-[1.1]">{title}</h1>
        {description && <p className="max-w-[62ch] text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}
