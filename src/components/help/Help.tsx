import { type ReactNode, useState } from 'react';

import { RULES } from '@/engine/rules';

import { cn } from '@/lib/cn';

import { GLOSSARY } from '@/components/help/glossary';
import { IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';

const FORMATS: { title: string; who: string; body: ReactNode }[] = [
  {
    title: 'Drop flight (A/B/C/D)',
    who: 'Club events where everyone wants plenty of matches',
    body: (
      <>
        Everyone starts in the <b>A flight</b>. Instead of going home after a loss, you drop down: lose in A round 1 → <b>C flight</b>, lose
        in A round 2 → <b>B flight</b>, lose in C round 1 → <b>D flight</b>. Each flight has its own champion, and most players get at least
        3 matches.
      </>
    ),
  },
  {
    title: 'Round robin',
    who: 'Small events and group stages',
    body: 'Players are split into groups and everyone in a group plays everyone. Groups are ranked by matches won, then BWF tie-breaks (head-to-head, game difference, point difference). The top 1 or 2 can go on to a knockout.',
  },
  {
    title: 'Knockout',
    who: 'Large events, finals days',
    body: 'Lose once and you are out, unless the event has a plate for first-round losers. Seeds and byes follow BWF rules, and players from the same club are kept apart in round 1 where possible.',
  },
];

export function HelpButton({ tone = 'default', audience = 'player' }: { tone?: 'default' | 'hero'; audience?: 'player' | 'admin' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Help" tone={tone} onClick={() => setOpen(true)}>
        <Icon name="help" size={20} />
      </IconButton>
      <HelpPanel open={open} onClose={() => setOpen(false)} audience={audience} />
    </>
  );
}

export function HelpPanel({ open, onClose, audience }: { open: boolean; onClose: () => void; audience: 'player' | 'admin' }) {
  const [tab, setTab] = useState<'start' | 'formats' | 'terms' | 'scoring'>('start');
  return (
    <Dialog open={open} onClose={onClose} side="right" title="Help" subtitle="Short answers to the common questions.">
      <Segmented
        label="Help topics"
        value={tab}
        onChange={setTab}
        size="sm"
        stretch
        className="mb-5"
        options={[
          { value: 'start', label: 'Start' },
          { value: 'formats', label: 'Formats' },
          { value: 'terms', label: 'Terms' },
          { value: 'scoring', label: 'Scoring' },
        ]}
      />
      {tab === 'start' && (audience === 'admin' ? <AdminStart /> : <PlayerStart />)}
      {tab === 'formats' && (
        <div className="flex flex-col gap-3">
          {FORMATS.map((f) => (
            <section key={f.title} className="rounded-2xl border border-line p-4">
              <h3 className="font-display text-[17px] font-bold">{f.title}</h3>
              <p className="mb-2 text-[12.5px] font-semibold text-muted">Best for: {f.who}</p>
              <p className="text-[14px] leading-relaxed text-muted">{f.body}</p>
            </section>
          ))}
        </div>
      )}
      {tab === 'terms' && (
        <dl className="flex flex-col divide-y divide-line">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="py-3">
              <dt className="font-semibold">{g.term}</dt>
              <dd className="mt-0.5 text-[14px] leading-relaxed text-muted">{g.body}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab === 'scoring' && (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-muted">Every rally scores a point. Each event shows which system it uses.</p>
          {[RULES.BWF_3x21, RULES.BWF_3x15, RULES.ONE_21, RULES.ONE_31].map((r) => (
            <section key={r.id} className="rounded-2xl border border-line p-4">
              <h3 className="font-semibold">{r.label}</h3>
              <p className="mt-0.5 text-[14px] text-muted">{r.note}</p>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function Steps({ items }: { items: { icon: Parameters<typeof Icon>[0]['name']; title: string; body: string }[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-2xl border border-line p-4">
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-full',
              i === 0 ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg',
            )}
          >
            <Icon name={s.icon} size={20} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">
              {i + 1}. {s.title}
            </div>
            <p className="mt-0.5 text-[14px] text-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PlayerStart() {
  return (
    <Steps
      items={[
        {
          icon: 'search',
          title: 'Find yourself',
          body: 'Search your name on the tournament page to see your next match, court and opponent.',
        },
        { icon: 'live', title: 'Watch live scores', body: 'The Live tab shows every court. Scores update as the desk enters them.' },
        {
          icon: 'draws',
          title: 'Follow the draw',
          body: 'On Draws, choose "Follow a player" to highlight their path through the bracket.',
        },
        {
          icon: 'bell',
          title: 'Get called to court',
          body: 'When the desk calls your match you get a notification with the court number.',
        },
      ]}
    />
  );
}

function AdminStart() {
  return (
    <Steps
      items={[
        { icon: 'task', title: 'Set up', body: 'Create the tournament, add events (MS, WS, MD, WD, XD or custom) and open registration.' },
        { icon: 'users', title: 'Confirm entries', body: 'Accept entries, pair up players looking for partners, then close registration.' },
        { icon: 'draws', title: 'Make the draws', body: 'Pick a format per event, check the seeds, preview the draw and publish it.' },
        {
          icon: 'whistle',
          title: 'Run match day',
          body: 'Send matches to courts (players are notified), then type in the score slips. Winners move on automatically.',
        },
      ]}
    />
  );
}
