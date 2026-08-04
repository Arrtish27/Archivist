import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/app/AppServicesProvider';
import { featureFlags } from '@/features/settings/featureFlags';
import { theme } from '@/ui/theme';

export function SettingsDiagnosticsScreen() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const catalogStatusQuery = useQuery({
    queryFn: () => services.catalog.getSyncStatus(),
    queryKey: ['catalog-status'],
  });
  const syncMutation = useMutation({
    mutationFn: () =>
      services.catalog.sync({
        maxPages: 1,
        pageSize: 25,
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['catalog-status'] }),
  });
  const status = catalogStatusQuery.data;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Diagnostics</Text>
        <Text style={styles.title}>Local Stack</Text>
      </View>

      <View style={styles.panel}>
        <SettingsRow label="Catalog" value={status?.status ?? 'loading'} />
        <SettingsRow
          label="Cards"
          value={String(status?.syncedCardCount ?? 0)}
        />
        <SettingsRow
          label="Editions"
          value={String(status?.syncedEditionCount ?? 0)}
        />
        <SettingsRow
          label="Last Sync"
          value={status?.lastSuccessfulSyncAt ?? 'never'}
        />
        <SettingsRow
          label="Collection"
          value={featureFlags.collectionMode ? 'enabled' : 'deferred'}
        />
        <SettingsRow
          label="Cloud Sync"
          value={featureFlags.cloudSync ? 'enabled' : 'deferred'}
        />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          disabled={syncMutation.isPending}
          onPress={() => syncMutation.mutate()}
          style={[
            styles.primaryButton,
            syncMutation.isPending && styles.disabledButton,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {syncMutation.isPending ? 'Syncing' : 'Sync One Page'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            queryClient.invalidateQueries({ queryKey: ['catalog-status'] })
          }
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {syncMutation.data?.status === 'failed' ? (
        <Text style={styles.errorText}>{syncMutation.data.error}</Text>
      ) : null}

      <StatusBar style="dark" />
    </ScrollView>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  disabledButton: {
    opacity: 0.55,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
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
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowLabel: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  rowValue: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
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
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
});
