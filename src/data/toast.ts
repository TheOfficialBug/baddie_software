import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'error' | 'info';
  /** optional second line */
  detail?: string;
  undo?: () => void;
}
export type ToastOptions = Omit<Toast, 'id' | 'text'>;

const MAX_VISIBLE = 3;
const DURATION_MS = 4500;
const DURATION_WITH_UNDO_MS = 8000;

interface ToastState {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

/** Transient notifications. Kept apart from the persisted data store. */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

let nextId = 0;

/** Show a toast from anywhere (components, store actions, event handlers). */
export function toast(text: string, opts?: ToastOptions): number {
  const id = ++nextId;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-(MAX_VISIBLE - 1)), { id, text, ...opts }] }));
  setTimeout(() => useToasts.getState().dismiss(id), opts?.undo ? DURATION_WITH_UNDO_MS : DURATION_MS);
  return id;
}
