import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/app/AppServicesProvider';
import { CatalogCard } from '@/data/catalog/types';
import { getSectionCountLabel } from '../../../domain/validation/section-counts';
import { Deck, DeckSection } from '../../../domain/validation/types';
import { theme } from '../../../ui/theme';

const sectionMetadata: {
  section: DeckSection;
  title: string;
}[] = [
  {
    section: 'material',
    title: 'Material',
  },
  {
    section: 'main',
    title: 'Main',
  },
  {
    section: 'sideboard',
    title: 'Sideboard',
  },
];

export function DeckBuilderHomeScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  const catalogStatusQuery = useQuery({
    queryFn: () => services.catalog.getSyncStatus(),
    queryKey: ['catalog-status'],
  });
  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });
  const searchResultsQuery = useQuery({
    enabled: searchQuery.trim().length >= 2,
    queryFn: () =>
      services.catalog.searchCards({
        limit: 5,
        query: searchQuery,
      }),
    queryKey: ['catalog-search', searchQuery],
  });
  const createDeckMutation = useMutation({
    mutationFn: () =>
      services.decks.createDeck({
        name: `Tournament Deck ${(decksQuery.data?.length ?? 0) + 1}`,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });
  const activeDeck = decksQuery.data?.[0] ?? null;
  const sectionCounts = useMemo(
    () => getDeckSectionCounts(activeDeck),
    [activeDeck],
  );
  const catalogStatus = catalogStatusQuery.data?.status ?? 'idle';
  const catalogTone =
    catalogStatus === 'ready'
      ? 'positive'
      : catalogStatus === 'failed'
        ? 'danger'
        : 'warning';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="deck-builder-home"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Local deck workspace</Text>
        <Text style={styles.title}>{activeDeck?.name ?? 'No deck yet'}</Text>
        <Text style={styles.subtitle}>
          {activeDeck?.formatId ?? 'Standard Constructed'}
        </Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill
          label="Catalog"
          value={formatCatalogStatus(catalogStatus)}
          tone={catalogTone}
        />
        <StatusPill
          label="Decks"
          value={String(decksQuery.data?.length ?? 0)}
          tone="neutral"
        />
      </View>

      {!activeDeck ? (
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

      <View style={styles.sectionList}>
        {sectionMetadata.map((item) => (
          <View key={item.section} style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <Text style={styles.sectionMeta}>
                {getSectionHelper(item.section, sectionCounts)}
              </Text>
            </View>
            <Text style={styles.sectionCount}>
              {getSectionCountLabel(item.section, sectionCounts[item.section])}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.searchPanel}>
        <Text style={styles.panelTitle}>Offline Catalog Search</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchQuery}
          placeholder="Search local card catalog"
          placeholderTextColor={theme.colors.muted}
          style={styles.searchInput}
          value={searchQuery}
        />
        <SearchResults
          isLoading={searchResultsQuery.isFetching}
          query={searchQuery}
          results={searchResultsQuery.data ?? []}
        />
      </View>

      <View style={styles.actionBar}>
        <ActionButton label="Scan" onPress={() => router.push('/scanner')} />
        <ActionButton label="Export" onPress={() => router.push('/export')} />
        <ActionButton
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </View>

      <StatusBar style="dark" />
    </ScrollView>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'danger' | 'neutral' | 'positive' | 'warning';
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === 'warning' && styles.statusPillWarning,
        tone === 'positive' && styles.statusPillPositive,
        tone === 'danger' && styles.statusPillDanger,
      ]}
    >
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionButton}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function SearchResults({
  isLoading,
  query,
  results,
}: {
  isLoading: boolean;
  query: string;
  results: CatalogCard[];
}) {
  if (query.trim().length < 2) {
    return <Text style={styles.emptyText}>Type at least two characters.</Text>;
  }

  if (isLoading) {
    return <Text style={styles.emptyText}>Searching local catalog.</Text>;
  }

  if (results.length === 0) {
    return <Text style={styles.emptyText}>No local matches yet.</Text>;
  }

  return (
    <View style={styles.searchResults}>
      {results.map((card) => (
        <View key={card.uuid} style={styles.searchResultRow}>
          <Text style={styles.searchResultTitle}>{card.name}</Text>
          <Text style={styles.searchResultMeta}>
            {[card.types.join(', '), card.classes.join(', ')]
              .filter(Boolean)
              .join(' | ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getDeckSectionCounts(deck: Deck | null): Record<DeckSection, number> {
  return {
    main: countDeckCards(deck, 'main'),
    material: countDeckCards(deck, 'material'),
    sideboard: countDeckCards(deck, 'sideboard'),
  };
}

function countDeckCards(deck: Deck | null, section: DeckSection) {
  return (
    deck?.cards
      .filter((card) => card.section === section)
      .reduce((total, card) => total + card.quantity, 0) ?? 0
  );
}

function getSectionHelper(
  section: DeckSection,
  counts: Record<DeckSection, number>,
) {
  if (section === 'material') {
    return `${counts.material}/12`;
  }

  if (section === 'main') {
    return `${counts.main}/60`;
  }

  return `${counts.sideboard}/15 cards`;
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

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  actionText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 40,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  eyebrow: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  header: {
    gap: 6,
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
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  sectionCount: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionList: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectionMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  sectionRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
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
  searchPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  searchResultMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  searchResultRow: {
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  searchResultTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  searchResults: {
    marginTop: 2,
  },
  statusLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusPill: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 14,
  },
  statusPillWarning: {
    borderColor: theme.colors.warning,
  },
  statusPillDanger: {
    borderColor: theme.colors.danger,
  },
  statusPillPositive: {
    borderColor: theme.colors.accent,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
});
