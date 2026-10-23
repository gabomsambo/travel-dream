/** The photo a hero shows: the primary, otherwise the first photo. */
export function coverPhoto<T extends { type: string; uri: string; isPrimary?: number | null }>(
  attachments: readonly T[],
): T | undefined {
  const photos = attachments.filter((attachment) => attachment.type === 'photo')
  return photos.find((photo) => photo.isPrimary === 1) ?? photos[0]
}
