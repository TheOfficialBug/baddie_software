// Organizer-desk actions any admin screen can trigger (score dialog, search).
import { createContext, useContext } from 'react';

export interface AdminCtx {
  openScore: (matchId: string) => void;
  openSearch: () => void;
}

export const AdminContext = createContext<AdminCtx>({ openScore: () => undefined, openSearch: () => undefined });

export const useAdmin = () => useContext(AdminContext);
