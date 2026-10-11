/** Inbox and Review open a place straight into Postcard edit mode. */
export function placeEditHref(id: string): string {
  return `/place/${id}?edit=1`
}

/** Explicit URL for the pre-redesign full-page editor. */
export function placeClassicHref(id: string): string {
  return `/place/${id}?editor=classic`
}

/**
 * How /place/[id] should open. `?editor=classic` wins over `?edit=1`.
 * A plain link stays in read mode; the "Open places in edit mode" preference is applied later on the client.
 */
export function initialPlaceMode(
  edit: string | undefined,
  editor: string | undefined
): "view" | "postcard" | "classic" {
  if (editor === "classic") return "classic"
  if (edit === "1") return "postcard"
  return "view"
}
