import type { ID, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Tabs';

import { type Audience, AUDIENCES, type Channel, CHANNELS, TEMPLATES } from '@/features/admin/notify/notifyOptions';

interface ComposerProps {
  events: TEvent[];
  tpl: number;
  onTemplate: (i: number) => void;
  title: string;
  onTitle: (v: string) => void;
  body: string;
  onBody: (v: string) => void;
  audience: Audience;
  onAudience: (a: Audience) => void;
  eventId: ID;
  onEventId: (id: ID) => void;
  recipientCount: number;
  channels: Channel[];
  onToggleChannel: (id: Channel, on: boolean) => void;
  touched: boolean;
  err: string | null;
  onSubmit: () => void;
}

/** "New notification" form: template, headline, message, audience and channels. */
export function NotifyComposer(p: ComposerProps) {
  return (
    <section className="panel flex min-w-0 flex-col gap-5 p-4 sm:p-5" aria-label="New notification">
      <h2 className="font-display text-[22px] font-bold">New notification</h2>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">Start from</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TEMPLATES.map((x, i) => (
            <button
              key={x.label}
              type="button"
              aria-pressed={p.tpl === i}
              onClick={() => p.onTemplate(i)}
              className={cn(
                'flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-2xl border-[1.5px] p-3 text-left text-[13.5px] font-semibold transition-colors',
                p.tpl === i ? 'border-fg' : 'border-line hover:border-fg/40',
              )}
            >
              <Icon name={x.icon} size={20} />
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Headline"
        error={p.touched && !p.title.trim() ? 'Add a short headline.' : undefined}
        hint="Shown in bold. Keep it under 60 characters."
      >
        {(id) => (
          <Input
            id={id}
            value={p.title}
            maxLength={80}
            onChange={(e) => p.onTitle(e.target.value)}
            placeholder="e.g. Court 3 is closed for 10 minutes"
          />
        )}
      </Field>
      <Field label="Message (optional)">
        {(id) => (
          <textarea
            id={id}
            value={p.body}
            onChange={(e) => p.onBody(e.target.value)}
            rows={3}
            className="field resize-y"
            placeholder="Any details players need."
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">Send to</span>
        <Segmented label="Audience" value={p.audience} onChange={p.onAudience} options={AUDIENCES} />
        {p.audience === 'event' && (
          <Select aria-label="Event" value={p.eventId} onChange={(e) => p.onEventId(e.target.value)} className="sm:max-w-sm">
            <option value="">Choose an event…</option>
            {p.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        )}
        <p className="text-[13px] text-muted">
          <span className="num font-semibold text-fg">{p.recipientCount}</span> player{p.recipientCount === 1 ? '' : 's'} will get this.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">How</span>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => {
            const on = p.channels.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => p.onToggleChannel(c.id, on)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13.5px] font-semibold transition-colors',
                  on ? 'border-fg bg-fg text-bg' : 'border-line hover:border-fg/50',
                )}
              >
                <Icon name={on ? 'check' : c.icon} size={17} /> {c.label}
              </button>
            );
          })}
        </div>
        <p className="text-[12.5px] text-muted">
          Text and email are simulated in this prototype; in-app notifications show up in each player's bell.
        </p>
      </div>

      {p.touched && p.err && (
        <p className="flex items-center gap-2 text-[14px] font-medium text-live">
          <Icon name="alert" size={17} /> {p.err}
        </p>
      )}
      <div className="flex justify-end border-t border-line pt-4">
        <Button variant="primary" size="lg" onClick={p.onSubmit} icon={<Icon name="send" size={18} />} className="w-full sm:w-auto">
          Send notification
        </Button>
      </div>
    </section>
  );
}
