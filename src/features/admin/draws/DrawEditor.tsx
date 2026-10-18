import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { ID, TEvent } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';
import { fmtAgo } from '@/lib/format';

import { type Lookup, makeLookup } from '@/data/lookup';
import {
  addExtraLine,
  drawPlaces,
  extraBoxes,
  heldEntries,
  isLowerFlight,
  movedEntries,
  movesByes,
  type PlaceBox,
  rearrangeDraw,
  removeExtraLine,
  type Seating,
  seatingOf,
} from '@/data/placements';
import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { useAccess } from '@/auth/useAccess';

import { Bracket } from '@/components/draw/Bracket';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';

/** What the organizer is about to do; each step is confirmed in a dialog. */
type Pending =
  | { kind: 'out'; key: string; entry: ID }
  | { kind: 'place'; key: string; entry: ID }
  /** a held player onto an occupied place: the occupant goes to the holding area */
  | { kind: 'replace'; key: string; entry: ID; occupant: ID }
  /** two placed players trade places */
  | { kind: 'swap'; from: string; to: string }
  | { kind: 'publish' }
  | { kind: 'discard' };

interface Draft {
  /** The published seating this draft started from; a redone draw makes the draft stale. */
  sig: string;
  seating: Seating;
}

/** Drag payload: a held entry, or a placed one (by its place). */
const DRAG_TYPE = 'application/x-smashboard-place';
type Dragged = { entry: ID; from?: string };

/**
 * Organizer-only: fix a published draw by hand. Take players out to a holding area, then put them
 * back with the dropdown on an open place (or by dragging on a computer). Drag one placed player
 * onto another to swap them. Changes stay on this device until published; players who have played
 * stay put.
 */
