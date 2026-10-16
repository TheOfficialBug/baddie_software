// Application state: the tournament database snapshot plus a few viewer preferences.
// All state transitions are pure functions in ./ops (unit-tested); this store wires them
// to React, persists the snapshot in the browser and raises toasts / notices.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/app';
import { mulberry32 } from '@/engine/rng';
import type { DrawPlan, Entry, ID, MatchUpdate, Player, Side, SkillLevel, TEvent, Tournament } from '@/engine/types';

import { safeStorage } from '@/lib/storage';

import * as accounts from '@/data/accounts';
import { fillFreeCourts } from '@/data/assign';
import * as checkIns from '@/data/checkIns';
import { applyImport, type EntryList, type ImportPlan, planImport } from '@/data/entryList';
import * as ops from '@/data/ops';
import { rearrangeDraw, type Seating } from '@/data/placements';
import * as resets from '@/data/resets';
import { buildIowaOpen } from '@/data/seed/iowaOpen';
import * as sim from '@/data/simulate';
import { toast } from '@/data/toast';
import { type DB, emptyDB, type Notice, type Profile, type RegistrationPick, type Role } from '@/data/types';

interface ViewerState {
  /** Timestamp of the newest notice the viewer has opened. */
  noticesSeenAt: number;
}

interface Actions {
  // accounts & team
  /** After sign-in: refresh the profile, accept staff invites for the email, link the player record. Returns the player id. */
  syncAccount: (p: Profile) => ID | null;
  /** Each returns null on success or a message to show. */
  inviteMember: (orgId: ID, email: string, role: Role) => string | null;
  cancelInvite: (inviteId: ID) => void;
  setMemberRole: (orgId: ID, userId: ID, role: Role) => string | null;
  removeMember: (orgId: ID, userId: ID) => string | null;
  // viewer
  markNoticesSeen: () => void;
  resetDemo: () => void;
  // notices
  sendNotice: (n: Omit<Notice, 'id' | 'at'>) => void;
  // tournaments & events
  createTournament: (t: Omit<Tournament, 'id' | 'nextMatchNumber'>, events: Omit<TEvent, 'id' | 'tournamentId'>[]) => ID;
  updateTournament: (id: ID, patch: Partial<Tournament>) => void;
  addEvent: (tid: ID, ev: Omit<TEvent, 'id' | 'tournamentId'>) => ID;
  updateEvent: (id: ID, patch: Partial<TEvent>) => void;
  deleteEvent: (id: ID) => void;
  // players & entries
  addPlayer: (p: Omit<Player, 'id'>) => ID;
  updatePlayer: (id: ID, patch: Partial<Player>) => void;
  addEntry: (eventId: ID, playerIds: ID[], status?: Entry['status'], extra?: Pick<Entry, 'levels' | 'pendingPartner'>) => ID;
  setEntryStatus: (id: ID, status: Entry['status']) => void;
  /** Fix a level given for one event; slot = player's place in the entry (after the last: the named partner). */
  setEntryLevel: (entryId: ID, slot: number, level: SkillLevel) => void;
  /** A player enters one or more events; each pick carries the levels and partner given for that event. */
  register: (tid: ID, playerId: ID, picks: RegistrationPick[], total: number) => void;
  /** Replace the tournament's entries with an imported entry list. Returns what was done (or why not). */
  importEntryList: (tid: ID, list: EntryList) => ImportPlan;
  // draws
  publishDraw: (eventId: ID, plan: DrawPlan, rngSeed: number, seedOrder: ID[]) => void;
  clearDraw: (eventId: ID) => void;
  /** Publish hand-made changes to who starts where in a draw. Returns an error message or null. */
  rearrangeDraw: (eventId: ID, seating: Seating) => string | null;
  /** Keep edits to a published draw without publishing them (`base` = the seating they start from). */
  saveDrawDraft: (eventId: ID, base: string, seating: Seating, by?: ID) => void;
  discardDrawDraft: (eventId: ID) => void;
  /** Make every remaining draw with the default settings (levels, seeds, club separation). Returns how many were made. */
  drawAllEvents: (tid: ID) => number;
  /** Make one event's draw with the default settings. Returns false when it has fewer than 2 entries. */
  drawEvent: (eventId: ID) => boolean;
  // tournament stage
  /** Move the tournament along: registration → closed → live → completed (or back). Players get an announcement. */
  setStage: (tid: ID, status: Tournament['status']) => void;
  // check-in
  /** Check players in at the venue, or undo it. `by` is the staff account doing it. */
  setCheckedIn: (tid: ID, playerIds: ID[], on: boolean, by?: ID) => void;
  /** Everyone in the tournament back to not checked in (start of a new day). */
  clearCheckIns: (tid: ID) => void;
  // simulator (test runs)
  /** One step of match day: a result comes in and free courts are filled. */
  simulateTick: (tid: ID) => sim.TickResult;
  /** Play up to n more matches at once. */
  simulateMatches: (tid: ID, n: number) => sim.TickResult;
  // match day
  /** Returns null when called, or the reason it wasn't (busy / resting players). */
  callMatch: (matchId: ID, courtId: ID, force?: ops.CallOverride) => ops.CallConflict | null;
  /** Send the next ready matches to every free court. Returns how many were called. */
  fillCourts: (tid: ID) => number;
  /** Start the match clock (players finished warming up). */
  startMatch: (matchId: ID) => void;
  returnToQueue: (matchId: ID) => void;
  adjustLive: (matchId: ID, side: Side, delta: 1 | -1) => void;
  /** Type a side's points for the current game (court card). Returns an error message or null. */
  setLivePoints: (matchId: ID, side: Side, points: number) => string | null;
  /** Save an in-progress score typed from a slip: finished games plus the current game. */
  setLiveScore: (matchId: ID, games: [number, number][], live: [number, number] | null) => void;
  /** Returns null on success, or a message explaining why the result was refused. */
  saveResult: (matchId: ID, input: ops.ResultInput) => string | null;
  undo: (updateId: ID) => void;
  // resets (the desk confirms first)
  /** One match back to not played (score, court and result cleared). Returns an error message or null. */
  resetMatch: (matchId: ID) => string | null;
  /** One event: clear its results, keep the draw. */
  resetEventResults: (eventId: ID) => void;
  /** One event: remove the draw and its results. */
  resetEventDraw: (eventId: ID) => void;
  /** Whole tournament: clear every result, keep the draws (back to the draws stage). */
  resetResults: (tid: ID) => void;
  /** Whole tournament: back to open registration, draws and results removed, entries kept. */
  resetDraws: (tid: ID) => void;
}

