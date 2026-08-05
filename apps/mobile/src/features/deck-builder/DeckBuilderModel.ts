import { CatalogCard, CatalogEdition } from '@/data/catalog/types';
import { syncConfig } from '@/data/sync/config';
import { DeckExportRow } from '@/domain/deck-export/types';
import {
  Deck,
  DeckCard,
  DeckSection,
  DeckValidationIssue,
  RuleSeverity,
} from '@/domain/validation/types';

export type DeckSortMode =
  | 'cost'
  | 'custom'
  | 'default'
  | 'element'
  | 'name'
  | 'quantity'
  | 'recent'
  | 'type';

export type SectionStats = {
  count: number;
  label: string;
  points?: number;
};

export type ValidationSummary = {
  errors: number;
  infos: number;
  status: 'errors' | 'valid' | 'warnings';
  warnings: number;
};

export type DeckSnapshotDiff = {
  cardName?: string;
  fromSection?: DeckSection;
  label: string;
  quantity?: number;
  section?: DeckSection;
  toSection?: DeckSection;
  type: 'added' | 'changed' | 'moved' | 'removed';
};

export const deckSectionOrder: DeckSection[] = [
  'material',
  'main',
  'sideboard',
];

export const DEFAULT_DECK_SECTION: DeckSection = 'material';

export const deckSectionMetadata: {
  section: DeckSection;
  shortTitle: string;
  title: string;
}[] = [
  {
    section: 'material',
    shortTitle: 'Mat',
    title: 'Material',
  },
  {
    section: 'main',
    shortTitle: 'Main',
    title: 'Main',
  },
  {
    section: 'sideboard',
    shortTitle: 'Side',
    title: 'Sideboard',
  },
];

const typeSortOrder = [
  'champion',
  'regalia',
  'domain',
  'ally',
  'attack',
  'action',
  'item',
  'weapon',
];

export function getDeckSectionStats(
  deck: Deck | null,
): Record<DeckSection, SectionStats> {
  const materialCount = countSection(deck, 'material');
  const mainCount = countSection(deck, 'main');
  const sideboardCount = countSection(deck, 'sideboard');
  const sideboardPoints = getSideboardPoints(
    deck?.cards.filter((card) => card.section === 'sideboard') ?? [],
  );

  return {
    main: {
      count: mainCount,
      label: String(mainCount),
    },
    material: {
      count: materialCount,
      label: `${materialCount}/12`,
    },
    sideboard: {
      count: sideboardCount,
      label: `${sideboardCount}/15 cards, ${sideboardPoints}/15 points`,
      points: sideboardPoints,
    },
  };
}

export function getSideboardPoints(cards: DeckCard[]) {
  return cards.reduce(
    (total, card) => total + getSideboardPointValue(card) * card.quantity,
    0,
  );
}

export function getSideboardPointValue(card: DeckCard) {
  return isMaterialCard(card) ? 3 : 1;
}

export function summarizeValidation(
  issues: DeckValidationIssue[],
): ValidationSummary {
  const errors = countSeverity(issues, 'error');
  const warnings = countSeverity(issues, 'warning');
  const infos = countSeverity(issues, 'info');

  return {
    errors,
    infos,
    status: errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : 'valid',
    warnings,
  };
}

export function getValidationLabel(summary: ValidationSummary) {
  if (summary.errors > 0) {
    return `${summary.errors} errors`;
  }

  if (summary.warnings > 0) {
    return `${summary.warnings} warnings`;
  }

  return 'Valid';
}

export function sortDeckCards(
  cards: DeckCard[],
  section: DeckSection,
  mode: DeckSortMode,
) {
  return [...cards].sort((left, right) => {
    switch (mode) {
      case 'cost':
        return compareCost(left, right) || compareName(left, right);
      case 'custom':
        return compareCustom(left, right) || compareName(left, right);
      case 'element':
        return (
          compareString(
            firstFacet(left.elements),
            firstFacet(right.elements),
          ) || compareName(left, right)
        );
      case 'name':
        return compareName(left, right);
      case 'quantity':
        return right.quantity - left.quantity || compareName(left, right);
      case 'recent':
        return compareRecent(left, right) || compareName(left, right);
      case 'type':
        return compareType(left, right) || compareName(left, right);
      case 'default':
        return compareDefault(left, right, section);
    }
  });
}

export function mapDeckToExportRows(
  deck: Deck | null,
  section?: DeckSection,
): DeckExportRow[] {
  const cards = section
    ? deck?.cards.filter((card) => card.section === section)
    : deck?.cards;

  return deckSectionOrder.flatMap((currentSection) =>
    sortDeckCards(
      cards?.filter((card) => card.section === currentSection) ?? [],
      currentSection,
      'default',
    ).map((card) => ({
      cardName: card.name,
      collectorNumber: card.editionCollectorNumber ?? undefined,
      quantity: card.quantity,
      section: card.section,
      setPrefix: card.editionSetPrefix ?? undefined,
    })),
  );
}

