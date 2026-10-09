import { useEffect } from 'react';

import { APP_NAME } from '@/config/app';

/** Set the browser tab title: "Part · Part · Smashboard". Empty parts are skipped. */
export function useDocumentTitle(...parts: (string | undefined | null | false)[]): void {
  const title = [...parts.filter(Boolean), APP_NAME].join(' · ');
  useEffect(() => {
    document.title = title;
  }, [title]);
}
