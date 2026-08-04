import { DeckExportFormat, DeckExportRow } from '@/domain/deck-export/types';

export type ExportService = {
  format(rows: DeckExportRow[], format: DeckExportFormat): string;
};

export const exportService: ExportService = {
  format(rows) {
    return rows.map((row) => `${row.quantity} ${row.cardName}`).join('\n');
  },
};
