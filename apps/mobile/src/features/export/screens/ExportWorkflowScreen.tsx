import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/app/AppServicesProvider';
import { DeckSnapshot } from '@/data/decks/DeckService';
import { DeckExportFormat, DeckExportScope } from '@/domain/deck-export/types';
import { standardConstructedRulePack } from '@/domain/validation/standard-constructed';
import { Deck } from '@/domain/validation/types';
import {
  buildSnapshotLabel,
  compareDecks,
  deckSectionMetadata,
  formatUpdatedAt,
  getDeckSectionStats,
  getValidationLabel,
  mapDeckToExportRows,
  summarizeValidation,
} from '@/features/deck-builder/DeckBuilderModel';
import {
  DeckExportPayload,
  exportFormatOptions,
  exportService,
  getExportFormatMetadata,
  getScopeExportTitle,
  writeExportPayloadToCache,
} from '@/features/export/ExportService';
import { theme } from '@/ui/theme';

type ActionState =
  | {
      status: 'idle';
    }
  | {
      message: string;
      status: 'error' | 'pending' | 'success';
    };

const currentSourceId = 'current';
const exportScopes: {
  scope: DeckExportScope;
  shortLabel: string;
}[] = [
  {
    scope: 'full',
    shortLabel: 'All',
  },
  ...deckSectionMetadata.map((item) => ({
    scope: item.section,
    shortLabel: item.shortTitle,
  })),
];

