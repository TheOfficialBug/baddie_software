import type { QueueItem } from '@/engine/scheduler';
import type { Tournament } from '@/engine/types';

import { type Lookup } from '@/data/lookup';
import type { CallConflict } from '@/data/ops';

import { fmtDuration } from '@/components/match/matchTiming';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';

import { useAdmin } from '@/features/admin/adminContext';

/** Shown when the desk tries to call a match with an unavailable player. */
export function ConflictDialog({
  lk,
  t,
  state,
  queue,
  now,
  onClose,
  onCall,
}: {
  lk: Lookup;
  t: Tournament;
  state: { matchId: string; courtId: string; conflict: CallConflict } | null;
  queue: QueueItem[];
  now: number;
  onClose: () => void;
  onCall: (matchId: string, courtId: string, force?: { busy?: boolean; rest?: boolean }) => void;
}) {
  const { openScore } = useAdmin();
  const m = state ? lk.match(state.matchId) : undefined;
  const busy = state?.conflict.busy ?? [];
  const resting = state?.conflict.resting ?? [];
  const alternative = state ? queue.find((q) => q.match.id !== state.matchId && !q.blocked && !q.resting) : undefined;
  const court = state ? lk.courtName(t.id, state.courtId) : '';
  return (
    <Dialog
      open={!!state && !!m}
      onClose={onClose}
      title={busy.length ? 'A player is on another court' : 'A player is still resting'}
      subtitle={m ? `Match #${m.number} wasn't sent to ${court}.` : undefined}
      size="md"
    >
      {m && state && (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2.5">
            {[...new Map(busy.map((b) => [b.match.id, b.match])).values()]
              .map((bm) => ({ match: bm, names: busy.filter((x) => x.match.id === bm.id).map((x) => lk.player(x.playerId)?.name ?? '') }))
              .map((b) => (
                <li key={b.match.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-live-soft p-4 text-live">
                  <Icon name="alert" size={20} />
                  <span className="min-w-0 flex-1 text-[14.5px]">
                    <strong>{b.names.join(' and ')}</strong> {b.names.length > 1 ? 'are' : 'is'} playing match #{b.match.number} on{' '}
                    {lk.courtName(t.id, b.match.courtId)}
                    {b.match.startedAt ? ` (${fmtDuration(now - b.match.startedAt)} so far)` : ' (warming up)'}.
                  </span>
                  <Button
                    size="sm"
                    variant="ink"
                    onClick={() => {
                      onClose();
                      openScore(b.match.id);
                    }}
                  >
                    Enter #{b.match.number} score
                  </Button>
                </li>
              ))}
            {resting.map((r) => (
              <li key={r.playerId} className="flex items-center gap-3 rounded-2xl bg-warn-soft p-4 text-warn">
                <Icon name="timer" size={20} />
                <span className="text-[14.5px]">
                  <strong>{lk.player(r.playerId)?.name}</strong> finished recently and has{' '}
                  <span className="num font-semibold">{r.minutesLeft}</span> more minute{r.minutesLeft === 1 ? '' : 's'} of rest (
                  {t.restMinutes} min minimum).
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-muted">
            {busy.length
              ? 'A player can only be on one court. If that match has finished, enter its score first and this one becomes available.'
              : 'You can wait, call a different match now, or send this one anyway if the player is happy to go on.'}
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" onClick={onClose}>
              Wait
            </Button>
            {!busy.length && resting.length > 0 && (
              <Button onClick={() => onCall(state.matchId, state.courtId, { rest: true })}>Send anyway</Button>
            )}
            {alternative && (
              <Button variant="primary" onClick={() => onCall(alternative.match.id, state.courtId)}>
                Send #{alternative.match.number} to {court} instead
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
