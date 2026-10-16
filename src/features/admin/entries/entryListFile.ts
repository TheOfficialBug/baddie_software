import type { Tournament } from '@/engine/types';

import { writeXlsx } from '@/lib/xlsx';

import { exportRows } from '@/data/entryList';
import type { DB } from '@/data/types';

/** Save the tournament's entry list as an .xlsx file (same layout the import reads). */
export function downloadEntryList(db: DB, t: Tournament) {
  const bytes = writeXlsx(exportRows(db, t.id), {
    name: 'Players',
    headerRow: 2,
    widths: [6, 16, 16, 12, 10, 10, 8, 8, 26, 8, 8, 5, 44, 48],
  });
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()} entries.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
