'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MassUploadSheet } from '@/components/mass-upload/mass-upload-page'
import { OPEN_UPLOAD_SHEET_EVENT } from '@/lib/upload-sheet'

function UploadSheetFromQuery({ onOpen }: { onOpen: () => void }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const openedFor = useRef<string | null>(null)

  useEffect(() => {
    if (params.get('sheet') !== '1') {
      openedFor.current = null
      return
    }
    const key = `${pathname}?${params.toString()}`
    if (openedFor.current === key) return
    openedFor.current = key
    onOpen()
    const next = new URLSearchParams(params.toString())
    next.delete('sheet')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [onOpen, params, pathname, router])

  return null
}

export function UploadSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const openWithFiles = useCallback((next?: File[]) => {
    setFiles(next && next.length > 0 ? next : [])
    setOpen(true)
  }, [])

  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ files?: File[] }>).detail
      openWithFiles(detail?.files)
    }
    window.addEventListener(OPEN_UPLOAD_SHEET_EVENT, onEvent)
    return () => window.removeEventListener(OPEN_UPLOAD_SHEET_EVENT, onEvent)
  }, [openWithFiles])

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <UploadSheetFromQuery onOpen={() => openWithFiles()} />
      </Suspense>
      <MassUploadSheet
        open={open}
        initialFiles={files}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setFiles([])
        }}
      />
    </>
  )
}
