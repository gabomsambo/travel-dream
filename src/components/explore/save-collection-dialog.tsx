"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/adapters/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/adapters/dialog"
import { Input } from "@/components/adapters/input"
import { useExplore, type NewCollection } from "./explore-provider"
import { editorialFont } from "./fonts"

/**
 * One confirm step before Explore writes anything: name the collection, see
 * how many places go in, then land in the day planner or on the collection.
 * The Library itself is never changed.
 */
export function SaveCollectionDialog({
  defaultName,
  placeIds,
  landing,
  description,
  title,
  children,
  buttonProps,
}: {
  defaultName: string
  placeIds: string[]
  landing: NewCollection["landing"]
  description?: string
  title: string
  /** Trigger button contents. */
  children: React.ReactNode
  buttonProps?: ButtonProps
}) {
  const { createCollection, busy } = useExplore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(defaultName)

  React.useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || placeIds.length === 0) return
    if (await createCollection({ name: trimmed, placeIds, description, landing })) setOpen(false)
  }

  return (
    <>
      <Button {...buttonProps} disabled={busy || placeIds.length === 0 || buttonProps?.disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className={cn(editorialFont.variable, "sm:max-w-md z-[70]")}>
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="font-editorial text-3xl font-normal leading-tight">{title}</DialogTitle>
              <DialogDescription>
                {placeIds.length} saved {placeIds.length === 1 ? "place goes" : "places go"} into a new collection
                {landing === "planner" ? ", then the day planner opens so you can sort them into days" : ""}. Your Library is not changed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="explore-collection-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="explore-collection-name"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Not yet
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {landing === "planner" ? "Create and plan" : "Save collection"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
