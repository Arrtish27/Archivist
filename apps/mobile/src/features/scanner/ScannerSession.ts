import { ScanCandidate, OcrCardText } from '@/domain/card-resolution/types';
import { DeckSection } from '@/domain/validation/types';

export type ScannerMode = 'deck' | 'batch';

export type ScannerStatus =
  | 'no_card_seen'
  | 'card_seen_hold_steady'
  | 'reading'
  | 'matched'
  | 'needs_confirmation'
  | 'too_blurry'
  | 'too_dark'
  | 'no_match'
  | 'duplicate_ignored';

export type ScannerTarget = {
  deckId: string;
  mode: ScannerMode;
  quantity: number;
  section: DeckSection;
};

export type ScannerDebugEvent = {
  candidateCount: number;
  candidates: {
    cardName?: string;
    cardUuid: string;
    confidence: number;
    reason: string[];
  }[];
  id: string;
  observedAt: string;
  ocrText: OcrCardText;
  rawText: string;
  reason: string[];
  status: ScannerStatus;
  targetSection: DeckSection;
};

export type ScannerDecision = {
  candidateKey?: string;
  candidates: ScanCandidate[];
  debugEvent: ScannerDebugEvent;
  primaryCandidate?: ScanCandidate;
  reason: string[];
  status: ScannerStatus;
  targetIssue?: string;
};

export type ScannerSessionOptions = {
  autoAddConfidenceThreshold?: number;
  duplicateCooldownMs?: number;
  requiredStableDetections?: number;
  createId?: () => string;
};

export type ScannerObservationInput = {
  candidates: ScanCandidate[];
  observedAt?: Date;
  ocrText: OcrCardText;
  rawText: string;
  target: ScannerTarget;
};

export type ScannerAddInput = {
  candidate: ScanCandidate;
  observedAt?: Date;
  target: ScannerTarget;
};

type StableCandidateState = {
  count: number;
  key: string;
};

type LastAddedState = {
  addedAtMs: number;
  awaitingClear: boolean;
  key: string;
  section: DeckSection;
};

const defaultSessionOptions = {
  autoAddConfidenceThreshold: 0.92,
  duplicateCooldownMs: 1500,
  requiredStableDetections: 2,
};

export class ScannerSession {
  private stableCandidate: StableCandidateState | null = null;
  private lastAdded: LastAddedState | null = null;

  constructor(private readonly options: ScannerSessionOptions = {}) {}

  observe(input: ScannerObservationInput): ScannerDecision {
    const observedAt = input.observedAt ?? new Date();
    const rawText = input.rawText.trim();

    if (!rawText && input.candidates.length === 0) {
      this.clearCardPresence();

      return this.buildDecision({
        candidates: [],
        input,
        observedAt,
        reason: ['empty_ocr'],
        status: 'no_card_seen',
      });
    }

    const primaryCandidate = input.candidates[0];

    if (!primaryCandidate) {
      this.stableCandidate = null;

      return this.buildDecision({
        candidates: [],
        input,
        observedAt,
        reason: ['no_local_candidate'],
        status: 'no_match',
      });
    }

    const candidateKey = getCandidateKey(primaryCandidate);
    const stableCount = this.recordStableObservation(candidateKey);
    const targetIssue = getTargetSectionIssue(
      primaryCandidate,
      input.target.section,
    );

    if (
      primaryCandidate.requiresConfirmation ||
      targetIssue ||
      input.candidates.length > 1
    ) {
      return this.buildDecision({
        candidateKey,
        candidates: input.candidates,
        input,
        observedAt,
        primaryCandidate,
        reason: [
          ...(primaryCandidate.requiresConfirmation
            ? ['candidate_requires_confirmation']
            : []),
          ...(targetIssue ? ['target_section_needs_confirmation'] : []),
          ...(input.candidates.length > 1 ? ['multiple_candidates'] : []),
        ],
        status: 'needs_confirmation',
        targetIssue: targetIssue ?? undefined,
      });
    }

    if (primaryCandidate.confidence < this.autoAddConfidenceThreshold) {
      return this.buildDecision({
        candidateKey,
        candidates: input.candidates,
        input,
        observedAt,
        primaryCandidate,
        reason: ['below_auto_add_threshold'],
        status: 'needs_confirmation',
      });
    }

    if (stableCount < this.requiredStableDetections) {
      return this.buildDecision({
        candidateKey,
        candidates: input.candidates,
        input,
        observedAt,
        primaryCandidate,
        reason: ['waiting_for_stable_repeat'],
        status: 'card_seen_hold_steady',
      });
    }

    if (
      this.isDuplicateBlocked(candidateKey, input.target.section, observedAt)
    ) {
      return this.buildDecision({
        candidateKey,
        candidates: input.candidates,
        input,
        observedAt,
        primaryCandidate,
        reason: ['duplicate_prevention'],
        status: 'duplicate_ignored',
      });
    }

    return this.buildDecision({
      candidateKey,
      candidates: input.candidates,
      input,
      observedAt,
      primaryCandidate,
      reason: ['auto_add_allowed'],
      status: 'matched',
    });
  }

