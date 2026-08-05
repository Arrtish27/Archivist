import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/application/AppServicesProvider';
import { CatalogCard } from '@/data/catalog/types';
import { DeckSnapshot } from '@/data/decks/DeckService';
import { DeckExportFormat } from '@/domain/deck-export/types';
import { standardConstructedRulePack } from '@/domain/validation/standard-constructed';
import {
  Deck,
  DeckCard,
  DeckSection,
  DeckValidationIssue,
} from '@/domain/validation/types';
import {
  buildSnapshotLabel,
  compareDecks,
  deckSectionMetadata,
  DeckSortMode,
  formatUpdatedAt,
  getCostLabel,
  getDeckCardTypeLine,
  getDeckSectionStats,
  getIssueFixText,
  getSectionShortTitle,
  getSectionTitle,
  getStatsLine,
  getValidationLabel,
  mapDeckToExportRows,
  resolveCardImageUri,
  resolveEdition,
  sortDeckCards,
  summarizeValidation,
} from '@/features/deck-builder/DeckBuilderModel';
import { exportService } from '@/features/export/ExportService';
import { theme } from '@/ui/theme';

type CopyState =
  | {
      status: 'idle';
    }
  | {
      message: string;
      status: 'copied' | 'failed';
    };

const sortModes: {
  label: string;
  mode: DeckSortMode;
}[] = [
  { label: 'Default', mode: 'default' },
  { label: 'Custom', mode: 'custom' },
  { label: 'Name', mode: 'name' },
  { label: 'Cost', mode: 'cost' },
  { label: 'Type', mode: 'type' },
  { label: 'Element', mode: 'element' },
  { label: 'Qty', mode: 'quantity' },
  { label: 'Recent', mode: 'recent' },
];

