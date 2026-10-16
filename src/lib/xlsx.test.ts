import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { readCsv, readTable, readXlsx, writeXlsx } from '@/lib/xlsx';

/** A zip with deflated files, the way spreadsheet apps write them. */
function deflatedZip(files: Record<string, string>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, dirBytes, end]));
}

describe('xlsx', () => {
  it('reads back what it writes: text, numbers, line breaks, symbols and gaps', async () => {
    const rows = [
      ['Title'],
      [],
      ['Name', 'Score', 'Notes'],
      ['Zoë & “Al” <A>', 34505, "Men's Doubles Jo Lin (12)\nMixed Doubles"],
      ['', 7, ''],
    ];
    const back = await readXlsx(writeXlsx(rows, { name: 'Players', headerRow: 2, widths: [10, 10, 30] }));
    expect(back).toEqual([
      ['Title'],
      [],
      ['Name', 'Score', 'Notes'],
      ['Zoë & “Al” <A>', '34505', "Men's Doubles Jo Lin (12)\nMixed Doubles"],
      ['', '7'],
    ]);
  });

  it('reads compressed workbooks with shared strings, rich text and cells without references', async () => {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const bytes = deflatedZip({
      'xl/workbook.xml': `<workbook ${ns} xmlns:r="r"><sheets><sheet name="Players" sheetId="1" r:id="rId5"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId5" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': `<sst ${ns}><si><t>Name</t></si><si><r><t>Ab</t></r><r><rPr><b/></rPr><t xml:space="preserve">e &amp; Co</t></r><rPh><t>ignored</t></rPh></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet ${ns}><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" s="3"/><c r="D2" t="s"><v>1</v></c></row><row><c t="inlineStr"><is><t>x</t></is></c><c><v>4.5</v></c></row></sheetData></worksheet>`,
    });
    expect(await readXlsx(bytes)).toEqual([[], ['Name', '', '', 'Abe & Co'], ['x', '4.5']]);
  });

  it('refuses files that are not workbooks', async () => {
    await expect(readXlsx(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a valid/);
    await expect(readTable(new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])]))).rejects.toThrow(/\.xls/);
  });
});

describe('csv', () => {
  it('handles quotes, commas, line breaks and a byte-order mark', () => {
    expect(readCsv('﻿Name,Info\r\n"Lin, Jo","Mixed Doubles ""Al""\nMen\'s Singles"\nB,\n')).toEqual([
      ['Name', 'Info'],
      ['Lin, Jo', 'Mixed Doubles "Al"\nMen\'s Singles'],
      ['B', ''],
    ]);
  });

  it('is picked for files that are not zips', async () => {
    expect(await readTable(new Blob(['a,b\n1,2']))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
