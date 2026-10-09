import { useState } from 'react';

import { ConfirmDialog, type ConfirmOptions } from '@/components/ui/ConfirmDialog';

/**
 * One confirm dialog per screen: `ask({...})` opens it, `dialog` renders it.
 * Keeps call sites to a single line each.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  return { ask: setOptions, dialog: <ConfirmDialog options={options} onClose={() => setOptions(null)} /> };
}
