import { useNow } from '@/hooks/useNow';

import { CourtCard } from '@/components/match/CourtCard';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';

import { useT } from '@/features/public/tournament/tournamentContext';

/** Every court at once, free ones included. */
export function LiveCourts() {
  const { t, lk } = useT();
  const now = useNow(10000);
  const matches = lk.matchesOf(t.id);
  const busy = matches.filter((m) => m.status === 'on_court').length;

  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title="All courts"
        description={`${busy} of ${t.courts.length} courts in use. Scores update as the desk enters them.`}
        action={
          t.status === 'live' ? (
            <ButtonLink to={`/t/${t.slug}/tv`} size="sm" icon={<Icon name="tv" size={16} />}>
              TV mode
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {t.courts.map((c) => (
          <CourtCard key={c.id} lk={lk} court={c} now={now} match={matches.find((m) => m.status === 'on_court' && m.courtId === c.id)} />
        ))}
      </div>
    </section>
  );
}