export function compareDecks(
  snapshotDeck: Deck,
  currentDeck: Deck | null,
): DeckSnapshotDiff[] {
  if (!currentDeck) {
    return [];
  }

  const snapshotCards = groupCardsForCompare(snapshotDeck.cards);
  const currentCards = groupCardsForCompare(currentDeck.cards);
  const keys = new Set([...snapshotCards.keys(), ...currentCards.keys()]);
  const diffs: DeckSnapshotDiff[] = [];

  for (const key of keys) {
    const before = snapshotCards.get(key);
    const after = currentCards.get(key);

    if (!before && after?.total) {
      for (const section of deckSectionOrder) {
        const quantity = after.sections.get(section) ?? 0;

        if (quantity > 0) {
          diffs.push({
            cardName: after.name,
            label: `+${quantity} ${after.name} in ${getSectionTitle(section)}`,
            quantity,
            section,
            type: 'added',
          });
        }
      }
      continue;
    }

    if (before?.total && !after) {
      for (const section of deckSectionOrder) {
        const quantity = before.sections.get(section) ?? 0;

        if (quantity > 0) {
          diffs.push({
            cardName: before.name,
            label: `-${quantity} ${before.name} from ${getSectionTitle(section)}`,
            quantity,
            section,
            type: 'removed',
          });
        }
      }
      continue;
    }

    if (!before || !after) {
      continue;
    }

    const deltas = new Map<DeckSection, number>();

    for (const section of deckSectionOrder) {
      const delta =
        (after.sections.get(section) ?? 0) -
        (before.sections.get(section) ?? 0);

      if (delta !== 0) {
        deltas.set(section, delta);
      }
    }

    const removedSections = deckSectionOrder.filter(
      (section) => (deltas.get(section) ?? 0) < 0,
    );
    const addedSections = deckSectionOrder.filter(
      (section) => (deltas.get(section) ?? 0) > 0,
    );

    for (const fromSection of removedSections) {
      for (const toSection of addedSections) {
        const removedQuantity = Math.abs(deltas.get(fromSection) ?? 0);
        const addedQuantity = deltas.get(toSection) ?? 0;
        const movedQuantity = Math.min(removedQuantity, addedQuantity);

        if (movedQuantity <= 0) {
          continue;
        }

        deltas.set(fromSection, (deltas.get(fromSection) ?? 0) + movedQuantity);
        deltas.set(toSection, (deltas.get(toSection) ?? 0) - movedQuantity);
        diffs.push({
          cardName: after.name,
          fromSection,
          label: `${formatCompareQuantity(movedQuantity)}${after.name} moved ${getSectionTitle(
            fromSection,
          )} to ${getSectionTitle(toSection)}`,
          quantity: movedQuantity,
          toSection,
          type: 'moved',
        });
      }
    }

    for (const section of deckSectionOrder) {
      const delta = deltas.get(section) ?? 0;

      if (delta === 0) {
        continue;
      }

      if ((before.sections.get(section) ?? 0) === 0 && delta > 0) {
        diffs.push({
          cardName: after.name,
          label: `+${delta} ${after.name} in ${getSectionTitle(section)}`,
          quantity: delta,
          section,
          type: 'added',
        });
        continue;
      }

      if ((after.sections.get(section) ?? 0) === 0 && delta < 0) {
        diffs.push({
          cardName: before.name,
          label: `${delta} ${before.name} from ${getSectionTitle(section)}`,
          quantity: Math.abs(delta),
          section,
          type: 'removed',
        });
        continue;
      }

      diffs.push({
        cardName: after.name,
        label: `${delta > 0 ? '+' : ''}${delta} ${after.name} in ${getSectionTitle(
          section,
        )}`,
        quantity: Math.abs(delta),
        section,
        type: 'changed',
      });
    }
  }

  return diffs;
}

export function getSectionTitle(section: DeckSection) {
  return (
    deckSectionMetadata.find((item) => item.section === section)?.title ??
    section
  );
}

export function getSectionShortTitle(section: DeckSection) {
  return (
    deckSectionMetadata.find((item) => item.section === section)?.shortTitle ??
    section
  );
}

export function getDeckCardTypeLine(card: DeckCard | CatalogCard) {
  return [
    card.types.join(', '),
    card.subtypes?.join(', '),
    card.classes?.join(', '),
    card.elements?.join(', '),
  ]
    .filter(Boolean)
    .join(' | ');
}

export function getCostLabel(card: DeckCard | CatalogCard) {
  if (card.costValue && card.costType) {
    return `${card.costValue} ${card.costType}`;
  }

  if (card.costValue) {
    return card.costValue;
  }

  return 'No cost';
}

