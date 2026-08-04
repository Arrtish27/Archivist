import { DeckCard, DeckValidationIssue, FormatRulePack } from './types';

const MATERIAL_MAX = 12;
const MAIN_MIN = 60;
const MAIN_COPY_MAX = 4;
const SIDEBOARD_MAX = 15;
const SIDEBOARD_POINT_MAX = 15;

export const standardConstructedRulePack: FormatRulePack = {
  id: 'standard',
  name: 'Standard Constructed',
  validate(deck) {
    return [
      ...validateMaterial(deck.cards),
      ...validateMain(deck.cards),
      ...validateSideboard(deck.cards),
    ];
  },
};

function validateMaterial(cards: DeckCard[]): DeckValidationIssue[] {
  const materialCards = cards.filter((card) => card.section === 'material');
  const issues: DeckValidationIssue[] = [];
  const count = countCards(materialCards);

  if (count > MATERIAL_MAX) {
    issues.push({
      code: 'material.max_cards',
      section: 'material',
      severity: 'error',
      message: 'Material Deck cannot exceed 12 cards.',
    });
  }

  if (
    !materialCards.some(
      (card) => card.types.includes('champion') && card.level === 0,
    )
  ) {
    issues.push({
      code: 'material.missing_level_zero_champion',
      section: 'material',
      severity: 'error',
      message: 'Material Deck needs at least one level 0 champion.',
    });
  }

  for (const card of materialCards) {
    if (!card.types.includes('champion') && !card.types.includes('regalia')) {
      issues.push({
        cardUuid: card.cardUuid,
        code: 'material.invalid_type',
        section: 'material',
        severity: 'error',
        message: `${card.name} belongs outside the Material Deck.`,
      });
    }
  }

  for (const duplicateName of findDuplicateNames(materialCards)) {
    issues.push({
      code: 'material.duplicate_name',
      section: 'material',
      severity: 'error',
      message: `${duplicateName} appears more than once in the Material Deck.`,
    });
  }

  return issues;
}

function validateMain(cards: DeckCard[]): DeckValidationIssue[] {
  const mainCards = cards.filter((card) => card.section === 'main');
  const issues: DeckValidationIssue[] = [];
  const count = countCards(mainCards);

  if (count < MAIN_MIN) {
    issues.push({
      code: 'main.min_cards',
      section: 'main',
      severity: 'error',
      message: 'Main Deck needs at least 60 cards.',
    });
  }

  for (const card of mainCards) {
    if (card.types.includes('champion') || card.types.includes('regalia')) {
      issues.push({
        cardUuid: card.cardUuid,
        code: 'main.invalid_type',
        section: 'main',
        severity: 'error',
        message: `${card.name} belongs outside the Main Deck.`,
      });
    }
  }

  for (const [name, quantity] of countByName(mainCards)) {
    if (quantity > MAIN_COPY_MAX) {
      issues.push({
        code: 'main.max_copies',
        section: 'main',
        severity: 'error',
        message: `${name} has ${quantity} copies; the Main Deck limit is 4.`,
      });
    }
  }

  return issues;
}

function validateSideboard(cards: DeckCard[]): DeckValidationIssue[] {
  const sideboardCards = cards.filter((card) => card.section === 'sideboard');
  const issues: DeckValidationIssue[] = [];
  const count = countCards(sideboardCards);
  const points = sideboardCards.reduce(
    (total, card) => total + getSideboardPointValue(card),
    0,
  );

  if (count > SIDEBOARD_MAX) {
    issues.push({
      code: 'sideboard.max_cards',
      section: 'sideboard',
      severity: 'error',
      message: 'Sideboard cannot exceed 15 cards.',
    });
  }

  if (points > SIDEBOARD_POINT_MAX) {
    issues.push({
      code: 'sideboard.max_points',
      section: 'sideboard',
      severity: 'error',
      message: 'Sideboard cannot exceed 15 points.',
    });
  }

  return issues;
}

function countCards(cards: DeckCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0);
}

function countByName(cards: DeckCard[]) {
  const counts = new Map<string, number>();

  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + card.quantity);
  }

  return counts;
}

function findDuplicateNames(cards: DeckCard[]) {
  return [...countByName(cards)]
    .filter(([, quantity]) => quantity > 1)
    .map(([name]) => name);
}

function getSideboardPointValue(card: DeckCard) {
  const cardPoints =
    card.types.includes('champion') || card.types.includes('regalia') ? 3 : 1;
  return cardPoints * card.quantity;
}