export function DrawEditor({ lk, ev, stageId, onDone }: { lk: Lookup; ev: TEvent; stageId?: string; onDone: () => void }) {
  const rearrange = useStore((s) => s.rearrangeDraw);
  // a lower flight (B, C, D) edits its own decided lines; otherwise the starting draw
  const flight = stageId && isLowerFlight(selectDB(useStore.getState()), stageId) ? stageId : undefined;
  // the draw's places from the stored data (stages, groups and matches of this event)
  const places = useMemo(() => drawPlaces(selectDB(useStore.getState()), ev.id, flight), [lk, ev.id, flight]); // eslint-disable-line react-hooks/exhaustive-deps
  const original = useMemo(() => seatingOf(places), [places]);
  const sig = JSON.stringify(original);
  const saveDraft = useStore((s) => s.saveDrawDraft);
  const dropSaved = useStore((s) => s.discardDrawDraft);
  const savedDraft = useStore((s) => s.drawDrafts.find((d) => d.eventId === ev.id && d.base === sig));
  const userId = useAccess().user?.id;
  const savedBy = useStore((s) => s.profiles.find((p) => p.id === savedDraft?.savedBy)?.name);
  // start from the saved changes when there are some, else from the published draw
  const base: Seating = savedDraft?.seating ?? original;
  const fresh: Draft = { sig, seating: base };
  // edits not saved yet are kept on this device as you go, so a reload loses nothing
  const [stored, setStored, clearDraft] = usePersistentState<Draft>(`drawEdit:${ev.id}${flight ? `:${flight}` : ''}`, fresh);
  const draft = stored.sig === sig ? stored : fresh;
  const unsaved = JSON.stringify(draft.seating) !== JSON.stringify(base);
  const now = useNow(30000);
  const seat = (patch: Seating) => setStored({ ...draft, seating: { ...draft.seating, ...patch } });
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragging, setDragging] = useState(false);
  // opening the editor brings the draw to the top of the screen, so the canvas gets the whole view
  const top = useRef<HTMLDivElement>(null);
  // (after the router's scroll restoration, which runs once the address gets ?edit=1)
  useEffect(() => {
    const t = setTimeout(() => top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, []);

  // lines added to placement round 1 (to give someone a bye), kept in the draft's seating
  const extras = extraBoxes(ev.id, draft.seating);
  const allBoxes = [...places.boxes, ...extras];
  const withdrawn = new Set(
    lk
      .entriesOf(ev.id)
      .filter((e) => e.status === 'withdrawn')
      .map((e) => e.id),
  );
  // taken out of the draw and not placed again (a withdrawn player may simply be left out)
  const taken = heldEntries(original, draft.seating).filter((e) => !withdrawn.has(e));
  // late entries: accepted after the draw was made, waiting for a place (a bye line or a withdrawn player's spot)
  const inDraw = new Set(Object.values(original).filter(Boolean));
  const seatedNow = new Set(Object.values(draft.seating).filter(Boolean));
  const late = flight
    ? [] // late entries start in the first flight
    : lk
        .entriesOf(ev.id)
        .filter((e) => e.status === 'accepted' && !inDraw.has(e.id))
        .map((e) => e.id);
  const latePlaced = late.filter((e) => seatedNow.has(e));
  const held = [
    ...taken,
    ...late.filter((e) => !seatedNow.has(e)),
    ...heldEntries(original, draft.seating).filter((e) => withdrawn.has(e)),
  ];
  const byesMoved = movesByes(original, draft.seating);
  // lines left with nobody in them (both places empty)
  const emptyLines = places.boxes
    .filter((b) => b.kind === 'line' && b.places.every((p) => (p.key in draft.seating ? !draft.seating[p.key] : true)))
    .filter((b) => b.places.some((p) => original[p.key]))
    .map((b) => b.title);
  const moved = movedEntries(original, draft.seating);
  const changes = moved.filter((m) => m.to || !withdrawn.has(m.entryId)).length + latePlaced.length;
  const boxOf = (key: string) => allBoxes.find((b) => b.places.some((p) => p.key === key));
  const where = (key: string) => {
    const b = boxOf(key);
    return b ? (b.stage ? `${b.stage} ${b.title}` : b.title) : '';
  };
  const name = (id: ID) => lk.entryName(id);
  const movable = (key: string) => {
    const e = draft.seating[key];
    return !e || !places.locked.has(e);
  };

  // Clubs an entry represents ("No club" doesn't count as a clash).
  const clubs = (id: ID) =>
    new Set(
      lk
        .playersOfEntry(id)
        .map((p) => p.club)
        .filter((c) => c && c !== 'No club'),
    );
  /** Who the entry would meet at that place (given the seating), and whether they share a club. */
  const meeting = (key: string, entry: ID, seating = draft.seating): { text: ReactNode; clash?: string } => {
    const b = boxOf(key)!;
    const others = b.places.filter((p) => p.key !== key).map((p) => (p.key in seating ? seating[p.key] : 'BYE'));
    const mine = clubs(entry);
    const clash = others.find((o) => o && o !== 'BYE' && [...clubs(o)].some((c) => mine.has(c)));
    const clashText = clash
      ? `${name(entry)} and ${name(clash)} are from the same club (${[...clubs(clash)].find((c) => mine.has(c))}).`
      : undefined;
    if (b.kind === 'group') {
      const mates = others.filter((o): o is ID => !!o && o !== 'BYE');
      return {
        text: (
          <>
            {name(entry)} joins {b.title}
            {mates.length ? <> with {mates.map(name).join(', ')}</> : null}.
          </>
        ),
        clash: clashText,
      };
    }
    const opp = others[0];
    return {
      text:
        opp === 'BYE' ? (
          <>{name(entry)} gets a bye straight into round 2.</>
        ) : opp ? (
          <>
            {name(entry)} plays {name(opp)} in {b.title}.
          </>
        ) : (
          <>The other place in {b.title} is empty, so unless you fill it they get a bye.</>
        ),
      clash: clashText,
    };
  };

  /** A drop (or dropdown pick) of `d` onto place `key`. */
  const dropOn = (key: string, d: Dragged) => {
    if (!movable(key) || d.from === key) return;
    const at = draft.seating[key];
    if (d.from) {
      if (at) setPending({ kind: 'swap', from: d.from, to: key });
      else setPending({ kind: 'place', key, entry: d.entry }); // moving a placed player to an open place
      return;
    }
    setPending(at ? { kind: 'replace', key, entry: d.entry, occupant: at } : { kind: 'place', key, entry: d.entry });
  };

  const confirm = () => {
    if (!pending) return;
    switch (pending.kind) {
      case 'out':
        seat({ [pending.key]: null });
        break;
      case 'place': {
        const from = Object.keys(draft.seating).find((k) => draft.seating[k] === pending.entry);
        seat({ ...(from ? { [from]: null } : {}), [pending.key]: pending.entry });
        break;
      }
      case 'replace':
        seat({ [pending.key]: pending.entry });
        break;
      case 'swap':
        seat({ [pending.from]: draft.seating[pending.to], [pending.to]: draft.seating[pending.from] });
        break;
      case 'discard':
        clearDraft();
        dropSaved(ev.id);
        toast('Changes discarded', { tone: 'info', detail: 'The draw is exactly as published.' });
        onDone();
        break;
      case 'publish': {
        const err = rearrange(ev.id, draft.seating, flight);
        if (err) {
          toast(err, { tone: 'error' });
          break;
        }
        clearDraft();
        toast(`${ev.name} draw updated`, {
          detail: `${moved.length} ${moved.length === 1 ? 'player' : 'players'} moved. Players were notified.`,
        });
        onDone();
        break;
      }
    }
    setPending(null);
  };

  const dialog = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'out':
        return {
          title: `Take ${name(pending.entry)} out?`,
          body: <>They leave {where(pending.key)} and wait in the holding area until you place them again.</>,
          action: 'Move to holding area',
        };
      case 'place': {
        const m = meeting(pending.key, pending.entry);
        return { title: `Put ${name(pending.entry)} in ${where(pending.key)}?`, body: m.text, warn: m.clash, action: 'Place here' };
      }
      case 'replace': {
        const m = meeting(pending.key, pending.entry);
        return {
          title: `Put ${name(pending.entry)} in ${where(pending.key)}?`,
          body: (
            <>
              {m.text} {name(pending.occupant)} moves to the holding area.
            </>
          ),
          warn: m.clash,
          action: 'Place here',
        };
      }
      case 'swap': {
        const a = draft.seating[pending.from]!;
        const b = draft.seating[pending.to]!;
        const after = { ...draft.seating, [pending.from]: b, [pending.to]: a };
        const ma = meeting(pending.to, a, after);
        const mb = meeting(pending.from, b, after);
        return {
          title: `Swap ${name(a)} and ${name(b)}?`,
          body: (
            <>
              {ma.text} {mb.text}
            </>
          ),
          warn: ma.clash ?? mb.clash,
          action: 'Swap them',
        };
      }
      case 'publish':
        return {
          title: `Publish changes to ${ev.name}?`,
          body: (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-[13.5px]">
                {moved.map((x) => (
                  <li key={x.entryId} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-fg">{name(x.entryId)}</span>
                    <span className="num shrink-0">
                      {where(x.from)} → {where(x.to)}
                    </span>
                  </li>
                ))}
              </ul>
              {byesMoved ? (
                <span>
                  Byes move, so the draw is rebuilt from these first-round lines and its matches are renumbered within the event&apos;s
                  numbers. Reprint any score slips you already printed.
                </span>
              ) : (
                <span>Match numbers stay the same.</span>
              )}
              <span>Everyone in {ev.name} gets a notification that the draw changed.</span>
            </div>
          ),
          warn: emptyLines.length
            ? `${emptyLines.join(', ')} ${emptyLines.length === 1 ? 'has' : 'have'} nobody left in ${emptyLines.length === 1 ? 'it' : 'them'}, so the round-2 opponent goes straight through.`
            : undefined,
          action: `Publish ${moved.length} ${moved.length === 1 ? 'change' : 'changes'}`,
        };
      case 'discard':
        return {
          title: 'Discard your changes?',
          body: savedDraft ? (
            <>Your saved and unsaved changes are removed. The draw stays exactly as published.</>
          ) : (
            <>The draw stays exactly as published.</>
          ),
          action: 'Discard',
          danger: true,
        };
    }
  })();

  const dirty = changes > 0 || held.length > 0 || !!savedDraft;
  const save = () => {
    saveDraft(ev.id, sig, draft.seating, userId);
    clearDraft();
    toast('Changes saved', { detail: 'Players see nothing yet. Come back any time to publish them.' });
  };

  // Later rounds preview the new seating once everyone is placed (byes carry the new players on).
  // (not with added lines: the rebuilt round 1 has more lines than the one being edited)
  const preview = useMemo(() => {
    if (taken.length || !changes || extras.length) return lk;
    const r = rearrangeDraw(selectDB(useStore.getState()), ev.id, draft.seating, flight);
    return r.db ? makeLookup(r.db) : lk;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk, ev.id, draft.seating]);
  const lineBox = new Map(places.boxes.filter((b) => b.kind === 'line').map((b) => [b.id, b]));
  const groupBoxes = places.boxes.filter((b) => b.kind === 'group');
  const firstLine = lk.match([...lineBox.keys()][0]);
  const startStage = firstLine ? lk.stagesOf(ev.id).find((s) => s.id === firstLine.stageId) : undefined;
  const canAddLines = !!startStage?.placement && places.byesMovable;

  const rowProps = {
    lk,
    seating: draft.seating,
    locked: places.locked,
    held,
    dragging,
    onTakeOut: (key: string, entry: ID) => setPending({ kind: 'out', key, entry }),
    onDrop: dropOn,
    onDragging: setDragging,
  };

  // The editor's actions: inside the canvas for brackets (so they stay with the draw, also in
  // full screen); pinned above the groups for round robin.
  const toolbar = (
    <div className="flex flex-col gap-2 bg-surface px-3 py-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-[13px] font-semibold">Editing starting places</span>
        <HelpTip label="How editing works" className="-my-1">
          Tap a player to take them out, then pick them in an open place (including a bye, before any match is played). On a computer you
          can also drag a name from the holding area, or drop one player on another to swap them. Players see nothing until you publish.
        </HelpTip>
        <span className="text-[12px] font-semibold" role="status">
          {unsaved ? (
            <span className="flex items-center gap-1 text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden /> Unsaved
            </span>
          ) : savedDraft ? (
            <span className="flex items-center gap-1 text-ok">
              <Icon name="check" size={13} strokeWidth={2.6} /> Saved {fmtAgo(savedDraft.savedAt, now)}
              {savedBy ? ` by ${savedBy}` : ''}
            </span>
          ) : (
            <span className="font-normal text-muted">No changes yet</span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDone} title="Leave the editor; saved and unsaved changes are kept">
          Close
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'discard' })}>
            Discard
          </Button>
        )}
        {canAddLines && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon name="plus" size={16} />}
            onClick={() => setStored({ ...draft, seating: addExtraLine(ev.id, draft.seating) })}
            title="An empty round-1 line: put a player in it and they get a bye"
          >
            Add a bye line
          </Button>
        )}
        <Button size="sm" disabled={!unsaved} icon={<Icon name="check" size={16} />} onClick={save}>
          {unsaved || !savedDraft ? 'Save changes' : 'Saved'}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!changes || taken.length > 0}
          title={taken.length ? 'Place everyone from the holding area first' : undefined}
          onClick={() => setPending({ kind: 'publish' })}
        >
          Publish{changes ? ` ${changes}` : ''} {changes === 1 ? 'change' : 'changes'}
        </Button>
      </div>
    </div>
  );

  return (
    <div ref={top} className="flex min-w-0 scroll-mt-20 flex-col gap-3">
      {startStage ? (
        <Bracket
          lk={preview}
          stage={startStage}
          matches={preview.matchesOfEvent(ev.id).filter((m) => m.stageId === startStage.id)}
          toolbar={toolbar}
          editLine={(m) => {
            const box = lineBox.get(m.id);
            return box ? <EditLine box={box} {...rowProps} /> : null;
          }}
        />
      ) : (
        <div
          className="sticky z-20 overflow-hidden rounded-xl border border-line shadow-sm"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
        >
          {toolbar}
          {flight && !places.boxes.length && (
            <p className="border-t border-line bg-surface p-4 text-[14px] text-muted">
              Nothing in this flight can be moved right now: its first-round places are either still waiting for results upstream, or their
              matches have already started.
            </p>
          )}
        </div>
      )}
      {extras.length > 0 && (
        <section aria-label="New bye lines" className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong p-3">
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-fg">New lines in round 1.</span> Take a player out of their match and put them here to give
            them a bye; their opponent gets a bye too unless you fill that place. Empty lines are ignored. After you publish, the placement
            rounds are rebuilt and renumbered.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {extras.map((b) => (
              <div key={b.id} className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <EditLine box={b} {...rowProps} />
                </div>
                {b.places.every((p) => !draft.seating[p.key]) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${b.title}`}
                    onClick={() => setStored({ ...draft, seating: removeExtraLine(draft.seating, b) })}
                  >
                    <Icon name="close" size={15} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {groupBoxes.length > 0 && (
        <div className="grid min-w-0 grid-cols-1 gap-2 pb-40 sm:grid-cols-2 xl:grid-cols-3">
          {groupBoxes.map((b) => (
            <section key={b.id} className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={b.title}>
              <div className="border-b border-line bg-sunken/60 px-2.5 py-1 text-[12px] font-semibold">{b.title}</div>
              <ul className="divide-y divide-line">
                {b.places.map((p) => (
                  <PlaceRow key={p.key} box={b} place={p} {...rowProps} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {(held.length > 0 || moved.length > 0) && (
        <HoldingTray
          held={held}
          moved={moved}
          name={name}
          where={where}
          onDragging={setDragging}
          waitingForPlaces={held.length > 0 && !!startStage}
        />
      )}

      <Dialog
        open={!!dialog}
        onClose={() => setPending(null)}
        title={dialog?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant={dialog && 'danger' in dialog ? 'danger' : 'primary'} onClick={confirm}>
              {dialog?.action}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[14px] text-muted">
          <div>{dialog?.body}</div>
          {dialog && 'warn' in dialog && dialog.warn && (
            <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 font-medium text-warn">
              <Icon name="alert" size={17} className="mt-0.5 shrink-0" /> {dialog.warn}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

type TrayPos = { x: number; y: number } | null;

/**
 * The holding area: a floating panel that appears once someone is taken out. Drag it anywhere by
 * its handle (mouse or finger); it stays where you leave it on this device, and a double-click on
 * the handle puts it back at the bottom. Names can be dragged onto any place; on phones the
 * dropdown on an open place is the way back in.
 */
function HoldingTray({
  held,
  moved,
  name,
  where,
  onDragging,
  waitingForPlaces,
}: {
  held: ID[];
  moved: { entryId: ID; from: string; to: string }[];
  name: (id: ID) => string;
  where: (key: string) => string;
  onDragging: (on: boolean) => void;
  waitingForPlaces: boolean;
}) {
  const [showChanges, setShowChanges] = useState(false);
  const [pos, setPos] = usePersistentState<TrayPos>('drawEdit.trayPos', null);
  const panel = useRef<HTMLElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  // keep the panel on screen (the window may have been resized since it was placed)
  const clampPos = (x: number, y: number): TrayPos => {
    const r = panel.current?.getBoundingClientRect();
    const w = r?.width ?? 320;
    const h = r?.height ?? 120;
    return { x: Math.min(Math.max(8, x), window.innerWidth - w - 8), y: Math.min(Math.max(8, y), window.innerHeight - h - 8) };
  };
  const placed = pos ? clampPos(pos.x, pos.y) : null;

  return (
    <aside
      ref={panel}
      aria-label="Holding area"
      className={cn(
        'fixed z-[65] flex w-[min(560px,calc(100vw-24px))] animate-rise flex-col gap-2 rounded-2xl border bg-surface p-3 shadow-pop',
        held.length ? 'border-warn' : 'border-line',
        !placed && 'inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] mx-auto lg:bottom-5',
      )}
      style={placed ? { left: placed.x, top: placed.y } : undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Move the holding area (double-click to put it back)"
          title="Drag to move · double-click to put it back"
          className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-sunken hover:text-fg active:cursor-grabbing touch:h-10"
          onPointerDown={(e) => {
            const r = panel.current!.getBoundingClientRect();
            grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!grab.current) return;
            setPos(clampPos(e.clientX - grab.current.dx, e.clientY - grab.current.dy));
          }}
          onPointerUp={() => (grab.current = null)}
          onPointerCancel={() => (grab.current = null)}
          onDoubleClick={() => setPos(null)}
        >
          <Icon name="drag" size={16} />
        </button>
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full',
            held.length ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok',
          )}
        >
          <Icon name={held.length ? 'users' : 'check'} size={15} />
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold">
          {held.length ? (
            <>
              Holding area · <span className="num">{held.length}</span> to place
            </>
          ) : (
            'Everyone is placed'
          )}
        </span>
        {moved.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowChanges((v) => !v)} aria-expanded={showChanges}>
            {moved.length} {moved.length === 1 ? 'change' : 'changes'}
            <Icon name={showChanges ? 'down' : 'up'} size={15} />
          </Button>
        )}
      </div>
      {held.length > 0 && (
        <>
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {held.map((e) => (
              <li
                key={e}
                draggable
                onDragStart={(d) => {
                  d.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ entry: e } satisfies Dragged));
                  d.dataTransfer.effectAllowed = 'move';
                  onDragging(true);
                }}
                onDragEnd={() => onDragging(false)}
                className="flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line bg-sunken px-2.5 text-[13px] font-semibold lg:cursor-grab"
              >
                <Icon name="drag" size={14} className="hidden shrink-0 text-muted lg:block" />
                <span className="truncate">{name(e)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">
            Pick them in an open place<span className="hidden lg:inline">, or drag a name onto any place</span>.
            {waitingForPlaces && ' Later rounds update once everyone is placed.'}
          </p>
        </>
      )}
      {showChanges && (
        <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto border-t border-line pt-2 text-[12.5px]">
          {moved.map((x) => (
            <li key={x.entryId} className="flex gap-1.5">
              <span className="min-w-0 flex-1 truncate">{name(x.entryId)}</span>
              <span className="num shrink-0 text-muted">{x.to ? `${where(x.from)} → ${where(x.to)}` : 'held'}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface RowProps {
  lk: Lookup;
  seating: Seating;
  locked: Set<ID>;
  held: ID[];
  dragging: boolean;
  onTakeOut: (key: string, entry: ID) => void;
  onDrop: (key: string, d: Dragged) => void;
  onDragging: (on: boolean) => void;
}

/** A first-round line in the bracket canvas, shaped like a match box: number gutter, two places. */
function EditLine({ box, ...rest }: RowProps & { box: PlaceBox }) {
  // a bye in the draft: a place nobody is in (fixed bye, or emptied)
  const bye = box.places.some((p) => !rest.seating[p.key]);
  return (
    <section aria-label={box.title} className="flex w-full overflow-hidden rounded-md border border-line-strong/70 bg-surface">
      <span
        className="num flex w-8 shrink-0 items-center justify-center border-r border-line bg-sunken text-[10.5px] font-semibold text-muted"
        aria-hidden
      >
        {bye ? 'bye' : box.title.startsWith('#') ? box.title.slice(1) : 'new'}
      </span>
      <ul className="min-w-0 flex-1 divide-y divide-line">
        {box.places.map((p) => (
          <PlaceRow key={p.key} box={box} place={p} compact {...rest} />
        ))}
      </ul>
    </section>
  );
}

/** One place: a player (tap to take out, drag to move or swap), a bye, or an open place with a dropdown. */
function PlaceRow({
  box,
  place: p,
  compact,
  lk,
  seating,
  locked,
  held,
  dragging,
  onTakeOut,
  onDrop,
  onDragging,
}: RowProps & { box: PlaceBox; place: PlaceBox['places'][number]; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const h = compact ? 'h-7' : 'h-9 touch:h-11';
  if (!(p.key in seating))
    return (
      <li
        className={cn('flex items-center px-2 text-[12.5px] italic text-faint', h)}
        title="Byes stay where they are once matches have been played"
      >
        Bye
      </li>
    );
  const e = seating[p.key];
  const isLocked = !!e && locked.has(e);
  const entry = e ? lk.entry(e) : undefined;
  const read = (d: DragEvent): Dragged | null => {
    try {
      return JSON.parse(d.dataTransfer.getData(DRAG_TYPE)) as Dragged;
    } catch {
      return null;
    }
  };
  const dropProps = isLocked
    ? {}
    : {
        onDragOver: (d: DragEvent) => {
          if (!d.dataTransfer.types.includes(DRAG_TYPE)) return;
          d.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (d: DragEvent) => {
          d.preventDefault();
          setOver(false);
          onDragging(false);
          const x = read(d);
          if (x) onDrop(p.key, x);
        },
      };
  return (
    <li
      {...dropProps}
      className={cn(
        'transition-colors',
        over && 'bg-primary/25 outline outline-2 -outline-offset-2 outline-primary',
        dragging && !isLocked && !over && 'bg-primary/5',
      )}
    >
      {e ? (
        <button
          type="button"
          disabled={isLocked}
          draggable={!isLocked}
          onDragStart={(d) => {
            d.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ entry: e, from: p.key } satisfies Dragged));
            d.dataTransfer.effectAllowed = 'move';
            onDragging(true);
          }}
          onDragEnd={() => onDragging(false)}
          onClick={() => onTakeOut(p.key, e)}
          title={isLocked ? 'Already played, so they stay here' : 'Tap to take out, or drag onto another place to swap'}
          className={cn(
            'flex w-full items-center gap-1.5 px-2 text-left text-[12.5px]',
            h,
            isLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-sunken lg:cursor-grab',
          )}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {lk.entryName(e)}
            {entry?.seed ? <span className="num ml-1 text-[10px] font-semibold text-muted">[{entry.seed}]</span> : null}
          </span>
          {!compact && <span className="hidden max-w-[40%] shrink-0 truncate text-[11.5px] text-muted sm:inline">{lk.entryClub(e)}</span>}
          {isLocked && <Icon name="lock" size={12} className="shrink-0 text-muted" />}
        </button>
      ) : (
        <div className={cn('flex items-center bg-primary/10 px-1', h)}>
          <Select
            aria-label={`Choose who goes in ${box.title}`}
            placeholder={held.length ? (p.entryId === 'BYE' ? 'Bye · add a player' : 'Empty · add a player') : 'Bye'}
            value=""
            disabled={!held.length}
            onChange={(x) => onDrop(p.key, { entry: x.target.value })}
            className={cn(
              'flex-1 rounded-md border-dashed bg-surface px-2 py-0 text-[12.5px] font-semibold',
              compact ? 'min-h-6' : 'min-h-8',
            )}
          >
            {held.map((x) => (
              <option key={x} value={x}>
                {lk.entryName(x)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </li>
  );
}
