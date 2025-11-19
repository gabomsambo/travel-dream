'use client';

import * as React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui-v2/radio-group';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui-v2/accordion';
import { Checkbox } from '@/components/ui-v2/checkbox';
import { Card, CardContent } from '@/components/ui-v2/card';
import { Button } from '@/components/ui-v2/button';
import { Label } from '@/components/ui-v2/label';
import { FIELD_CATEGORIES, FIELD_DEFINITIONS } from '@/lib/export-field-metadata';
import type { FieldPreset, FieldCategory } from '@/types/export';

interface FieldPickerProps {
  preset: FieldPreset | 'custom';
  onPresetChange: (preset: FieldPreset | 'custom') => void;
  customFields: string[];
  onCustomFieldsChange: (fields: string[]) => void;
}

const PRESET_OPTIONS = [
  {
    value: 'minimal' as const,
    label: 'Minimal',
    description: 'Essential info only (name, location, website)'
  },
  {
    value: 'standard' as const,
    label: 'Standard',
    description: 'Most common fields for everyday use'
  },
  {
    value: 'complete' as const,
    label: 'Complete',
    description: 'All available fields and metadata'
  },
  {
    value: 'custom' as const,
    label: 'Custom',
    description: 'Pick exactly what you need'
  }
];

export function FieldPicker({
  preset,
  onPresetChange,
  customFields,
  onCustomFieldsChange
}: FieldPickerProps) {
  const handleFieldToggle = (fieldId: string) => {
    if (customFields.includes(fieldId)) {
      onCustomFieldsChange(customFields.filter(id => id !== fieldId));
    } else {
      onCustomFieldsChange([...customFields, fieldId]);
    }
  };

  const handleSelectAll = (category: FieldCategory) => {
    const categoryFields = FIELD_CATEGORIES[category].fields;
    const newFields = [...customFields];

    categoryFields.forEach(fieldId => {
      if (!newFields.includes(fieldId)) {
        newFields.push(fieldId);
      }
    });

    onCustomFieldsChange(newFields);
  };

  const handleDeselectAll = (category: FieldCategory) => {
    const categoryFields = FIELD_CATEGORIES[category].fields;
    onCustomFieldsChange(customFields.filter(id => !categoryFields.includes(id)));
  };

  const isCategoryFullySelected = (category: FieldCategory): boolean => {
    const categoryFields = FIELD_CATEGORIES[category].fields;
    return categoryFields.every(fieldId => customFields.includes(fieldId));
  };

  const isCategoryPartiallySelected = (category: FieldCategory): boolean => {
    const categoryFields = FIELD_CATEGORIES[category].fields;
    const selectedCount = categoryFields.filter(fieldId => customFields.includes(fieldId)).length;
    return selectedCount > 0 && selectedCount < categoryFields.length;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Field Preset</h3>
          <p className="text-sm text-muted-foreground">
            Choose a preset or customize your field selection
          </p>
        </div>

        <RadioGroup value={preset} onValueChange={onPresetChange}>
          <div className="grid gap-3">
            {PRESET_OPTIONS.map((option) => (
              <Card key={option.value} className="relative cursor-pointer hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </label>
                </CardContent>
              </Card>
            ))}
          </div>
        </RadioGroup>
      </div>

      {preset === 'custom' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Custom Field Selection</h3>
            <p className="text-sm text-muted-foreground">
              Select individual fields from each category
            </p>
          </div>

          <Accordion type="multiple" className="w-full">
            {(Object.entries(FIELD_CATEGORIES) as [FieldCategory, typeof FIELD_CATEGORIES[FieldCategory]][]).map(([categoryKey, category]) => {
              const fullySelected = isCategoryFullySelected(categoryKey);
              const partiallySelected = isCategoryPartiallySelected(categoryKey);
              const selectedCount = category.fields.filter(fieldId => customFields.includes(fieldId)).length;

              return (
                <AccordionItem key={categoryKey} value={categoryKey}>
                  <AccordionTrigger>
                    <div className="flex items-center justify-between flex-1 pr-4">
                      <div className="space-y-1 text-left">
                        <div className="font-medium">{category.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {category.description}
                        </div>
                      </div>
                      {selectedCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {selectedCount} / {category.fields.length} selected
                        </div>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectAll(categoryKey)}
                          disabled={fullySelected}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeselectAll(categoryKey)}
                          disabled={selectedCount === 0}
                        >
                          Deselect All
                        </Button>
                      </div>

                      <div className="grid gap-3">
                        {category.fields.map((fieldId) => {
                          const fieldDef = FIELD_DEFINITIONS[fieldId];
                          if (!fieldDef) return null;

                          return (
                            <label
                              key={fieldId}
                              className="flex items-start gap-3 cursor-pointer hover:bg-accent/50 p-2 rounded-md transition-colors"
                            >
                              <Checkbox
                                checked={customFields.includes(fieldId)}
                                onCheckedChange={() => handleFieldToggle(fieldId)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="text-sm font-medium">
                                  {fieldDef.csvHeader}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Field: {fieldDef.dbField}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </div>
  );
}
