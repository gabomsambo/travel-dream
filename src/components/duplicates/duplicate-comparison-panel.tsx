'use client';

import { Check, AlertTriangle, Plus, Minus } from 'lucide-react';
import { Badge } from '@/components/adapters/badge';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface DuplicateComparisonPanelProps {
  target: Place;
  compareTo: Place;
  className?: string;
}

type FieldValue = string | number | boolean | string[] | null | undefined | Place['coords'];

interface FieldComparison {
  label: string;
  targetValue: FieldValue;
  compareValue: FieldValue;
  type: 'text' | 'array' | 'coords';
}

function formatCoords(coords: Place['coords']): string {
  if (!coords || typeof coords !== 'object') return '';
  if ('lat' in coords && 'lon' in coords && coords.lat !== null && coords.lon !== null) {
    return `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;
  }
  return '';
}

function getFieldValue(value: FieldValue, type: 'text' | 'array' | 'coords'): string {
  if (value === null || value === undefined) return '';
  if (type === 'coords') return formatCoords(value as Place['coords']);
  if (type === 'array') {
    const arr = value as string[];
    return Array.isArray(arr) ? arr.join(', ') : '';
  }
  return String(value);
}

function isEmpty(value: FieldValue, type: 'text' | 'array' | 'coords'): boolean {
  if (value === null || value === undefined) return true;
  if (type === 'array') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (type === 'coords') {
    if (typeof value !== 'object') return true;
    const coords = value as Place['coords'];
    return !coords || !('lat' in coords) || !('lon' in coords) ||
           coords.lat === null || coords.lon === null;
  }
  return String(value).trim() === '';
}

function valuesMatch(v1: FieldValue, v2: FieldValue, type: 'text' | 'array' | 'coords'): boolean {
  if (isEmpty(v1, type) && isEmpty(v2, type)) return true;
  if (isEmpty(v1, type) || isEmpty(v2, type)) return false;

  if (type === 'array') {
    const arr1 = (v1 as string[]).map(s => s.toLowerCase().trim()).sort();
    const arr2 = (v2 as string[]).map(s => s.toLowerCase().trim()).sort();
    return JSON.stringify(arr1) === JSON.stringify(arr2);
  }

  if (type === 'coords') {
    const c1 = v1 as Place['coords'];
    const c2 = v2 as Place['coords'];
    if (!c1 || !c2 || typeof c1 !== 'object' || typeof c2 !== 'object') return false;
    return 'lat' in c1 && 'lat' in c2 && 'lon' in c1 && 'lon' in c2 &&
           c1.lat === c2.lat && c1.lon === c2.lon;
  }

  return String(v1).toLowerCase().trim() === String(v2).toLowerCase().trim();
}

type DiffIndicator = 'match' | 'differ' | 'target-missing' | 'compare-missing';

function getDiffIndicator(
  targetValue: FieldValue,
  compareValue: FieldValue,
  type: 'text' | 'array' | 'coords'
): DiffIndicator {
  const targetEmpty = isEmpty(targetValue, type);
  const compareEmpty = isEmpty(compareValue, type);

  if (targetEmpty && compareEmpty) return 'match';
  if (targetEmpty && !compareEmpty) return 'target-missing';
  if (!targetEmpty && compareEmpty) return 'compare-missing';
  if (valuesMatch(targetValue, compareValue, type)) return 'match';
  return 'differ';
}

function DiffIcon({ indicator }: { indicator: DiffIndicator }) {
  switch (indicator) {
    case 'match':
      return <Check className="h-4 w-4 text-green-500" />;
    case 'differ':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'target-missing':
      return <Plus className="h-4 w-4 text-blue-500" />;
    case 'compare-missing':
      return <Minus className="h-4 w-4 text-gray-400" />;
  }
}

function ArrayBadges({ values, className }: { values: string[]; className?: string }) {
  if (!values || values.length === 0) {
    return <span className="text-muted-foreground text-sm italic">None</span>;
  }

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {values.map((value, idx) => (
        <Badge key={idx} variant="outline" className="text-xs">
          {value}
        </Badge>
      ))}
    </div>
  );
}

export function DuplicateComparisonPanel({
  target,
  compareTo,
  className,
}: DuplicateComparisonPanelProps) {
  const fields: FieldComparison[] = [
    { label: 'Name', targetValue: target.name, compareValue: compareTo.name, type: 'text' },
    { label: 'Kind', targetValue: target.kind, compareValue: compareTo.kind, type: 'text' },
    { label: 'City', targetValue: target.city, compareValue: compareTo.city, type: 'text' },
    { label: 'Country', targetValue: target.country, compareValue: compareTo.country, type: 'text' },
    { label: 'Address', targetValue: target.address, compareValue: compareTo.address, type: 'text' },
    { label: 'Coordinates', targetValue: target.coords, compareValue: compareTo.coords, type: 'coords' },
    { label: 'Description', targetValue: target.description, compareValue: compareTo.description, type: 'text' },
    { label: 'Tags', targetValue: target.tags, compareValue: compareTo.tags, type: 'array' },
    { label: 'Vibes', targetValue: target.vibes, compareValue: compareTo.vibes, type: 'array' },
    { label: 'Activities', targetValue: target.activities, compareValue: compareTo.activities, type: 'array' },
    { label: 'Amenities', targetValue: target.amenities, compareValue: compareTo.amenities, type: 'array' },
    { label: 'Cuisine', targetValue: target.cuisine, compareValue: compareTo.cuisine, type: 'array' },
    { label: 'Alt Names', targetValue: target.altNames, compareValue: compareTo.altNames, type: 'array' },
  ];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-[120px_1fr_auto_1fr] gap-2 text-sm">
        <div className="font-medium text-muted-foreground">Field</div>
        <div className="font-medium text-center">Target (Keep)</div>
        <div className="w-6" />
        <div className="font-medium text-center">Compare</div>
      </div>

      <div className="border-t" />

      {fields.map((field) => {
        const indicator = getDiffIndicator(field.targetValue, field.compareValue, field.type);
        const targetDisplay = getFieldValue(field.targetValue, field.type);
        const compareDisplay = getFieldValue(field.compareValue, field.type);

        return (
          <div
            key={field.label}
            className={cn(
              'grid grid-cols-[120px_1fr_auto_1fr] gap-2 py-2 items-start',
              indicator === 'target-missing' && 'bg-blue-50/50 -mx-2 px-2 rounded',
              indicator === 'differ' && 'bg-amber-50/50 -mx-2 px-2 rounded'
            )}
          >
            <div className="text-sm font-medium text-muted-foreground">{field.label}</div>

            <div className="text-sm">
              {field.type === 'array' ? (
                <ArrayBadges values={field.targetValue as string[] || []} />
              ) : (
                targetDisplay || <span className="text-muted-foreground italic">Empty</span>
              )}
            </div>

            <div className="flex items-center justify-center w-6">
              <DiffIcon indicator={indicator} />
            </div>

            <div className="text-sm">
              {field.type === 'array' ? (
                <ArrayBadges values={field.compareValue as string[] || []} />
              ) : (
                compareDisplay || <span className="text-muted-foreground italic">Empty</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="border-t pt-3">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-green-500" /> Match
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" /> Different
          </span>
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3 text-blue-500" /> Will add
          </span>
          <span className="flex items-center gap-1">
            <Minus className="h-3 w-3 text-gray-400" /> Missing
          </span>
        </div>
      </div>
    </div>
  );
}
