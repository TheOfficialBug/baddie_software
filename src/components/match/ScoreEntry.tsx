import { useEffect, useMemo, useRef, useState } from 'react';

import { checkGame, checkMatch, parseQuickScore } from '@/engine/rules';
import type { GameScore, ResultType, Side } from '@/engine/types';

import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { matchContext } from '@/components/match/matchInfo';
import { EventChip, FlightBadge, Pill } from '@/components/tournament/Badges';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/useConfirm';

const RESULT_OPTIONS: { value: ResultType; label: string }[] = [
  { value: 'normal', label: 'Played' },
  { value: 'retired', label: 'Retired' },
  { value: 'walkover', label: 'Walkover' },
  { value: 'dq', label: 'Disqualified' },
];

/** Score-slip form (design: "Enter score slip"). Used in a dialog, a sheet on phones, and inline on the Scores page. */
export function ScoreForm({
  matchId,
  onDone,
  onCancel,
  embedded,
}: {
  matchId: string;
  onDone: () => void;
  onCancel?: () => void;
  embedded?: boolean;
}) {
  const lk = useLookup();
  const m = lk.match(matchId);
  const saveResult = useStore((s) => s.saveResult);
  const setLiveScore = useStore((s) => s.setLiveScore);
  const undo = useStore((s) => s.undo);
  const resetMatch = useStore((s) => s.resetMatch);
  const { ask, dialog } = useConfirm();
  const rules = m ? lk.matchRules(m) : null;
  const n = rules?.bestOf ?? 3;

  const initial = (): string[][] => {
    const games: GameScore[] = m ? [...m.games, ...(m.live && (m.live[0] || m.live[1]) ? [m.live] : [])] : [];
    return Array.from({ length: n }, (_, i) => (games[i] ? [String(games[i][0]), String(games[i][1])] : ['', '']));
  };
  // The slip being typed is saved per match on this device, so switching to another event,
  // page or tab and coming back keeps it. It's cleared once the score is saved.
  const [slip, setSlip, clearSlip, restored] = usePersistentState<{ cells: string[][]; result: ResultType; special?: Side }>(
    `score:${matchId}`,
    () => ({
      cells: initial(),
      result: m?.result ?? 'normal',
      special:
        !m?.result || m.result === 'normal' || !m.winner ? undefined : m.result === 'walkover' ? m.winner : m.winner === 'a' ? 'b' : 'a',
    }),
  );
  // one row per game of this match's format; a slip saved under another format is fitted to it
  const fit = (c: string[][]) => Array.from({ length: n }, (_, i) => c[i] ?? ['', '']);
  const cells = fit(slip.cells);
  const { result, special } = slip;
  const setCells = (v: string[][] | ((c: string[][]) => string[][])) =>
    setSlip((x) => ({ ...x, cells: typeof v === 'function' ? v(fit(x.cells)) : v }));
  const setResult = (v: ResultType) => setSlip((x) => ({ ...x, result: v }));
  const setSpecial = (v: Side | undefined) => setSlip((x) => ({ ...x, special: v }));
  const [quick, setQuick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(min-width: 768px)').matches) first.current?.focus();
  }, []);

  const games: GameScore[] = useMemo(
    () => cells.filter(([x, y]) => x !== '' || y !== '').map(([x, y]) => [Number(x || 0), Number(y || 0)] as GameScore),
    [cells],
  );
  // Walkover: the picked side wins. Retired / DQ: the picked side is the one who retired or was disqualified.
  const declaredWinner: Side | undefined = !special ? undefined : result === 'walkover' ? special : special === 'a' ? 'b' : 'a';
  const check = rules ? checkMatch(games, rules, result, result === 'normal' ? undefined : declaredWinner) : null;

  if (!m || !rules || !check) return <p className="text-muted">Match not found.</p>;
  const ctx = matchContext(lk, m);
  const names = { a: lk.entryName(m.a), b: lk.entryName(m.b) };
  const ready = m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE';
  const showErrors = touched;
  const winner = check.ok ? check.winner : undefined;

  // Can this be saved as a live (in-progress) score? Only finished games + one valid unfinished game.
  const liveSplit = (() => {
    if (result !== 'normal' || m.status !== 'on_court' || !games.length) return null;
    const last = games[games.length - 1];
    const lc = checkGame(last, rules);
    const done = lc.complete ? games : games.slice(0, -1);
    if (!lc.valid || done.some((g) => !checkGame(g, rules).complete)) return null;
    if (checkMatch(done, rules).ok) return null;
    return { games: done, live: lc.complete ? ([0, 0] as GameScore) : last };
  })();

  const save = () => {
    setTouched(true);
    if (!check.ok) return;
    const err = saveResult(m.id, { games, result, winner: result === 'normal' ? undefined : declaredWinner });
    if (err) {
      setError(err);
      return;
    }
    clearSlip();
    const after = useStore.getState();
    const lastUpdate = after.updates[after.updates.length - 1];
    const w = check.winner!;
    const l: Side = w === 'a' ? 'b' : 'a';
    toast(`Result saved for match #${m.number}`, {
      tone: 'ok',
      detail: `${names[w]} won.${m.loserTo ? ` ${names[l]} drops to the ${m.loserTo}.` : ''} The draw and public page are updated.`,
      undo: lastUpdate ? () => undo(lastUpdate.id) : undefined,
    });
    onDone();
  };

  const setCell = (gi: number, side: 0 | 1, v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setCells((c) => c.map((g, i) => (i === gi ? (side === 0 ? [clean, g[1]] : [g[0], clean]) : g)));
    setError(null);
  };

  const applyQuick = (text: string) => {
    setQuick(text);
    const parsed = parseQuickScore(text);
    if (parsed.length) setCells(Array.from({ length: n }, (_, i) => (parsed[i] ? [String(parsed[i][0]), String(parsed[i][1])] : ['', ''])));
  };

  const messages: { tone: 'ok' | 'live' | 'info'; tag: string; text: string }[] = [];
  if (restored && !touched && !winner)
    messages.push({ tone: 'info', tag: 'Kept', text: 'Scores you typed earlier for this match were kept.' });
  if (error) messages.push({ tone: 'live', tag: 'Problem', text: error });
  else if (winner) {
    messages.push({
      tone: 'ok',
      tag: 'Valid',
      text: `${names[winner]} wins${result === 'normal' && check.summary ? `, ${check.summary} in games` : ''}.`,
    });
    if (m.loserTo) messages.push({ tone: 'info', tag: 'Next', text: `${names[winner === 'a' ? 'b' : 'a']} drops to the ${m.loserTo}.` });
  } else if (showErrors) {
    [...new Set([...check.gameErrors.filter(Boolean), ...check.errors.filter((e) => e !== 'Fix the highlighted games.')])].forEach((e) =>
      messages.push({ tone: 'live', tag: 'Check', text: e as string }),
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      {embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="eyebrow">
              {ctx.ev.name} · {ctx.label}
              {m.courtId ? ` · ${lk.courtName(ctx.ev.tournamentId, m.courtId)}` : ''}
            </span>
            <h2 className="font-display text-[clamp(22px,2.6vw,28px)] font-extrabold">
              {m.status === 'finished' ? 'Edit result' : 'Enter score slip'} <span className="num text-muted">#{m.number}</span>
            </h2>
          </div>
          <Pill tone="info" title={rules.note}>
            {rules.label}
          </Pill>
        </div>
      )}
      {!embedded && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <EventChip kind={ctx.ev.kind} />
          {ctx.flight && <FlightBadge flight={ctx.flight} size="sm" />}
          <span>{ctx.label}</span>
          <Pill tone="info" className="ml-auto" title={rules.note}>
            {rules.short}
          </Pill>
        </div>
      )}

      {!ready ? (
        <p className="rounded-2xl bg-sunken p-4 text-[14px] text-muted">Both players need to be known before you can enter a result.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Result type"
              value={result}
              onChange={(v) => {
                setResult(v);
                setSpecial(undefined);
                setError(null);
              }}
              options={RESULT_OPTIONS}
              size="sm"
            />
            <HelpTip label="Result types">
              <b>Played</b>: the match finished normally. <b>Retired</b>: a player stopped mid-match (keep the score so far).{' '}
              <b>Walkover</b>: the opponent didn't play. <b>Disqualified</b>: removed by the referee.
            </HelpTip>
          </div>

          {result !== 'walkover' && (
            <>
              <label className="relative flex items-center">
                <Icon name="edit" size={17} className="pointer-events-none absolute left-3.5 text-muted" />
                <span className="sr-only">Type the whole score</span>
                <input
                  value={quick}
                  onChange={(e) => applyQuick(e.target.value)}
                  placeholder={`Or type it: ${rules.bestOf === 1 ? `${rules.pointsToWin}-15` : `${rules.pointsToWin}-15 18-${rules.pointsToWin} ${rules.pointsToWin}-19`}`}
                  className="min-h-11 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-[15px] outline-none placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-primary/25"
                />
              </label>

              <div className="scroll-thin -mx-1 overflow-x-auto px-1 pb-1">
                <div
                  className="grid items-center gap-x-2 gap-y-3 sm:gap-x-2.5"
                  style={{ gridTemplateColumns: `minmax(110px,1fr) repeat(${n}, minmax(56px, 76px))` }}
                >
                  <span />
                  {Array.from({ length: n }, (_, i) => (
                    <span key={i} className="eyebrow text-center">
                      Game {i + 1}
                    </span>
                  ))}
                  {(['a', 'b'] as Side[]).map((side, si) => (
                    <div key={side} className="flex min-w-0 flex-col items-start gap-1" style={{ gridRow: si + 2, gridColumn: 1 }}>
                      {winner === side && <Pill tone="lime">Winner</Pill>}
                      <strong className="line-clamp-2 text-[15px] leading-snug sm:text-[17px]">{names[side]}</strong>
                    </div>
                  ))}
                  {cells.map((g, gi) =>
                    ([0, 1] as const).map((s) => {
                      const bad = showErrors && !!check.gameErrors[gi];
                      const good = !bad && g[0] !== '' && g[1] !== '' && checkGame([Number(g[0]), Number(g[1])], rules).complete;
                      return (
                        <div key={`${gi}-${s}`} className="grid place-items-center" style={{ gridRow: s + 2, gridColumn: gi + 2 }}>
                          <input
                            ref={gi === 0 && s === 0 ? first : undefined}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label={`Game ${gi + 1}, ${s === 0 ? names.a : names.b} points`}
                            value={g[s]}
                            onChange={(e) => setCell(gi, s, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className={cn(
                              'input-big num h-[60px] w-full max-w-[76px] rounded-[14px] border-[1.5px] bg-bg text-center text-[26px] font-semibold outline-none transition-colors focus:border-accent focus:ring-[3px] focus:ring-primary/25',
                              bad ? 'border-live bg-live-soft' : good ? 'border-ok' : 'border-line',
                            )}
                          />
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            </>
          )}

          {result !== 'normal' && (
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-semibold">
                {result === 'retired' ? 'Who retired?' : result === 'dq' ? 'Who was disqualified?' : 'Who gets the walkover (wins)?'}
              </span>
              <div className="grid gap-2 xs:grid-cols-2">
                {(['a', 'b'] as Side[]).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setSpecial(side)}
                    aria-pressed={special === side}
                    className={cn(
                      'min-h-12 truncate rounded-full border-[1.5px] px-4 text-left text-[14px] font-semibold transition-colors',
                      special === side ? 'border-fg bg-fg text-bg' : 'border-line hover:border-fg/50',
                    )}
                  >
                    {names[side]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="flex min-h-[28px] flex-col gap-2" aria-live="polite">
            {messages.length === 0 && <li className="text-[14px] text-muted">{rules.note}</li>}
            {messages.map((msg) => (
              <li key={msg.text} className="flex items-start gap-2.5 text-[14px]">
                <Pill tone={msg.tone === 'ok' ? 'ok' : msg.tone === 'live' ? 'live' : 'info'} className="min-w-[64px] justify-center">
                  {msg.tag}
                </Pill>
                <span className="pt-0.5">{msg.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-4 xs:flex-row xs:flex-wrap xs:items-center xs:justify-end">
        {m.status === 'finished' && (
          <Button
            variant="ghost"
            className="text-live xs:mr-auto"
            icon={<Icon name="refresh" size={17} />}
            onClick={() =>
              ask({
                title: `Reset the result of match #${m.number}?`,
                body: 'The score is cleared and the match goes back to not played, ready to call again.',
                warning: 'The winner is taken out of their next match.',
                confirmLabel: 'Reset result',
                danger: true,
                onConfirm: () => {
                  const err = resetMatch(m.id);
                  if (err) {
                    toast(err, { tone: 'error' });
                    return;
                  }
                  clearSlip();
                  toast(`Match #${m.number} reset`, { tone: 'info', detail: 'It is back in the queue.' });
                  onDone();
                },
              })
            }
          >
            Reset result
          </Button>
        )}
        {dialog}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {liveSplit && (
          <Button
            onClick={() => {
              setLiveScore(m.id, liveSplit.games, liveSplit.live);
              clearSlip();
              toast(`Live score updated on ${lk.courtName(ctx.ev.tournamentId, m.courtId)}`, {
                tone: 'info',
                detail: 'Spectators see it right away.',
              });
              onDone();
            }}
          >
            Save live score
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!ready}
          className="xs:min-w-[170px]"
          icon={<Icon name="check" size={18} strokeWidth={2.2} />}
        >
          {m.status === 'finished' ? 'Save changes' : 'Confirm result'}
        </Button>
      </div>
    </form>
  );
}

export function ScoreDialog({ matchId, onClose }: { matchId: string | null; onClose: () => void }) {
  const lk = useLookup();
  const m = matchId ? lk.match(matchId) : undefined;
  const t = m ? lk.tournament(lk.event(m.eventId)?.tournamentId) : undefined;
  return (
    <Dialog
      open={!!m}
      onClose={onClose}
      title={m ? `${m.status === 'finished' ? 'Edit result' : 'Enter score slip'} · #${m.number}` : ''}
      subtitle={m?.courtId && t ? `${lk.courtName(t.id, m.courtId)}${m.status === 'on_court' ? ' · on court now' : ''}` : undefined}
      size="lg"
    >
      {m && <ScoreForm key={m.id} matchId={m.id} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}