export function ExportWorkflowScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams();
  const requestedDeckId = getStringRouteParam(routeParams.deckId);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(currentSourceId);
  const [format, setFormat] = useState<DeckExportFormat>('plainText');
  const [scope, setScope] = useState<DeckExportScope>('full');
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>({
    status: 'idle',
  });

  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });
  const deck = useMemo(
    () =>
      selectActiveDeck(
        decksQuery.data ?? [],
        selectedDeckId ?? requestedDeckId ?? null,
      ),
    [decksQuery.data, requestedDeckId, selectedDeckId],
  );
  const snapshotsQuery = useQuery({
    enabled: Boolean(deck),
    queryFn: () => (deck ? services.decks.listSnapshots(deck.id) : []),
    queryKey: ['deck-snapshots', deck?.id],
  });
  const snapshots = snapshotsQuery.data ?? [];
  const selectedSnapshot =
    sourceId === currentSourceId
      ? null
      : (snapshots.find((snapshot) => snapshot.id === sourceId) ?? null);
  const sourceDeck = selectedSnapshot?.deck ?? deck;
  const sectionStats = useMemo(
    () => getDeckSectionStats(sourceDeck),
    [sourceDeck],
  );
  const validationSummary = useMemo(() => {
    const issues = deck ? standardConstructedRulePack.validate(deck) : [];
    return summarizeValidation(issues);
  }, [deck]);
  const payload = useMemo(
    () =>
      sourceDeck
        ? buildPayloadForSource({
            deck: sourceDeck,
            format,
            scope,
            snapshot: selectedSnapshot,
          })
        : null,
    [format, scope, selectedSnapshot, sourceDeck],
  );

  const createSnapshotMutation = useMutation({
    mutationFn: async (input: { deck: Deck; label: string }) =>
      services.decks.createSnapshot({
        deckId: input.deck.id,
        exportText: exportService.format(
          mapDeckToExportRows(input.deck),
          'plainText',
        ),
        label: input.label,
      }),
    onSuccess: async (snapshot) => {
      setSnapshotLabel('');
      setSourceId(snapshot.id);
      await queryClient.invalidateQueries({
        queryKey: ['deck-snapshots', deck?.id],
      });
    },
  });

  async function copyPayload(nextPayload: DeckExportPayload | null = payload) {
    if (!nextPayload) {
      return;
    }

    await runExportAction(`Copied ${nextPayload.lineCount} lines.`, async () =>
      Clipboard.setStringAsync(nextPayload.text),
    );
  }

  async function shareTextPayload(
    nextPayload: DeckExportPayload | null = payload,
  ) {
    if (!nextPayload) {
      return;
    }

    await runExportAction('Opened native share sheet.', async () =>
      Share.share({
        message: nextPayload.text,
        title: nextPayload.title,
      }),
    );
  }

  async function shareFilePayload(
    nextPayload: DeckExportPayload | null = payload,
  ) {
    if (!nextPayload || !isFileExportFormat(nextPayload.format)) {
      return;
    }

    await runExportAction(`Prepared ${nextPayload.filename}.`, async () => {
      const isAvailable = await Sharing.isAvailableAsync();

      if (!isAvailable) {
        throw new Error('Native file sharing is unavailable on this device.');
      }

      const uri = await writeExportPayloadToCache(nextPayload, FileSystem);
      await Sharing.shareAsync(uri, {
        UTI: nextPayload.uti,
        dialogTitle: nextPayload.title,
        mimeType: nextPayload.mimeType,
      });
    });
  }

  async function copyScope(nextScope: DeckExportScope) {
    if (!sourceDeck) {
      return;
    }

    await copyPayload(
      buildPayloadForSource({
        deck: sourceDeck,
        format,
        scope: nextScope,
        snapshot: selectedSnapshot,
      }),
    );
  }

  async function runExportAction(
    successMessage: string,
    action: () => Promise<unknown>,
  ) {
    setActionState({
      message: 'Working...',
      status: 'pending',
    });

    try {
      await action();
      setActionState({
        message: successMessage,
        status: 'success',
      });
    } catch (error) {
      setActionState({
        message:
          error instanceof Error ? error.message : 'Export action failed.',
        status: 'error',
      });
    }
  }

  function selectDeck(deckId: string) {
    setSelectedDeckId(deckId);
    setSourceId(currentSourceId);
    setCompareBaseId(null);
    setCompareTargetId(null);
  }

  const isBusy =
    actionState.status === 'pending' || createSnapshotMutation.isPending;
  const formatMetadata = getExportFormatMetadata(format);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Export</Text>
        <Text style={styles.title}>{sourceDeck?.name ?? 'No active deck'}</Text>
        <Text style={styles.subtitle}>
          {payload
            ? `${selectedSnapshot?.label ?? 'Current Deck'} | ${getScopeExportTitle(
                payload.scope,
              )} | ${formatMetadata.label} | ${payload.lineCount} lines`
            : 'Create a local deck to export.'}
        </Text>
      </View>

      <ActionBanner state={actionState} />

      <DeckSelectorPanel
        activeDeckId={deck?.id ?? null}
        decks={decksQuery.data ?? []}
        isLoading={decksQuery.isLoading}
        onSelect={selectDeck}
      />

      {deck ? (
        <>
          <View style={styles.statusRow}>
            <StatusPill label="Material" value={sectionStats.material.label} />
            <StatusPill label="Main" value={sectionStats.main.label} />
            <StatusPill
              label="Sideboard"
              value={sectionStats.sideboard.label}
            />
          </View>

          <SourceSelectorPanel
            activeSourceId={selectedSnapshot?.id ?? currentSourceId}
            isLoading={snapshotsQuery.isFetching}
            onSelect={setSourceId}
            snapshots={snapshots}
          />

          <SnapshotCreatePanel
            currentDeck={deck}
            isCreating={createSnapshotMutation.isPending}
            label={snapshotLabel}
            onCreate={(currentDeck) =>
              createSnapshotMutation.mutate({
                deck: currentDeck,
                label: snapshotLabel.trim() || buildSnapshotLabel(),
              })
            }
            onLabelChange={setSnapshotLabel}
            validationLabel={getValidationLabel(validationSummary)}
          />

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleGroup}>
                <Text style={styles.panelTitle}>Export Format</Text>
                <Text style={styles.panelMeta}>{payload?.filename ?? '-'}</Text>
              </View>
            </View>

            <ChoiceGrid>
              {exportFormatOptions.map((option) => (
                <ChoiceButton
                  active={format === option.format}
                  key={option.format}
                  label={option.label}
                  onPress={() => setFormat(option.format)}
                />
              ))}
            </ChoiceGrid>

            <Text style={styles.sectionHeading}>Export Scope</Text>
            <ChoiceGrid>
              {exportScopes.map((item) => (
                <ChoiceButton
                  active={scope === item.scope}
                  key={item.scope}
                  label={item.shortLabel}
                  onPress={() => setScope(item.scope)}
                  value={getScopeValue(item.scope, sectionStats)}
                />
              ))}
            </ChoiceGrid>

            <View style={styles.actionGrid}>
              <PrimaryButton
                disabled={!payload?.text || isBusy}
                label="Copy"
                onPress={() => void copyPayload()}
              />
              <SecondaryButton
                disabled={!payload?.text || isBusy}
                label="Share Text"
                onPress={() => void shareTextPayload()}
              />
              <SecondaryButton
                disabled={
                  !payload?.text || !isFileExportFormat(format) || isBusy
                }
                label="Export File"
                onPress={() => void shareFilePayload()}
              />
            </View>

            <View style={styles.quickCopyGrid}>
              {exportScopes.map((item) => (
                <TinyButton
                  key={item.scope}
                  label={`Copy ${item.shortLabel}`}
                  onPress={() => void copyScope(item.scope)}
                />
              ))}
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Preview</Text>
              <Text style={styles.panelMeta}>
                {payload ? `${payload.mimeType} | ${payload.lineCount}` : '-'}
              </Text>
            </View>
            <Text style={styles.exportText}>
              {payload?.text || 'Add cards to this deck to preview exports.'}
            </Text>
          </View>

          <SnapshotComparePanel
            activeDeck={deck}
            compareBaseId={compareBaseId}
            compareTargetId={compareTargetId}
            onBaseChange={setCompareBaseId}
            onTargetChange={setCompareTargetId}
            selectedSnapshot={selectedSnapshot}
            snapshots={snapshots}
          />
        </>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.panelTitle}>No Deck Selected</Text>
          <Text style={styles.panelText}>
            Create a deck from the workspace.
          </Text>
        </View>
      )}

      <StatusBar style="dark" />
    </ScrollView>
  );
}

