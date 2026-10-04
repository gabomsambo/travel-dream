"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore, Ellipsis, Loader2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/adapters/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { notify } from "@/lib/notify"
import { toastWithNavigate } from "@/lib/toast-navigate"

async function failureMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  return (data && typeof data.message === "string" && data.message) || fallback
}

/**
 * The hero's ⋯ menu: archive (or restore) and delete, through the same endpoints the
 * review, inbox and archive pages use — PATCH status and DELETE /api/places/[id].
 */
export function PlaceActionsMenu({
  placeId,
  placeName,
  status,
  className,
}: {
  placeId: string
  placeName: string
  status: string
  className?: string
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState<"archive" | "restore" | "delete" | null>(null)

  // Back to wherever the user came from (Explore, Library, Inbox…), refreshed so the place
  // they just archived or deleted is gone there too. A direct visit has nowhere to go back
  // to, so it lands on the Library.
  const leave = React.useCallback(() => {
    if (window.history.length > 1) {
      window.addEventListener("popstate", () => router.refresh(), { once: true })
      router.back()
    } else {
      router.push("/library")
    }
  }, [router])

  const setStatus = async (next: "archived" | "library") => {
    setBusy(next === "archived" ? "archive" : "restore")
    try {
      const response = await fetch(`/api/places/${placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!response.ok) throw new Error(await failureMessage(response, next === "archived" ? "Failed to archive place" : "Failed to restore place"))
      if (next === "archived") {
        toastWithNavigate(`Archived “${placeName}”`, "/archive", {
          actionLabel: "View archive",
          description: "You can restore it from the Archive at any time.",
        })
        leave()
      } else {
        notify.success(`Restored “${placeName}” to your library`)
        router.refresh()
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  const deletePlace = async () => {
    setBusy("delete")
    try {
      const response = await fetch(`/api/places/${placeId}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await failureMessage(response, "Failed to delete place"))
      setConfirmDelete(false)
      notify.success(`Deleted “${placeName}”`)
      leave()
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete place")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            disabled={busy !== null}
            className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", className)}
          >
            {busy && busy !== "delete" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ellipsis className="h-4 w-4" aria-hidden />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {status === "archived" ? (
            <DropdownMenuItem onSelect={() => setStatus("library")}>
              <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden /> Restore to library
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus("archived")}>
              <Archive className="mr-2 h-4 w-4" aria-hidden /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => busy !== "delete" && setConfirmDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{placeName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the place with its photos, links, reservations and notes. It can’t be undone. If you
              only want it out of the way, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={deletePlace} disabled={busy === "delete"}>
              {busy === "delete" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Delete place
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
