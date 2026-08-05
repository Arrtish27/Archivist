import { DeckExportFormat, DeckExportRow } from '@/domain/deck-export/types';
import { DeckSection } from '@/domain/validation/types';

export type ExportService = {
  format(rows: DeckExportRow[], format: DeckExportFormat): string;
};

const sectionOrder: DeckSection[] = ['material', 'main', 'sideboard'];

export const exportService: ExportService = {
  format(rows, format) {
    switch (format) {
      case 'countPrefix':
        return formatCountPrefix(rows);
      case 'csv':
        return formatCsv(rows);
      case 'json':
        return formatJson(rows);
      case 'plainText':
        return formatPlainText(rows);
    }
  },
};

function formatPlainText(rows: DeckExportRow[]) {
  return sectionOrder
    .map((section) => {
      const sectionRows = rows.filter((row) => row.section === section);

      if (sectionRows.length === 0) {
        return '';
      }

      return [
        getSectionExportTitle(section),
        ...sectionRows.map((row) => `${row.quantity} ${row.cardName}`),
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatCountPrefix(rows: DeckExportRow[]) {
  return rows.map((row) => `${row.quantity}x ${row.cardName}`).join('\n');
}

function formatCsv(rows: DeckExportRow[]) {
  return [
    'section,quantity,card_name,set_prefix,collector_number',
    ...rows.map((row) =>
      [
        row.section,
        row.quantity,
        escapeCsv(row.cardName),
        row.setPrefix ?? '',
        row.collectorNumber ?? '',
      ].join(','),
    ),
  ].join('\n');
}

function formatJson(rows: DeckExportRow[]) {
  return JSON.stringify(
    {
      format: 'standard',
      sections: Object.fromEntries(
        sectionOrder.map((section) => [
          section,
          rows
            .filter((row) => row.section === section)
            .map((row) => ({
              cardName: row.cardName,
              collectorNumber: row.collectorNumber ?? null,
              quantity: row.quantity,
              setPrefix: row.setPrefix ?? null,
            })),
        ]),
      ),
    },
    null,
    2,
  );
}

function getSectionExportTitle(section: DeckSection) {
  switch (section) {
    case 'main':
      return 'Main Deck';
    case 'material':
      return 'Material Deck';
    case 'sideboard':
      return 'Sideboard';
  }
}

function escapeCsv(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
