import { describe, expect, it } from 'vitest';

import { mapMlKitTextRecognitionResult } from './NativeOcrService';

describe('mapMlKitTextRecognitionResult', () => {
  it('flattens native OCR blocks into resolver-ready text lines', () => {
    const result = mapMlKitTextRecognitionResult(
      'file:///card.jpg',
      {
        blocks: [
          {
            lines: [
              {
                text: 'Apotheosis Rite',
              },
              {
                text: 'P24-000',
              },
            ],
            text: 'Apotheosis Rite\nP24-000',
          },
        ],
        text: ' Apotheosis Rite\nP24-000 ',
      },
      '2026-08-05T00:00:00.000Z',
    );

    expect(result).toEqual(
      expect.objectContaining({
        blockCount: 1,
        lines: [{ text: 'Apotheosis Rite' }, { text: 'P24-000' }],
        processedAt: '2026-08-05T00:00:00.000Z',
        rawText: 'Apotheosis Rite\nP24-000',
        uri: 'file:///card.jpg',
      }),
    );
  });
});
