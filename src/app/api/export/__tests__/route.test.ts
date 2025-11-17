import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import * as exportService from '@/lib/export-service';

jest.mock('@/lib/export-service');

describe('POST /api/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation', () => {
    it('should return 400 for invalid request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toBe('Invalid request data');
      expect(data.errors).toBeDefined();
    });

    it('should return 400 for missing scope type', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });

    it('should return 400 for missing format', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });

    it('should return 400 for invalid format', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          format: 'invalid',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });

    it('should return 400 for collection scope without collectionId', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'collection' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });

    it('should return 400 for selected scope without placeIds', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'selected' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });
  });

  describe('Successful exports', () => {
    it('should export collection as CSV', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockResolvedValue({
        buffer: 'Name,City\nTest Place,Paris',
        mimeType: 'text/csv',
        filename: 'test_collection.csv'
      });

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'collection', collectionId: 'col_test' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('test_collection.csv');
    });

    it('should export library as XLSX', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockResolvedValue({
        buffer: Buffer.from('mock xlsx data'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'library_export.xlsx'
      });

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          format: 'xlsx',
          preset: 'complete'
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('spreadsheetml.sheet');
    });

    it('should export selected places as PDF', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockResolvedValue({
        buffer: Buffer.from('mock pdf data'),
        mimeType: 'application/pdf',
        filename: 'selected_places.pdf'
      });

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'selected', placeIds: ['plc_1', 'plc_2'] },
          format: 'pdf',
          preset: 'minimal'
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('should use default preset when not specified', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockResolvedValue({
        buffer: 'test data',
        mimeType: 'text/csv',
        filename: 'export.csv'
      });

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          format: 'csv'
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockExportData).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: 'standard'
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should return 404 when collection not found', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockRejectedValue(new Error('Collection not found'));

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'collection', collectionId: 'col_nonexistent' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.status).toBe('error');
      expect(data.message).toContain('not found');
    });

    it('should return 500 for database errors', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
      expect(data.message).toBe('Database connection failed');
    });

    it('should return 500 for no places found', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockRejectedValue(new Error('No places found to export'));

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'selected', placeIds: [] },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
    });
  });

  describe('Response format', () => {
    it('should include timestamp in error responses', async () => {
      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should handle string buffers correctly', async () => {
      const mockExportData = jest.spyOn(exportService, 'exportData') as any;
      mockExportData.mockResolvedValue({
        buffer: 'CSV string content',
        mimeType: 'text/csv',
        filename: 'test.csv'
      });

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify({
          scope: { type: 'library' },
          format: 'csv',
          preset: 'standard'
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('CSV string content');
    });
  });
});
