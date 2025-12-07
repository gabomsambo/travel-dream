"use client"

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { CSVExcelDropzone } from './csv-excel-dropzone'
import { ColumnMapper } from './column-mapper'
import { ImportOptions } from './import-options'
import { ImportPreview } from './import-preview'
import { ImportReview } from './import-review'
import { validateRows, preparePlacesForImport } from '@/lib/import-service'
import { autoMapColumns } from '@/lib/import-field-metadata'
import type { ImportPreviewResponse, ColumnMapping, ImportOptions as ImportOptionsType, ParsedRow, ImportResult, ImportTemplate } from '@/types/import'

type Step = 'upload' | 'mapping' | 'options' | 'preview' | 'review' | 'importing' | 'complete'

interface ImportWorkflowProps {
  onComplete?: (result: ImportResult) => void
  onClose?: () => void
  onStepChange?: (step: Step) => void
}

export function ImportWorkflow({ onComplete, onClose, onStepChange }: ImportWorkflowProps) {
  const [step, setStep] = useState<Step>('upload')

  // Notify parent when step changes (for progress tracking)
  useEffect(() => {
    onStepChange?.(step)
  }, [step, onStepChange])
  const [error, setError] = useState<string | null>(null)

  const [parseResult, setParseResult] = useState<ImportPreviewResponse | null>(null)
  const [rows, setRows] = useState<string[][]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [template, setTemplate] = useState<ImportTemplate>('auto')

  const [confidentMode, setConfidentMode] = useState(false)
  const [collectionId, setCollectionId] = useState<string | null>(null)

  const [validRows, setValidRows] = useState<ParsedRow[]>([])
  const [invalidRows, setInvalidRows] = useState<ParsedRow[]>([])
  const [confirmedRowNumbers, setConfirmedRowNumbers] = useState<Set<number>>(new Set())

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleParsed = useCallback((result: ImportPreviewResponse) => {
    setParseResult(result)
    setRows(result.sampleRows)
    setMappings(result.suggestedMappings)
    if (result.detectedTemplate) {
      setTemplate(result.detectedTemplate)
    }
    setError(null)
    setStep('mapping')
  }, [])

  const handleTemplateChange = useCallback((newTemplate: ImportTemplate) => {
    setTemplate(newTemplate)
    if (parseResult) {
      const newMappings = autoMapColumns(parseResult.headers, newTemplate)
      setMappings(newMappings)
    }
  }, [parseResult])

  const handleMappingComplete = useCallback(async () => {
    if (!parseResult) return

    const hasNameMapping = mappings.some(m => m.targetField === 'name')
    if (!hasNameMapping) {
      setError('Name column must be mapped')
      return
    }

    try {
      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: await createFormDataFromParseResult(),
      })

      const data = await response.json()
      if (data.status === 'success') {
        setRows(data.sampleRows.length > 0 ? [...data.sampleRows, ...getExtraRows(data.totalRows, data.sampleRows.length)] : [])
      }
    } catch {
    }

    setStep('options')
  }, [mappings, parseResult])

  const createFormDataFromParseResult = async () => {
    return new FormData()
  }

  const getExtraRows = (total: number, sample: number) => {
    return []
  }

  const handleOptionsComplete = useCallback(() => {
    if (!parseResult) return

    const { valid, invalid } = validateRows(
      parseResult.sampleRows.length > 0 ? parseResult.sampleRows : [],
      mappings
    )

    setValidRows(valid)
    setInvalidRows(invalid)

    if (confidentMode) {
      setStep('review')
    } else {
      setStep('preview')
    }
  }, [parseResult, mappings, confidentMode])

  const handleImport = useCallback(async () => {
    if (!parseResult) return

    setIsImporting(true)
    setError(null)

    try {
      const response = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parseResult.sampleRows,
          mappings,
          options: {
            confidentMode,
            targetStatus: 'inbox' as const,
            collectionId: collectionId || undefined,
            template,
          },
          confirmedRowIndices: confidentMode ? Array.from(confirmedRowNumbers) : undefined,
        }),
      })

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.message)
      }

      setImportResult(data.result)
      setStep('complete')
      onComplete?.(data.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }, [parseResult, mappings, confidentMode, collectionId, template, confirmedRowNumbers, onComplete])

  const goBack = () => {
    switch (step) {
      case 'mapping':
        setStep('upload')
        setParseResult(null)
        break
      case 'options':
        setStep('mapping')
        break
      case 'preview':
      case 'review':
        setStep('options')
        break
    }
  }

  const getStepNumber = () => {
    switch (step) {
      case 'upload': return 1
      case 'mapping': return 2
      case 'options': return 3
      case 'preview':
      case 'review': return 4
      case 'importing':
      case 'complete': return 5
    }
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {['Upload', 'Map Columns', 'Options', 'Preview', 'Complete'].map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${getStepNumber() > idx + 1 ? 'bg-green-100 text-green-800' :
                getStepNumber() === idx + 1 ? 'bg-blue-600 text-white' :
                'bg-gray-100 text-gray-400'}
            `}>
              {getStepNumber() > idx + 1 ? <CheckCircle className="h-4 w-4" /> : idx + 1}
            </div>
            <span className={getStepNumber() === idx + 1 ? 'font-medium' : 'text-gray-400'}>
              {label}
            </span>
            {idx < 4 && <ArrowRight className="h-4 w-4 text-gray-300" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {step === 'upload' && (
        <CSVExcelDropzone
          onParsed={handleParsed}
          onError={setError}
        />
      )}

      {step === 'mapping' && parseResult && (
        <>
          <ColumnMapper
            headers={parseResult.headers}
            sampleRows={parseResult.sampleRows}
            mappings={mappings}
            onMappingsChange={setMappings}
            template={template}
            onTemplateChange={handleTemplateChange}
          />
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleMappingComplete}
              disabled={!mappings.some(m => m.targetField === 'name')}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </>
      )}

      {step === 'options' && parseResult && (
        <>
          <ImportOptions
            confidentMode={confidentMode}
            onConfidentModeChange={setConfidentMode}
            selectedCollectionId={collectionId}
            onCollectionChange={setCollectionId}
            validCount={parseResult.totalRows}
            invalidCount={0}
          />
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={handleOptionsComplete}>
              {confidentMode ? 'Review Places' : 'Preview Import'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <ImportPreview
            validRows={validRows}
            invalidRows={invalidRows}
            headers={parseResult?.headers || []}
          />
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={handleImport} disabled={isImporting || validRows.length === 0}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${validRows.length} Places`
              )}
            </Button>
          </div>
        </>
      )}

      {step === 'review' && (
        <ImportReview
          validRows={validRows}
          confirmedRowNumbers={confirmedRowNumbers}
          onConfirmedChange={setConfirmedRowNumbers}
          onConfirm={handleImport}
          isImporting={isImporting}
        />
      )}

      {step === 'complete' && importResult && (
        <div className="text-center py-8 space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h3 className="text-xl font-medium">Import Complete!</h3>
          <div className="flex justify-center gap-4">
            <Badge variant="default" className="bg-green-100 text-green-800 text-lg px-4 py-2">
              {importResult.created} places imported
            </Badge>
          </div>
          <div className="text-sm text-gray-500 space-y-1">
            {importResult.toLibrary > 0 && (
              <div>{importResult.toLibrary} added to library</div>
            )}
            {importResult.toInbox > 0 && (
              <div>{importResult.toInbox} added to inbox</div>
            )}
            {importResult.failed > 0 && (
              <div className="text-amber-600">{importResult.failed} failed to import</div>
            )}
          </div>
          <Button onClick={onClose} className="mt-4">
            Done
          </Button>
        </div>
      )}
    </div>
  )
}
