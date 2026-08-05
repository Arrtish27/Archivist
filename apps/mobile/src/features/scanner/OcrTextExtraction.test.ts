import { describe, expect, it } from 'vitest';

import { buildOcrCardText, buildOcrNameCandidates } from './OcrTextExtraction';

describe('buildOcrCardText', () => {
  it('extracts likely name and footer text from framed OCR lines', () => {
    const text = buildOcrCardText({
      blockCount: 1,
      lines: [
        {
          frame: { height: 12, left: 10, top: 20, width: 100 },
          text: 'Apotheosis Rite',
        },
        {
          frame: { height: 10, left: 10, top: 210, width: 70 },
          text: 'P24-000 EN',
        },
      ],
      platform: 'test',
      processedAt: '2026-08-05T00:00:00.000Z',
      rawText: 'Apotheosis Rite\nP24-000 EN',
      source: 'ml-kit-text-recognition',
      uri: 'file:///card.jpg',
    });

    expect(text).toEqual(
      expect.objectContaining({
        collectorNumberText: '000',
        footerText: 'P24-000 EN',
        nameText: 'Apotheosis Rite',
        setPrefixText: 'P24',
      }),
    );
  });

  it('turns polluted OCR title lines into searchable name candidates', () => {
    expect(
      buildOcrNameCandidates([
        "Lv.3o ja, Heaven's Favored",
        'THERING',
        'COST',
        'Champion',
        'Tamer Human',
        'Guo Jia Lineage',
      ]),
    ).toEqual(
      expect.arrayContaining([
        "ja, Heaven's Favored",
        "Heaven's Favored",
        'Guo Jia',
      ]),
    );
  });
});
