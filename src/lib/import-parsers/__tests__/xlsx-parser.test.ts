/**
 * @jest-environment node
 *
 * Characterization tests for the XLSX import parser.
 *
 * `fixtures/places-golden.xlsx` was produced by the XLSX *export* generator, so
 * these tests double as an export -> import round-trip check. The fixture is
 * committed as a fixed byte stream: it is the reference input the parser must
 * keep reading identically no matter which spreadsheet library is underneath.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { parseXLSX, getSampleRows, getSheetNames } from '../xlsx-parser';

const FIXTURES = path.join(__dirname, 'fixtures');

const loadFixture = (name: string): ArrayBuffer => {
  const buffer = fs.readFileSync(path.join(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

describe('xlsx-parser', () => {
  describe('parseXLSX', () => {
    it('should parse the exported workbook back into headers and rows', async () => {
      const result = await parseXLSX(loadFixture('places-golden.xlsx'));

      expect(result.errors).toEqual([]);
      expect(result.sheetName).toBe('Places');
      expect(result.availableSheets).toEqual(['Places', 'Summary']);
      expect(result.headers).toEqual(['Name', 'City', 'Country', 'Tags', 'Rating']);
      expect(result.rows).toEqual([
        ['Café "Flore"', 'Paris', 'France', 'tag1, tag2', '5'],
        ['Sushi, Bar', 'Tokyo', 'Japan', '', '4'],
        ['Museum', 'Paris', 'France', 'art', '0']
      ]);
      expect(result.totalRows).toBe(3);
    });

    it('should return every cell as a string', async () => {
      const result = await parseXLSX(loadFixture('places-golden.xlsx'));

      result.rows.forEach(row => {
        expect(row).toHaveLength(result.headers.length);
        row.forEach(cell => expect(typeof cell).toBe('string'));
      });
    });

    it('should read a specific sheet when targetSheet is given', async () => {
      const result = await parseXLSX(loadFixture('places-golden.xlsx'), 'Summary');

      expect(result.sheetName).toBe('Summary');
      expect(result.headers).toEqual(['Metric', 'Count']);
      expect(result.rows[0]).toEqual(['Total Places', '3']);
    });

    it('should prefer the "Places" sheet when no target is given', async () => {
      const result = await parseXLSX(loadFixture('places-golden.xlsx'));

      expect(result.sheetName).toBe('Places');
    });

    it('should fall back to the first sheet when there is no "Places" sheet', async () => {
      const result = await parseXLSX(loadFixture('multi-sheet-no-places.xlsx'));

      expect(result.sheetName).toBe('Alpha');
      expect(result.availableSheets).toEqual(['Alpha', 'Beta']);
      expect(result.headers).toEqual(['Col A', 'Col B']);
    });

    it('should fall back to the first sheet when targetSheet does not exist', async () => {
      const result = await parseXLSX(loadFixture('multi-sheet-no-places.xlsx'), 'Nonexistent');

      expect(result.sheetName).toBe('Alpha');
      expect(result.rows).toEqual([
        ['a1', 'b1'],
        ['a2', 'b2']
      ]);
    });

    it('should skip fully blank rows', async () => {
      // The Alpha sheet has a blank row between "a1" and "a2".
      const result = await parseXLSX(loadFixture('multi-sheet-no-places.xlsx'));

      expect(result.totalRows).toBe(2);
      expect(result.rows).toEqual([
        ['a1', 'b1'],
        ['a2', 'b2']
      ]);
    });

    it('should report an empty sheet as an error', async () => {
      const result = await parseXLSX(loadFixture('empty-places.xlsx'));

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
      expect(result.errors).toEqual([{ row: 0, message: 'Sheet "Places" is empty' }]);
    });

    it('should not yield data rows for a buffer that is not a workbook', async () => {
      const bytes = Buffer.from('this is definitely not a spreadsheet');
      const result = await parseXLSX(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      );

      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });
  });

  describe('getSheetNames', () => {
    it('should list every sheet in the workbook', async () => {
      expect(await getSheetNames(loadFixture('places-golden.xlsx'))).toEqual(['Places', 'Summary']);
      expect(await getSheetNames(loadFixture('multi-sheet-no-places.xlsx'))).toEqual(['Alpha', 'Beta']);
    });

    it('should not surface a "Places" sheet for an unreadable buffer', async () => {
      const bytes = Buffer.from('nope');
      const names = await getSheetNames(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      );

      expect(names).not.toContain('Places');
    });
  });

  describe('getSampleRows', () => {
    it('should return at most the requested number of rows', async () => {
      const result = await parseXLSX(loadFixture('places-golden.xlsx'));

      expect(getSampleRows(result.rows, 2)).toEqual(result.rows.slice(0, 2));
      expect(getSampleRows(result.rows)).toEqual(result.rows);
    });
  });
});
