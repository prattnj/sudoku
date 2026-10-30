// Generates the bundled puzzle sets: `npm run generate-puzzles [-- --count 1000 --seed 2026]`.
// Each puzzle has a unique solution and is graded by the hardest technique required:
//   easy   - singles only, 35-39 clues
//   medium - needs locked candidates / pairs / triples (no harder)
//   hard   - needs X-Wing, Swordfish, Y-Wing, XYZ-Wing or quads (still solvable without guessing)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, countSolutions, gridToString } from '../src/sudoku/core';
import { grade, LEVEL_SINGLES, LEVEL_MEDIUM, LEVEL_HARD } from '../src/sudoku/grader';

type Difficulty = 'easy' | 'medium' | 'hard';

const args = process.argv.slice(2);
const argValue = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const COUNT = argValue('count', 1000);
const SEED = argValue('seed', 2026);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Removes clues in 180°-symmetric pairs while the puzzle stays unique and solvable
 * using techniques up to `maxLevel`, stopping once `minClues` is reached.
 */
function carve(solution: number[], maxLevel: number, minClues: number, rng: () => number): number[] {
  const grid = solution.slice();
  let clues = 81;
  const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rng);
  for (const i of order) {
    const j = 80 - i;
    const removed = i === j ? 1 : 2;
    if (clues - removed < minClues) continue;
    const a = grid[i], b = grid[j];
    grid[i] = 0;
    grid[j] = 0;
    if (countSolutions(grid) === 1 && grade(grid, maxLevel).solved) {
      clues -= removed;
    } else {
      grid[i] = a;
      grid[j] = b;
    }
  }
  return grid;
}

function makePuzzle(difficulty: Difficulty, rng: () => number): number[] | null {
  const solution = solve(new Array(81).fill(0), 1, rng)[0];
  switch (difficulty) {
    case 'easy': {
      const target = 35 + Math.floor(rng() * 5);
      const grid = carve(solution, LEVEL_SINGLES, target, rng);
      const clues = grid.filter(Boolean).length;
      return clues <= 39 ? grid : null;
    }
    case 'medium': {
      const grid = carve(solution, LEVEL_MEDIUM, 24, rng);
      return grade(grid).level === LEVEL_MEDIUM ? grid : null;
    }
    case 'hard': {
      const grid = carve(solution, LEVEL_HARD, 17, rng);
      return grade(grid).level === LEVEL_HARD ? grid : null;
    }
  }
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
mkdirSync(outDir, { recursive: true });

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
difficulties.forEach((difficulty, n) => {
  const rng = mulberry32(SEED * 31 + n);
  const seen = new Set<string>();
  const puzzles: string[] = [];
  let attempts = 0;
  const start = Date.now();
  while (puzzles.length < COUNT) {
    attempts++;
    const grid = makePuzzle(difficulty, rng);
    if (!grid) continue;
    const s = gridToString(grid);
    if (seen.has(s)) continue;
    seen.add(s);
    puzzles.push(s);
    if (puzzles.length % 100 === 0) {
      process.stdout.write(`  ${difficulty}: ${puzzles.length}/${COUNT} (${attempts} attempts)\n`);
    }
  }
  const avgClues = puzzles.reduce((sum, p) => sum + [...p].filter((c) => c !== '0').length, 0) / puzzles.length;
  writeFileSync(resolve(outDir, `${difficulty}.json`), JSON.stringify(puzzles));
  console.log(
    `${difficulty}: ${puzzles.length} puzzles, avg ${avgClues.toFixed(1)} clues, ` +
      `${attempts} attempts, ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
});