export function DeckBuilderHomeScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<DeckSection>('main');
  const [sortMode, setSortMode] = useState<DeckSortMode>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [deckNameDraft, setDeckNameDraft] = useState<{
    deckId: string | null;
    name: string;
  }>({
    deckId: null,
    name: '',
  });
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [copyState, setCopyState] = useState<CopyState>({ status: 'idle' });

  const catalogStatusQuery = useQuery({
    queryFn: () => services.catalog.getSyncStatus(),
    queryKey: ['catalog-status'],
  });
  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });
  const activeDeck = useMemo(
    () => selectActiveDeck(decksQuery.data ?? [], selectedDeckId),
    [decksQuery.data, selectedDeckId],
  );
  const validationIssues = useMemo(
    () => (activeDeck ? standardConstructedRulePack.validate(activeDeck) : []),
    [activeDeck],
  );
  const validationSummary = useMemo(
    () => summarizeValidation(validationIssues),
    [validationIssues],
  );
  const sectionStats = useMemo(
    () => getDeckSectionStats(activeDeck),
    [activeDeck],
  );
  const activeSectionCards = useMemo(
    () =>
      sortDeckCards(
        activeDeck?.cards.filter((card) => card.section === activeSection) ??
          [],
        activeSection,
        sortMode,
      ),
    [activeDeck, activeSection, sortMode],
  );
  const selectedDeckCard = useMemo(
    () => activeDeck?.cards.find((card) => card.id === selectedCardId) ?? null,
    [activeDeck, selectedCardId],
  );
  const deckNameValue =
    activeDeck && deckNameDraft.deckId === activeDeck.id
      ? deckNameDraft.name
      : (activeDeck?.name ?? '');

  const searchResultsQuery = useQuery({
    enabled: searchQuery.trim().length >= 2,
    queryFn: () =>
      services.catalog.searchCards({
        limit: 12,
        query: searchQuery,
      }),
    queryKey: ['deck-builder-catalog-search', searchQuery],
  });
  const cardDetailQuery = useQuery({
    enabled: Boolean(selectedDeckCard),
    queryFn: () =>
      selectedDeckCard
        ? services.catalog.getCard(selectedDeckCard.cardUuid)
        : null,
    queryKey: ['catalog-card-detail', selectedDeckCard?.cardUuid],
  });
  const snapshotsQuery = useQuery({
    enabled: Boolean(activeDeck),
    queryFn: () =>
      activeDeck ? services.decks.listSnapshots(activeDeck.id) : [],
    queryKey: ['deck-snapshots', activeDeck?.id],
  });

  const invalidateDecks = () =>
    queryClient.invalidateQueries({ queryKey: ['decks'] });
  const invalidateSnapshots = () =>
    queryClient.invalidateQueries({ queryKey: ['deck-snapshots'] });

  const createDeckMutation = useMutation({
    mutationFn: () =>
      services.decks.createDeck({
        name: `Tournament Deck ${(decksQuery.data?.length ?? 0) + 1}`,
      }),
    onSuccess: async (deck) => {
      setSelectedDeckId(deck.id);
      await invalidateDecks();
    },
  });
  const updateDeckMutation = useMutation({
    mutationFn: (input: { deckId: string; name: string }) =>
      services.decks.updateDeck(input.deckId, {
        name: input.name,
      }),
    onSuccess: invalidateDecks,
  });
  const duplicateDeckMutation = useMutation({
    mutationFn: (deck: Deck) =>
      services.decks.duplicateDeck(deck.id, `${deck.name} Copy`),
    onSuccess: async (deck) => {
      setSelectedDeckId(deck.id);
      await invalidateDecks();
    },
  });
  const archiveDeckMutation = useMutation({
    mutationFn: (deckId: string) => services.decks.archiveDeck(deckId),
    onSuccess: async (deck) => {
      if (selectedDeckId === deck.id) {
        setSelectedDeckId(null);
      }

      await invalidateDecks();
    },
  });
  const writeCardMutation = useMutation({
    mutationFn: (input: {
      cardUuid: string;
      deckId: string;
      editionUuid?: string | null;
      quantity: number;
      section: DeckSection;
    }) => services.decks.upsertDeckCard(input),
    onSuccess: invalidateDecks,
  });
  const removeCardMutation = useMutation({
    mutationFn: (deckCardId: string) =>
      services.decks.removeDeckCard(deckCardId),
    onSuccess: async () => {
      setSelectedCardId(null);
      await invalidateDecks();
    },
  });
  const moveCardMutation = useMutation({
    mutationFn: (input: { deckCardId: string; section: DeckSection }) =>
      services.decks.moveDeckCard(input.deckCardId, input.section),
    onSuccess: async () => {
      setSelectedCardId(null);
      await invalidateDecks();
    },
  });
  const createSnapshotMutation = useMutation({
    mutationFn: (input: { deck: Deck; label: string }) =>
      services.decks.createSnapshot({
        deckId: input.deck.id,
        exportText: exportService.format(
          mapDeckToExportRows(input.deck),
          'plainText',
        ),
        label: input.label,
      }),
    onSuccess: async () => {
      setSnapshotLabel('');
      await invalidateSnapshots();
    },
  });
  const restoreSnapshotMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      services.decks.restoreSnapshot(snapshotId),
    onSuccess: async (deck) => {
      setSelectedDeckId(deck.id);
      setSelectedCardId(null);
      await invalidateDecks();
    },
  });

  async function addCatalogCard(card: CatalogCard, section: DeckSection) {
    if (!activeDeck) {
      return;
    }

    const editionUuid = card.editions[0]?.uuid ?? null;
    const existing = activeDeck.cards.find(
      (deckCard) =>
        deckCard.cardUuid === card.uuid &&
        deckCard.section === section &&
        (deckCard.editionUuid ?? null) === editionUuid,
    );

    await writeCardMutation.mutateAsync({
      cardUuid: card.uuid,
      deckId: activeDeck.id,
      editionUuid,
      quantity: (existing?.quantity ?? 0) + addQuantity,
      section,
    });
  }

  async function updateQuantity(card: DeckCard, quantity: number) {
    if (!activeDeck || !card.id) {
      return;
    }

    if (quantity <= 0) {
      await removeCardMutation.mutateAsync(card.id);
      return;
    }

    await writeCardMutation.mutateAsync({
      cardUuid: card.cardUuid,
      deckId: activeDeck.id,
      editionUuid: card.editionUuid ?? null,
      quantity,
      section: card.section,
    });
  }

  async function commitQuantityDraft(card: DeckCard) {
    const key = card.id ?? card.cardUuid;
    const draft = quantityDrafts[key];

    if (draft === undefined) {
      return;
    }

    const quantity = Number(draft);
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    if (!Number.isInteger(quantity)) {
      return;
    }

    await updateQuantity(card, quantity);
  }

  async function copyExport(
    format: DeckExportFormat = 'plainText',
    section?: DeckSection,
  ) {
    if (!activeDeck) {
      return;
    }

    const text = exportService.format(
      mapDeckToExportRows(activeDeck, section),
      format,
    );

    try {
      await Clipboard.setStringAsync(text);
      setCopyState({
        message: `Copied ${countExportLines(text)} lines.`,
        status: 'copied',
      });
    } catch {
      setCopyState({
        message: 'Clipboard copy failed.',
        status: 'failed',
      });
    }
  }

  async function copySnapshot(snapshot: DeckSnapshot) {
    const exportText =
      snapshot.exportText ||
      exportService.format(mapDeckToExportRows(snapshot.deck), 'plainText');

    try {
      await Clipboard.setStringAsync(exportText);
      setCopyState({
        message: `Copied ${countExportLines(exportText)} lines from ${snapshot.label}.`,
        status: 'copied',
      });
    } catch {
      setCopyState({
        message: 'Clipboard copy failed.',
        status: 'failed',
      });
    }
  }

  function jumpToIssue(issue: DeckValidationIssue) {
    if (issue.section) {
      setActiveSection(issue.section);
    }

    if (issue.cardUuid) {
      const card = activeDeck?.cards.find(
        (deckCard) => deckCard.cardUuid === issue.cardUuid,
      );

      setSelectedCardId(card?.id ?? null);
    }
  }

  const catalogStatus = catalogStatusQuery.data?.status ?? 'idle';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="deck-builder-home"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Deck Builder</Text>
        <Text style={styles.title}>{activeDeck?.name ?? 'No active deck'}</Text>
        <Text style={styles.subtitle}>
          {activeDeck
            ? `${activeDeck.formatId} | ${formatUpdatedAt(activeDeck.updatedAt)}`
            : 'Create a local Standard deck to start.'}
        </Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill
          label="Catalog"
          tone={catalogStatus === 'ready' ? 'positive' : 'warning'}
          value={formatCatalogStatus(catalogStatus)}
        />
        <StatusPill
          label="Validation"
          tone={validationSummary.status}
          value={activeDeck ? getValidationLabel(validationSummary) : 'No deck'}
        />
        <StatusPill
          label="Decks"
          tone="neutral"
          value={String(decksQuery.data?.length ?? 0)}
        />
      </View>

      {copyState.status !== 'idle' ? (
        <Text
          style={[
            styles.copyState,
            copyState.status === 'failed' && styles.copyStateFailed,
          ]}
        >
          {copyState.message}
        </Text>
      ) : null}

      <DeckListPanel
        activeDeckId={activeDeck?.id ?? null}
        decks={decksQuery.data ?? []}
        isCreating={createDeckMutation.isPending}
        isLoading={decksQuery.isLoading}
        onArchive={(deck) => archiveDeckMutation.mutate(deck.id)}
        onCreate={() => createDeckMutation.mutate()}
        onDuplicate={(deck) => duplicateDeckMutation.mutate(deck)}
        onSelect={(deckId) => setSelectedDeckId(deckId)}
      />

      {activeDeck ? (
        <>
          <View style={styles.panel}>
            <View style={styles.editorHeader}>
              <View style={styles.editorTitleGroup}>
                <Text style={styles.panelTitle}>Deck Editor</Text>
                <Text style={styles.panelMeta}>
                  {sectionStats.material.label} | Main {sectionStats.main.label}{' '}
                  | {sectionStats.sideboard.label}
                </Text>
              </View>
              <PrimaryButton
                disabled={
                  deckNameValue.trim().length === 0 ||
                  deckNameValue.trim() === activeDeck.name ||
                  updateDeckMutation.isPending
                }
                label={updateDeckMutation.isPending ? 'Saving' : 'Save'}
                onPress={() =>
                  updateDeckMutation.mutate({
                    deckId: activeDeck.id,
                    name: deckNameValue.trim(),
                  })
                }
              />
            </View>

            <TextInput
              autoCorrect={false}
              onChangeText={(name) =>
                setDeckNameDraft({
                  deckId: activeDeck.id,
                  name,
                })
              }
              placeholder="Deck name"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              value={deckNameValue}
            />

            <SectionTabs
              activeSection={activeSection}
              onChange={setActiveSection}
              sectionStats={sectionStats}
            />

            <View style={styles.toolbar}>
              <View>
                <Text style={styles.sectionHeading}>
                  {getSectionTitle(activeSection)}
                </Text>
                <Text style={styles.panelMeta}>
                  {sectionStats[activeSection].label}
                </Text>
              </View>
              <View style={styles.toolbarActions}>
                <SecondaryButton
                  label="Scan"
                  onPress={() =>
                    router.push({
                      pathname: '/scanner',
                      params: {
                        deckId: activeDeck.id,
                        section: activeSection,
                      },
                    })
                  }
                />
                <SecondaryButton
                  label={`Copy ${getSectionShortTitle(activeSection)}`}
                  onPress={() => void copyExport('plainText', activeSection)}
                />
              </View>
            </View>

            <SortSelector onChange={setSortMode} selectedMode={sortMode} />

            <CardRows
              cards={activeSectionCards}
              issues={validationIssues}
              onCommitQuantity={(card) => void commitQuantityDraft(card)}
              onOpenCard={(card) => setSelectedCardId(card.id ?? null)}
              onQuantityDraftChange={(card, value) =>
                setQuantityDrafts((current) => ({
                  ...current,
                  [card.id ?? card.cardUuid]: value.replace(/[^0-9]/g, ''),
                }))
              }
              onQuantityStep={(card, delta) =>
                void updateQuantity(card, card.quantity + delta)
              }
              quantityDrafts={quantityDrafts}
            />
          </View>

          <SearchAddPanel
            addQuantity={addQuantity}
            isLoading={searchResultsQuery.isFetching}
            onAddCard={(card, section) => void addCatalogCard(card, section)}
            onQuantityChange={setAddQuantity}
            onQueryChange={setSearchQuery}
            query={searchQuery}
            results={searchResultsQuery.data ?? []}
          />

          <ValidationPanel
            issues={validationIssues}
            onIssuePress={jumpToIssue}
            summary={validationSummary}
          />

          <SnapshotsPanel
            activeDeck={activeDeck}
            copySnapshot={copySnapshot}
            createSnapshot={() =>
              createSnapshotMutation.mutate({
                deck: activeDeck,
                label: snapshotLabel.trim() || buildSnapshotLabel(),
              })
            }
            isCreating={createSnapshotMutation.isPending}
            isRestoring={restoreSnapshotMutation.isPending}
            label={snapshotLabel}
            onLabelChange={setSnapshotLabel}
            restoreSnapshot={(snapshot) =>
              restoreSnapshotMutation.mutate(snapshot.id)
            }
            snapshots={snapshotsQuery.data ?? []}
          />

          <View style={styles.actionBar}>
            <PrimaryButton
              label="Copy All"
              onPress={() => void copyExport('plainText')}
            />
            <SecondaryButton
              label="Export"
              onPress={() =>
                router.push({
                  pathname: '/export',
                  params: {
                    deckId: activeDeck.id,
                  },
                })
              }
            />
          </View>
        </>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.panelTitle}>No Deck Selected</Text>
          <Text style={styles.panelText}>
            Create a deck from the list above.
          </Text>
        </View>
      )}

      <CardDetailSheet
        card={selectedDeckCard}
        catalogCard={cardDetailQuery.data ?? null}
        isLoading={cardDetailQuery.isFetching}
        onClose={() => setSelectedCardId(null)}
        onDuplicate={(card) => void updateQuantity(card, card.quantity + 1)}
        onMove={(card, section) =>
          card.id
            ? moveCardMutation.mutate({
                deckCardId: card.id,
                section,
              })
            : undefined
        }
        onRemove={(card) =>
          card.id ? removeCardMutation.mutate(card.id) : undefined
        }
        onSetQuantity={(card, quantity) => void updateQuantity(card, quantity)}
        visible={Boolean(selectedDeckCard)}
      />

      <StatusBar style="dark" />
    </ScrollView>
  );
}

