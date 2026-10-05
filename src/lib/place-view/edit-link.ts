/** Inbox and Review open a place straight into the editor. */
export function placeEditHref(id: string): string {
  return `/place/${id}?edit=1`
}
