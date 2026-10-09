// The tournament page passes the tournament and lookup to its tabs.
import { useOutletContext } from 'react-router';

import type { Tournament } from '@/engine/types';

import { type Lookup } from '@/data/lookup';

export interface TCtx {
  t: Tournament;
  lk: Lookup;
}

export const useT = () => useOutletContext<TCtx>();
