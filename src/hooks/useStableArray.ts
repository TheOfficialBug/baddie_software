import { useRef } from 'react';

/**
 * The previous array as long as it holds the same items, so memoised children skip re-rendering when
 * an unrelated part of the data changes (a live point recomputes lists that didn't change).
 */
export function useStableArray<T>(xs: T[]): T[] {
  const ref = useRef(xs);
  const prev = ref.current;
  if (prev !== xs && (prev.length !== xs.length || prev.some((x, i) => x !== xs[i]))) ref.current = xs;
  return ref.current;
}
