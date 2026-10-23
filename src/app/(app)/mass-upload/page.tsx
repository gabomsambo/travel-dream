import { redirect } from 'next/navigation'
import { UPLOAD_SHEET_HREF } from '@/lib/upload-sheet'

/** The upload lives on the Inbox. Keep the old URL working. */
export default function MassUploadRoute() {
  redirect(UPLOAD_SHEET_HREF)
}
