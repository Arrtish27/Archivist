import { describe, expect, it } from 'vitest';

import { ScanCandidate } from '@/domain/card-resolution/types';

import { createScannerSession, getTargetSectionIssue } from './ScannerSession';

const exactFooterCandidate: ScanCandidate = {
  cardName: 'Creative Shock',
  cardTypes: ['action'],
  cardUuid: 'card-creative-shock',
  collectorNumber: '102',
  confidence: 0.98,
  editionUuid: 'edition-creative-shock-doa-102',
  reason: ['exact_footer', 'offline_set_collector'],
  requiresConfirmation: false,
  setPrefix: 'DOA',
};

describe('ScannerSession', () => {
  it('requires stable repeated exact matches before auto-add', () => {
    const session = createScannerSession({
      createId: predictableIds(),
      requiredStableDetections: 2,
    });
    const target = {
      deckId: 'deck-1',
      mode: 'batch' as const,
      quantity: 1,
      section: 'main' as const,
    };
    const first = session.observe({
      candidates: [exactFooterCandidate],
      observedAt: new Date('2026-08-05T00:00:00.000Z'),
      ocrText: { footerText: 'DOA-102', nameText: 'Creative Shock' },
      rawText: 'Creative Shock\nDOA-102',
      target,
    });
    const second = session.observe({
      candidates: [exactFooterCandidate],
      observedAt: new Date('2026-08-05T00:00:01.000Z'),
      ocrText: { footerText: 'DOA-102', nameText: 'Creative Shock' },
      rawText: 'Creative Shock\nDOA-102',
      target,
    });

    expect(first.status).toBe('card_seen_hold_steady');
    expect(second.status).toBe('matched');
  });

  it('blocks repeat adds until the card leaves frame', () => {
    const session = createScannerSession({
      createId: predictableIds(),
      requiredStableDetections: 1,
    });
    const target = {
      deckId: 'deck-1',
      mode: 'batch' as const,
      quantity: 1,
      section: 'main' as const,
    };
    const first = session.observe({
      candidates: [exactFooterCandidate],
      observedAt: new Date('2026-08-05T00:00:00.000Z'),
      ocrText: { footerText: 'DOA-102', nameText: 'Creative Shock' },
      rawText: 'Creative Shock\nDOA-102',
      target,
    });

    session.recordAdd({
      candidate: exactFooterCandidate,
      observedAt: new Date('2026-08-05T00:00:00.000Z'),
      target,
    });

    const duplicate = session.observe({
      candidates: [exactFooterCandidate],
      observedAt: new Date('2026-08-05T00:00:03.000Z'),
      ocrText: { footerText: 'DOA-102', nameText: 'Creative Shock' },
      rawText: 'Creative Shock\nDOA-102',
      target,
    });
    session.observe({
      candidates: [],
      observedAt: new Date('2026-08-05T00:00:04.000Z'),
      ocrText: {},
      rawText: '',
      target,
    });
    const afterClear = session.observe({
      candidates: [exactFooterCandidate],
      observedAt: new Date('2026-08-05T00:00:05.600Z'),
      ocrText: { footerText: 'DOA-102', nameText: 'Creative Shock' },
      rawText: 'Creative Shock\nDOA-102',
      target,
    });

    expect(first.status).toBe('matched');
    expect(duplicate.status).toBe('duplicate_ignored');
    expect(afterClear.status).toBe('matched');
  });
});

describe('getTargetSectionIssue', () => {
  it('requires confirmation before auto-adding cards into invalid sections', () => {
    expect(getTargetSectionIssue(exactFooterCandidate, 'material')).toBe(
      'This card belongs outside the Material Deck.',
    );
  });
});

function predictableIds() {
  let index = 0;

  return () => {
    index += 1;
    return `scan-${index}`;
  };
}
