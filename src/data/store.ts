// Application state: the tournament database snapshot plus a few viewer preferences.
// All state transitions are pure functions in ./ops (unit-tested); this store wires them
// to React, persists the snapshot in the browser and raises toasts / notices.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/app';
import type { DrawPlan, Entry, ID, MatchUpdate, Player, Side, TEvent, Tournament } from '@/engine/types';

import { safeStorage } from '@/lib/storage';

import * as accounts from '@/data/accounts';
import { buildDemo } from '@/data/demo';
import * as ops from '@/data/ops';
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
  /** A player enters one or more events; each pick carries the levels and partner given for that event. */
  register: (tid: ID, playerId: ID, picks: RegistrationPick[], total: number) => void;
  // draws
  publishDraw: (eventId: ID, plan: DrawPlan, rngSeed: number, seedOrder: ID[]) => void;
  clearDraw: (eventId: ID) => void;
  // match day
  /** Returns null when called, or the reason it wasn't (busy / resting players). */
  callMatch: (matchId: ID, courtId: ID, force?: ops.CallOverride) => ops.CallConflict | null;
  /** Start the match clock (players finished warming up). */
  startMatch: (matchId: ID) => void;
  returnToQueue: (matchId: ID) => void;
  adjustLive: (matchId: ID, side: Side, delta: 1 | -1) => void;
  /** Save an in-progress score typed from a slip: finished games plus the current game. */
  setLiveScore: (matchId: ID, games: [number, number][], live: [number, number] | null) => void;
  /** Returns null on success, or a message explaining why the result was refused. */
  saveResult: (matchId: ID, input: ops.ResultInput) => string | null;
  undo: (updateId: ID) => void;
}

export type State = DB & ViewerState & Actions;

/** Bump when the shape of persisted data changes; older saved data is replaced with fresh demo data. */
const STORE_VERSION = 10;
const DB_KEYS = Object.keys(emptyDB()) as (keyof DB)[];

/** The database part of the state (no viewer preferences, no actions). */
export const selectDB = (s: DB): DB => Object.fromEntries(DB_KEYS.map((k) => [k, s[k]])) as unknown as DB;

const freshState = (): DB & ViewerState => ({ ...buildDemo(), noticesSeenAt: 0 });

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

        publishDraw: (eventId, plan, rngSeed, seedOrder) => {
          const next = ops.applySeeds(ops.publishPlan(db(), eventId, plan, rngSeed), eventId, seedOrder);
          const ev = next.events.find((e) => e.id === eventId)!;
          const resolved = ops.resolveTournament(next, ev.tournamentId);
          commit({ ...resolved, notices: [...resolved.notices, ops.drawPublishedNotice(ev, Date.now())] });
        },
        clearDraw: (eventId) => commit(ops.clearDraw(db(), eventId)),

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
