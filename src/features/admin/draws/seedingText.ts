// The seeding order as plain text, to copy into a spreadsheet or message and paste back:
// one row per entry, "rank <tab> name <tab> level" (doubles: "Jo Lin / Ana Ortega" and "B/C").
import type { ID, SkillLevel } from '@/engine/types';

import { nameScore } from '@/data/entryList';
import type { Lookup } from '@/data/lookup';

/** The list as tab-separated rows (pastes into Excel or Google Sheets as three columns). */
export function seedingText(lk: Lookup, order: ID[]): string {
  return order.map((id, i) => `${i + 1}\t${lk.entryName(id)}\t${lk.entryLevels(id).join('/')}`).join('\n');
}

export interface PastedSeeding {
  /** The new order: matched entries in the pasted order, then any entries the text left out (in their old order). */
  order: ID[];
  /** Levels given in the text, where they fit the entry (one per player). */
  levels: Record<ID, SkillLevel[]>;
  matched: number;
  /** Rows that matched no entry (or an entry already used). */
  unmatched: string[];
  /** Entries the text didn't mention; they keep their place after the pasted ones. */
  missing: ID[];
}

const LEVEL = /^[ABCD](?:\s*\/\s*[ABCD])*$/i;
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** One pasted row → name and levels. Accepts "3<TAB>Jo Lin<TAB>B", "3. Jo Lin B", "Jo Lin, B" or just "Jo Lin". */
function parseRow(row: string): { name: string; whole: string; levels?: SkillLevel[] } | null {
  let cells = row.includes('\t') ? row.split('\t') : row.split(/\s*[,;]\s*/);
  cells = cells.map((c) => c.trim()).filter(Boolean);
  if (cells.length && /^#?\d+[.)]?$/.test(cells[0])) cells.shift(); // rank column
  if (!cells.length) return null;
  let levels: SkillLevel[] | undefined;
  if (cells.length > 1 && LEVEL.test(cells[cells.length - 1])) {
    levels = cells
      .pop()!
      .toUpperCase()
      .split('/')
      .map((l) => l.trim() as SkillLevel);
  }
  let name = cells.join(' ').replace(/^#?\d+[.)]?\s+/, '');
  const whole = name.trim();
  // "Jo Lin B" (level at the end, space-separated); `whole` keeps it in case it's part of the name
  const tail = /\s+([ABCD](?:\/[ABCD])*)$/i.exec(name);
  if (!levels && tail && name.slice(0, tail.index).trim()) {
    levels = tail[1].toUpperCase().split('/') as SkillLevel[];
    name = name.slice(0, tail.index);
  }
  name = name.trim();
  return name ? { name, whole, levels } : null;
}

/** Match pasted rows to this event's entries (exact name first, then a close match) and build the new order. */
export function parseSeedingText(text: string, lk: Lookup, order: ID[]): PastedSeeding {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  const left = new Set(order);
  const byName = new Map(order.map((id) => [norm(lk.entryName(id)), id]));
  const out: ID[] = [];
  const levels: Record<ID, SkillLevel[]> = {};
  const unmatched: string[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (!parsed) continue;
    // a heading row ("Rank Name Level") isn't an entry
    if (/^(name|player|entry|pair|seed|rank)\b/i.test(parsed.name) && !byName.has(norm(parsed.name))) continue;
    // the whole row is a name (e.g. a surname "D"): no level in it
    const asWhole = byName.get(norm(parsed.whole));
    if (asWhole && left.has(asWhole) && parsed.whole !== parsed.name) {
      parsed.name = parsed.whole;
      parsed.levels = undefined;
    }
    let id = byName.get(norm(parsed.name));
    if (!id || !left.has(id)) {
      const scored = [...left]
        .map((e) => ({ e, score: nameScore(parsed.name, lk.entryName(e)) }))
        .filter((x) => x.score >= 1.6)
        .sort((a, b) => b.score - a.score);
      // only a clear best match counts
      id = scored.length && (scored.length === 1 || scored[0].score > scored[1].score) ? scored[0].e : undefined;
    }
    if (!id || !left.has(id)) {
      unmatched.push(row);
      continue;
    }
    left.delete(id);
    out.push(id);
    if (parsed.levels && parsed.levels.length === lk.entryLevels(id).length) levels[id] = parsed.levels;
  }
  const missing = order.filter((id) => left.has(id));
  return { order: [...out, ...missing], levels, matched: out.length, unmatched, missing };
}
