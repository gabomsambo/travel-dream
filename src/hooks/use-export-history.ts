'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useLocalStorage } from './use-local-storage';
import type { ExportHistoryEntry } from '@/types/export';

const MAX_HISTORY_ENTRIES = 50;
const TTL_DAYS = 7;
const STORAGE_KEY = 'export-history';

const ExportHistoryEntrySchema = z.object({
  id: z.string(),
  filename: z.string(),
  exportedAt: z.string(),
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
  recordCount: z.number(),
  fileSize: z.number()
});

const HistoryArraySchema = z.array(ExportHistoryEntrySchema);

const EMPTY_HISTORY: ExportHistoryEntry[] = [];

export function useExportHistory() {
  const [history, setHistory, removeHistory] = useLocalStorage<ExportHistoryEntry[]>(
    STORAGE_KEY,
    EMPTY_HISTORY
  );

  const cleanupExpired = useCallback(() => {
    const now = new Date();
    const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;

    setHistory(prevHistory => {
      const cleaned = prevHistory.filter(entry => {
        const exportedDate = new Date(entry.exportedAt);
        const age = now.getTime() - exportedDate.getTime();
        return age < ttlMs;
      });

      if (cleaned.length !== prevHistory.length) {
        console.log(`Cleaned ${prevHistory.length - cleaned.length} expired history entries`);
        return cleaned;
      }

      return prevHistory;
    });
  }, [setHistory]);

  const addToHistory = useCallback((entry: Omit<ExportHistoryEntry, 'id' | 'exportedAt'>) => {
    try {
      const newEntry: ExportHistoryEntry = {
        id: crypto.randomUUID(),
        exportedAt: new Date().toISOString(),
        ...entry
      };

      const validation = ExportHistoryEntrySchema.safeParse(newEntry);
      if (!validation.success) {
        console.error('Invalid history entry:', validation.error);
        return null;
      }

      setHistory(prevHistory => {
        const now = new Date();
        const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;

        const validEntries = prevHistory.filter(e => {
          const exportedDate = new Date(e.exportedAt);
          const age = now.getTime() - exportedDate.getTime();
          return age < ttlMs;
        });

        const updatedHistory = [newEntry, ...validEntries];

        if (updatedHistory.length > MAX_HISTORY_ENTRIES) {
          return updatedHistory.slice(0, MAX_HISTORY_ENTRIES);
        }

        return updatedHistory;
      });

      return newEntry.id;
    } catch (error) {
      console.error('Add to history error:', error);
      return null;
    }
  }, [setHistory]);

  const [sortedHistory, setSortedHistory] = useState<ExportHistoryEntry[]>([]);

  const deleteHistoryEntry = useCallback((id: string) => {
    setHistory(prevHistory => prevHistory.filter(e => e.id !== id));
  }, [setHistory]);

  useEffect(() => {
    try {
      const validation = HistoryArraySchema.safeParse(history);
      if (!validation.success) {
        console.warn('Invalid history in storage, resetting:', validation.error);
        removeHistory();
        setSortedHistory([]);
      } else {
        const sorted = [...validation.data].sort((a, b) =>
          new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime()
        );
        setSortedHistory(prev => {
          if (prev.length !== sorted.length) return sorted;
          const isSame = prev.every((item, idx) => item.id === sorted[idx].id);
          return isSame ? prev : sorted;
        });
      }
    } catch (error) {
      console.error('Get history error:', error);
      setSortedHistory([]);
    }
  }, [history, removeHistory]);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupExpired();
    }, 24 * 60 * 60 * 1000);

    return () => clearInterval(cleanupInterval);
  }, [cleanupExpired]);

  return {
    history: sortedHistory,
    addToHistory,
    deleteHistoryEntry,
    clearAllHistory: removeHistory,
    cleanupExpired
  };
}
