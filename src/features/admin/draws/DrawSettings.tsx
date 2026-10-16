import type { ReactNode } from 'react';

import { bwfSeedCount } from '@/engine/draws';
import type { EventConfig, Mode } from '@/engine/types';

import { cn } from '@/lib/cn';

import { GLOSSARY } from '@/components/help/glossary';
import { IconButton } from '@/components/ui/Button';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Tabs';

const MODES: { value: Mode; label: string; body: string; everyone: string }[] = [
  {
    value: 'round_robin',
    label: 'Round robin',
    body: 'Groups where everyone plays everyone; the top 1 or 2 can go on to a knockout.',
    everyone: 'every match in their group',
  },
  {
    value: 'drop_flight',
    label: 'Drop flight',
    body: 'Everyone starts in flight A; losers drop to the lower flights instead of going home.',
    everyone: '2–3 matches',
  },
  {
    value: 'knockout',
    label: 'Knockout',
    body: 'Lose once and you are out, with BWF seeding and byes.',
    everyone: '1 match, or 2 with a plate',
  },
];

const PAIRING: Record<NonNullable<EventConfig['pairing']>, { label: string; text: string }> = {
  balanced: { label: 'Close levels', text: 'Players meet someone near their level in round 1 (A plays C, B plays D).' },
  classic: { label: 'Ranked order', text: 'A classic bracket: the top-ranked unseeded player meets the lowest-ranked (A plays D).' },
  random: { label: 'Random draw', text: 'Unseeded players are drawn by lot, as in BWF draws.' },
};

const seedHelp = GLOSSARY.find((g) => g.term === 'Seed')?.body;

/**
 * Every draw choice in one row: format, its options, pairing and seeds. Each control is labelled
 * above, and one plain sentence underneath says what the current choice means for players.
 */
