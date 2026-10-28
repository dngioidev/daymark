import type { StandaloneNote } from '../../types/daymark';
import { graphVocabulary } from './graphVocabulary';

/** 2,000 distinct alphabetic words, 20 overlapping topic clusters, 60-word bodies. */
export function graphPerformanceNotes(count = 1000, wordsPerNote = 60): StandaloneNote[] {
  const word = (i: number) => graphVocabulary[i];
  return Array.from({ length: count }, (_, i) => ({ id: String(i), title: `Topic ${word(i % 20 * 100)} entry ${i}`, folder: i % 2 ? 'Research/Topics' : 'Research', tags: [],
    content: Array.from({ length: wordsPerNote }, (_, j) => word(i % 20 * 100 + (j * 17 + Math.floor(i / 20)) % 100)).join(' '), createdAt: '', updatedAt: '' }));
}
