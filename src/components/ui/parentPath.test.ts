import { describe, expect, it } from 'vitest';

import { isHomePath, parentPath } from '@/components/ui/parentPath';

describe('parent page for the back button', () => {
  it.each([
    ['/admin/t/t-iowa/draws/ev-ms', '/admin/t/t-iowa/draws'],
    ['/admin/t/t-iowa/draws', '/admin/t/t-iowa'],
    ['/admin/t/t-iowa', '/admin'],
    ['/admin/t/t-iowa/m/m-12', '/admin/t/t-iowa'],
    ['/t/iowa-open/players/p1', '/t/iowa-open/players'],
    ['/t/iowa-open', '/'],
    ['/account', '/'],
  ])('%s → %s', (from, to) => expect(parentPath(from)).toBe(to));

  it('knows the two home pages', () => {
    expect(isHomePath('/')).toBe(true);
    expect(isHomePath('/admin')).toBe(true);
    expect(isHomePath('/admin/')).toBe(true);
    expect(isHomePath('/admin/t/x')).toBe(false);
  });
});
