// Human-style logical solver used to grade puzzle difficulty.
// Always applies the easiest technique that makes progress, and records the hardest level needed.
import { ALL, PEERS, UNITS, bit, candidatesFor, digitsOf, popcount, rowOf, colOf, boxOf, singleDigit } from './core';

export const LEVEL_SINGLES = 1; // naked & hidden singles
export const LEVEL_MEDIUM = 2; // locked candidates, naked/hidden pairs & triples
export const LEVEL_HARD = 3; // quads, X-Wing, Swordfish, Y-Wing, XYZ-Wing

export interface GradeResult {
  solved: boolean;
  /** Hardest technique level required (0 if nothing to do). */
  level: number;
  /** How many times a technique of each level was applied. */
  uses: [number, number, number, number];
}

class LogicState {
  values: number[];
  cands: number[];

  constructor(grid: readonly number[]) {
    this.values = grid.slice();
    this.cands = this.values.map((v, i) => (v ? 0 : candidatesFor(this.values, i)));
  }

  place(i: number, d: number) {
    this.values[i] = d;
    this.cands[i] = 0;
    const b = bit(d);
    for (const p of PEERS[i]) this.cands[p] &= ~b;
  }

  eliminate(i: number, mask: number): boolean {
    if (this.cands[i] & mask) {
      this.cands[i] &= ~mask;
      return true;
    }
    return false;
  }

  get solved() {
    return this.values.every((v) => v !== 0);
  }

  get broken() {
    return this.values.some((v, i) => !v && !this.cands[i]);
  }
}

function* combinations<T>(items: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

const sees = (a: number, b: number) =>
  a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

// ---------- Level 1 ----------

function nakedSingle(s: LogicState): boolean {
  for (let i = 0; i < 81; i++) {
    if (!s.values[i] && popcount(s.cands[i]) === 1) {
      s.place(i, singleDigit(s.cands[i]));
      return true;
    }
  }
  return false;
}

function hiddenSingle(s: LogicState): boolean {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let where = -1;
      let count = 0;
      for (const i of unit) {
        if (s.cands[i] & b) {
          where = i;
          if (++count > 1) break;
        }
      }
      if (count === 1) {
        s.place(where, d);
        return true;
      }
    }
  }
  return false;
}

// ---------- Level 2 ----------

function lockedCandidates(s: LogicState): boolean {
  let progress = false;
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const cells = UNITS[u].filter((i) => s.cands[i] & b);
      if (cells.length < 2) continue;
      // The digit's cells in this unit all share one other unit -> eliminate from the rest of that unit.
      const shared: number[] = [];
      if (u >= 18) {
        if (cells.every((i) => rowOf(i) === rowOf(cells[0]))) shared.push(rowOf(cells[0]));
        if (cells.every((i) => colOf(i) === colOf(cells[0]))) shared.push(9 + colOf(cells[0]));
      } else if (cells.every((i) => boxOf(i) === boxOf(cells[0]))) {
        shared.push(18 + boxOf(cells[0]));
      }
      for (const other of shared) {
        for (const i of UNITS[other]) {
          if (!cells.includes(i) && s.eliminate(i, b)) progress = true;
        }
      }
      if (progress) return true;
    }
  }
  return false;
}

function nakedSubset(s: LogicState, n: number): boolean {
  for (const unit of UNITS) {
    const empties = unit.filter((i) => !s.values[i] && popcount(s.cands[i]) <= n);
    if (empties.length < n) continue;
    for (const combo of combinations(empties, n)) {
      let union = 0;
      for (const i of combo) union |= s.cands[i];
      if (popcount(union) !== n) continue;
      let progress = false;
      for (const i of unit) {
        if (!combo.includes(i) && !s.values[i] && s.eliminate(i, union)) progress = true;
      }
      if (progress) return true;
    }
  }
  return false;
}

function hiddenSubset(s: LogicState, n: number): boolean {
  for (const unit of UNITS) {
    const empties = unit.filter((i) => !s.values[i]);
    if (empties.length <= n) continue;
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) {
      const c = empties.filter((i) => s.cands[i] & bit(d)).length;
      if (c >= 2 && c <= n) digits.push(d);
    }
    for (const combo of combinations(digits, n)) {
      let mask = 0;
      for (const d of combo) mask |= bit(d);
      const cells = empties.filter((i) => s.cands[i] & mask);
      if (cells.length !== n) continue;
      let progress = false;
      for (const i of cells) if (s.eliminate(i, ALL & ~mask)) progress = true;
      if (progress) return true;
    }
  }
  return false;
}

// ---------- Level 3 ----------