export function getStatsLine(card: DeckCard | CatalogCard) {
  return [
    card.power ? `POW ${card.power}` : null,
    card.life ? `Life ${card.life}` : null,
    card.durability ? `DUR ${card.durability}` : null,
    card.speed ? `Speed ${card.speed}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

export function resolveEdition(
  card: CatalogCard | null,
  editionUuid?: string | null,
): CatalogEdition | null {
  if (!card) {
    return null;
  }

  return (
    card.editions.find((edition) => edition.uuid === editionUuid) ??
    card.editions[0] ??
    null
  );
}

export function resolveCardImageUri(imagePath?: string | null) {
  if (!imagePath) {
    return null;
  }

  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  return `${syncConfig.apiBaseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

export function getIssueFixText(issue: DeckValidationIssue) {
  switch (issue.code) {
    case 'main.min_cards':
      return 'Add enough non-champion, non-regalia cards to reach 60.';
    case 'main.max_copies':
      return 'Lower this card to four copies or move extras out of Main.';
    case 'main.invalid_type':
      return 'Move champion or regalia cards to Material or Sideboard.';
    case 'material.max_cards':
      return 'Remove or move cards until Material is 12 or fewer.';
    case 'material.missing_level_zero_champion':
      return 'Add a level 0 champion to Material.';
    case 'material.duplicate_name':
      return 'Keep only one copy of each Material card name.';
    case 'material.invalid_type':
      return 'Move non-champion and non-regalia cards out of Material.';
    case 'sideboard.max_cards':
      return 'Remove or move cards until Sideboard is 15 or fewer.';
    case 'sideboard.max_points':
      return 'Remove cards or replace champion/regalia cards to lower points.';
    default:
      return 'Adjust the listed card or section and validation will update.';
  }
}

export function formatUpdatedAt(value?: string | null) {
  if (!value) {
    return 'Not saved';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

export function buildSnapshotLabel(date = new Date()) {
  return `Tournament ${date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })}`;
}

function countSection(deck: Deck | null, section: DeckSection) {
  return (
    deck?.cards
      .filter((card) => card.section === section)
      .reduce((total, card) => total + card.quantity, 0) ?? 0
  );
}

function groupCardsForCompare(cards: DeckCard[]) {
  const map = new Map<
    string,
    {
      name: string;
      sections: Map<DeckSection, number>;
      total: number;
    }
  >();

  for (const card of cards) {
    const key = `${card.cardUuid}:${card.editionUuid ?? ''}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        name: card.name,
        sections: new Map([[card.section, card.quantity]]),
        total: card.quantity,
      });
      continue;
    }

    current.sections.set(
      card.section,
      (current.sections.get(card.section) ?? 0) + card.quantity,
    );
    current.total += card.quantity;
  }

  return map;
}

function countSeverity(issues: DeckValidationIssue[], severity: RuleSeverity) {
  return issues.filter((issue) => issue.severity === severity).length;
}

function compareDefault(left: DeckCard, right: DeckCard, section: DeckSection) {
  if (section === 'material') {
    return (
      compareType(left, right) ||
      compareNumber(left.level ?? 999, right.level ?? 999) ||
      compareName(left, right)
    );
  }

  if (section === 'main') {
    return (
      compareType(left, right) ||
      compareCost(left, right) ||
      compareName(left, right)
    );
  }

  return compareType(left, right) || compareName(left, right);
}

function compareCost(left: DeckCard, right: DeckCard) {
  return compareNumber(parseCost(left.costValue), parseCost(right.costValue));
}

function compareCustom(left: DeckCard, right: DeckCard) {
  return compareNumber(left.sortOrder ?? 999999, right.sortOrder ?? 999999);
}

function compareName(left: DeckCard, right: DeckCard) {
  return left.name.localeCompare(right.name);
}

function compareRecent(left: DeckCard, right: DeckCard) {
  return (
    Date.parse(right.updatedAt ?? right.createdAt ?? '') -
    Date.parse(left.updatedAt ?? left.createdAt ?? '')
  );
}

function compareType(left: DeckCard, right: DeckCard) {
  return compareNumber(primaryTypeRank(left), primaryTypeRank(right));
}

function compareNumber(left: number, right: number) {
  return left - right;
}

function compareString(left: string, right: string) {
  return left.localeCompare(right);
}

function primaryTypeRank(card: DeckCard) {
  const type = card.types[0] ?? '';
  const index = typeSortOrder.indexOf(type);

  return index === -1 ? 999 : index;
}

function parseCost(value?: string | null) {
  if (!value) {
    return 999;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 999;
}

function firstFacet(values?: string[]) {
  return values?.[0] ?? '';
}

function isMaterialCard(card: DeckCard) {
  return card.types.includes('champion') || card.types.includes('regalia');
}

function formatCompareQuantity(quantity: number) {
  return quantity === 1 ? '' : `${quantity} `;
}
