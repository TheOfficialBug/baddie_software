import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePersistentState } from '@/hooks/usePersistentState';

describe('usePersistentState', () => {
  it('keeps a value per key across unmounts (switching pages or tabs)', () => {
    const first = renderHook(() => usePersistentState('draw:ev-MS', 'default'));
    expect(first.result.current[0]).toBe('default');
    expect(first.result.current[3]).toBe(false);
    act(() => first.result.current[1]('MS draft'));
    first.unmount();

    const again = renderHook(() => usePersistentState('draw:ev-MS', 'default'));
    expect(again.result.current[0]).toBe('MS draft');
    expect(again.result.current[3]).toBe(true); // restored
  });

  it('switches drafts when the key changes (MS → MD → MS)', () => {
    const { result, rerender } = renderHook(({ k }) => usePersistentState(k, 'empty'), { initialProps: { k: 'score:m1' } });
    act(() => result.current[1]('21-19'));
    rerender({ k: 'score:m2' });
    expect(result.current[0]).toBe('empty');
    act(() => result.current[1]('15-21'));
    rerender({ k: 'score:m1' });
    expect(result.current[0]).toBe('21-19');
    rerender({ k: 'score:m2' });
    expect(result.current[0]).toBe('15-21');
  });

  it('clear() forgets the saved value', () => {
    const { result, unmount } = renderHook(() => usePersistentState('notify.title:t1', ''));
    act(() => result.current[1]('Courts 3 and 4 delayed'));
    act(() => result.current[2]());
    expect(result.current[0]).toBe('');
    unmount();
    expect(renderHook(() => usePersistentState('notify.title:t1', '')).result.current[0]).toBe('');
  });

  it('a null key keeps state in memory only', () => {
    const a = renderHook(() => usePersistentState<number>(null, 1));
    act(() => a.result.current[1](5));
    expect(a.result.current[0]).toBe(5);
    a.unmount();
    expect(renderHook(() => usePersistentState<number>(null, 1)).result.current[0]).toBe(1);
  });
});
