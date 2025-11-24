'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui-v2/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-v2/select'
import { Checkbox } from '@/components/ui-v2/checkbox'
import { Label } from '@/components/ui-v2/label'
import { Info } from 'lucide-react'

interface FormatSelectorProps {
  format: 'csv' | 'xlsx' | 'pdf' | 'kml'
  onFormatChange: (format: 'csv' | 'xlsx' | 'pdf' | 'kml') => void
  options: Record<string, any>
  onOptionsChange: (options: Record<string, any>) => void
}

export function FormatSelector({
  format,
  onFormatChange,
  options,
  onOptionsChange,
}: FormatSelectorProps) {
  return (
    <Tabs value={format} onValueChange={onFormatChange as (value: string) => void}>
      <TabsList>
        <TabsTrigger value="csv">CSV</TabsTrigger>
        <TabsTrigger value="xlsx">XLSX</TabsTrigger>
        <TabsTrigger value="pdf">PDF</TabsTrigger>
        <TabsTrigger value="kml">KML</TabsTrigger>
      </TabsList>

      <TabsContent value="csv" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Optimized for</Label>
          <Select
            value={options.optimizedFor || 'sheets'}
            onValueChange={(value) =>
              onOptionsChange({ ...options, optimizedFor: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sheets">Google Sheets</SelectItem>
              <SelectItem value="excel">Microsoft Excel</SelectItem>
              <SelectItem value="notion">Notion</SelectItem>
              <SelectItem value="airtable">Airtable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="utf8-bom"
            checked={options.utf8Bom || false}
            onCheckedChange={(checked) =>
              onOptionsChange({ ...options, utf8Bom: checked })
            }
          />
          <Label htmlFor="utf8-bom">Include UTF-8 BOM</Label>
        </div>
      </TabsContent>

      <TabsContent value="xlsx" className="space-y-4 pt-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-summary"
            checked={options.includeSummary || false}
            onCheckedChange={(checked) =>
              onOptionsChange({ ...options, includeSummary: checked })
            }
          />
          <Label htmlFor="include-summary">Include summary sheet</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="separate-by-city"
            checked={options.separateByCity || false}
            onCheckedChange={(checked) =>
              onOptionsChange({ ...options, separateByCity: checked })
            }
          />
          <Label htmlFor="separate-by-city">Separate sheets by city</Label>
        </div>
      </TabsContent>

      <TabsContent value="pdf" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select
            value={options.layout || 'table'}
            onValueChange={(value) =>
              onOptionsChange({ ...options, layout: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="table">Table View</SelectItem>
              <SelectItem value="itinerary">Itinerary</SelectItem>
              <SelectItem value="detailed">Detailed Cards</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Page size</Label>
          <Select
            value={options.pageSize || 'a4'}
            onValueChange={(value) =>
              onOptionsChange({ ...options, pageSize: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TabsContent>

      <TabsContent value="kml" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Group placemarks by</Label>
          <Select
            value={options.kmlGroupBy || 'none'}
            onValueChange={(value) =>
              onOptionsChange({ ...options, kmlGroupBy: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="kind">Type (restaurant, cafe, etc.)</SelectItem>
              <SelectItem value="city">City</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Google My Maps limits:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>2,000 placemarks per layer</li>
                <li>10 layers per map</li>
                <li>5 MB file size</li>
              </ul>
              <p className="mt-2">Only places with coordinates will be exported.</p>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
