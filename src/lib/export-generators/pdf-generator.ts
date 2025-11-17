import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';
import type { DayBucket } from '@/types/database';
import { flattenPlace } from '../export-utils';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable?: {
      finalY: number;
    };
  }
}

interface PDFGeneratorOptions {
  title?: string;
  groupByDay?: boolean;
  dayBuckets?: DayBucket[];
  relationMetadata?: Map<string, any>;
}

export async function generatePDF(
  places: Place[],
  fieldDefs: FieldDefinition[],
  options: PDFGeneratorOptions = {}
): Promise<Buffer> {
  const { title = 'Places Export', groupByDay = false, dayBuckets = [], relationMetadata } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  doc.setFontSize(18);
  doc.text(title, 14, 15);

  doc.setFontSize(10);
  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Exported: ${exportDate}`, 14, 22);

  let startY = 30;

  if (groupByDay && dayBuckets.length > 0) {
    dayBuckets.forEach((bucket, index) => {
      const dayPlaces = places.filter(p => bucket.placeIds.includes(p.id));

      if (dayPlaces.length > 0) {
        if (startY > 250) {
          doc.addPage();
          startY = 20;
        }

        doc.setFontSize(14);
        doc.text(`Day ${bucket.dayNumber}`, 14, startY);
        startY += 7;

        addPlacesTable(doc, dayPlaces, fieldDefs, relationMetadata, startY);
        startY = doc.lastAutoTable?.finalY || startY + 10;
        startY += 10;
      }
    });

    const unscheduledPlaces = places.filter(p =>
      !dayBuckets.some(bucket => bucket.placeIds.includes(p.id))
    );

    if (unscheduledPlaces.length > 0) {
      if (startY > 250) {
        doc.addPage();
        startY = 20;
      }

      doc.setFontSize(14);
      doc.text('Unscheduled Places', 14, startY);
      startY += 7;

      addPlacesTable(doc, unscheduledPlaces, fieldDefs, relationMetadata, startY);
    }
  } else {
    addPlacesTable(doc, places, fieldDefs, relationMetadata, startY);
  }

  addPageNumbers(doc);

  return Buffer.from(doc.output('arraybuffer'));
}

function addPlacesTable(
  doc: jsPDF,
  places: Place[],
  fieldDefs: FieldDefinition[],
  relationMetadata: Map<string, any> | undefined,
  startY: number
): void {
  const headers = fieldDefs.map(field => field.csvHeader);

  const body = places.map(place => {
    const relationData = relationMetadata?.get(place.id);
    const flatPlace = flattenPlace(place, fieldDefs, relationData);

    return headers.map(header => {
      const value = flatPlace[header] || '';

      if (value.length > 50) {
        return value.substring(0, 47) + '...';
      }
      return value;
    });
  });

  doc.autoTable({
    head: [headers],
    body,
    startY,
    styles: {
      fontSize: 8,
      cellPadding: 2
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { top: 10, right: 14, bottom: 20, left: 14 },
    theme: 'striped'
  });
}

function addPageNumbers(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
}
