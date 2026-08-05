import { describe, expect, it } from 'vitest';

import { getScannerCaptureDelayMs } from './ScannerCaptureLoop';

const baseInput = {
  cameraReady: true,
  captureStatus: 'complete' as const,
  deckWriteState: 'idle' as const,
  decisionStatus: 'no_match' as const,
  hasActiveDeck: true,
  paused: false,
};

describe('getScannerCaptureDelayMs', () => {
  it('uses a fast idle loop instead of the old long batch delay', () => {
    expect(getScannerCaptureDelayMs(baseInput)).toBeLessThan(900);
  });

  it('pauses while confirmation is required', () => {
    expect(
      getScannerCaptureDelayMs({
        ...baseInput,
        decisionStatus: 'needs_confirmation',
      }),
    ).toBeNull();
  });

  it('waits while deck writes are in progress', () => {
    expect(
      getScannerCaptureDelayMs({
        ...baseInput,
        deckWriteState: 'saving',
      }),
    ).toBeNull();
  });
});
