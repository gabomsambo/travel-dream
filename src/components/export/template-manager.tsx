'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui-v2/dialog';
import { Button } from '@/components/ui-v2/button';
import { Input } from '@/components/ui-v2/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui-v2/card';
import { Save, Trash, Download } from 'lucide-react';
import type { ExportTemplate, ExportScope, ExportFormat, FieldPreset } from '@/types/export';

interface TemplateManagerProps {
  currentConfig: {
    scope: ExportScope;
    format: ExportFormat;
    preset: FieldPreset;
    customFields?: string[];
    options?: ExportTemplate['options'];
  };
  templates: ExportTemplate[];
  onSaveTemplate: (name: string) => void;
  onLoadTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
}

export function TemplateManager({
  currentConfig,
  templates,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
}: TemplateManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const handleSaveTemplate = () => {
    if (templateName.trim()) {
      onSaveTemplate(templateName.trim());
      setTemplateName('');
      setIsDialogOpen(false);
    }
  };

  const getScopeLabel = (scope: ExportScope): string => {
    switch (scope.type) {
      case 'collection':
        return 'Collection';
      case 'library':
        return 'Library';
      case 'selected':
        return `Selected (${scope.placeIds.length})`;
      default:
        return 'Unknown';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Save />
              Save as Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Export Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label htmlFor="template-name" className="text-sm font-medium">
                  Template Name
                </label>
                <Input
                  id="template-name"
                  placeholder="e.g., Tokyo Restaurants Export"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveTemplate();
                    }
                  }}
                  maxLength={50}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setTemplateName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                >
                  Save Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No saved templates yet</p>
            <p className="text-xs mt-1">
              Save your current export configuration as a template for quick reuse
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{template.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getScopeLabel(template.scope)} • {template.format.toUpperCase()} • {template.preset}
                    {template.createdAt && (
                      <> • {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onLoadTemplate(template.id)}
                  >
                    <Download />
                    Use
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDeleteTemplate(template.id)}
                  >
                    <Trash />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
