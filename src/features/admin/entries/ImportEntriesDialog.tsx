import { useMemo, useRef, useState } from 'react';

import type { Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { readTable } from '@/lib/xlsx';

import { type EntryList, parseEntryList, planImport } from '@/data/entryList';
import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';

/** Organizer loads an entry list from a spreadsheet: pick a file, check the preview, then import. */
export function ImportEntriesDialog({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const importEntryList = useStore((s) => s.importEntryList);
  const eventNames = useStore((s) =>
    s.events
      .filter((e) => e.tournamentId === t.id)
      .map((e) => e.name)
      .join('\n'),
  );
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; list: EntryList } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // preview against the data as it is now; the import re-checks when confirmed
  const plan = useMemo(() => (file ? planImport(selectDB(useStore.getState()), t.id, file.list) : null), [file, t.id]);

  const read = async (f?: File) => {
    if (!f) return;
    setReading(true);
    setError(null);
    try {
      const list = parseEntryList(await readTable(f), eventNames.split('\n'));
      setFile({ name: f.name, list });
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'This file could not be read.');
    } finally {
      setReading(false);
    }
  };

  const confirm = () => {
    if (!file) return;
    const done = importEntryList(t.id, file.list);
    if (done.blocked) {
      setError(done.blocked);
      return;
    }
    const entries = done.entries.filter((e) => e.status !== 'withdrawn').length;
    toast(`Imported ${plural(entries, 'entry', 'entries')}`, {
      detail: `${plural(done.players.length, 'player')} from ${file.name}.`,
    });
    onClose();
  };

  const entries = plan?.events.reduce((n, e) => n + e.entries, 0) ?? 0;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Import entries"
      subtitle="Load the entry list from a spreadsheet. It replaces this tournament’s current entries."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!plan || !!plan.blocked || entries === 0} onClick={confirm}>
            {plan && !plan.blocked && entries > 0 ? `Import ${plural(entries, 'entry', 'entries')}` : 'Import'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div
          role="group"
          aria-label="Spreadsheet file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void read(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
            dragging ? 'border-info bg-info-soft' : 'border-line',
          )}
        >
          <Icon name="upload" size={24} className="text-muted" />
          {file ? (
            <p className="text-[14px]">
              <span className="font-semibold">{file.name}</span>
              <span className="text-muted"> · {plural(file.list.players.length, 'player')}</span>
            </p>
          ) : (
            <p className="max-w-[46ch] text-[14px] text-muted">
              Drop the file here, or choose it. Use the <span className="font-semibold text-fg">Players</span> list exported from
              tournamentsoftware.com, or a file exported from here (.xlsx or .csv).
            </p>
          )}
          <Button size="sm" onClick={() => input.current?.click()} disabled={reading}>
            {reading ? 'Reading…' : file ? 'Choose another file' : 'Choose file'}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            aria-label="Choose a spreadsheet"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {(error ?? plan?.blocked) && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-live-soft p-3 text-[13px] font-medium text-live">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <div>{error ?? plan?.blocked}</div>
          </div>
        )}

        {plan && !plan.blocked && (
          <>
            <div className="grid gap-2">
              <h3 className="eyebrow">What will change</h3>
              <ul className="grid gap-1 text-[14px]">
                <li>
                  <span className="num font-semibold">{plan.newPlayers}</span> new {plan.newPlayers === 1 ? 'player' : 'players'}
                  {plan.updatedPlayers > 0 && (
                    <>
                      , <span className="num font-semibold">{plan.updatedPlayers}</span> updated (club, level or birth year)
                    </>
                  )}
                </li>
                <li>
                  <span className="num font-semibold">{entries}</span> {entries === 1 ? 'entry' : 'entries'}, all accepted
                </li>
                {plan.removedEntries > 0 && (
                  <li className="text-warn">
                    <span className="num font-semibold">{plan.removedEntries}</span> current{' '}
                    {plan.removedEntries === 1 ? 'entry is' : 'entries are'} not on the list and will be removed
                  </li>
                )}
              </ul>
            </div>

            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-1.5 font-semibold">Event</th>
                  <th className="py-1.5 text-right font-semibold">Entries</th>
                  <th className="py-1.5 text-right font-semibold">Withdrawn</th>
                  <th className="py-1.5 text-right font-semibold">
                    <abbr title="Doubles partner not on the list, or not given" className="no-underline">
                      Partner unknown
                    </abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.events.map((e) => (
                  <tr key={e.eventId} className="border-b border-line/60">
                    <td className="py-1.5 pr-2">{e.name}</td>
                    <td className="num py-1.5 text-right font-semibold">{e.entries}</td>
                    <td className="num py-1.5 text-right text-muted">{e.withdrawn || '–'}</td>
                    <td className={cn('num py-1.5 text-right', e.namedPartners ? 'text-warn' : 'text-muted')}>{e.namedPartners || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {plan.warnings.length > 0 && (
              <div className="grid gap-2">
                <h3 className="eyebrow">Worth a look ({plan.warnings.length})</h3>
                <ul className="grid max-h-56 gap-1.5 overflow-y-auto rounded-xl bg-warn-soft p-3 text-[13px] text-warn">
                  {plan.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12.5px] text-muted">
                  You can import anyway and fix these on this page afterwards, or correct the spreadsheet and import it again.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
