import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/application/AppServicesProvider';
import { Deck } from '@/domain/validation/types';
import { DeckListPanel } from '@/features/deck-builder/screens/DeckBuilderHomeScreen';
import { theme } from '@/ui/theme';

export function DeckListScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();

  const catalogStatusQuery = useQuery({
    queryFn: () => services.catalog.getSyncStatus(),
    queryKey: ['catalog-status'],
  });
  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });

  const invalidateDecks = () =>
    queryClient.invalidateQueries({ queryKey: ['decks'] });

  const createDeckMutation = useMutation({
    mutationFn: () =>
      services.decks.createDeck({
        name: `Tournament Deck ${(decksQuery.data?.length ?? 0) + 1}`,
      }),
    onSuccess: async (deck) => {
      await invalidateDecks();
      router.push({
        pathname: '/decks/[deckId]',
        params: {
          deckId: deck.id,
        },
      });
    },
  });
  const duplicateDeckMutation = useMutation({
    mutationFn: (deck: Deck) =>
      services.decks.duplicateDeck(deck.id, `${deck.name} Copy`),
    onSuccess: async (deck) => {
      await invalidateDecks();
      router.push({
        pathname: '/decks/[deckId]',
        params: {
          deckId: deck.id,
        },
      });
    },
  });
  const archiveDeckMutation = useMutation({
    mutationFn: (deckId: string) => services.decks.archiveDeck(deckId),
    onSuccess: invalidateDecks,
  });

  const catalogStatus = catalogStatusQuery.data?.status ?? 'idle';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="deck-list"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Deck Workspace</Text>
        <Text style={styles.title}>Decks</Text>
        <Text style={styles.subtitle}>
          Select a saved deck or create a local Standard deck.
        </Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill
          label="Catalog"
          tone={catalogStatus === 'ready' ? 'positive' : 'warning'}
          value={formatCatalogStatus(catalogStatus)}
        />
        <StatusPill
          label="Decks"
          tone="neutral"
          value={String(decksQuery.data?.length ?? 0)}
        />
      </View>

      <DeckListPanel
        activeDeckId={null}
        decks={decksQuery.data ?? []}
        isCreating={createDeckMutation.isPending}
        isLoading={decksQuery.isLoading}
        onArchive={(deck) => archiveDeckMutation.mutate(deck.id)}
        onCreate={() => createDeckMutation.mutate()}
        onDuplicate={(deck) => duplicateDeckMutation.mutate(deck)}
        onSelect={(deckId) =>
          router.push({
            pathname: '/decks/[deckId]',
            params: {
              deckId,
            },
          })
        }
      />

      <View style={styles.actionBar}>
        <SecondaryButton
          label="Scanner"
          onPress={() => router.push('/scanner')}
        />
        <SecondaryButton
          label="Export"
          onPress={() => router.push('/export')}
        />
        <SecondaryButton
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
  tone,
  value,
}: {
  label: string;
  tone: 'neutral' | 'positive' | 'warning';
  value: string;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === 'positive' && styles.positiveBorder,
        tone === 'warning' && styles.warningBorder,
      ]}
    >
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
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
    flexWrap: 'wrap',
    gap: 8,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 42,
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
  positiveBorder: {
    borderColor: theme.colors.accent,
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
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 88,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
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
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  warningBorder: {
    borderColor: theme.colors.warning,
  },
});
