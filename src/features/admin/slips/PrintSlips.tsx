import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import type { Match, Tournament } from '@/engine/types';

import { appUrl } from '@/lib/url';

import { type Lookup, useLookup } from '@/data/lookup';

import { matchContext } from '@/components/match/matchInfo';
import { NotFound } from '@/components/NotFound';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { ShuttleMark } from '@/components/ui/Logo';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Tabs';

type Which = 'on_court' | 'ready' | 'all';

const MAX = 40;

export function PrintSlips() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const [which, setWhich] = useState<Which>('on_court');
  const unplayed = useMemo(
    () => (t ? lk.matchesOf(t.id).filter((m) => m.number > 0 && m.status !== 'bye' && m.status !== 'finished') : []),
    [lk, t],
  );
  const pick = (w: Which) =>
    unplayed.filter((m) => (w === 'all' ? m.status === 'ready' || m.status === 'on_court' || m.status === 'pending' : m.status === w));
  const list = useMemo(() => pick(which).sort((a, b) => a.number - b.number), [unplayed, which]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return <NotFound what="tournament" />;
  const printable = Math.min(list.length, MAX);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="no-print"
        eyebrow={t.name}
        title="Score slips"
        description="Hand a slip to the players when you call a match. When it comes back, scan the QR code with your phone to open that match's score form."
        actions={
          !__ARTIFACT__ && (
            <Button variant="primary" icon={<Icon name="print" size={18} />} onClick={() => window.print()} disabled={list.length === 0}>
              Print <span className="num">{printable}</span> slip{printable === 1 ? '' : 's'}
            </Button>
          )
        }
      />

      <div className="no-print flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented
          label="Which slips"
          value={which}
          onChange={setWhich}
          className="self-start"
          options={[
            { value: 'on_court', label: 'On court', count: pick('on_court').length },
            { value: 'ready', label: 'Ready to call', count: pick('ready').length },
            { value: 'all', label: 'All unplayed', count: pick('all').length },
          ]}
        />
        <p className="flex items-center gap-1.5 text-[13px] text-muted sm:ml-auto">
          <Icon name="info" size={16} />
          {__ARTIFACT__
            ? 'Printing works in the hosted app. This preview shows the layout: 4 slips per page.'
            : 'Prints 4 slips per page, in black and white.'}
        </p>
      </div>

      {list.length > MAX && (
        <p className="no-print rounded-2xl bg-warn-soft p-4 text-[14px] text-warn">
          Showing the first <span className="num">{MAX}</span> of <span className="num">{list.length}</span> slips. Print these, then come
          back for the rest.
        </p>
      )}

      {list.length === 0 ? (
        <Empty icon="print" title="No slips to print" body="Pick another list, or call matches to courts first." />
      ) : (
        <div className="rounded-[18px] bg-sunken p-3 sm:p-5 print:rounded-none print:bg-transparent print:p-0">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 print:grid-cols-2 print:gap-0">
            {list.slice(0, MAX).map((m) => (
              <Slip key={m.id} lk={lk} t={t} m={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Slip({ lk, t, m }: { lk: Lookup; t: Tournament; m: Match }) {
  const ctx = matchContext(lk, m);
  const rules = lk.matchRules(m);
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toString(appUrl(`/admin/t/${t.id}/m/${m.id}`), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [t.id, m.id]);
  const side = (s: 'a' | 'b') => (m[s] && m[s] !== 'BYE' ? lk.entryName(m[s]) : s === 'a' ? 'TBD' : 'TBD');

  return (
    <article
      className="flex break-inside-avoid flex-col gap-3 rounded-xl border-2 border-dashed border-line-strong bg-white p-4 text-black print:rounded-none print:border print:border-black/40"
      style={{ colorScheme: 'light' }}
    >
      <header className="flex items-start gap-3">
        <ShuttleMark size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] uppercase tracking-wider text-black/60">{t.name}</div>
          <div className="text-[13px] font-semibold">
            {ctx.ev.name} · {ctx.label}
          </div>
        </div>
        <div className="text-right">
          <div className="num font-display text-[34px] font-extrabold leading-none">#{m.number}</div>
          <div className="text-[12px] font-semibold">{m.courtId ? lk.courtName(t.id, m.courtId) : 'Court ____'}</div>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] items-center gap-x-2 gap-y-1.5 text-[14px]">
        <span className="text-[10px] uppercase tracking-wider text-black/55">Player / pair</span>
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="text-center text-[10px] uppercase tracking-wider text-black/55">
            {i < rules.bestOf ? `G${i + 1}` : ''}
          </span>
        ))}
        {(['a', 'b'] as const).map((s) => (
          <div key={s} className="contents">
            <span className="truncate font-semibold">{side(s)}</span>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < rules.bestOf ? 'h-9 rounded border border-black/50' : ''} />
            ))}
          </div>
        ))}
      </div>
      <footer className="flex items-end gap-3">
        <div className="flex-1 text-[11px] text-black/60">
          <div className="mb-3">{rules.label}. Write scores from each side, e.g. 21-15.</div>
          <div className="flex gap-3">
            <span className="flex-1 border-t border-black/50 pt-1">Winner signature</span>
            <span className="flex-1 border-t border-black/50 pt-1">Loser signature</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div
            className="h-[76px] w-[76px] [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
            aria-label="QR code to enter this match's score"
            role="img"
          />
          <span className="mt-1 text-[9px] uppercase tracking-wider text-black/55">Scan to score</span>
        </div>
      </footer>
    </article>
  );
}
