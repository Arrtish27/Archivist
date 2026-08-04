import { Deck } from '../../domain/validation/types';

export type DeckService = {
  listDecks(): Promise<Deck[]>;
};

export const deckService: DeckService = {
  async listDecks() {
    return [];
  },
};
