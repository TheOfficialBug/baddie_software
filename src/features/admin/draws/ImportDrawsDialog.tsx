import { useMemo, useRef, useState } from 'react';

import type { Tournament } from '@/engine/types';

import { plural } from '@/lib/format';

import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';
import { importTsDraws, parseTsDrawFile, type TsDrawFile } from '@/data/tsDraws';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';

/** Organizer loads the draws made on tournamentsoftware.com: same first round, our A/B/C/D flights after it. */
export function ImportDrawsDialog({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const importDraws = useStore((s) => s.importTsDraws);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; draws: TsDrawFile } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // preview against the data as it is now; the import runs again when confirmed
  const preview = useMemo(() => (file ? importTsDraws(selectDB(useStore.getState()), t.id, file.draws) : null), [file, t.id]);

  const read = async (f?: File) => {
    if (!f) return;
    setError(null);
    try {
      setFile({ name: f.name, draws: parseTsDrawFile(await f.text()) });
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'This file could not be read.');
    }
  };

  const confirm = () => {
    if (!file) return;
    const done = importDraws(t.id, file.draws);
    if (done.error) {
      setError(done.error);
      return;
    }
    toast(`Imported ${plural(done.events.length, 'draw')}`, { detail: `${plural(done.players, 'player')} from ${file.name}.` });
    onClose();
  };

  const problem = error ?? preview?.error;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Import draws"
      subtitle="Use the draws made on tournamentsoftware.com. It replaces the entries and draws of those events."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!preview || !!preview.error} onClick={confirm}>
            {preview && !preview.error ? `Publish ${plural(preview.events.length, 'draw')}` : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line p-5 text-center">
          <Icon name="upload" size={24} className="text-muted" />
          {file ? (
            <p className="text-[14px] font-semibold">{file.name}</p>
          ) : (
            <p className="max-w-[46ch] text-[14px] text-muted">
              Choose the draws file (.json). First rounds stay exactly as drawn there; losers drop into the B, C and D flights.
            </p>
          )}
          <Button size="sm" onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose file'}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Choose a draws file"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {problem && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-live-soft p-3 text-[13px] font-medium text-live">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <div>{problem}</div>
          </div>
        )}

        {preview && !preview.error && (
          <>
            <p className="text-[14px]">
              <span className="num font-semibold">{preview.players}</span> players
              {preview.newPlayers < preview.players && (
                <>
                  {' '}
                  (<span className="num font-semibold">{preview.players - preview.newPlayers}</span> already here)
                </>
              )}
            </p>
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-1.5 font-semibold">Event</th>
                  <th className="py-1.5 text-right font-semibold">Entries</th>
                </tr>
              </thead>
              <tbody>
                {preview.events.map((e) => (
                  <tr key={e.name} className="border-b border-line/60">
                    <td className="py-1.5 pr-2">{e.name}</td>
                    <td className="num py-1.5 text-right font-semibold">{e.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.warnings.length > 0 && (
              <ul className="grid gap-1.5 rounded-xl bg-warn-soft p-3 text-[13px] text-warn">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
