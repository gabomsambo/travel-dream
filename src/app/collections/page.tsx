import { PageHeader } from "@/components/layout/page-header"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, FolderOpen, MapPin, Calendar } from "lucide-react"

// Mock collections data
const mockCollections = [
  {
    id: "col_1",
    name: "Barcelona Weekend",
    description: "Perfect spots for a 2-day Barcelona trip",
    itemCount: 8,
    tags: ["weekend", "highlights"],
    createdAt: "2025-09-25T00:00:00Z",
    updatedAt: "2025-09-27T00:00:00Z",
  },
  {
    id: "col_2", 
    name: "Hidden Gems Barcelona",
    description: "Off the beaten path places locals love",
    itemCount: 12,
    tags: ["hidden-gem", "local-favorite"],
    createdAt: "2025-09-20T00:00:00Z",
    updatedAt: "2025-09-26T00:00:00Z",
  },
  {
    id: "col_3",
    name: "Sunset Spots",
    description: "Best places to watch the sunset in Barcelona",
    itemCount: 5,
    tags: ["sunset", "viewpoint"],
    createdAt: "2025-09-18T00:00:00Z", 
    updatedAt: "2025-09-24T00:00:00Z",
  }
]

export default function CollectionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Collections"
        description={`${mockCollections.length} curated collections`}
      >
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Collection
        </Button>
      </PageHeader>

      {/* Collections Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockCollections.map((collection) => (
          <Card key={collection.id} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold leading-none tracking-tight">
                    {collection.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                </div>
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{collection.itemCount} places</span>
              </div>
              
              <div className="flex flex-wrap gap-1">
                {collection.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
            
            <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Updated {new Date(collection.updatedAt).toLocaleDateString()}</span>
              </div>
              <Button variant="ghost" size="sm">
                View
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {mockCollections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <FolderOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground mb-1">
            No collections yet
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first collection to organize your places
          </p>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Collection
          </Button>
        </div>
      )}
    </div>
  )
}
