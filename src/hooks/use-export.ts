'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { ExportScope, ExportFormat, FieldPreset } from '@/types/export';

interface ExportOptions {
  includeCollectionMetadata?: boolean;
  csvOptimizedFor?: 'sheets' | 'excel' | 'notion' | 'airtable';
  xlsxIncludeSummary?: boolean;
  xlsxSeparateSheetsByCity?: boolean;
  pdfLayout?: 'table' | 'itinerary' | 'detailed';
  pdfPageSize?: 'a4' | 'letter';
}

export function useExport() {
  const [scope, setScope] = useState<ExportScope>({ type: 'library' });
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [preset, setPreset] = useState<FieldPreset>('standard');
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [options, setOptions] = useState<ExportOptions>({});
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async (recordCount?: number) => {
    setIsExporting(true);
    try {
      const requestBody: any = {
        scope,
        format,
        preset
      };

      if (preset === 'custom' && customFields.length > 0) {
        requestBody.options = {
          ...options,
          customFields
        };
      } else if (Object.keys(options).length > 0) {
        requestBody.options = options;
      }

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const timestamp = new Date().toISOString().split('T')[0];
      const scopeLabel = scope.type === 'collection' ? 'collection' :
                        scope.type === 'library' ? 'library' : 'export';
      a.download = `${scopeLabel}_${timestamp}.${format}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const count = recordCount || 'unknown';
      toast.success(`Exported ${count} places as ${format.toUpperCase()}`);

      return {
        filename: a.download,
        fileSize: blob.size,
        recordCount: typeof count === 'number' ? count : 0
      };
    } catch (error) {
      console.error('Export error:', error);
      const message = error instanceof Error ? error.message : 'Export failed. Please try again.';
      toast.error(message);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, [scope, format, preset, customFields, options]);

  const resetToDefaults = useCallback(() => {
    setScope({ type: 'library' });
    setFormat('csv');
    setPreset('standard');
    setCustomFields([]);
    setOptions({});
  }, []);

  const updateOptions = useCallback((newOptions: Partial<ExportOptions>) => {
    setOptions(prev => ({ ...prev, ...newOptions }));
  }, []);

  return {
    scope,
    setScope,
    format,
    setFormat,
    preset,
    setPreset,
    customFields,
    setCustomFields,
    options,
    updateOptions,
    isExporting,
    handleExport,
    resetToDefaults
  };
}
