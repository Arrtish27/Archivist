import { describe, expect, it } from 'vitest';

import { exportService } from './ExportService';

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
});
