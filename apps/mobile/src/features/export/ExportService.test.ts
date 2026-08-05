import { describe, expect, it } from 'vitest';

import { exportService, writeExportPayloadToCache } from './ExportService';

const rows = [
  {
    cardName: 'Lorraine, Blademaster',
    collectorNumber: '001',
    quantity: 1,
    section: 'material' as const,
    setPrefix: 'DOA',
  },
  {
    cardName: 'Creative Shock',
    collectorNumber: '102',
    quantity: 4,
    section: 'main' as const,
    setPrefix: 'DOA',
  },
  {
    cardName: 'Apotheosis Rite',
    collectorNumber: '000',
    quantity: 1,
    section: 'sideboard' as const,
    setPrefix: 'P24',
  },
];

describe('exportService', () => {
  it('formats grouped plain text deck exports', () => {
    expect(exportService.format(rows, 'plainText')).toBe(
      [
        'Material Deck',
        '1 Lorraine, Blademaster',
        '',
        'Main Deck',
        '4 Creative Shock',
        '',
        'Sideboard',
        '1 Apotheosis Rite',
      ].join('\n'),
    );
  });

  it('formats CSV with escaped card names', () => {
    expect(exportService.format(rows, 'csv')).toContain(
      'material,1,"Lorraine, Blademaster",DOA,001',
    );
  });

  it('formats count-prefix exports without edition text', () => {
    expect(exportService.format(rows, 'countPrefix')).toBe(
      [
        '1x Lorraine, Blademaster',
        '4x Creative Shock',
        '1x Apotheosis Rite',
      ].join('\n'),
    );
  });

  it('formats structured JSON exports', () => {
    const parsed = JSON.parse(exportService.format(rows, 'json')) as {
      sections: {
        main: {
          cardName: string;
          quantity: number;
        }[];
      };
    };

    expect(parsed.sections.main[0]).toMatchObject({
      cardName: 'Creative Shock',
      quantity: 4,
    });
  });

  it('builds export payload metadata for native sharing', () => {
    const payload = exportService.buildPayload({
      deckName: 'Lorraine Locals',
      format: 'csv',
      rows: rows.filter((row) => row.section === 'main'),
      scope: 'main',
      sourceLabel: 'Tournament 5 Aug',
    });

    expect(payload).toMatchObject({
      filename: 'lorraine-locals-tournament-5-aug-main-deck-csv.csv',
      format: 'csv',
      lineCount: 2,
      mimeType: 'text/csv',
      scope: 'main',
      title: 'Lorraine Locals - Tournament 5 Aug - Main Deck - CSV',
    });
  });

  it('writes export payloads into the cache export directory', async () => {
    const writes: string[] = [];
    const directories: string[] = [];
    const payload = exportService.buildPayload({
      deckName: 'Locals',
      format: 'json',
      rows,
    });

    const uri = await writeExportPayloadToCache(payload, {
      cacheDirectory: 'file:///cache/',
      makeDirectoryAsync: async (directory) => {
        directories.push(directory);
      },
      writeAsStringAsync: async (fileUri, contents) => {
        writes.push(`${fileUri}:${contents.slice(0, 1)}`);
      },
    });

    expect(uri).toBe('file:///cache/deck-exports/locals-full-deck-json.json');
    expect(directories).toEqual(['file:///cache/deck-exports/']);
    expect(writes).toEqual([
      'file:///cache/deck-exports/locals-full-deck-json.json:{',
    ]);
  });
});
