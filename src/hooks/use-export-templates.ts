'use client';

import { useCallback, useState, useEffect } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { useLocalStorage } from './use-local-storage';
import type { ExportTemplate } from '@/types/export';

const MAX_TEMPLATES = 20;
const STORAGE_KEY = 'export-templates';

const ExportTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  scope: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('collection'),
      collectionId: z.string()
    }),
    z.object({
      type: z.literal('library'),
      filters: z.any().optional()
    }),
    z.object({
      type: z.literal('selected'),
      placeIds: z.array(z.string())
    })
  ]),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  preset: z.enum(['minimal', 'standard', 'complete', 'custom']),
  customFields: z.array(z.string()).optional(),
  options: z.object({
    includeCollectionMetadata: z.boolean().optional(),
    csvOptimizedFor: z.enum(['sheets', 'excel', 'notion', 'airtable']).optional(),
    xlsxIncludeSummary: z.boolean().optional(),
    xlsxSeparateSheetsByCity: z.boolean().optional(),
    pdfLayout: z.enum(['table', 'itinerary', 'detailed']).optional(),
    pdfPageSize: z.enum(['a4', 'letter']).optional()
  }).optional(),
  createdAt: z.string()
});

const TemplatesArraySchema = z.array(ExportTemplateSchema);

const EMPTY_TEMPLATES: ExportTemplate[] = [];

export function useExportTemplates() {
  const [templates, setTemplates, removeTemplates] = useLocalStorage<ExportTemplate[]>(
    STORAGE_KEY,
    EMPTY_TEMPLATES
  );

  const saveTemplate = useCallback((name: string, config: Omit<ExportTemplate, 'id' | 'name' | 'createdAt'>) => {
    try {
      const newTemplate: ExportTemplate = {
        id: crypto.randomUUID(),
        name,
        ...config,
        createdAt: new Date().toISOString()
      };

      const validation = ExportTemplateSchema.safeParse(newTemplate);
      if (!validation.success) {
        toast.error('Invalid template configuration');
        console.error('Validation error:', validation.error);
        return null;
      }

      setTemplates(prevTemplates => {
        let updatedTemplates = [...prevTemplates, newTemplate];

        if (updatedTemplates.length > MAX_TEMPLATES) {
          updatedTemplates.sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          updatedTemplates = updatedTemplates.slice(
            updatedTemplates.length - MAX_TEMPLATES
          );
        }

        return updatedTemplates;
      });

      toast.success(`Template "${name}" saved`);
      return newTemplate.id;
    } catch (error) {
      if (error instanceof Error && error.message.includes('QuotaExceededError')) {
        toast.error('Storage quota exceeded. Try deleting some templates.');
      } else {
        toast.error('Failed to save template');
        console.error('Save template error:', error);
      }
      return null;
    }
  }, [setTemplates]);

  const deleteTemplate = useCallback((id: string) => {
    try {
      setTemplates(prevTemplates => prevTemplates.filter(t => t.id !== id));
      toast.success('Template deleted');
    } catch (error) {
      toast.error('Failed to delete template');
      console.error('Delete template error:', error);
    }
  }, [setTemplates]);

  const getTemplate = useCallback((id: string): ExportTemplate | undefined => {
    return templates.find(t => t.id === id);
  }, [templates]);

  const [validatedTemplates, setValidatedTemplates] = useState<ExportTemplate[]>([]);

  useEffect(() => {
    try {
      const validation = TemplatesArraySchema.safeParse(templates);
      if (!validation.success) {
        console.warn('Invalid templates in storage, resetting:', validation.error);
        removeTemplates();
        setValidatedTemplates([]);
      } else {
        setValidatedTemplates(prev => {
          if (prev.length !== validation.data.length) return validation.data;
          const isSame = prev.every((item, idx) => item.id === validation.data[idx].id);
          return isSame ? prev : validation.data;
        });
      }
    } catch (error) {
      console.error('Template validation error:', error);
      setValidatedTemplates([]);
    }
  }, [templates, removeTemplates]);

  return {
    templates: validatedTemplates,
    saveTemplate,
    deleteTemplate,
    getTemplate,
    clearAllTemplates: removeTemplates
  };
}
