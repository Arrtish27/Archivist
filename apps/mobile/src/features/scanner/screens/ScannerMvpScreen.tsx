import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppServices } from '@/application/AppServicesProvider';
import { CatalogCard } from '@/data/catalog/types';
import { ScanCandidate } from '@/domain/card-resolution/types';
import { DeckSection } from '@/domain/validation/types';
import { DEFAULT_DECK_SECTION } from '@/features/deck-builder/DeckBuilderModel';
import { StillImageOcrResult } from '@/features/scanner/NativeOcrService';
import { getScannerCaptureDelayMs } from '@/features/scanner/ScannerCaptureLoop';
import {
  createScannerDeckWorkflow,
  ScannerDeckAddResult,
  ScannerDeckAddSource,
} from '@/features/scanner/ScannerDeckWorkflow';
import { ScannerResolution } from '@/features/scanner/ScannerService';
import {
  createScannerSession,
  ScannerDebugEvent,
  ScannerDecision,
  ScannerMode,
  ScannerTarget,
} from '@/features/scanner/ScannerSession';
import { theme } from '@/ui/theme';

type CaptureState =
  | {
      status: 'idle';
    }
  | {
      status: 'capturing';
    }
  | {
      decision: ScannerDecision;
      ocr: StillImageOcrResult;
      resolution: ScannerResolution;
      status: 'complete';
    }
  | {
      message: string;
      status: 'failed';
    };

type DeckWriteState = 'idle' | 'saving' | 'undoing';

const deckSections: {
  label: string;
  section: DeckSection;
}[] = [
  { label: 'Material', section: 'material' },
  { label: 'Main', section: 'main' },
  { label: 'Sideboard', section: 'sideboard' },
];

