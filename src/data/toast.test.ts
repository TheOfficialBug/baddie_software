import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast, useToasts } from '@/data/toast';

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('shows at most three toasts, newest last', () => {
    ['one', 'two', 'three', 'four'].forEach((t) => toast(t));
    expect(useToasts.getState().toasts.map((t) => t.text)).toEqual(['two', 'three', 'four']);
  });

  it('dismisses itself after a few seconds, longer when it offers undo', () => {
    toast('saved');
    toast('result saved', { undo: () => undefined });
    vi.advanceTimersByTime(5000);
    expect(useToasts.getState().toasts.map((t) => t.text)).toEqual(['result saved']);
    vi.advanceTimersByTime(4000);
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it('can be dismissed by id', () => {
    const id = toast('hello', { tone: 'info' });
    useToasts.getState().dismiss(id);
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