function DeckSelectorPanel({
  activeDeckId,
  decks,
  isLoading,
  onSelect,
}: {
  activeDeckId: string | null;
  decks: Deck[];
  isLoading: boolean;
  onSelect: (deckId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Deck</Text>
        {isLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      </View>
      {decks.length === 0 && !isLoading ? (
        <Text style={styles.panelText}>No saved decks.</Text>
      ) : null}
      <ChoiceGrid>
        {decks.map((deck) => (
          <ChoiceButton
            active={deck.id === activeDeckId}
            key={deck.id}
            label={deck.name}
            onPress={() => onSelect(deck.id)}
            value={formatUpdatedAt(deck.updatedAt)}
          />
        ))}
      </ChoiceGrid>
    </View>
  );
}

function SourceSelectorPanel({
  activeSourceId,
  isLoading,
  onSelect,
  snapshots,
}: {
  activeSourceId: string;
  isLoading: boolean;
  onSelect: (sourceId: string) => void;
  snapshots: DeckSnapshot[];
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Export Source</Text>
        {isLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      </View>
      <ChoiceGrid>
        <ChoiceButton
          active={activeSourceId === currentSourceId}
          label="Current Deck"
          onPress={() => onSelect(currentSourceId)}
          value="live"
        />
        {snapshots.map((snapshot) => (
          <ChoiceButton
            active={activeSourceId === snapshot.id}
            key={snapshot.id}
            label={snapshot.label}
            onPress={() => onSelect(snapshot.id)}
            value={formatUpdatedAt(snapshot.createdAt)}
          />
        ))}
      </ChoiceGrid>
    </View>
  );
}

function SnapshotCreatePanel({
  currentDeck,
  isCreating,
  label,
  onCreate,
  onLabelChange,
  validationLabel,
}: {
  currentDeck: Deck;
  isCreating: boolean;
  label: string;
  onCreate: (deck: Deck) => void;
  onLabelChange: (value: string) => void;
  validationLabel: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleGroup}>
          <Text style={styles.panelTitle}>Tournament Snapshot</Text>
          <Text style={styles.panelMeta}>Validation {validationLabel}</Text>
        </View>
        <PrimaryButton
          disabled={isCreating}
          label={isCreating ? 'Saving' : 'Create'}
          onPress={() => onCreate(currentDeck)}
        />
      </View>
      <TextInput
        autoCorrect={false}
        onChangeText={onLabelChange}
        placeholder={buildSnapshotLabel()}
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
        value={label}
      />
    </View>
  );
}

function SnapshotComparePanel({
  activeDeck,
  compareBaseId,
  compareTargetId,
  onBaseChange,
  onTargetChange,
  selectedSnapshot,
  snapshots,
}: {
  activeDeck: Deck;
  compareBaseId: string | null;
  compareTargetId: string | null;
  onBaseChange: (snapshotId: string) => void;
  onTargetChange: (snapshotId: string) => void;
  selectedSnapshot: DeckSnapshot | null;
  snapshots: DeckSnapshot[];
}) {
  const baseSnapshot =
    snapshots.find((snapshot) => snapshot.id === compareBaseId) ??
    snapshots[0] ??
    null;
  const targetSnapshot =
    snapshots.find(
      (snapshot) =>
        snapshot.id === compareTargetId && snapshot.id !== baseSnapshot?.id,
    ) ??
    snapshots.find((snapshot) => snapshot.id !== baseSnapshot?.id) ??
    null;
  const currentDiffs = selectedSnapshot
    ? compareDecks(selectedSnapshot.deck, activeDeck)
    : [];
  const snapshotDiffs =
    baseSnapshot && targetSnapshot
      ? compareDecks(baseSnapshot.deck, targetSnapshot.deck)
      : [];

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Compare</Text>

      {selectedSnapshot ? (
        <View style={styles.compareBlock}>
          <Text style={styles.sectionHeading}>Current vs Snapshot</Text>
          <Text style={styles.panelMeta}>{selectedSnapshot.label}</Text>
          <DiffList diffs={currentDiffs} emptyLabel="Matches current deck." />
        </View>
      ) : (
        <Text style={styles.panelText}>
          Select a snapshot source to compare.
        </Text>
      )}

      {snapshots.length >= 2 ? (
        <View style={styles.compareBlock}>
          <Text style={styles.sectionHeading}>Snapshot vs Snapshot</Text>
          <Text style={styles.panelMeta}>
            {baseSnapshot?.label ?? '-'} to {targetSnapshot?.label ?? '-'}
          </Text>
          <Text style={styles.choiceLabel}>Base</Text>
          <ChoiceGrid>
            {snapshots.map((snapshot) => (
              <ChoiceButton
                active={snapshot.id === baseSnapshot?.id}
                key={snapshot.id}
                label={snapshot.label}
                onPress={() => onBaseChange(snapshot.id)}
                value={formatUpdatedAt(snapshot.createdAt)}
              />
            ))}
          </ChoiceGrid>
          <Text style={styles.choiceLabel}>Target</Text>
          <ChoiceGrid>
            {snapshots.map((snapshot) => (
              <ChoiceButton
                active={snapshot.id === targetSnapshot?.id}
                disabled={snapshot.id === baseSnapshot?.id}
                key={snapshot.id}
                label={snapshot.label}
                onPress={() => onTargetChange(snapshot.id)}
                value={formatUpdatedAt(snapshot.createdAt)}
              />
            ))}
          </ChoiceGrid>
          <DiffList diffs={snapshotDiffs} emptyLabel="Snapshots match." />
        </View>
      ) : null}
    </View>
  );
}

function DiffList({
  diffs,
  emptyLabel,
}: {
  diffs: ReturnType<typeof compareDecks>;
  emptyLabel: string;
}) {
  if (diffs.length === 0) {
    return <Text style={styles.panelMeta}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.diffList}>
      {diffs.map((diff, index) => (
        <Text key={`${diff.label}:${index}`} style={styles.diffText}>
          {diff.label}
        </Text>
      ))}
    </View>
  );
}

