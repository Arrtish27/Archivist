import { ScannerStatus } from './ScannerSession';

export type ScannerCaptureLoopInput = {
  cameraReady: boolean;
  captureStatus: 'capturing' | 'complete' | 'failed' | 'idle';
  deckWriteState: 'idle' | 'saving' | 'undoing';
  decisionStatus?: ScannerStatus;
  hasActiveDeck: boolean;
  paused: boolean;
};

export function getScannerCaptureDelayMs(input: ScannerCaptureLoopInput) {
  if (
    input.paused ||
    !input.cameraReady ||
    !input.hasActiveDeck ||
    input.captureStatus === 'capturing' ||
    input.deckWriteState !== 'idle'
  ) {
    return null;
  }

  if (input.captureStatus === 'failed' || input.captureStatus === 'idle') {
    return 450;
  }

  switch (input.decisionStatus) {
    case 'needs_confirmation':
      return null;
    case 'too_blurry':
    case 'too_dark':
      return 650;
    case 'card_seen_hold_steady':
    case 'duplicate_ignored':
    case 'matched':
    case 'no_card_seen':
    case 'no_match':
    case 'reading':
      return 450;
    default:
      return 450;
  }
}