export function DrawSettings({
  mode,
  onModeChange,
  cfg,
  onCfgChange,
  n,
  seeds,
  onSeedsChange,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  cfg: EventConfig;
  onCfgChange: (cfg: EventConfig) => void;
  n: number;
  seeds: number;
  onSeedsChange: (seeds: number) => void;
}) {
  const info = MODES.find((m) => m.value === mode)!;
  const pairing = cfg.pairing ?? 'balanced';
  const placement = mode === 'drop_flight' && cfg.variant === 'PLACEMENT';
  // in placement rounds the choice is which bottom-half player each top-half player meets
  const half = Math.floor(n / 2);
  const pairingLabel = (v: NonNullable<EventConfig['pairing']>) =>
    !placement
      ? PAIRING[v].label
      : v === 'balanced'
        ? `Close levels (1 v ${half + 1})`
        : v === 'classic'
          ? `Ranked order (1 v ${n})`
          : 'Random draw';
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set(!on)}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors touch:min-h-11',
        on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-muted hover:border-fg/50',
      )}
    >
      <Icon name={on ? 'check' : 'plus'} size={14} strokeWidth={2.4} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Control label="Format">
          <Segmented
            label="Format"
            size="sm"
            value={mode}
            onChange={onModeChange}
            options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          />
        </Control>

        {mode === 'drop_flight' && (
          <Control label="Flights">
            <Segmented
              label="Flights"
              size="sm"
              value={cfg.variant}
              onChange={(v) => onCfgChange({ ...cfg, variant: v })}
              options={[
                { value: 'PLACEMENT', label: 'By results' },
                { value: 'ABCD', label: 'A–D' },
                { value: 'AB', label: 'A–B' },
              ]}
            />
          </Control>
        )}
        {mode === 'round_robin' && (
          <>
            <Control label="Group size">
              <Segmented
                label="Group size"
                size="sm"
                value={String(cfg.groupSize)}
                onChange={(v) => onCfgChange({ ...cfg, groupSize: Number(v) })}
                options={[3, 4, 5, 6].map((x) => ({ value: String(x), label: String(x) }))}
              />
            </Control>
            <Control label="Then">
              <Segmented
                label="After the groups"
                size="sm"
                value={String(cfg.advance)}
                onChange={(v) => onCfgChange({ ...cfg, advance: Number(v) as 0 | 1 | 2 })}
                options={[
                  { value: '0', label: 'Stop' },
                  { value: '1', label: 'Top 1 on' },
                  { value: '2', label: 'Top 2 on' },
                ]}
              />
            </Control>
          </>
        )}
        {mode === 'knockout' && (
          <Control label="Extras">
            <div className="flex gap-1.5">
              {toggle('Plate', cfg.plate, (v) => onCfgChange({ ...cfg, plate: v }))}
              {toggle('3rd place', cfg.thirdPlace, (v) => onCfgChange({ ...cfg, thirdPlace: v }))}
            </div>
          </Control>
        )}

        {
          <Control
            label={
              <>
                Pairing
                <HelpTip label="Pairing" className="-my-1">
                  {placement ? (
                    <>
                      Round 1 is always the top half of the seeding order against the bottom half. <b>Close levels</b>: 1 v {half + 1}, 2 v{' '}
                      {half + 2}… (A plays C, B plays D). <b>Ranked order</b>: 1 v {n}, 2 v {n - 1}… (A plays D, B plays C, so the B/C
                      borderline is settled head to head). <b>Random draw</b>: after the seeds, the order is drawn by lot.
                    </>
                  ) : (
                    <>
                      <b>Close levels</b> ranks players by skill level and pairs them with someone near their level (A plays C, B plays D).{' '}
                      <b>Ranked order</b> is the classic bracket, where the top-ranked meet the lowest-ranked first (A plays D).{' '}
                      <b>Random draw</b> is the BWF draw by lot. Players from the same club are kept apart where possible in every mode;
                      players without a club don&apos;t count as clubmates.
                    </>
                  )}
                </HelpTip>
              </>
            }
          >
            <Select
              aria-label="First-round pairing"
              value={pairing}
              onChange={(e) => onCfgChange({ ...cfg, pairing: e.target.value as typeof pairing })}
              className={cn('min-h-9 py-1 text-[13px] font-semibold touch:min-h-11', placement ? 'w-[210px]' : 'w-[170px]')}
            >
              {(Object.keys(PAIRING) as NonNullable<EventConfig['pairing']>[]).map((v) => (
                <option key={v} value={v}>
                  {pairingLabel(v)}
                </option>
              ))}
            </Select>
          </Control>
        }

        {placement && (
          <Control
            label={
              <>
                Byes
                <HelpTip label="Byes" className="-my-1">
                  Byes always go to the top of the seeding order. <b>Placement round 1</b>: the top players skip round 1, as many as make
                  every flight a clean knockout (48 entries → 16 byes, flights of 16, 16, 8 and 8). <b>Placement round 2</b>: the best of
                  each round-2 group skip round 2 (flights of 16, 8, 16 and 8). <b>In the flights</b>: everyone plays both placement rounds;
                  each flight&apos;s Round 1 has the byes (flights of 12 and 4 byes each, one level per flight).
                </HelpTip>
              </>
            }
          >
            <Select
              aria-label="Where byes go"
              value={cfg.placementByes ?? 'round1'}
              onChange={(e) => onCfgChange({ ...cfg, placementByes: e.target.value as NonNullable<EventConfig['placementByes']> })}
              className="min-h-9 w-[190px] py-1 text-[13px] font-semibold touch:min-h-11"
            >
              <option value="round1">Placement round 1</option>
              <option value="round2">Placement round 2</option>
              <option value="flights">In the flights</option>
            </Select>
          </Control>
        )}

        <Control
          label={
            <>
              Seeds
              {seedHelp && (
                <HelpTip label="Seed" className="-my-1">
                  {seedHelp} {mode === 'round_robin' ? 'One per group is typical.' : `BWF suggests ${bwfSeedCount(n)} for ${n} entries.`}
                </HelpTip>
              )}
            </>
          }
        >
          <div className="flex items-center rounded-full border border-line bg-surface">
            <IconButton label="Fewer seeds" size="sm" disabled={seeds <= 0} onClick={() => onSeedsChange(Math.max(0, seeds - 1))}>
              <Icon name="minus" size={16} />
            </IconButton>
            <span className="num w-7 text-center text-[14px] font-semibold" aria-live="polite">
              {seeds}
            </span>
            <IconButton label="More seeds" size="sm" disabled={seeds >= n} onClick={() => onSeedsChange(Math.min(n, seeds + 1))}>
              <Icon name="plus" size={16} />
            </IconButton>
          </div>
        </Control>
      </div>
      <p className="text-[13px] text-muted">
        {placement ? (
          <>
            <span className="font-semibold text-fg">Drop flight by results:</span> byes go to the top of the ranking (
            {(cfg.placementByes ?? 'round1') === 'round1'
              ? 'they skip round 1'
              : cfg.placementByes === 'round2'
                ? 'the best of each group skip round 2'
                : 'in the flights’ Round 1'}
            ); round 1 is the top half of the rest against the bottom half ({pairing === 'classic' ? 'best v worst' : 'A v C, B v D'});
            round 2 is winners against winners and losers against losers. Round-2 winners and losers make flights A, B, C and D, and each
            flight is a knockout. Most players get 3 or more matches. The draw is fixed once published.
          </>
        ) : (
          <>
            <span className="font-semibold text-fg">{info.label}:</span> {info.body} Everyone plays {info.everyone}. {PAIRING[pairing].text}
          </>
        )}
      </p>
    </div>
  );
}

function Control({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </div>
  );
}
