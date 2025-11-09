import Link from 'next/link'
import { Button } from "@/components/adapters/button"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/adapters/card"
import { MapPin, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <MapPin className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold">Page Not Found</h2>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="/inbox">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Go to Inbox
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