/** X-Wing (size 2) and Swordfish (size 3). */
function fish(s: LogicState, size: number): boolean {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    for (const byRow of [true, false]) {
      // Base lines: rows (or cols) where the digit has 2..size positions; positions are cross-line indexes.
      const lines: { line: number; pos: number }[] = [];
      for (let line = 0; line < 9; line++) {
        let pos = 0;
        for (let k = 0; k < 9; k++) {
          const i = byRow ? line * 9 + k : k * 9 + line;
          if (s.cands[i] & b) pos |= 1 << k;
        }
        const c = popcount(pos);
        if (c >= 2 && c <= size) lines.push({ line, pos });
      }
      for (const combo of combinations(lines, size)) {
        let union = 0;
        for (const l of combo) union |= l.pos;
        if (popcount(union) !== size) continue;
        const baseLines = new Set(combo.map((l) => l.line));
        let progress = false;
        for (let k = 0; k < 9; k++) {
          if (!(union & (1 << k))) continue;
          for (let line = 0; line < 9; line++) {
            if (baseLines.has(line)) continue;
            const i = byRow ? line * 9 + k : k * 9 + line;
            if (s.eliminate(i, b)) progress = true;
          }
        }
        if (progress) return true;
      }
    }
  }
  return false;
}

function yWing(s: LogicState): boolean {
  for (let pivot = 0; pivot < 81; pivot++) {
    if (popcount(s.cands[pivot]) !== 2) continue;
    const [a, b] = digitsOf(s.cands[pivot]);
    const bivalue = PEERS[pivot].filter((p) => popcount(s.cands[p]) === 2);
    for (const p1 of bivalue) {
      const m1 = s.cands[p1];
      if (!(m1 & bit(a)) || m1 & bit(b)) continue;
      const c = singleDigit(m1 & ~bit(a));
      for (const p2 of bivalue) {
        if (s.cands[p2] !== (bit(b) | bit(c))) continue;
        let progress = false;
        for (const t of PEERS[p1]) {
          if (t !== pivot && t !== p2 && sees(t, p2) && s.eliminate(t, bit(c))) progress = true;
        }
        if (progress) return true;
      }
    }
  }
  return false;
}

function xyzWing(s: LogicState): boolean {
  for (let pivot = 0; pivot < 81; pivot++) {
    const pm = s.cands[pivot];
    if (popcount(pm) !== 3) continue;
    const pincers = PEERS[pivot].filter((p) => popcount(s.cands[p]) === 2 && (s.cands[p] & pm) === s.cands[p]);
    for (const [p1, p2] of combinations(pincers, 2)) {
      const m1 = s.cands[p1];
      const m2 = s.cands[p2];
      if (m1 === m2 || (m1 | m2) !== pm) continue;
      const z = m1 & m2;
      let progress = false;
      for (const t of PEERS[pivot]) {
        if (t !== p1 && t !== p2 && sees(t, p1) && sees(t, p2) && s.eliminate(t, z)) progress = true;
      }
      if (progress) return true;
    }
  }
  return false;
}

const TECHNIQUES: { level: number; run: (s: LogicState) => boolean }[] = [
  { level: LEVEL_SINGLES, run: nakedSingle },
  { level: LEVEL_SINGLES, run: hiddenSingle },
  { level: LEVEL_MEDIUM, run: lockedCandidates },
  { level: LEVEL_MEDIUM, run: (s) => nakedSubset(s, 2) },
  { level: LEVEL_MEDIUM, run: (s) => hiddenSubset(s, 2) },
  { level: LEVEL_MEDIUM, run: (s) => nakedSubset(s, 3) },
  { level: LEVEL_MEDIUM, run: (s) => hiddenSubset(s, 3) },
  { level: LEVEL_HARD, run: (s) => fish(s, 2) },
  { level: LEVEL_HARD, run: yWing },
  { level: LEVEL_HARD, run: xyzWing },
  { level: LEVEL_HARD, run: (s) => fish(s, 3) },
  { level: LEVEL_HARD, run: (s) => nakedSubset(s, 4) },
  { level: LEVEL_HARD, run: (s) => hiddenSubset(s, 4) },
];

/** Grade a puzzle using techniques up to `maxLevel`. */
export function grade(grid: readonly number[], maxLevel = LEVEL_HARD): GradeResult {
  const s = new LogicState(grid);
  const uses: GradeResult['uses'] = [0, 0, 0, 0];
  let level = 0;
  while (!s.solved) {
    if (s.broken) return { solved: false, level, uses };
    let progressed = false;
    for (const t of TECHNIQUES) {
      if (t.level > maxLevel) break;
      if (t.run(s)) {
        level = Math.max(level, t.level);
        uses[t.level]++;
        progressed = true;
        break;
      }
    }
    if (!progressed) return { solved: false, level, uses };
  }
  return { solved: true, level, uses };
}
