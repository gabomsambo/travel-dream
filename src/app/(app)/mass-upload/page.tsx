import { PageHeader } from "@/components/layout/page-header"
import { MassUploadPage } from "@/components/mass-upload/mass-upload-page"
import { auth } from "@/lib/auth"

export default async function MassUploadRoute() {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mass Upload"
        description="Upload and process travel screenshots in bulk"
      />
      <MassUploadPage />
    </div>
  )
}
