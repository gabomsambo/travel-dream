"use client"

import { useState, useCallback } from 'react'
import { validateRows } from '@/lib/import-service'
import { autoMapColumns } from '@/lib/import-field-metadata'
import type {
  ImportPreviewResponse,
  ColumnMapping,
  ImportTemplate,
  ParsedRow,
  ImportResult,
} from '@/types/import'

export type ImportStep =
  | 'idle'
  | 'parsing'
  | 'mapping'
  | 'options'
  | 'validating'
  | 'preview'
  | 'review'
  | 'importing'
  | 'complete'
  | 'error'

interface UseImportWorkflowState {
  step: ImportStep
  error: string | null
  parseResult: ImportPreviewResponse | null
  rows: string[][]
  mappings: ColumnMapping[]
  template: ImportTemplate
  confidentMode: boolean
  collectionId: string | null
  validRows: ParsedRow[]
  invalidRows: ParsedRow[]
  confirmedRowNumbers: Set<number>
  importResult: ImportResult | null
  isLoading: boolean
}

interface UseImportWorkflowActions {
  setStep: (step: ImportStep) => void
  setError: (error: string | null) => void
  setParseResult: (result: ImportPreviewResponse | null) => void
  setRows: (rows: string[][]) => void
  setMappings: (mappings: ColumnMapping[]) => void
  setTemplate: (template: ImportTemplate) => void
  setConfidentMode: (enabled: boolean) => void
  setCollectionId: (id: string | null) => void
  setConfirmedRowNumbers: (numbers: Set<number>) => void
  reset: () => void
  parseFile: (file: File) => Promise<void>
  applyTemplate: (template: ImportTemplate) => void
  validateAndProceed: () => void
  executeImport: () => Promise<void>
}

const initialState: UseImportWorkflowState = {
  step: 'idle',
  error: null,
  parseResult: null,
  rows: [],
  mappings: [],
  template: 'auto',
  confidentMode: false,
  collectionId: null,
  validRows: [],
  invalidRows: [],
  confirmedRowNumbers: new Set(),
  importResult: null,
  isLoading: false,
}

export function useImportWorkflow(): UseImportWorkflowState & UseImportWorkflowActions {
  const [state, setState] = useState<UseImportWorkflowState>(initialState)

  const setStep = useCallback((step: ImportStep) => {
    setState(prev => ({ ...prev, step }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const setParseResult = useCallback((parseResult: ImportPreviewResponse | null) => {
    setState(prev => ({ ...prev, parseResult }))
  }, [])

  const setRows = useCallback((rows: string[][]) => {
    setState(prev => ({ ...prev, rows }))
  }, [])

  const setMappings = useCallback((mappings: ColumnMapping[]) => {
    setState(prev => ({ ...prev, mappings }))
  }, [])

  const setTemplate = useCallback((template: ImportTemplate) => {
    setState(prev => ({ ...prev, template }))
  }, [])

  const setConfidentMode = useCallback((confidentMode: boolean) => {
    setState(prev => ({ ...prev, confidentMode }))
  }, [])

  const setCollectionId = useCallback((collectionId: string | null) => {
    setState(prev => ({ ...prev, collectionId }))
  }, [])

  const setConfirmedRowNumbers = useCallback((confirmedRowNumbers: Set<number>) => {
    setState(prev => ({ ...prev, confirmedRowNumbers }))
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  const parseFile = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, step: 'parsing', isLoading: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.message)
      }

      const parseResult: ImportPreviewResponse = {
        headers: data.headers,
        sampleRows: data.sampleRows,
        totalRows: data.totalRows,
        suggestedMappings: data.suggestedMappings,
        detectedTemplate: data.detectedTemplate,
        format: data.format,
      }

      setState(prev => ({
        ...prev,
        parseResult,
        rows: data.sampleRows,
        mappings: data.suggestedMappings,
        template: data.detectedTemplate || 'auto',
        step: 'mapping',
        isLoading: false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to parse file',
        step: 'error',
        isLoading: false,
      }))
    }
  }, [])

  const applyTemplate = useCallback((template: ImportTemplate) => {
    if (!state.parseResult) return

    const newMappings = autoMapColumns(state.parseResult.headers, template)
    setState(prev => ({
      ...prev,
      template,
      mappings: newMappings,
    }))
  }, [state.parseResult])

  const validateAndProceed = useCallback(() => {
    if (!state.parseResult) return

    setState(prev => ({ ...prev, step: 'validating', isLoading: true }))

    const { valid, invalid } = validateRows(state.rows, state.mappings)

    setState(prev => ({
      ...prev,
      validRows: valid,
      invalidRows: invalid,
      step: prev.confidentMode ? 'review' : 'preview',
      isLoading: false,
    }))
  }, [state.parseResult, state.rows, state.mappings])

  const executeImport = useCallback(async () => {
    if (!state.parseResult) return

    setState(prev => ({ ...prev, step: 'importing', isLoading: true, error: null }))

    try {
      const response = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: state.rows,
          mappings: state.mappings,
          options: {
            confidentMode: state.confidentMode,
            targetStatus: 'inbox' as const,
            collectionId: state.collectionId || undefined,
            template: state.template,
          },
          confirmedRowIndices: state.confidentMode
            ? Array.from(state.confirmedRowNumbers)
            : undefined,
        }),
      })

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.message)
      }

      setState(prev => ({
        ...prev,
        importResult: data.result,
        step: 'complete',
        isLoading: false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Import failed',
        step: 'error',
        isLoading: false,
      }))
    }
  }, [state])

  return {
    ...state,
    setStep,
    setError,
    setParseResult,
    setRows,
    setMappings,
    setTemplate,
    setConfidentMode,
    setCollectionId,
    setConfirmedRowNumbers,
    reset,
    parseFile,
    applyTemplate,
    validateAndProceed,
    executeImport,
  }
}
