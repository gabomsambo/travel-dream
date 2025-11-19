'use client';

import { useState, useEffect } from 'react';
import { useExport } from '@/hooks/use-export';
import { useExportTemplates } from '@/hooks/use-export-templates';
import { useExportHistory } from '@/hooks/use-export-history';
import { useDebounce } from '@/hooks/use-debounce';
import { ScopeSelector } from './scope-selector';
import { FormatSelector } from './format-selector';
import { FieldPicker } from './field-picker';
import { PreviewCard } from './preview-card';
import { TemplateManager } from './template-manager';
import { ExportHistory } from './export-history';
import { Button } from '@/components/ui-v2/button';
import { Loader2 } from 'lucide-react';
import type { Collection } from '@/types/database';

interface ExportClientProps {
  collections: Collection[];
  filterOptions: {
    kinds: string[];
    cities: string[];
    countries: string[];
    tags: string[];
    vibes: string[];
  };
}

export function ExportClient({ collections, filterOptions }: ExportClientProps) {
  const exportHook = useExport();
  const {
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
    handleExport
  } = exportHook;

  const { templates, saveTemplate, deleteTemplate } = useExportTemplates();
  const { history, addToHistory, deleteHistoryEntry } = useExportHistory();

  const [previewCount, setPreviewCount] = useState<number>(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const debouncedScope = useDebounce(scope, 500);
  const debouncedCustomFields = useDebounce(customFields, 500);

  useEffect(() => {
    let cancelled = false;

    async function fetchPreviewCount() {
      setIsLoadingPreview(true);
      try {
        const params = new URLSearchParams({
          scope: JSON.stringify(debouncedScope),
          preset,
          ...(preset === 'custom' && debouncedCustomFields.length > 0 && {
            customFields: JSON.stringify(debouncedCustomFields)
          })
        });

        const response = await fetch(`/api/export/preview?${params}`);
        const data = await response.json();

        if (!cancelled && data.success) {
          setPreviewCount(data.count);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch preview:', error);
          setPreviewCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      }
    }

    fetchPreviewCount();

    return () => {
      cancelled = true;
    };
  }, [debouncedScope, preset, debouncedCustomFields]);

  const handleExportClick = async () => {
    try {
      const result = await handleExport(previewCount);
      if (result) {
        addToHistory({
          filename: result.filename,
          scope,
          format,
          preset,
          recordCount: result.recordCount || previewCount,
          fileSize: result.fileSize
        });
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setScope(template.scope);
      setFormat(template.format);
      setPreset(template.preset);
      if (template.customFields) {
        setCustomFields(template.customFields);
      }
      if (template.options) {
        updateOptions(template.options);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ScopeSelector
          scope={scope}
          onScopeChange={setScope}
          collections={collections}
          filterOptions={filterOptions}
        />

        <FormatSelector
          format={format}
          onFormatChange={setFormat}
          options={options}
          onOptionsChange={updateOptions}
        />
      </div>

      <FieldPicker
        preset={preset}
        onPresetChange={setPreset}
        customFields={customFields}
        onCustomFieldsChange={setCustomFields}
      />

      <PreviewCard
        scope={debouncedScope}
        preset={preset}
        customFields={debouncedCustomFields}
      />

      <div className="flex gap-4">
        <Button
          onClick={handleExportClick}
          disabled={isExporting || previewCount === 0 || isLoadingPreview}
          size="lg"
          className="flex-1"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            `Export ${previewCount} ${previewCount === 1 ? 'Place' : 'Places'} as ${format.toUpperCase()}`
          )}
        </Button>
      </div>

      <TemplateManager
        currentConfig={{
          scope,
          format,
          preset,
          customFields: preset === 'custom' ? customFields : undefined,
          options
        }}
        templates={templates}
        onSaveTemplate={(name) => {
          saveTemplate(name, {
            scope,
            format,
            preset,
            customFields: preset === 'custom' ? customFields : undefined,
            options
          });
        }}
        onLoadTemplate={handleLoadTemplate}
        onDeleteTemplate={deleteTemplate}
      />

      <ExportHistory
        history={history}
        onDeleteEntry={deleteHistoryEntry}
      />
    </div>
  );
}
