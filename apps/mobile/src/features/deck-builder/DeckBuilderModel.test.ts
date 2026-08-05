import { describe, expect, it } from 'vitest';

import { Deck } from '@/domain/validation/types';
import {
  compareDecks,
  getDeckSectionStats,
  mapDeckToExportRows,
  sortDeckCards,
} from './DeckBuilderModel';

const deck: Deck = {
  cards: [
    {
      cardUuid: 'champion',
      level: 0,
      name: 'Lorraine',
      quantity: 1,
      section: 'material',
      types: ['champion'],
    },
    {
      cardUuid: 'regalia',
      name: 'Apotheosis Rite',
      quantity: 1,
      section: 'sideboard',
      types: ['regalia'],
    },
    {
      cardUuid: 'action',
      costValue: '2',
      elements: ['FIRE'],
      name: 'Creative Shock',
      quantity: 4,
      section: 'main',
      types: ['action'],
    },
    {
      cardUuid: 'ally',
      costValue: '1',
      elements: ['NORM'],
      name: 'Brave Squire',
      quantity: 2,
      section: 'main',
      types: ['ally'],
    },
  ],
  formatId: 'standard',
  id: 'deck-1',
  name: 'Locals',
};

describe('DeckBuilderModel', () => {
  it('counts sections and sideboard points for the editor badges', () => {
    const stats = getDeckSectionStats(deck);

    expect(stats.material.label).toBe('1/12');
    expect(stats.main.label).toBe('6');
    expect(stats.sideboard.label).toBe('1/15 cards, 3/15 points');
  });

  it('sorts the main deck by default type, cost, and name', () => {
    const sorted = sortDeckCards(
      deck.cards.filter((card) => card.section === 'main'),
      'main',
      'default',
    );

    expect(sorted.map((card) => card.name)).toEqual([
      'Brave Squire',
      'Creative Shock',
    ]);
  });

  it('maps sorted deck cards into export rows by section', () => {
    const rows = mapDeckToExportRows(deck);

    expect(rows.map((row) => `${row.section}:${row.cardName}`)).toEqual([
      'material:Lorraine',
      'main:Brave Squire',
      'main:Creative Shock',
      'sideboard:Apotheosis Rite',
    ]);
  });

  it('compares a tournament snapshot with the current deck', () => {
    const current: Deck = {
      ...deck,
      cards: [
        {
          cardUuid: 'champion',
          level: 0,
          name: 'Lorraine',
          quantity: 1,
          section: 'material',
          types: ['champion'],
        },
        {
          cardUuid: 'action',
          costValue: '2',
          name: 'Creative Shock',
          quantity: 3,
          section: 'sideboard',
          types: ['action'],
        },
      ],
    };

    expect(compareDecks(deck, current).map((diff) => diff.label)).toEqual(
      expect.arrayContaining([
        'Creative Shock moved Main to Sideboard',
        '-1 Creative Shock in Sideboard',
        '-1 Apotheosis Rite from Sideboard',
        '-2 Brave Squire from Main',
      ]),
    );
  });
});
