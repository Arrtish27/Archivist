import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useAppServices } from '@/app/AppServicesProvider';
import { mapDeckToExportRows } from '@/features/deck-builder/DeckBuilderModel';
import { exportService } from '@/features/export/ExportService';
import { theme } from '@/ui/theme';

export function ExportWorkflowScreen() {
  const services = useAppServices();
  const routeParams = useLocalSearchParams();
  const requestedDeckId = getStringRouteParam(routeParams.deckId);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const decksQuery = useQuery({
    queryFn: () => services.decks.listDecks(),
    queryKey: ['decks'],
  });
  const deck =
    (requestedDeckId
      ? decksQuery.data?.find((item) => item.id === requestedDeckId)
      : decksQuery.data?.[0]) ?? null;
  const rows = useMemo(() => mapDeckToExportRows(deck), [deck]);
  const exportText = useMemo(
    () => exportService.format(rows, 'plainText'),
    [rows],
  );

  async function copyExport() {
    try {
      await Clipboard.setStringAsync(exportText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Local export workflow</Text>
        <Text style={styles.title}>{deck?.name ?? 'No active deck'}</Text>
        <Text style={styles.subtitle}>
          Clipboard export runs locally and does not require an account.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Plain Text Preview</Text>
        <Text style={styles.exportText}>
          {exportText || 'Create a deck and add cards to preview export text.'}
        </Text>
      </View>

      <Pressable
        disabled={!exportText}
        onPress={copyExport}
        style={[styles.primaryButton, !exportText && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>Copy Export Text</Text>
      </Pressable>

      {copyState !== 'idle' ? (
        <Text
          style={[
            styles.copyStatus,
            copyState === 'failed' && styles.copyStatusError,
          ]}
        >
          {copyState === 'copied'
            ? 'Copied to clipboard.'
            : 'Clipboard copy failed.'}
        </Text>
      ) : null}

      <StatusBar style="dark" />
    </ScrollView>
  );
}

function getStringRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  copyStatus: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  copyStatusError: {
    color: theme.colors.danger,
  },
  disabledButton: {
    opacity: 0.55,
  },
  exportText: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 120,
    padding: 12,
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
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
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
  subtitle: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
});
