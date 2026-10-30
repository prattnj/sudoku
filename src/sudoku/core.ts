// Shared Sudoku primitives. Cells are indexed 0..80 (row-major).
// Candidate sets are 9-bit masks: bit (d - 1) set means digit d is a candidate.

export const ALL = 0x1ff;

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    const box: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.push((r0 + r) * 9 + c0 + c);
    units.push(box);
  }
  return units;
})();

/** For each cell, the indices of its row, column and box units. */
export const CELL_UNITS: number[][] = Array.from({ length: 81 }, (_, i) => [
  rowOf(i),
  9 + colOf(i),
  18 + boxOf(i),
]);

/** For each cell, the 20 other cells sharing a row, column or box. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const set = new Set<number>();
  for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) set.add(j);
  return [...set];
});

export const bit = (d: number) => 1 << (d - 1);

export function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** Digits (1-9) present in a mask, ascending. */
export function digitsOf(m: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
  return out;
}

/** Only valid when exactly one bit is set. */
export const singleDigit = (m: number) => 31 - Math.clz32(m) + 1;

export function parseGrid(s: string): number[] {
  if (s.length !== 81) throw new Error(`Grid must be 81 chars, got ${s.length}`);
  return Array.from(s, (ch) => (ch >= '1' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0));
}

export const gridToString = (g: readonly number[]) => g.join('');

/** Digits that do not appear among the cell's peers. */
export function candidatesFor(values: readonly number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) if (values[p]) used |= bit(values[p]);
  return ALL & ~used;
}

/** Cells whose value duplicates another value in a shared row/column/box. */
export function findConflicts(values: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const unit of UNITS) {
    const seen = new Map<number, number>();
    for (const i of unit) {
      const v = values[i];
      if (!v) continue;
      const prev = seen.get(v);
      if (prev !== undefined) {
        out.add(prev);
        out.add(i);
      } else seen.set(v, i);
    }
  }
  return out;
}

/**
 * Backtracking solver. Returns up to `limit` solutions (use limit 2 to test uniqueness).
 * Optional `rng` randomizes digit order (used to build random full grids).
 */
export function solve(grid: readonly number[], limit = 1, rng?: () => number): number[][] {
  const values = grid.slice();
  const rowM = new Array(9).fill(0);
  const colM = new Array(9).fill(0);
  const boxM = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = values[i];
    if (!v) continue;
    const b = bit(v);
    const r = rowOf(i), c = colOf(i), x = boxOf(i);
    if ((rowM[r] | colM[c] | boxM[x]) & b) return [];
    rowM[r] |= b;
    colM[c] |= b;
    boxM[x] |= b;
  }
  const solutions: number[][] = [];

  const search = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (values[i]) continue;
      const m = ALL & ~(rowM[rowOf(i)] | colM[colOf(i)] | boxM[boxOf(i)]);
      const n = popcount(m);
      if (n < bestCount) {
        best = i;
        bestMask = m;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      solutions.push(values.slice());
      return solutions.length >= limit;
    }
    if (bestCount === 0) return false;
    const digits = digitsOf(bestMask);
    if (rng) {
      for (let k = digits.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [digits[k], digits[j]] = [digits[j], digits[k]];
      }
    }
    const r = rowOf(best), c = colOf(best), x = boxOf(best);
    for (const d of digits) {
      const b = bit(d);
      values[best] = d;
      rowM[r] |= b;
      colM[c] |= b;
      boxM[x] |= b;
      if (search()) return true;
      rowM[r] &= ~b;
      colM[c] &= ~b;
      boxM[x] &= ~b;
    }
    values[best] = 0;
    return false;
  };

  search();
  return solutions;
}

export const countSolutions = (grid: readonly number[], limit = 2) => solve(grid, limit).length;
