// Just enough of the .xlsx format to read the first sheet of a workbook and to write a one-sheet
// workbook, plus CSV. A .xlsx file is a zip of XML parts; reading inflates them with the platform's
// DecompressionStream, writing stores them uncompressed (the files are small).

export type Cell = string | number | null | undefined;

const utf8 = new TextEncoder();
const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);

// ---------- zip ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every file in a zip archive, by path. */
async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('This file is not a valid .xlsx workbook.');
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = fromUtf8(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflate(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** A zip archive with the files stored as-is. */
function zip(files: [string, Uint8Array][]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, data] of files) {
    const name = utf8.encode(path);
    const crc = crc32(data);
    const head = (size: number, sig: number) => {
      const b = new Uint8Array(size);
      const v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      return { b, v };
    };
    // local file header
    const l = head(30 + name.length, 0x04034b50);
    l.v.setUint16(4, 20, true);
    l.v.setUint16(6, 0x0800, true); // UTF-8 names
    l.v.setUint16(12, 0x21, true); // 1980-01-01
    l.v.setUint32(14, crc, true);
    l.v.setUint32(18, data.length, true);
    l.v.setUint32(22, data.length, true);
    l.v.setUint16(26, name.length, true);
    l.b.set(name, 30);
    // central directory record
    const c = head(46 + name.length, 0x02014b50);
    c.v.setUint16(4, 20, true);
    c.v.setUint16(6, 20, true);
    c.v.setUint16(8, 0x0800, true);
    c.v.setUint16(14, 0x21, true);
    c.v.setUint32(16, crc, true);
    c.v.setUint32(20, data.length, true);
    c.v.setUint32(24, data.length, true);
    c.v.setUint16(28, name.length, true);
    c.v.setUint32(42, offset, true);
    c.b.set(name, 46);
    locals.push(l.b, data);
    centrals.push(c.b);
    offset += l.b.length + data.length;
  }
  const dirSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let at = 0;
  for (const b of parts) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

// ---------- XML ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e],
  );
const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // characters XML 1.0 can't carry
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
/** The text of every <t> in a string item, leaving out phonetic hints. */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

/** "C12" → 2 (zero-based column). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}
const columnName = (i: number): string => (i < 26 ? '' : columnName(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

// ---------- reading ----------

/** The first sheet of a .xlsx workbook as rows of text (numbers as written, e.g. "34505"). */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(bytes);
  const text = (path: string) => {
    const f = files.get(path);
    return f ? fromUtf8(f) : undefined;
  };
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new Error('This file is not a valid .xlsx workbook.');
  // first sheet → its part, through the workbook relationships
  const rid = attr(/<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? '', 'r:id');
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  const target = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => m[1]).find((a) => attr(a, 'Id') === rid);
  const href = (target && attr(target, 'Target')) ?? 'worksheets/sheet1.xml';
  const sheetPath = href.startsWith('/') ? href.slice(1) : `xl/${href}`;
  const sheet = text(sheetPath) ?? text('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('The workbook has no sheets.');

  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[1], 'r') ?? rows.length + 1) - 1;
    const row: string[] = [];
    let col = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      if (ref) col = columnIndex(ref);
      const type = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? textOf(body) : v === undefined ? '' : unescapeXml(v);
      row[col++] = value;
    }
    rows[r] = Array.from(row, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}

/** Rows of a CSV file (RFC 4180: quoted fields may hold commas, quotes and line breaks). */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

/** A spreadsheet the user picked: .xlsx or .csv, told apart by content. */
export async function readTable(file: Blob & { name?: string }): Promise<string[][]> {
  const bytes = new Uint8Array(
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as ArrayBuffer);
          r.onerror = () => reject(new Error('This file could not be read.'));
          r.readAsArrayBuffer(file);
        }),
  );
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('Old .xls files can’t be read. Save it as .xlsx (or .csv) and try again.');
  return readCsv(fromUtf8(bytes));
}

// ---------- writing ----------

export interface SheetOptions {
  /** Sheet tab name. */
  name?: string;
  /** Column widths in characters. */
  widths?: number[];
  /** Zero-based row index printed bold (the column headings). */
  headerRow?: number;
}

/** A one-sheet .xlsx workbook. Text with line breaks wraps in its cell. */
export function writeXlsx(rows: Cell[][], opts: SheetOptions = {}): Uint8Array {
  const sheetName = escapeXml((opts.name ?? 'Sheet1').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const cols = opts.widths?.length
    ? `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === '') return '';
          const ref = `${columnName(c)}${r + 1}`;
          // styles: 1 = bold heading, 2 = wrapped text
          const style = r === opts.headerRow ? ' s="1"' : typeof value === 'string' && value.includes('\n') ? ' s="2"' : '';
          if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `${head}<workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `${head}<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    ],
    ['xl/worksheets/sheet1.xml', `${head}<worksheet ${ns}>${cols}<sheetData>${body}</sheetData></worksheet>`],
  ];
  return zip(parts.map(([path, xml]) => [path, utf8.encode(xml)]));
}