function ActionBanner({ state }: { state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }

  return (
    <Text
      style={[
        styles.actionBanner,
        state.status === 'error' && styles.actionBannerError,
      ]}
    >
      {state.message}
    </Text>
  );
}

function ChoiceGrid({ children }: { children: ReactNode }) {
  return <View style={styles.choiceGrid}>{children}</View>;
}

function ChoiceButton({
  active,
  disabled,
  label,
  onPress,
  value,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choiceButton,
        active && styles.choiceButtonActive,
        disabled && styles.disabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.choiceButtonText,
          active && styles.choiceButtonTextActive,
        ]}
      >
        {label}
      </Text>
      {value ? (
        <Text
          numberOfLines={1}
          style={[
            styles.choiceButtonMeta,
            active && styles.choiceButtonTextActive,
          ]}
        >
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabled]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.secondaryButton, disabled && styles.disabled]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function TinyButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tinyButton}>
      <Text style={styles.tinyButtonText}>{label}</Text>
    </Pressable>
  );
}

function buildPayloadForSource({
  deck,
  format,
  scope,
  snapshot,
}: {
  deck: Deck;
  format: DeckExportFormat;
  scope: DeckExportScope;
  snapshot: DeckSnapshot | null;
}) {
  return exportService.buildPayload({
    deckName: deck.name,
    format,
    rows: mapDeckToExportRows(deck, scope === 'full' ? undefined : scope),
    scope,
    sourceLabel: snapshot?.label,
  });
}

function getScopeValue(
  scope: DeckExportScope,
  sectionStats: ReturnType<typeof getDeckSectionStats>,
) {
  if (scope === 'full') {
    return String(
      sectionStats.material.count +
        sectionStats.main.count +
        sectionStats.sideboard.count,
    );
  }

  return sectionStats[scope].label;
}

function selectActiveDeck(decks: Deck[], deckId: string | null) {
  return decks.find((deck) => deck.id === deckId) ?? decks[0] ?? null;
}

function getStringRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isFileExportFormat(format: DeckExportFormat) {
  return format === 'csv' || format === 'json';
}

const styles = StyleSheet.create({
  actionBanner: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionBannerError: {
    color: theme.colors.danger,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  choiceButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 48,
    justifyContent: 'center',
    minWidth: 112,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceButtonActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  choiceButtonMeta: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  choiceButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  choiceButtonTextActive: {
    color: theme.colors.surface,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compareBlock: {
    gap: 8,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  diffList: {
    gap: 5,
  },
  diffText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.5,
  },
  emptyPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  exportText: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 160,
    padding: 12,
  },
  eyebrow: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  header: {
    gap: 6,
  },
  input: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  panelText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  panelTitleGroup: {
    flex: 1,
    gap: 3,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  quickCopyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeading: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  statusLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusPill: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  tinyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    minHeight: 34,
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 10,
  },
  tinyButtonText: {
    color: theme.colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
});