export function ScannerMvpScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams();
  const requestedDeckId = getStringRouteParam(routeParams.deckId);
  const requestedSection = getDeckSectionRouteParam(routeParams.section);
  const cameraRef = useRef<CameraView>(null);
  const scannerSessionRef = useRef(createScannerSession());
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const routeDefaultSection = requestedSection ?? DEFAULT_DECK_SECTION;
  const [sectionSelection, setSectionSelection] = useState<{
    routeSection: DeckSection | null;
    section: DeckSection;
  }>(() => ({
    routeSection: requestedSection,
    section: routeDefaultSection,
  }));
  const targetSection =
    sectionSelection.routeSection === requestedSection
      ? sectionSelection.section
      : routeDefaultSection;
  const setTargetSection = useCallback(
    (section: DeckSection) =>
      setSectionSelection({
        routeSection: requestedSection,
        section,
      }),
    [requestedSection],
  );
  const [quantity, setQuantity] = useState(1);
  const [scannerMode, setScannerMode] = useState<ScannerMode>('deck');
  const [autoCapturePaused, setAutoCapturePaused] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: 'idle',
  });
  const [deckWriteState, setDeckWriteState] = useState<DeckWriteState>('idle');
  const [lastAdd, setLastAdd] = useState<ScannerDeckAddResult | null>(null);
  const [recentAdds, setRecentAdds] = useState<ScannerDeckAddResult[]>([]);
  const [eventLog, setEventLog] = useState<ScannerDebugEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const deckWorkflow = useMemo(
    () => createScannerDeckWorkflow(services.decks),
    [services.decks],
  );
  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });
  const activeDeck =
    (requestedDeckId
      ? decksQuery.data?.find((deck) => deck.id === requestedDeckId)
      : decksQuery.data?.[0]) ?? null;
  const manualSearchQuery = useQuery({
    enabled: searchQuery.trim().length >= 2,
    queryFn: () =>
      services.catalog.searchCards({
        limit: 8,
        query: searchQuery,
      }),
    queryKey: ['scanner-manual-search', searchQuery],
  });
  const createDeckMutation = useMutation({
    mutationFn: () =>
      services.decks.createDeck({
        name: `Tournament Deck ${(decksQuery.data?.length ?? 0) + 1}`,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const refreshDecks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
    [queryClient],
  );

  const appendEvent = useCallback((event: ScannerDebugEvent) => {
    setEventLog((current) => [event, ...current].slice(0, 8));
  }, []);

  const addCandidateToDeck = useCallback(
    async (
      candidate: ScanCandidate,
      addedQuantity: number,
      source: ScannerDeckAddSource,
    ) => {
      if (!activeDeck) {
        setCaptureState({
          message: 'Create a local deck before adding scanned cards.',
          status: 'failed',
        });
        return;
      }

      setDeckWriteState('saving');

      try {
        const result = await deckWorkflow.addCandidateToDeck({
          candidate,
          deckId: activeDeck.id,
          quantity: addedQuantity,
          section: targetSection,
          source,
        });
        const target = getScannerTarget(
          activeDeck.id,
          targetSection,
          addedQuantity,
          scannerMode,
        );

        scannerSessionRef.current.recordAdd({
          candidate,
          target,
        });
        setLastAdd(result);
        setRecentAdds((current) => [result, ...current].slice(0, 6));
        await refreshDecks();
        if (source === 'scanner_confirmation') {
          setCaptureState({ status: 'idle' });
        }
      } finally {
        setDeckWriteState('idle');
      }
    },
    [activeDeck, deckWorkflow, refreshDecks, scannerMode, targetSection],
  );

  const addCatalogCardToDeck = useCallback(
    async (card: CatalogCard) => {
      if (!activeDeck) {
        return;
      }

      setDeckWriteState('saving');

      try {
        const result = await deckWorkflow.addCatalogCardToDeck({
          card,
          deckId: activeDeck.id,
          quantity,
          section: targetSection,
        });

        setLastAdd(result);
        setRecentAdds((current) => [result, ...current].slice(0, 6));
        await refreshDecks();
      } finally {
        setDeckWriteState('idle');
      }
    },
    [activeDeck, deckWorkflow, quantity, refreshDecks, targetSection],
  );

  const undoLastAdd = useCallback(async () => {
    if (!lastAdd) {
      return;
    }

    setDeckWriteState('undoing');

    try {
      await deckWorkflow.undoAdd(lastAdd.undo);
      setRecentAdds((current) =>
        current.filter((entry) => entry.id !== lastAdd.id),
      );
      setLastAdd(null);
      await refreshDecks();
    } finally {
      setDeckWriteState('idle');
    }
  }, [deckWorkflow, lastAdd, refreshDecks]);

  const captureAndRecognize = useCallback(
    async (mode: ScannerMode = scannerMode) => {
      if (
        !activeDeck ||
        !cameraRef.current ||
        captureState.status === 'capturing' ||
        deckWriteState !== 'idle'
      ) {
        return;
      }

      setCaptureState({ status: 'capturing' });

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.65,
          skipProcessing: false,
        });
        const ocr = await services.ocr.recognizeStillImage(photo.uri);
        const resolution = await services.scanner.analyzeStillImage(ocr);
        const target = getScannerTarget(
          activeDeck.id,
          targetSection,
          quantity,
          mode,
        );
        const decision = scannerSessionRef.current.observe({
          candidates: resolution.candidates,
          ocrText: resolution.ocrText,
          rawText: resolution.rawText,
          target,
        });

        appendEvent(decision.debugEvent);
        setCaptureState({
          decision,
          ocr,
          resolution,
          status: 'complete',
        });

        if (mode === 'batch' && decision.status === 'matched') {
          const candidate = decision.primaryCandidate;

          if (candidate) {
            await addCandidateToDeck(candidate, quantity, 'scanner_match');
          }
        }
      } catch (error) {
        setCaptureState({
          message: error instanceof Error ? error.message : String(error),
          status: 'failed',
        });
      }
    },
    [
      activeDeck,
      addCandidateToDeck,
      appendEvent,
      captureState.status,
      deckWriteState,
      quantity,
      scannerMode,
      services.ocr,
      services.scanner,
      targetSection,
    ],
  );

  useEffect(() => {
    const delayMs = getScannerCaptureDelayMs({
      cameraReady,
      captureStatus: captureState.status,
      decisionStatus:
        captureState.status === 'complete'
          ? captureState.decision.status
          : undefined,
      deckWriteState,
      hasActiveDeck: Boolean(activeDeck),
      paused: autoCapturePaused,
    });

    if (delayMs === null) {
      return;
    }

    const timer = setTimeout(() => {
      void captureAndRecognize('batch');
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    activeDeck,
    autoCapturePaused,
    cameraReady,
    captureAndRecognize,
    captureState,
    deckWriteState,
  ]);

  if (!permission) {
    return <ScannerStateScreen message="Checking camera permission" />;
  }

  if (!permission.granted) {
    return (
      <ScannerStateScreen
        actionLabel="Allow Camera"
        message="Camera access is optional"
        onAction={requestPermission}
        supportingText="Manual deck entry and local search stay available if camera access is denied."
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="scanner-mvp"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Scanner MVP</Text>
        <Text style={styles.title}>{activeDeck?.name ?? 'No deck yet'}</Text>
        <Text style={styles.subtitle}>
          {activeDeck
            ? getDeckCountLabel(activeDeck.cards.length)
            : 'Local deck required'}
        </Text>
      </View>

      {!activeDeck && requestedDeckId ? (
        <Pressable
          onPress={() => router.replace('/decks')}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Deck List</Text>
        </Pressable>
      ) : null}

      {!activeDeck && !requestedDeckId ? (
        <Pressable
          disabled={createDeckMutation.isPending}
          onPress={() => createDeckMutation.mutate()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {createDeckMutation.isPending ? 'Creating' : 'Create Local Deck'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.cameraPanel}>
        <CameraView
          active={Boolean(activeDeck)}
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          ref={cameraRef}
          style={styles.camera}
        />
        <View pointerEvents="none" style={styles.guideFrame}>
          <View style={styles.guideInset} />
        </View>
        <View style={styles.cameraStatus}>
          <Text style={styles.cameraStatusText}>
            {autoCapturePaused ? 'Paused' : getScannerStateLabel(captureState)}
          </Text>
        </View>
      </View>

      <View style={styles.controlPanel}>
        <SectionSelector
          onChange={setTargetSection}
          selectedSection={targetSection}
        />
        <QuantityStepper onChange={setQuantity} value={quantity} />
        <View style={styles.captureRow}>
          <Pressable
            disabled={!cameraReady || !activeDeck}
            onPress={() => {
              setScannerMode('batch');
              setAutoCapturePaused((value) => !value);
            }}
            style={[
              styles.primaryButton,
              !autoCapturePaused && styles.primaryButtonActive,
              (!cameraReady || !activeDeck) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {autoCapturePaused ? 'Resume Auto' : 'Pause Auto'}
            </Text>
          </Pressable>
          <Pressable
            disabled={
              !cameraReady || !activeDeck || captureState.status === 'capturing'
            }
            onPress={() => {
              setScannerMode('deck');
              void captureAndRecognize('deck');
            }}
            style={[
              styles.secondaryButton,
              (!cameraReady ||
                !activeDeck ||
                captureState.status === 'capturing') &&
                styles.disabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {captureState.status === 'capturing' ? 'Reading' : 'Scan Now'}
            </Text>
          </Pressable>
        </View>
        <Pressable
          disabled={!lastAdd || deckWriteState !== 'idle'}
          onPress={() => void undoLastAdd()}
          style={[
            styles.undoButton,
            (!lastAdd || deckWriteState !== 'idle') && styles.disabled,
          ]}
        >
          <Text style={styles.undoButtonText}>
            {deckWriteState === 'undoing' ? 'Undoing' : 'Undo Last Add'}
          </Text>
        </Pressable>
      </View>

      <DecisionPanel
        captureState={captureState}
        deckWriteState={deckWriteState}
        onAddCandidate={addCandidateToDeck}
        onClearDecision={() => setCaptureState({ status: 'idle' })}
        quantity={quantity}
      />

      <ManualSearchPanel
        activeDeckReady={Boolean(activeDeck)}
        isLoading={manualSearchQuery.isFetching}
        onAddCard={(card) => void addCatalogCardToDeck(card)}
        onQueryChange={setSearchQuery}
        query={searchQuery}
        results={manualSearchQuery.data ?? []}
      />

      <RecentAddsPanel recentAdds={recentAdds} />
      <ScannerDebugPanel eventLog={eventLog} state={captureState} />

      <StatusBar style="light" />
    </ScrollView>
  );
}

function getStringRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getDeckSectionRouteParam(
  value: string | string[] | undefined,
): DeckSection | null {
  const section = getStringRouteParam(value);

  if (section === 'main' || section === 'material' || section === 'sideboard') {
    return section;
  }

  return null;
}

function SectionSelector({
  onChange,
  selectedSection,
}: {
  onChange: (section: DeckSection) => void;
  selectedSection: DeckSection;
}) {
  return (
    <View style={styles.segmentedControl}>
      {deckSections.map((item) => (
        <Pressable
          key={item.section}
          onPress={() => onChange(item.section)}
          style={[
            styles.segmentButton,
            selectedSection === item.section && styles.segmentButtonActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              selectedSection === item.section && styles.segmentTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function QuantityStepper({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.panelTitle}>Quantity</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(Math.max(1, value - 1))}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(12, value + 1))}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DecisionPanel({
  captureState,
  deckWriteState,
  onAddCandidate,
  onClearDecision,
  quantity,
}: {
  captureState: CaptureState;
  deckWriteState: DeckWriteState;
  onAddCandidate: (
    candidate: ScanCandidate,
    quantity: number,
    source: ScannerDeckAddSource,
  ) => Promise<void>;
  onClearDecision: () => void;
  quantity: number;
}) {
  if (captureState.status === 'idle') {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Scan Result</Text>
        <Text style={styles.panelText}>Ready</Text>
      </View>
    );
  }

  if (captureState.status === 'capturing') {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.panelText}>Reading card text</Text>
      </View>
    );
  }

  if (captureState.status === 'failed') {
    return (
      <View style={[styles.panel, styles.warningPanel]}>
        <Text style={styles.panelTitle}>Scanner Error</Text>
        <Text style={styles.panelText}>{captureState.message}</Text>
      </View>
    );
  }

  const decision = captureState.decision;
  const primary = decision.primaryCandidate;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{formatDecisionStatus(decision)}</Text>
      {decision.targetIssue ? (
        <Text style={styles.warningText}>{decision.targetIssue}</Text>
      ) : null}
      {primary ? <CandidateSummary candidate={primary} /> : null}
      {decision.status === 'matched' && primary ? (
        <View style={styles.actionGrid}>
          <CandidateAddButton
            disabled={deckWriteState !== 'idle'}
            label="Add Once"
            onPress={() => onAddCandidate(primary, 1, 'scanner_confirmation')}
          />
          <CandidateAddButton
            disabled={deckWriteState !== 'idle'}
            label={`Add ${quantity}`}
            onPress={() =>
              onAddCandidate(primary, quantity, 'scanner_confirmation')
            }
          />
          <CandidateAddButton
            disabled={deckWriteState !== 'idle'}
            label="Add Playset"
            onPress={() => onAddCandidate(primary, 4, 'scanner_confirmation')}
          />
        </View>
      ) : null}
      {decision.status === 'needs_confirmation' ? (
        <>
          <View style={styles.candidateList}>
            {decision.candidates.map((candidate) => (
              <View key={candidate.cardUuid} style={styles.candidateRow}>
                <CandidateSummary candidate={candidate} />
                <Pressable
                  disabled={deckWriteState !== 'idle'}
                  onPress={() =>
                    onAddCandidate(candidate, quantity, 'scanner_confirmation')
                  }
                  style={[
                    styles.compactButton,
                    deckWriteState !== 'idle' && styles.disabled,
                  ]}
                >
                  <Text style={styles.compactButtonText}>Confirm</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <CandidateAddButton
            disabled={deckWriteState !== 'idle'}
            label="Skip"
            onPress={onClearDecision}
          />
        </>
      ) : null}
      {decision.status === 'no_match' ? (
        <Text style={styles.panelText}>Use local search below.</Text>
      ) : null}
      {decision.status === 'duplicate_ignored' ? (
        <Text style={styles.panelText}>
          Move card away before scanning it again.
        </Text>
      ) : null}
    </View>
  );
}

function CandidateSummary({ candidate }: { candidate: ScanCandidate }) {
  return (
    <View style={styles.candidateSummary}>
      <Text style={styles.candidateTitle}>
        {candidate.cardName ?? candidate.cardUuid}
      </Text>
      <Text style={styles.panelMeta}>
        {Math.round(candidate.confidence * 100)} percent confidence
        {candidate.setPrefix && candidate.collectorNumber
          ? ` | ${candidate.setPrefix}-${candidate.collectorNumber}`
          : ''}
      </Text>
      <Text style={styles.panelMeta}>{candidate.reason.join(', ')}</Text>
    </View>
  );
}

function CandidateAddButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.compactButton, disabled && styles.disabled]}
    >
      <Text style={styles.compactButtonText}>{label}</Text>
    </Pressable>
  );
}

function ManualSearchPanel({
  activeDeckReady,
  isLoading,
  onAddCard,
  onQueryChange,
  query,
  results,
}: {
  activeDeckReady: boolean;
  isLoading: boolean;
  onAddCard: (card: CatalogCard) => void;
  onQueryChange: (value: string) => void;
  query: string;
  results: CatalogCard[];
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Manual Search</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onQueryChange}
        placeholder="Search local catalog"
        placeholderTextColor={theme.colors.muted}
        style={styles.searchInput}
        value={query}
      />
      {query.trim().length < 2 ? (
        <Text style={styles.panelText}>Type at least two characters.</Text>
      ) : null}
      {isLoading ? <Text style={styles.panelText}>Searching</Text> : null}
      {query.trim().length >= 2 && !isLoading && results.length === 0 ? (
        <Text style={styles.panelText}>No local matches.</Text>
      ) : null}
      {results.map((card) => (
        <View key={card.uuid} style={styles.searchResultRow}>
          <View style={styles.searchResultText}>
            <Text style={styles.candidateTitle}>{card.name}</Text>
            <Text style={styles.panelMeta}>
              {[card.types.join(', '), card.classes.join(', ')]
                .filter(Boolean)
                .join(' | ')}
            </Text>
          </View>
          <Pressable
            disabled={!activeDeckReady}
            onPress={() => onAddCard(card)}
            style={[styles.compactButton, !activeDeckReady && styles.disabled]}
          >
            <Text style={styles.compactButtonText}>Add</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function RecentAddsPanel({
  recentAdds,
}: {
  recentAdds: ScannerDeckAddResult[];
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Recent Adds</Text>
      {recentAdds.length === 0 ? (
        <Text style={styles.panelText}>None</Text>
      ) : (
        recentAdds.map((entry) => (
          <View key={entry.id} style={styles.recentAddRow}>
            <Text style={styles.candidateTitle}>
              {entry.quantity} {entry.cardName ?? 'Card'}
            </Text>
            <Text style={styles.panelMeta}>
              {formatSection(entry.section)} | {formatSource(entry.source)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function ScannerDebugPanel({
  eventLog,
  state,
}: {
  eventLog: ScannerDebugEvent[];
  state: CaptureState;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Scanner Logs</Text>
      {state.status === 'complete' ? (
        <>
          <Text style={styles.ocrText}>
            {state.ocr.rawText || 'No OCR text.'}
          </Text>
          {state.resolution.ocrText.nameCandidates?.length ? (
            <Text style={styles.panelMeta}>
              Queries: {state.resolution.ocrText.nameCandidates.join(' | ')}
            </Text>
          ) : null}
        </>
      ) : null}
      {eventLog.length === 0 ? (
        <Text style={styles.panelText}>No scan events.</Text>
      ) : (
        eventLog.map((event) => (
          <View key={event.id} style={styles.logRow}>
            <Text style={styles.panelMeta}>
              {event.status} | {event.candidateCount} candidates
            </Text>
            <Text style={styles.panelMeta}>{event.reason.join(', ')}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function ScannerStateScreen({
  actionLabel,
  message,
  onAction,
  supportingText,
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  supportingText?: string;
}) {
  return (
    <View style={styles.stateScreen}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{message}</Text>
        {supportingText ? (
          <Text style={styles.panelText}>{supportingText}</Text>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function getScannerTarget(
  deckId: string,
  section: DeckSection,
  quantity: number,
  mode: ScannerMode,
): ScannerTarget {
  return {
    deckId,
    mode,
    quantity,
    section,
  };
}

function formatDecisionStatus(decision: ScannerDecision) {
  switch (decision.status) {
    case 'card_seen_hold_steady':
      return 'Hold Steady';
    case 'duplicate_ignored':
      return 'Move Card Away';
    case 'matched':
      return 'Matched';
    case 'needs_confirmation':
      return 'Needs Confirmation';
    case 'no_card_seen':
      return 'No Card Seen';
    case 'no_match':
      return 'No Match';
    case 'reading':
      return 'Reading';
    case 'too_blurry':
      return 'Too Blurry';
    case 'too_dark':
      return 'Too Dark';
  }
}

function getScannerStateLabel(captureState: CaptureState) {
  if (captureState.status === 'capturing') {
    return 'Reading';
  }

  if (captureState.status === 'idle') {
    return 'Looking';
  }

  if (captureState.status === 'failed') {
    return 'Scanner Error';
  }

  return formatDecisionStatus(captureState.decision);
}

function formatSection(section: DeckSection) {
  switch (section) {
    case 'main':
      return 'Main';
    case 'material':
      return 'Material';
    case 'sideboard':
      return 'Sideboard';
  }
}

function formatSource(source: ScannerDeckAddSource) {
  switch (source) {
    case 'manual_search':
      return 'Search';
    case 'scanner_confirmation':
      return 'Confirmed';
    case 'scanner_match':
      return 'Scanner';
  }
}

function getDeckCountLabel(cardRows: number) {
  return `${cardRows} saved rows`;
}

const styles = StyleSheet.create({
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  camera: {
    flex: 1,
  },
  cameraPanel: {
    aspectRatio: 3 / 4,
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cameraStatus: {
    backgroundColor: 'rgba(29, 37, 38, 0.82)',
    borderRadius: 8,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    top: 12,
  },
  cameraStatusText: {
    color: theme.colors.surface,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  candidateList: {
    gap: 10,
  },
  candidateRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  candidateSummary: {
    flex: 1,
    gap: 3,
  },
  candidateTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  captureRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: 14,
  },
  compactButtonText: {
    color: theme.colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  controlPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  eyebrow: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  guideFrame: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  guideInset: {
    aspectRatio: 2.5 / 3.5,
    borderColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    opacity: 0.94,
    width: '74%',
  },
  header: {
    gap: 6,
  },
  logRow: {
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 8,
  },
  ocrText: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    padding: 10,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  panelText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonActive: {
    backgroundColor: theme.colors.text,
  },
  recentAddRow: {
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 8,
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  searchInput: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchResultRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  searchResultText: {
    flex: 1,
    gap: 3,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButtonTextActive: {
    color: theme.colors.surface,
  },
  segmentedControl: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segmentButton: {
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.text,
  },
  segmentText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: theme.colors.surface,
  },
  stateScreen: {
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  stepperButtonText: {
    color: theme.colors.surface,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 26,
  },
  stepperControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  stepperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  undoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.warning,
    borderRadius: 8,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  undoButtonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  warningPanel: {
    borderColor: theme.colors.warning,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