  recordAdd(input: ScannerAddInput) {
    const observedAt = input.observedAt ?? new Date();

    this.lastAdded = {
      addedAtMs: observedAt.getTime(),
      awaitingClear: true,
      key: getCandidateKey(input.candidate),
      section: input.target.section,
    };
  }

  clearCardPresence() {
    this.stableCandidate = null;

    if (this.lastAdded) {
      this.lastAdded = {
        ...this.lastAdded,
        awaitingClear: false,
      };
    }
  }

  private recordStableObservation(candidateKey: string) {
    if (this.stableCandidate?.key === candidateKey) {
      this.stableCandidate = {
        count: this.stableCandidate.count + 1,
        key: candidateKey,
      };
    } else {
      this.stableCandidate = {
        count: 1,
        key: candidateKey,
      };
    }

    return this.stableCandidate.count;
  }

  private isDuplicateBlocked(
    candidateKey: string,
    section: DeckSection,
    observedAt: Date,
  ) {
    if (
      !this.lastAdded ||
      this.lastAdded.key !== candidateKey ||
      this.lastAdded.section !== section
    ) {
      return false;
    }

    if (this.lastAdded.awaitingClear) {
      return true;
    }

    return (
      observedAt.getTime() - this.lastAdded.addedAtMs < this.duplicateCooldownMs
    );
  }

  private buildDecision(input: {
    candidateKey?: string;
    candidates: ScanCandidate[];
    input: ScannerObservationInput;
    observedAt: Date;
    primaryCandidate?: ScanCandidate;
    reason: string[];
    status: ScannerStatus;
    targetIssue?: string;
  }): ScannerDecision {
    return {
      candidateKey: input.candidateKey,
      candidates: input.candidates,
      debugEvent: {
        candidateCount: input.candidates.length,
        candidates: input.candidates.map((candidate) => ({
          cardName: candidate.cardName,
          cardUuid: candidate.cardUuid,
          confidence: candidate.confidence,
          reason: candidate.reason,
        })),
        id: this.createId(),
        observedAt: input.observedAt.toISOString(),
        ocrText: input.input.ocrText,
        rawText: input.input.rawText,
        reason: input.reason,
        status: input.status,
        targetSection: input.input.target.section,
      },
      primaryCandidate: input.primaryCandidate,
      reason: input.reason,
      status: input.status,
      targetIssue: input.targetIssue,
    };
  }

  private get autoAddConfidenceThreshold() {
    return (
      this.options.autoAddConfidenceThreshold ??
      defaultSessionOptions.autoAddConfidenceThreshold
    );
  }

  private get duplicateCooldownMs() {
    return (
      this.options.duplicateCooldownMs ??
      defaultSessionOptions.duplicateCooldownMs
    );
  }

  private get requiredStableDetections() {
    return (
      this.options.requiredStableDetections ??
      defaultSessionOptions.requiredStableDetections
    );
  }

  private createId() {
    return (
      this.options.createId?.() ??
      `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
    );
  }
}

export function createScannerSession(options?: ScannerSessionOptions) {
  return new ScannerSession(options);
}

export function getCandidateKey(candidate: ScanCandidate) {
  return `${candidate.cardUuid}:${candidate.editionUuid ?? 'any'}`;
}

export function getTargetSectionIssue(
  candidate: ScanCandidate,
  section: DeckSection,
) {
  const cardTypes = new Set(
    (candidate.cardTypes ?? []).map((type) => type.toLowerCase()),
  );

  if (cardTypes.size === 0) {
    return null;
  }

  const isMaterialCard = cardTypes.has('champion') || cardTypes.has('regalia');

  if (section === 'material' && !isMaterialCard) {
    return 'This card belongs outside the Material Deck.';
  }

  if (section === 'main' && isMaterialCard) {
    return 'Champion and Regalia cards belong outside the Main Deck.';
  }

  return null;
}
