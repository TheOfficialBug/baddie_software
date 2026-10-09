import { useState } from 'react';
import { useParams } from 'react-router';

import type { Tournament } from '@/engine/types';

import { fmtDateRange } from '@/lib/format';

import { useLookup } from '@/data/lookup';

import { NotFound } from '@/components/NotFound';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';

import { CourtBoard } from '@/features/admin/courts/CourtBoard';
import { DrawsStage } from '@/features/admin/run/DrawsStage';
import { FinishedStage } from '@/features/admin/run/FinishedStage';
import { RegistrationStage } from '@/features/admin/run/RegistrationStage';
import { StageBar } from '@/features/admin/run/StageBar';
import { type StageIndex, stageOf, tournamentProgress } from '@/features/admin/run/stages';

/**
 * The organizer's home: one page that follows the tournament through registration, draws,
 * match day and the finish, always showing the one next step. Match day is the court board.
 */
export function RunTournament() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  // a past stage the organizer opened to look back at; dropped as soon as the stage moves on
  const [looking, setLooking] = useState<{ at: Tournament['status']; view: StageIndex } | null>(null);
  if (!t) return <NotFound what="tournament" />;

  const p = tournamentProgress(lk, t);
  const current = stageOf(t.status);
  const view = looking && looking.at === t.status ? looking.view : current;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`${fmtDateRange(t.startDate, t.endDate)} · ${t.venue}`}
        title={t.name}
        actions={
          <>
            <ButtonLink to={`/t/${t.slug}`} icon={<Icon name="external" size={17} />}>
              Public page
            </ButtonLink>
            <ButtonLink to={`/admin/t/${t.id}/notify`} variant="ink" icon={<Icon name="megaphone" size={17} />}>
              Message players
            </ButtonLink>
          </>
        }
      />

      <StageBar t={t} p={p} current={current} view={view} onView={(i) => setLooking(i === current ? null : { at: t.status, view: i })} />

      {view === 0 && <RegistrationStage lk={lk} t={t} p={p} />}
      {view === 1 && <DrawsStage lk={lk} t={t} p={p} />}
      {view === 2 && <CourtBoard lk={lk} t={t} />}
      {view === 3 && <FinishedStage lk={lk} t={t} p={p} />}
    </div>
  );
}
