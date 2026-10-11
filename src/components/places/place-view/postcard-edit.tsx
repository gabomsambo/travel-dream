"use client"

import * as React from "react"
import { ChevronRight, Plus } from "lucide-react"
import type { PlaceWithRelations } from "@/types/database"
import {
  EDIT_SECTION_LABELS,
  editIndexRows,
  fieldsFor,
  sectionHasVisibleBody,
  type EditSectionId,
} from "@/lib/place-view/edit-fields"
import { SectionHeader } from "./place-sections"
import { applyDraft, SectionPencilSlot, useSectionEdit, type SectionId } from "./section-edit"
import { SectionEditor } from "./section-editors"

const ADD_ROW = "flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-primary/[0.03] hover:text-foreground"

function AddFieldRows({ section, place }: { section: EditSectionId; place: PlaceWithRelations }) {
  const api = useSectionEdit()
  if (!api) return null
  const missing = fieldsFor(section).filter((field) => field.missing(place))
  if (missing.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {missing.map((field) => (
        <button key={field.id} type="button" onClick={() => api.open(section)} className={ADD_ROW}>
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>+ Add {field.label}</span>
        </button>
      ))}
    </div>
  )
}

function EmptySectionHeader({ id }: { id: SectionId }) {
  return (
    <section aria-label={EDIT_SECTION_LABELS[id]} className="group">
      <SectionHeader eyebrow={EDIT_SECTION_LABELS[id]} action={<SectionPencilSlot id={id} />} />
    </section>
  )
}

/**
 * Read view of one section, or its editor once engaged.
 * In Postcard edit, a hidden section stays in place as “+ Add” rows.
 */
export function SectionSlot({
  id,
  shown,
  children,
}: {
  id: SectionId
  shown: boolean
  children: React.ReactNode
}) {
  const api = useSectionEdit()
  const desktopEdit = Boolean(api?.editingAll && !api.mobile)
  if (api && api.active === id && !api.mobile) {
    return (
      <div className={desktopEdit ? "space-y-3" : "rounded-2xl border border-primary/25 bg-primary/[0.03] p-5 ring-4 ring-primary/[0.04]"}>
        <SectionEditor id={id} api={api} />
      </div>
    )
  }
  if (!shown && !desktopEdit) return null
  const place = api ? applyDraft(api.place, api.draft) : null
  return (
    <div>
      {shown ? children : <EmptySectionHeader id={id} />}
      {desktopEdit && place && <AddFieldRows section={id} place={place} />}
    </div>
  )
}

/** Phone edit-all: every section and missing field, each opening the existing sheet. */
export function EditIndex({ place }: { place: PlaceWithRelations }) {
  const api = useSectionEdit()
  if (!api) return null
  const rows = editIndexRows(place)
  return (
    <div className="px-4 pt-4 sm:px-8">
      <ul aria-label="Sections" className="divide-y rounded-2xl border bg-card">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => api.open(row.section)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{row.title}</span>
                <span className={`mt-0.5 block truncate text-sm ${row.add ? "text-muted-foreground" : "font-medium"}`}>{row.detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function sectionShown(id: SectionId, place: PlaceWithRelations): boolean {
  return sectionHasVisibleBody(id, place)
}
