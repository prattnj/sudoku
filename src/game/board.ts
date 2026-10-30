// Pure board operations. Every operation returns a new Board, or the same object if nothing changed,
// so the caller can push exactly one undo snapshot per user action (including side effects such as
// candidates removed from peers).
import { PEERS, bit, candidatesFor, popcount, singleDigit } from '../sudoku/core';

export interface Board {
  /** 0 = empty, 1-9 = value. */
  values: number[];
  /** Candidate notes as 9-bit masks (bit d-1 = digit d). */
  notes: number[];
}

export const boardsEqual = (a: Board, b: Board) =>
  a.values.every((v, i) => v === b.values[i]) && a.notes.every((n, i) => n === b.notes[i]);

/** Places `d` at each cell (simultaneously), clearing their notes and removing `d` from peers' notes. */
function place(board: Board, cells: { i: number; d: number }[]): Board {
  const values = board.values.slice();
  const notes = board.notes.slice();
  for (const { i, d } of cells) {
    values[i] = d;
    notes[i] = 0;
  }
  for (const { i, d } of cells) {
    for (const p of PEERS[i]) notes[p] &= ~bit(d);
  }
  return { values, notes };
}

/** Enter a value. Entering the cell's current value again clears it. */
export function setValue(board: Board, given: readonly boolean[], i: number, d: number): Board {
  if (given[i]) return board;
  if (board.values[i] === d) {
    const values = board.values.slice();
    values[i] = 0;
    return { values, notes: board.notes };
  }
  return place(board, [{ i, d }]);
}

export function toggleNote(board: Board, given: readonly boolean[], i: number, d: number): Board {
  if (given[i] || board.values[i]) return board;
  const notes = board.notes.slice();
  notes[i] ^= bit(d);
  return { values: board.values, notes };
}

/** Clears the value if present, otherwise clears the notes. */
export function erase(board: Board, given: readonly boolean[], i: number): Board {
  if (given[i]) return board;
  if (board.values[i]) {
    const values = board.values.slice();
    values[i] = 0;
    return { values, notes: board.notes };
  }
  if (board.notes[i]) {
    const notes = board.notes.slice();
    notes[i] = 0;
    return { values: board.values, notes };
  }
  return board;
}

/** Replaces every empty cell's notes with the digits not present in its row, column or box. */
export function autoCandidates(board: Board): Board {
  const notes = board.values.map((v, i) => (v ? 0 : candidatesFor(board.values, i)));
  const next = { values: board.values, notes };
  return boardsEqual(board, next) ? board : next;
}

/** Fills every empty cell whose notes contain exactly one candidate (one pass). */
export function fillSingles(board: Board): Board {
  const cells: { i: number; d: number }[] = [];
  for (let i = 0; i < 81; i++) {
    if (!board.values[i] && popcount(board.notes[i]) === 1) cells.push({ i, d: singleDigit(board.notes[i]) });
  }
  return cells.length ? place(board, cells) : board;
}

/**
 * Chooses a cell to reveal: the selected cell if it's empty or wrong, otherwise any wrong cell,
 * otherwise an empty cell with only one possible digit, otherwise the first empty cell.
 */
export function pickHintCell(
  board: Board,
  given: readonly boolean[],
  solution: readonly number[],
  selected: number | null,
): number | null {
  const wrong = (i: number) => !given[i] && board.values[i] !== solution[i];
  if (selected !== null && wrong(selected)) return selected;
  const wrongFilled = board.values.findIndex((v, i) => v !== 0 && wrong(i));
  if (wrongFilled >= 0) return wrongFilled;
  let firstEmpty: number | null = null;
  for (let i = 0; i < 81; i++) {
    if (board.values[i]) continue;
    if (popcount(candidatesFor(board.values, i)) === 1) return i;
    firstEmpty ??= i;
  }
  return firstEmpty;
}

export function revealCell(board: Board, solution: readonly number[], i: number): Board {
  if (board.values[i] === solution[i]) return board;
  return place(board, [{ i, d: solution[i] }]);
}

export const isSolved = (board: Board, solution: readonly number[]) =>
  board.values.every((v, i) => v === solution[i]);

export const isFull = (board: Board) => board.values.every((v) => v !== 0);
