import type { Difficulty } from './gameState';

const loaders: Record<Difficulty, () => Promise<{ default: string[] }>> = {
  easy: () => import('../data/easy.json'),
  medium: () => import('../data/medium.json'),
  hard: () => import('../data/hard.json'),
};

const cache = new Map<Difficulty, Promise<string[]>>();

export function loadPuzzles(difficulty: Difficulty): Promise<string[]> {
  let p = cache.get(difficulty);
  if (!p) {
    p = loaders[difficulty]().then((m) => m.default);
    cache.set(difficulty, p);
  }
  return p;
}
