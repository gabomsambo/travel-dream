/**
 * @jest-environment node
 *
 * Covers the format dispatch in parseFile - in particular that spreadsheet
 * uploads still round-trip through the XLSX parser, and that an unreadable
 * legacy .xls gets an actionable error rather than an opaque one.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { parseFile } from '../import-service';

const FIXTURES = path.join(__dirname, '..', 'import-parsers', '__tests__', 'fixtures');

const loadFixture = (name: string): ArrayBuffer => {
  const buffer = fs.readFileSync(path.join(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

const toArrayBuffer = (text: string): ArrayBuffer => {
  const buffer = Buffer.from(text);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

describe('import-service parseFile', () => {
  it('should parse an .xlsx upload into headers, sample rows and a total', async () => {
    const result = await parseFile(loadFixture('places-golden.xlsx'), 'my-places.xlsx');

    expect(result.success).toBe(true);
    expect(result.preview?.format).toBe('xlsx');
    expect(result.preview?.headers).toEqual(['Name', 'City', 'Country', 'Tags', 'Rating']);
    expect(result.preview?.totalRows).toBe(3);
    expect(result.preview?.sampleRows).toHaveLength(3);
  });

  it('should parse a .csv upload', async () => {
    const result = await parseFile(toArrayBuffer('Name,City\nAlpha,Lisbon\n'), 'places.csv');

    expect(result.success).toBe(true);
    expect(result.preview?.format).toBe('csv');
    expect(result.preview?.headers).toEqual(['Name', 'City']);
  });

  it('should reject an unsupported extension', async () => {
    const result = await parseFile(toArrayBuffer('irrelevant'), 'notes.txt');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unsupported file type: txt');
  });

  it('should tell the user to re-save an unreadable legacy .xls as .xlsx', async () => {
    // A real BIFF/OLE workbook starts with this compound-document signature.
    const legacyXls = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);
    const result = await parseFile(
      legacyXls.buffer.slice(legacyXls.byteOffset, legacyXls.byteOffset + legacyXls.byteLength) as ArrayBuffer,
      'old-places.xls'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Legacy .xls files are no longer supported. Please re-save the file as .xlsx and upload it again.'
    );
  });

  it('should still read a .xlsx workbook that was named .xls', async () => {
    const result = await parseFile(loadFixture('places-golden.xlsx'), 'mislabelled.xls');

    expect(result.success).toBe(true);
    expect(result.preview?.headers).toEqual(['Name', 'City', 'Country', 'Tags', 'Rating']);
  });
});
