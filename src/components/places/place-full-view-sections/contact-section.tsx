"use client"

import { Input } from "@/components/adapters/input"
import { Label } from "@/components/adapters/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { HoursEditor } from "@/components/ui-custom/hours-editor"

interface ContactSectionProps {
  formData: any
  updateField: (field: any, value: any) => void
}

export function ContactSection({ formData, updateField }: ContactSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📞 Contact & Practical Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Website */}
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website || ''}
              onChange={(e) => updateField('website', e.target.value || null)}
              placeholder="https://example.com"
            />
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => updateField('phone', e.target.value || null)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ''}
              onChange={(e) => updateField('email', e.target.value || null)}
              placeholder="info@example.com"
            />
          </div>
        </div>

        {/* Hours */}
        <div>
          <Label>Hours</Label>
          <HoursEditor
            value={formData.hours}
            onChange={(hours) => updateField('hours', hours)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
