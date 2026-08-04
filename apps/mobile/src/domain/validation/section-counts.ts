import { DeckSection } from './types';

export function getSectionCountLabel(
  section: DeckSection,
  count: number,
  points = count,
) {
  switch (section) {
    case 'material':
      return `${count}/12`;
    case 'main':
      return `${count}`;
    case 'sideboard':
      return `${count}/15 cards, ${points}/15 points`;
  }
}
