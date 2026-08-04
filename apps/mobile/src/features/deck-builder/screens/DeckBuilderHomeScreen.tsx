import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSectionCountLabel } from '../../../domain/validation/section-counts';
import { DeckSection } from '../../../domain/validation/types';
import { theme } from '../../../ui/theme';

const sections: {
  section: DeckSection;
  title: string;
  count: number;
  helper: string;
}[] = [
  {
    section: 'material',
    title: 'Material',
    count: 0,
    helper: '0/12',
  },
  {
    section: 'main',
    title: 'Main',
    count: 0,
    helper: '0/60',
  },
  {
    section: 'sideboard',
    title: 'Sideboard',
    count: 0,
    helper: '0/15 cards, 0/15 points',
  },
];

export function DeckBuilderHomeScreen() {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="deck-builder-home"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Local deck workspace</Text>
        <Text style={styles.title}>Tournament Deck</Text>
        <Text style={styles.subtitle}>Standard Constructed</Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill label="Catalog" value="Not synced" tone="warning" />
        <StatusPill label="Validation" value="Draft" tone="neutral" />
      </View>

      <View style={styles.sectionList}>
        {sections.map((item) => (
          <View key={item.section} style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <Text style={styles.sectionMeta}>{item.helper}</Text>
            </View>
            <Text style={styles.sectionCount}>
              {getSectionCountLabel(item.section, item.count)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.actionBar}>
        <Text style={styles.actionText}>Search</Text>
        <Text style={styles.actionText}>Scan</Text>
        <Text style={styles.actionText}>Export</Text>
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
  tone: 'neutral' | 'warning';
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === 'warning' && styles.statusPillWarning,
      ]}
    >
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
  eyebrow: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  header: {
    gap: 6,
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
