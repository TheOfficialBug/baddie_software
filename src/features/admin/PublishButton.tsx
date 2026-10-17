import type { Tournament } from '@/engine/types';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

/**
 * Always in the desk's top bar, so it can't be missed: a draft tournament (hidden from the public) gets
 * Publish; once published, a chip that opens the public page to check what players see.
 */
export function PublishButton({ t, canPublish }: { t: Tournament; canPublish: boolean }) {
  const lk = useLookup();
  const { ask, dialog } = useConfirm();
  const events = lk.eventsOf(t.id);
  const drawn = events.filter((e) => e.drawState === 'published').length;

  if (t.status !== 'draft')
    return (
      <ButtonLink
        to={`/t/${t.slug}`}
        target="_blank"
        size="sm"
        variant="soft"
        icon={<span className="h-2 w-2 rounded-full bg-ok" aria-hidden />}
        iconRight={<Icon name="external" size={15} />}
        className="touch:min-h-11"
        aria-label="Published: open the public page"
      >
        <span className="hidden sm:inline">Published</span>
      </ButtonLink>
    );
  if (!canPublish) return null;

  const publish = () => {
    // draws already made: players see them straight away; otherwise registration opens
    const status: Tournament['status'] = events.length && drawn === events.length ? 'closed' : 'registration';
    const s = useStore.getState();
    s.updateTournament(t.id, { status });
    s.sendNotice({
      tournamentId: t.id,
      kind: status === 'closed' ? 'draw' : 'announcement',
      audience: 'all',
      channels: ['app'],
      title: status === 'closed' ? `${t.name}: the draws are out` : `${t.name} is open for entries`,
      body: status === 'closed' ? 'See every event’s draw and find your first match.' : 'Pick your events on the tournament page.',
    });
    toast(`${t.name} is published`, { detail: 'Players and spectators can see it now.' });
  };

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        icon={<Icon name="upload" size={16} />}
        className="touch:min-h-11"
        onClick={() =>
          ask({
            title: `Publish ${t.name}?`,
            body:
              drawn === events.length && events.length
                ? `Everyone can see the tournament, its ${events.length} draws and players on the site, and gets a “draws are out” notification. Scores you enter update live.`
                : `Everyone can see the tournament on the site and registration opens. ${drawn} of ${events.length} draws are made so far.`,
            confirmLabel: 'Publish',
            onConfirm: publish,
          })
        }
      >
        Publish
      </Button>
      {dialog}
    </>
  );
}