export type State = DB & ViewerState & Actions;

const STAGE_NOTICE: Partial<Record<Tournament['status'], (t: Tournament) => { title: string; body: string }>> = {
  registration: (t) => ({ title: 'Registration is open', body: `Enter ${t.name} on the tournament page.` }),
  closed: () => ({
    title: 'Registration is closed',
    body: 'Thanks for entering! Draws are being made; you will be notified when yours is out.',
  }),
  live: (t) => ({ title: `${t.name} is live`, body: 'Follow the courts and your next match on the tournament page.' }),
  completed: () => ({ title: 'That is a wrap', body: 'All results are final. Thanks for playing!' }),
};

/** Bump when the shape of persisted data changes; older saved data is replaced with fresh demo data. */
const STORE_VERSION = 11;
const DB_KEYS = Object.keys(emptyDB()) as (keyof DB)[];

/** The database part of the state (no viewer preferences, no actions). */
export const selectDB = (s: DB): DB => Object.fromEntries(DB_KEYS.map((k) => [k, s[k]])) as unknown as DB;

const freshState = (): DB & ViewerState => ({ ...buildIowaOpen(), noticesSeenAt: 0 });

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** The current database snapshot (no viewer state, no actions). */
      const db = (): DB => selectDB(get());
      const commit = (next: DB) => set({ ...next });
      /** Undo record for a match, taken before it changes. */
      const record = (matchId: ID, label: string): MatchUpdate => {
        const m = get().matches.find((x) => x.id === matchId)!;
        return { id: ops.uid('u'), matchId, at: Date.now(), label, before: ops.snapshot(m) };
      };

      return {
        ...freshState(),

        syncAccount: (p) => {
          const withProfile = accounts.acceptInvites(accounts.upsertProfile(db(), p), p.id, p.email);
          const { db: next, playerId } = accounts.claimPlayer(withProfile, p.id, p.email);
          commit(next);
          return playerId;
        },
        inviteMember: (orgId, email, role) => {
          const r = accounts.inviteMember(db(), orgId, email, role);
          if (r.db) commit(r.db);
          return r.error ?? null;
        },
        cancelInvite: (inviteId) => commit(accounts.cancelInvite(db(), inviteId)),
        setMemberRole: (orgId, userId, role) => {
          const r = accounts.setMemberRole(db(), orgId, userId, role);
          if (r.db) commit(r.db);
          return r.error ?? null;
        },
        removeMember: (orgId, userId) => {
          const r = accounts.removeMember(db(), orgId, userId);
          if (r.db) commit(r.db);
          return r.error ?? null;
        },
        markNoticesSeen: () => set({ noticesSeenAt: Date.now() }),
        resetDemo: () => {
          set(freshState());
          toast('Demo data reset');
        },

        sendNotice: (n) => set((s) => ({ notices: [...s.notices, { ...n, id: ops.uid('n'), at: Date.now() }] })),

        createTournament: (t, events) => {
          const id = ops.uid('t');
          const tour: Tournament = { ...t, id, nextMatchNumber: 1 };
          const evs = events.map((e) => ({ ...e, id: ops.uid('ev'), tournamentId: id }));
          set((s) => ({ tournaments: [...s.tournaments, tour], events: [...s.events, ...evs] }));
          return id;
        },
        updateTournament: (id, patch) => set((s) => ({ tournaments: s.tournaments.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
        addEvent: (tid, ev) => {
          const id = ops.uid('ev');
          set((s) => ({ events: [...s.events, { ...ev, id, tournamentId: tid }] }));
          return id;
        },
        updateEvent: (id, patch) =>
          set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch, config: { ...e.config, ...patch.config } } : e)) })),
        deleteEvent: (id) => {
          const cleared = ops.clearDraw(db(), id);
          commit({
            ...cleared,
            events: cleared.events.filter((e) => e.id !== id),
            entries: cleared.entries.filter((e) => e.eventId !== id),
          });
        },

        addPlayer: (p) => {
          const id = ops.uid('p');
          set((s) => ({ players: [...s.players, { ...p, id }] }));
          return id;
        },
        updatePlayer: (id, patch) => set((s) => ({ players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        addEntry: (eventId, playerIds, status = 'accepted', extra) => {
          const id = ops.uid('e');
          set((s) => ({ entries: [...s.entries, { id, eventId, playerIds, status, createdAt: Date.now(), ...extra }] }));
          return id;
        },
        setEntryStatus: (id, status) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, status } : e)) })),
        setEntryLevel: (entryId, slot, level) => commit(ops.setEntryLevel(db(), entryId, slot, level)),
        register: (tid, playerId, picks, total) => {
          const ids = picks.map((p) =>
            get().addEntry(p.eventId, p.partnerId ? [playerId, p.partnerId] : [playerId], 'pending', {
              levels: p.levels,
              pendingPartner: p.pendingPartner,
            }),
          );
          set((s) => ({
            registrations: [...s.registrations, { id: ops.uid('r'), tournamentId: tid, playerId, entryIds: ids, total, at: Date.now() }],
          }));
        },
        importEntryList: (tid, list) => {
          const plan = planImport(db(), tid, list);
          if (!plan.blocked) commit(applyImport(db(), tid, plan));
          return plan;
        },

        publishDraw: (eventId, plan, rngSeed, seedOrder) => {
          const next = ops.applySeeds(ops.publishPlan(db(), eventId, plan, rngSeed), eventId, seedOrder);
          const ev = next.events.find((e) => e.id === eventId)!;
          const resolved = ops.resolveTournament(next, ev.tournamentId);
          commit({ ...resolved, notices: [...resolved.notices, ops.drawPublishedNotice(ev, Date.now())] });
        },
        clearDraw: (eventId) => commit(ops.clearDraw(db(), eventId)),
        rearrangeDraw: (eventId, seating) => {
          const r = rearrangeDraw(db(), eventId, seating);
          if (!r.db) return r.error;
          const ev = r.db.events.find((e) => e.id === eventId)!;
          commit({
            ...r.db,
            notices: [...r.db.notices, ops.drawUpdatedNotice(ev, Date.now())],
            drawDrafts: r.db.drawDrafts.filter((d) => d.eventId !== eventId),
          });
          return null;
        },
        saveDrawDraft: (eventId, base, seating, by) =>
          set((s) => ({
            drawDrafts: [
              ...s.drawDrafts.filter((d) => d.eventId !== eventId),
              { eventId, base, seating, savedAt: Date.now(), savedBy: by },
            ],
          })),
        discardDrawDraft: (eventId) => set((s) => ({ drawDrafts: s.drawDrafts.filter((d) => d.eventId !== eventId) })),
        drawAllEvents: (tid) => {
          const before = db();
          const todo = before.events.filter((e) => e.tournamentId === tid && e.drawState !== 'published');
          const next = sim.drawAll(before, tid, Date.now() % 1_000_000_000);
          const made = next.events.filter((e) => todo.some((x) => x.id === e.id) && e.drawState === 'published');
          commit({ ...next, notices: [...next.notices, ...made.map((ev) => ops.drawPublishedNotice(ev, Date.now()))] });
          return made.length;
        },

        drawEvent: (eventId) => {
          const before = db();
          const next = sim.drawEvent(before, eventId, Date.now() % 1_000_000_000);
          const ev = next.events.find((e) => e.id === eventId);
          if (next === before || !ev || ev.drawState !== 'published') return false;
          commit({ ...next, notices: [...next.notices, ops.drawPublishedNotice(ev, Date.now())] });
          return true;
        },

        setStage: (tid, status) => {
          const t = get().tournaments.find((x) => x.id === tid);
          if (!t || t.status === status) return;
          const text = STAGE_NOTICE[status]?.(t);
          set((s) => ({
            tournaments: s.tournaments.map((x) => (x.id === tid ? { ...x, status } : x)),
            notices: text
              ? [
                  ...s.notices,
                  {
                    id: ops.uid('n'),
                    tournamentId: tid,
                    at: Date.now(),
                    kind: 'announcement',
                    audience: 'all',
                    channels: ['app'],
                    ...text,
                  },
                ]
              : s.notices,
          }));
        },

        setCheckedIn: (tid, playerIds, on, by) => commit(checkIns.setCheckedIn(db(), tid, playerIds, on, Date.now(), by)),
        clearCheckIns: (tid) => commit(checkIns.clearCheckIns(db(), tid)),

        simulateTick: (tid) => {
          const r = sim.simulateTick(db(), tid, Date.now(), mulberry32(Date.now() % 2_147_483_647));
          commit(r.db);
          return r;
        },
        simulateMatches: (tid, n) => {
          // results spread over the last few minutes per match, ending now
          const r = sim.simulateMatches(db(), tid, n, Date.now() - n * 2 * 60_000, mulberry32(Date.now() % 2_147_483_647), 2);
          commit(r.db);
          return r;
        },

        startMatch: (matchId) =>
          set((s) => ({ matches: s.matches.map((m) => (m.id === matchId && !m.startedAt ? { ...m, startedAt: Date.now() } : m)) })),
        callMatch: (matchId, courtId, force) => {
          const u = record(matchId, 'Called to court');
          const now = Date.now();
          const r = ops.callToCourt(db(), matchId, courtId, now, force);
          if (!r.db) {
            if (r.conflict) return r.conflict;
            toast(r.error ?? 'Not possible', { tone: 'error' });
            return { busy: [], resting: [] };
          }
          const notice = ops.courtCallNotice(r.db, matchId, courtId, now);
          commit({ ...r.db, updates: [...r.db.updates, u], notices: notice ? [...r.db.notices, notice] : r.db.notices });
          return null;
        },
        fillCourts: (tid) => {
          const before = db();
          const r = fillFreeCourts(before, tid, Date.now());
          if (!r.called.length) return 0;
          const ups = r.called.map(({ matchId }) => record(matchId, 'Called to court'));
          commit({ ...r.db, updates: [...r.db.updates, ...ups] });
          return r.called.length;
        },
        returnToQueue: (matchId) => {
          const u = record(matchId, 'Returned to queue');
          const next = ops.returnToQueue(db(), matchId);
          commit({ ...next, updates: [...next.updates, u] });
        },
        adjustLive: (matchId, side, delta) => {
          const current = db();
          const m = current.matches.find((x) => x.id === matchId);
          if (!m) return;
          const r = ops.adjustLive(current, matchId, side, delta, ops.rulesOfMatch(current, m));
          if (!r.db) toast(r.error ?? 'Not possible', { tone: 'info' });
          else commit(r.db);
        },
        setLivePoints: (matchId, side, points) => {
          const current = db();
          const m = current.matches.find((x) => x.id === matchId);
          if (!m) return 'Match not found.';
          const r = ops.setLivePoints(current, matchId, side, points, ops.rulesOfMatch(current, m));
          if (!r.db) return r.error;
          commit(r.db);
          return null;
        },
        setLiveScore: (matchId, games, live) => {
          const u = record(matchId, 'Live score updated');
          set((s) => ({
            matches: s.matches.map((m) => (m.id === matchId ? { ...m, games, live, startedAt: m.startedAt ?? Date.now() } : m)),
            updates: [...s.updates, u],
          }));
        },
        saveResult: (matchId, input) => {
          const prev = get().matches.find((x) => x.id === matchId);
          const u = record(matchId, prev?.status === 'finished' ? 'Result edited' : 'Result saved');
          const r = ops.saveResult(db(), matchId, input, Date.now());
          if (!r.db) return r.error ?? 'Could not save.';
          commit({ ...r.db, updates: [...r.db.updates, u] });
          return null;
        },
        resetMatch: (matchId) => {
          const u = record(matchId, 'Score reset');
          const r = resets.resetMatch(db(), matchId);
          if (!r.db) return r.error;
          commit({ ...r.db, updates: [...r.db.updates, u] });
          return null;
        },
        resetEventResults: (eventId) => commit(resets.resetEventResults(db(), eventId)),
        resetEventDraw: (eventId) => commit(resets.resetEventDraw(db(), eventId)),
        resetResults: (tid) => commit(resets.resetTournamentResults(db(), tid)),
        resetDraws: (tid) => commit(resets.resetTournamentDraws(db(), tid)),
        undo: (updateId) => {
          const u = get().updates.find((x) => x.id === updateId);
          if (!u) return;
          const r = ops.restore(db(), u);
          if (!r.db) {
            toast(r.error ?? 'Not possible', { tone: 'error' });
            return;
          }
          commit({ ...r.db, updates: r.db.updates.filter((x) => x.id !== updateId) });
          toast('Undone');
        },
      };
    },
    {
      name: STORAGE_KEYS.db,
      version: STORE_VERSION,
      storage: createJSONStorage(() => ({
        getItem: (k) => safeStorage.get(k),
        setItem: (k, v) => safeStorage.set(k, v),
        removeItem: (k) => safeStorage.remove(k),
      })),
      // Persist data and viewer preferences only; actions are recreated on load.
      partialize: (s) => {
        const out: Partial<State> = { noticesSeenAt: s.noticesSeenAt };
        for (const k of DB_KEYS) Object.assign(out, { [k]: s[k] });
        return out;
      },
      // Older saved demos are replaced rather than migrated.
      migrate: () => freshState() as State,
    },
  ),
);