function DeckListPanel({
  activeDeckId,
  decks,
  isCreating,
  isLoading,
  onArchive,
  onCreate,
  onDuplicate,
  onSelect,
}: {
  activeDeckId: string | null;
  decks: Deck[];
  isCreating: boolean;
  isLoading: boolean;
  onArchive: (deck: Deck) => void;
  onCreate: () => void;
  onDuplicate: (deck: Deck) => void;
  onSelect: (deckId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Deck List</Text>
        <PrimaryButton
          disabled={isCreating}
          label={isCreating ? 'Creating' : 'New'}
          onPress={onCreate}
        />
      </View>
      {isLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {decks.length === 0 && !isLoading ? (
        <Text style={styles.panelText}>No saved decks.</Text>
      ) : null}
      {decks.map((deck) => {
        const issues = standardConstructedRulePack.validate(deck);
        const summary = summarizeValidation(issues);
        const identity = getDeckIdentity(deck);

        return (
          <Pressable
            key={deck.id}
            onPress={() => onSelect(deck.id)}
            style={[
              styles.deckRow,
              deck.id === activeDeckId && styles.deckRowActive,
            ]}
          >
            <View style={styles.identityPreview}>
              <Text style={styles.identityPreviewText}>
                {identity.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.deckRowText}>
              <Text style={styles.deckRowTitle}>{deck.name}</Text>
              <Text style={styles.panelMeta}>
                {identity} | {deck.formatId} | {formatUpdatedAt(deck.updatedAt)}
              </Text>
              <Text style={styles.panelMeta}>
                {getValidationLabel(summary)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <TinyButton label="Duplicate" onPress={() => onDuplicate(deck)} />
              <TinyButton label="Archive" onPress={() => onArchive(deck)} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionTabs({
  activeSection,
  onChange,
  sectionStats,
}: {
  activeSection: DeckSection;
  onChange: (section: DeckSection) => void;
  sectionStats: ReturnType<typeof getDeckSectionStats>;
}) {
  return (
    <View style={styles.segmentedControl}>
      {deckSectionMetadata.map((item) => (
        <Pressable
          key={item.section}
          onPress={() => onChange(item.section)}
          style={[
            styles.segmentButton,
            activeSection === item.section && styles.segmentButtonActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              activeSection === item.section && styles.segmentTextActive,
            ]}
          >
            {item.title}
          </Text>
          <Text
            style={[
              styles.segmentMeta,
              activeSection === item.section && styles.segmentTextActive,
            ]}
          >
            {sectionStats[item.section].label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SortSelector({
  onChange,
  selectedMode,
}: {
  onChange: (mode: DeckSortMode) => void;
  selectedMode: DeckSortMode;
}) {
  return (
    <View style={styles.sortWrap}>
      {sortModes.map((item) => (
        <Pressable
          key={item.mode}
          onPress={() => onChange(item.mode)}
          style={[
            styles.sortButton,
            selectedMode === item.mode && styles.sortButtonActive,
          ]}
        >
          <Text
            style={[
              styles.sortButtonText,
              selectedMode === item.mode && styles.sortButtonTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function CardRows({
  cards,
  issues,
  onCommitQuantity,
  onOpenCard,
  onQuantityDraftChange,
  onQuantityStep,
  quantityDrafts,
}: {
  cards: DeckCard[];
  issues: DeckValidationIssue[];
  onCommitQuantity: (card: DeckCard) => void;
  onOpenCard: (card: DeckCard) => void;
  onQuantityDraftChange: (card: DeckCard, value: string) => void;
  onQuantityStep: (card: DeckCard, delta: number) => void;
  quantityDrafts: Record<string, string>;
}) {
  if (cards.length === 0) {
    return <Text style={styles.panelText}>This section is empty.</Text>;
  }

  return (
    <View style={styles.cardList}>
      {cards.map((card) => {
        const key = card.id ?? card.cardUuid;
        const cardIssues = issues.filter(
          (issue) => issue.cardUuid === card.cardUuid,
        );

        return (
          <Pressable
            key={key}
            onPress={() => onOpenCard(card)}
            style={[
              styles.cardRow,
              cardIssues.some((issue) => issue.severity === 'error') &&
                styles.cardRowError,
            ]}
          >
            <View style={styles.cardRowText}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.panelMeta}>{getDeckCardTypeLine(card)}</Text>
              {cardIssues[0] ? (
                <Text style={styles.inlineIssue}>{cardIssues[0].message}</Text>
              ) : null}
            </View>
            <QuantityEditor
              onBlur={() => onCommitQuantity(card)}
              onChangeText={(value) => onQuantityDraftChange(card, value)}
              onStep={(delta) => onQuantityStep(card, delta)}
              value={quantityDrafts[key] ?? String(card.quantity)}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function QuantityEditor({
  onBlur,
  onChangeText,
  onStep,
  value,
}: {
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onStep: (delta: number) => void;
  value: string;
}) {
  return (
    <View style={styles.quantityEditor}>
      <TinyButton label="-" onPress={() => onStep(-1)} />
      <TextInput
        keyboardType="number-pad"
        onBlur={onBlur}
        onChangeText={onChangeText}
        onSubmitEditing={onBlur}
        style={styles.quantityInput}
        value={value}
      />
      <TinyButton label="+" onPress={() => onStep(1)} />
    </View>
  );
}

function SearchAddPanel({
  addQuantity,
  isLoading,
  onAddCard,
  onQuantityChange,
  onQueryChange,
  query,
  results,
}: {
  addQuantity: number;
  isLoading: boolean;
  onAddCard: (card: CatalogCard, section: DeckSection) => void;
  onQuantityChange: (quantity: number) => void;
  onQueryChange: (value: string) => void;
  query: string;
  results: CatalogCard[];
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Search Add</Text>
        <View style={styles.quantityEditor}>
          <TinyButton
            label="-"
            onPress={() => onQuantityChange(Math.max(1, addQuantity - 1))}
          />
          <Text style={styles.addQuantity}>{addQuantity}</Text>
          <TinyButton
            label="+"
            onPress={() => onQuantityChange(Math.min(99, addQuantity + 1))}
          />
        </View>
      </View>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onQueryChange}
        placeholder="Name, type, element, class, cost, or set"
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
        value={query}
      />
      {query.trim().length < 2 ? (
        <Text style={styles.panelText}>Type at least two characters.</Text>
      ) : null}
      {isLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {query.trim().length >= 2 && !isLoading && results.length === 0 ? (
        <Text style={styles.panelText}>No local matches.</Text>
      ) : null}
      {results.map((card) => (
        <View key={card.uuid} style={styles.searchResultRow}>
          <View style={styles.searchResultText}>
            <Text style={styles.cardName}>{card.name}</Text>
            <Text style={styles.panelMeta}>{getDeckCardTypeLine(card)}</Text>
            <Text style={styles.panelMeta}>{getCostLabel(card)}</Text>
          </View>
          <View style={styles.searchAddButtons}>
            {deckSectionMetadata.map((item) => (
              <TinyButton
                key={item.section}
                label={item.shortTitle}
                onPress={() => onAddCard(card, item.section)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ValidationPanel({
  issues,
  onIssuePress,
  summary,
}: {
  issues: DeckValidationIssue[];
  onIssuePress: (issue: DeckValidationIssue) => void;
  summary: ReturnType<typeof summarizeValidation>;
}) {
  const sortedIssues = [...issues].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity),
  );

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Validation</Text>
        <ValidationBadge summary={summary} />
      </View>
      {sortedIssues.length === 0 ? (
        <Text style={styles.panelText}>No construction issues.</Text>
      ) : (
        sortedIssues.map((issue) => (
          <Pressable
            key={`${issue.code}:${issue.cardUuid ?? issue.section ?? 'deck'}`}
            onPress={() => onIssuePress(issue)}
            style={styles.issueRow}
          >
            <Text
              style={[
                styles.issueSeverity,
                issue.severity === 'error' && styles.issueSeverityError,
              ]}
            >
              {issue.severity.toUpperCase()}
            </Text>
            <Text style={styles.issueMessage}>{issue.message}</Text>
            <Text style={styles.panelMeta}>{getIssueFixText(issue)}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function SnapshotsPanel({
  activeDeck,
  copySnapshot,
  createSnapshot,
  isCreating,
  isRestoring,
  label,
  onLabelChange,
  restoreSnapshot,
  snapshots,
}: {
  activeDeck: Deck;
  copySnapshot: (snapshot: DeckSnapshot) => void;
  createSnapshot: () => void;
  isCreating: boolean;
  isRestoring: boolean;
  label: string;
  onLabelChange: (value: string) => void;
  restoreSnapshot: (snapshot: DeckSnapshot) => void;
  snapshots: DeckSnapshot[];
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Snapshots</Text>
        <PrimaryButton
          disabled={isCreating}
          label={isCreating ? 'Saving' : 'Create'}
          onPress={createSnapshot}
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
      {snapshots.length === 0 ? (
        <Text style={styles.panelText}>No tournament snapshots.</Text>
      ) : null}
      {snapshots.map((snapshot) => {
        const diffs = compareDecks(snapshot.deck, activeDeck);

        return (
          <View key={snapshot.id} style={styles.snapshotRow}>
            <View style={styles.snapshotTitleRow}>
              <View style={styles.snapshotTitleGroup}>
                <Text style={styles.cardName}>{snapshot.label}</Text>
                <Text style={styles.panelMeta}>
                  {formatUpdatedAt(snapshot.createdAt)}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <TinyButton
                  label="Copy"
                  onPress={() => copySnapshot(snapshot)}
                />
                <TinyButton
                  label={isRestoring ? '...' : 'Restore'}
                  onPress={() => restoreSnapshot(snapshot)}
                />
              </View>
            </View>
            {diffs.length === 0 ? (
              <Text style={styles.panelMeta}>Matches current deck.</Text>
            ) : (
              diffs.slice(0, 4).map((diff) => (
                <Text key={diff.label} style={styles.panelMeta}>
                  {diff.label}
                </Text>
              ))
            )}
            {diffs.length > 4 ? (
              <Text style={styles.panelMeta}>
                {diffs.length - 4} more changes.
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CardDetailSheet({
  card,
  catalogCard,
  isLoading,
  onClose,
  onDuplicate,
  onMove,
  onRemove,
  onSetQuantity,
  visible,
}: {
  card: DeckCard | null;
  catalogCard: CatalogCard | null;
  isLoading: boolean;
  onClose: () => void;
  onDuplicate: (card: DeckCard) => void;
  onMove: (card: DeckCard, section: DeckSection) => void;
  onRemove: (card: DeckCard) => void;
  onSetQuantity: (card: DeckCard, quantity: number) => void;
  visible: boolean;
}) {
  const edition = resolveEdition(catalogCard, card?.editionUuid);
  const imageUri = resolveCardImageUri(
    edition?.imagePath ?? card?.editionImagePath,
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.sheet}>
          {!card ? null : (
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleGroup}>
                  <Text style={styles.sheetTitle}>{card.name}</Text>
                  <Text style={styles.panelMeta}>
                    {getSectionTitle(card.section)} | Qty {card.quantity}
                  </Text>
                </View>
                <TinyButton label="Close" onPress={onClose} />
              </View>

              {imageUri ? (
                <Image
                  contentFit="contain"
                  source={{ uri: imageUri }}
                  style={styles.cardImage}
                />
              ) : (
                <View style={styles.cardImagePlaceholder}>
                  <Text style={styles.panelMeta}>No cached image.</Text>
                </View>
              )}

              {isLoading ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : null}

              <View style={styles.detailGrid}>
                <DetailField label="Type" value={getDeckCardTypeLine(card)} />
                <DetailField label="Cost" value={getCostLabel(card)} />
                <DetailField label="Stats" value={getStatsLine(card) || '-'} />
                <DetailField
                  label="Edition"
                  value={
                    edition
                      ? `${edition.setPrefix}-${edition.collectorNumber}`
                      : card.editionSetPrefix && card.editionCollectorNumber
                        ? `${card.editionSetPrefix}-${card.editionCollectorNumber}`
                        : '-'
                  }
                />
              </View>

              {card.effectRaw ? (
                <View style={styles.effectBox}>
                  <Text style={styles.panelTitle}>Effect</Text>
                  <Text style={styles.effectText}>{card.effectRaw}</Text>
                </View>
              ) : null}

              {catalogCard?.editions.length ? (
                <View style={styles.effectBox}>
                  <Text style={styles.panelTitle}>Editions</Text>
                  {catalogCard.editions.slice(0, 6).map((item) => (
                    <Text key={item.uuid} style={styles.panelMeta}>
                      {item.setPrefix}-{item.collectorNumber} | {item.setName}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={styles.sheetActions}>
                <TinyButton
                  label="-1"
                  onPress={() => onSetQuantity(card, card.quantity - 1)}
                />
                <TinyButton
                  label="+1"
                  onPress={() => onSetQuantity(card, card.quantity + 1)}
                />
                <TinyButton
                  label="Duplicate"
                  onPress={() => onDuplicate(card)}
                />
                <TinyButton label="Remove" onPress={() => onRemove(card)} />
              </View>

              <View style={styles.moveGrid}>
                {deckSectionMetadata.map((section) => (
                  <SecondaryButton
                    disabled={card.section === section.section}
                    key={section.section}
                    label={`Move ${getSectionShortTitle(section.section)}`}
                    onPress={() => onMove(card, section.section)}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '-'}</Text>
    </View>
  );
}

function StatusPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'errors' | 'neutral' | 'positive' | 'valid' | 'warnings' | 'warning';
  value: string;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        (tone === 'warning' || tone === 'warnings') && styles.warningBorder,
        tone === 'errors' && styles.errorBorder,
        (tone === 'positive' || tone === 'valid') && styles.positiveBorder,
      ]}
    >
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function ValidationBadge({
  summary,
}: {
  summary: ReturnType<typeof summarizeValidation>;
}) {
  return (
    <View
      style={[
        styles.validationBadge,
        summary.status === 'errors' && styles.validationBadgeError,
        summary.status === 'warnings' && styles.validationBadgeWarning,
      ]}
    >
      <Text style={styles.validationBadgeText}>
        {getValidationLabel(summary)}
      </Text>
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

function selectActiveDeck(decks: Deck[], selectedDeckId: string | null) {
  return decks.find((deck) => deck.id === selectedDeckId) ?? decks[0] ?? null;
}

function getDeckIdentity(deck: Deck) {
  const champion =
    deck.cards.find(
      (card) => card.types.includes('champion') && card.level === 0,
    ) ?? deck.cards.find((card) => card.types.includes('champion'));

  return champion?.name ?? 'No champion';
}

function severityRank(severity: DeckValidationIssue['severity']) {
  switch (severity) {
    case 'error':
      return 0;
    case 'warning':
      return 1;
    case 'info':
      return 2;
  }
}

function formatCatalogStatus(status: string) {
  if (status === 'ready') {
    return 'Ready';
  }

  if (status === 'syncing') {
    return 'Syncing';
  }

  if (status === 'failed') {
    return 'Failed';
  }

  return 'Not synced';
}

function countExportLines(value: string) {
  return value.split('\n').filter((line) => line.trim().length > 0).length;
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    gap: 10,
  },
  addQuantity: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  cardImage: {
    alignSelf: 'center',
    aspectRatio: 2.5 / 3.5,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    width: '72%',
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    aspectRatio: 2.5 / 3.5,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    width: '72%',
  },
  cardList: {
    gap: 10,
  },
  cardName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  cardRow: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  cardRowError: {
    borderColor: theme.colors.danger,
  },
  cardRowText: {
    flex: 1,
    gap: 3,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 42,
  },
  copyState: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  copyStateFailed: {
    color: theme.colors.danger,
  },
  deckRow: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  deckRowActive: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
  },
  deckRowText: {
    flex: 1,
    gap: 3,
  },
  deckRowTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  detailField: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    gap: 4,
    padding: 10,
  },
  detailGrid: {
    gap: 10,
  },
  detailLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  disabled: {
    opacity: 0.5,
  },
  editorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  editorTitleGroup: {
    flex: 1,
    gap: 3,
  },
  effectBox: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    gap: 8,
    padding: 12,
  },
  effectText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  errorBorder: {
    borderColor: theme.colors.danger,
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
  identityPreview: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  identityPreviewText: {
    color: theme.colors.surface,
    fontSize: 18,
    fontWeight: '900',
  },
  inlineIssue: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
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
  issueMessage: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  issueRow: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  issueSeverity: {
    color: theme.colors.warning,
    fontSize: 11,
    fontWeight: '900',
  },
  issueSeverityError: {
    color: theme.colors.danger,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(23, 32, 38, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  moveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  positiveBorder: {
    borderColor: theme.colors.accent,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    minWidth: 82,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  quantityEditor: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quantityInput: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    height: 36,
    minWidth: 42,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  searchAddButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: 128,
  },
  searchResultRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 12,
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
    minHeight: 42,
    justifyContent: 'center',
    minWidth: 82,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeading: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
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
    gap: 3,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.text,
  },
  segmentMeta: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: theme.colors.surface,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    maxHeight: '88%',
  },
  sheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 34,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  sheetTitleGroup: {
    flex: 1,
    gap: 4,
  },
  snapshotRow: {
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  snapshotTitleGroup: {
    flex: 1,
    gap: 3,
  },
  snapshotTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sortButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  sortButtonActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  sortButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  sortButtonTextActive: {
    color: theme.colors.surface,
  },
  sortWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    fontSize: 14,
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
    minWidth: 38,
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
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  validationBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  validationBadgeError: {
    backgroundColor: theme.colors.danger,
  },
  validationBadgeText: {
    color: theme.colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  validationBadgeWarning: {
    backgroundColor: theme.colors.warning,
  },
  warningBorder: {
    borderColor: theme.colors.warning,
  },
});
