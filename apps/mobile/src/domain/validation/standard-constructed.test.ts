import { describe, expect, it } from 'vitest';

import { standardConstructedRulePack } from './standard-constructed';
import { Deck } from './types';

describe('standardConstructedRulePack', () => {
  it('flags a draft deck before the player reaches constructed counts', () => {
    const deck: Deck = {
      cards: [],
      formatId: 'standard',
      id: 'deck-1',
      name: 'Draft',
    };

    const issues = standardConstructedRulePack.validate(deck);

    expect(issues.map((issue) => issue.code)).toEqual([
      'material.missing_level_zero_champion',
      'main.min_cards',
    ]);
  });

  it('flags cards placed in invalid sections', () => {
    const deck: Deck = {
      cards: [
        {
          cardUuid: 'champion-1',
          level: 0,
          name: 'Lorraine',
          quantity: 1,
          section: 'main',
          types: ['champion'],
        },
        {
          cardUuid: 'action-1',
          name: 'Creative Shock',
          quantity: 1,
          section: 'material',
          types: ['action'],
        },
      ],
      formatId: 'standard',
      id: 'deck-1',
      name: 'Invalid placement',
    };

    const issueCodes = standardConstructedRulePack
      .validate(deck)
      .map((issue) => issue.code);

    expect(issueCodes).toContain('main.invalid_type');
    expect(issueCodes).toContain('material.invalid_type');
  });
});
