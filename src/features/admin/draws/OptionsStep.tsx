import type { ReactNode } from 'react';

import { bwfSeedCount } from '@/engine/draws';
import type { EventConfig, Mode } from '@/engine/types';

import { GLOSSARY } from '@/components/help/glossary';
import { IconButton } from '@/components/ui/Button';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Tabs';

import { StepHead } from '@/features/admin/draws/StepHead';

const help = (term: string) => GLOSSARY.find((g) => g.term === term)?.body;

/** Step 2: format-specific options, first-round pairing and the number of seeds. */
export function OptionsStep({
  mode,
  cfg,
  onCfgChange,
  n,
  seeds,
  onSeedsChange,
}: {
  mode: Mode;
  cfg: EventConfig;
  onCfgChange: (cfg: EventConfig) => void;
  n: number;
  seeds: number;
  onSeedsChange: (seeds: number) => void;
}) {
  return (
    <section aria-labelledby="db-options">
      <StepHead n={2} id="db-options" title="Set the options" />
      <div className="panel flex flex-col divide-y divide-line px-4 sm:px-5">
        {mode === 'round_robin' && (
          <>
            <Row label="Group size" hint="Players in each group">
              <Segmented
                label="Group size"
                size="sm"
                value={String(cfg.groupSize)}
                onChange={(v) => onCfgChange({ ...cfg, groupSize: Number(v) })}
                options={[3, 4, 5, 6].map((x) => ({ value: String(x), label: String(x) }))}
              />
            </Row>
            <Row label="After the groups" hint="Who goes on to a knockout">
              <Segmented
                label="After the groups"
                size="sm"
                value={String(cfg.advance)}
                onChange={(v) => onCfgChange({ ...cfg, advance: Number(v) as 0 | 1 | 2 })}
                options={[
                  { value: '0', label: 'Stop' },
                  { value: '1', label: 'Top 1' },
                  { value: '2', label: 'Top 2' },
                ]}
              />
            </Row>
          </>
        )}
        {mode === 'drop_flight' && (
          <Row label="Flights" hint="A/B suits smaller draws">
            <Segmented
              label="Flights"
              size="sm"
              value={cfg.variant}
              onChange={(v) => onCfgChange({ ...cfg, variant: v })}
              options={[
                { value: 'ABCD', label: 'A B C D' },
                { value: 'AB', label: 'A B' },
              ]}
            />
          </Row>
        )}
        {mode === 'knockout' && (
          <>
            <div className="py-3">
              <Switch
                label="Plate for first-round losers"
                description="A second chance, so everyone plays twice."
                on={cfg.plate}
                onChange={(v) => onCfgChange({ ...cfg, plate: v })}
              />
            </div>
            <div className="py-3">
              <Switch
                label="3rd place match"
                description="The two losing semi-finalists play off."
                on={cfg.thirdPlace}
                onChange={(v) => onCfgChange({ ...cfg, thirdPlace: v })}
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-2 py-3.5">
          <div className="flex items-center gap-1">
            <span className="text-[14px] font-semibold">First-round pairing</span>
            <HelpTip label="Pairing">
              <b>Balanced</b> ranks players by skill level and pairs the top half with the bottom half in order, so A plays C and B plays D:
              close but fair matches. <b>Strong vs weak</b> pairs the best with the weakest (A plays D). <b>Random</b> is the BWF draw by
              lot. In every mode, players from the same club are kept apart where possible and byes go to the top-ranked.
            </HelpTip>
          </div>
          <Segmented
            label="First-round pairing"
            size="sm"
            value={cfg.pairing ?? 'balanced'}
            onChange={(v) => onCfgChange({ ...cfg, pairing: v })}
            options={[
              { value: 'balanced', label: 'Balanced (A–C)' },
              { value: 'classic', label: 'Strong vs weak (A–D)' },
              { value: 'random', label: 'Random' },
            ]}
          />
          <p className="text-[12.5px] text-muted">
            {(cfg.pairing ?? 'balanced') === 'random'
              ? 'Unseeded players are drawn by lot (BWF style). Same-club players are still separated in round 1.'
              : mode === 'round_robin'
                ? 'Groups get an even mix of levels, and players from the same club go to different groups where possible.'
                : 'Ranked by skill level, then paired so matches are competitive. Same-club players never meet in round 1 when it can be avoided.'}
          </p>
        </div>
        <Row
          label={
            <span className="inline-flex items-center gap-0.5">
              Seeds
              {help('Seed') && (
                <HelpTip label="Seed" className="-my-1">
                  {help('Seed')}
                </HelpTip>
              )}
            </span>
          }
          hint={mode === 'round_robin' ? 'One per group is typical' : `BWF suggests ${bwfSeedCount(n)} for ${n} entries`}
        >
          <div className="flex items-center gap-1 rounded-full bg-sunken p-1">
            <IconButton
              label="Fewer seeds"
              size="sm"
              className="bg-surface shadow-lift"
              disabled={seeds <= 0}
              onClick={() => onSeedsChange(Math.max(0, seeds - 1))}
            >
              <Icon name="minus" size={18} />
            </IconButton>
            <span className="num w-9 text-center text-[17px] font-semibold" aria-live="polite">
              {seeds}
            </span>
            <IconButton
              label="More seeds"
              size="sm"
              className="bg-surface shadow-lift"
              disabled={seeds >= n}
              onClick={() => onSeedsChange(Math.min(n, seeds + 1))}
            >
              <Icon name="plus" size={18} />
            </IconButton>
          </div>
        </Row>
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{label}</div>
        {hint && <div className="text-[13px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
