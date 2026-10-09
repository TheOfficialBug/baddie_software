import { useMemo, useState } from 'react';
import { useParams } from 'react-router';

import type { ID } from '@/engine/types';

import { useNow } from '@/hooks/useNow';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';
import type { Notice } from '@/data/types';

import { NotFound } from '@/components/NotFound';
import { PageHeader } from '@/components/ui/PageHeader';

import { NotifyComposer } from '@/features/admin/notify/NotifyComposer';
import { type Audience, type Channel, CHANNELS, notifyRecipients, TEMPLATES } from '@/features/admin/notify/notifyOptions';
import { NotifyPreview } from '@/features/admin/notify/NotifyPreview';
import { SentNotices } from '@/features/admin/notify/SentNotices';

export function Notify() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(30000);
  const notices = useStore((s) => s.notices);
  const send = useStore((s) => s.sendNotice);
  const [tpl, setTpl] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [eventId, setEventId] = useState<ID>('');
  const [channels, setChannels] = useState<Channel[]>(['app', 'sms']);
  const [touched, setTouched] = useState(false);

  const recipients = useMemo(() => (t ? notifyRecipients(lk, t, audience, eventId) : ([] as ID[])), [lk, t, audience, eventId]);

  if (!t) return <NotFound what="tournament" />;
  const sent = notices.filter((n) => n.tournamentId === t.id).sort((a, b) => b.at - a.at);
  const kind = TEMPLATES[tpl].kind;
  const err = !title.trim()
    ? 'Add a short headline.'
    : audience === 'event' && !eventId
      ? 'Choose an event.'
      : !channels.length
        ? 'Pick at least one way to send it.'
        : recipients.length === 0
          ? 'Nobody matches this audience right now.'
          : null;

  const pickTemplate = (i: number) => {
    setTpl(i);
    setTitle(TEMPLATES[i].title);
    setBody(TEMPLATES[i].body);
  };

  const submit = () => {
    setTouched(true);
    if (err) return;
    const n: Omit<Notice, 'id' | 'at'> = {
      tournamentId: t.id,
      kind,
      title: title.trim(),
      body: body.trim() || undefined,
      audience: audience === 'all' ? 'all' : audience === 'event' ? 'event' : 'players',
      eventId: audience === 'event' ? eventId : undefined,
      playerIds: audience === 'court' || audience === 'next' ? recipients : undefined,
      channels,
    };
    send(n);
    toast(`Notification sent to ${recipients.length} player${recipients.length === 1 ? '' : 's'}`, {
      detail: `${title.trim()} · ${channels.map((c) => CHANNELS.find((x) => x.id === c)!.label.toLowerCase()).join(', ')}`,
    });
    setTitle('');
    setBody('');
    setTouched(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Notifications"
        description="Tell players what's happening. Court calls go out automatically when you send a match to a court."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <NotifyComposer
          events={lk.eventsOf(t.id)}
          tpl={tpl}
          onTemplate={pickTemplate}
          title={title}
          onTitle={setTitle}
          body={body}
          onBody={setBody}
          audience={audience}
          onAudience={setAudience}
          eventId={eventId}
          onEventId={setEventId}
          recipientCount={recipients.length}
          channels={channels}
          onToggleChannel={(id, on) => setChannels((xs) => (on ? xs.filter((x) => x !== id) : [...xs, id]))}
          touched={touched}
          err={err}
          onSubmit={submit}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <NotifyPreview kind={kind} title={title} body={body} fallback={t.name} />
          <SentNotices sent={sent} now={now} lk={lk} />
        </div>
      </div>
    </div>
  );
}
