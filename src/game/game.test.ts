import { describe, expect, it } from 'vitest';
import { PEERS, bit, candidatesFor, countSolutions, parseGrid } from '../sudoku/core';
import { grade, LEVEL_HARD, LEVEL_MEDIUM, LEVEL_SINGLES } from '../sudoku/grader';
import { autoCandidates, erase, fillSingles, pickHintCell, setValue, toggleNote, type Board } from './board';
import { gameReducer, newGame, type Game } from './gameState';
import easy from '../data/easy.json';
import medium from '../data/medium.json';
import hard from '../data/hard.json';

const PUZZLE = easy[0];

function fresh(): Game {
  return newGame('easy', 0, PUZZLE);
}

const firstEmpty = (g: Game) => g.board.values.findIndex((v) => v === 0);

describe('bundled puzzles', () => {
  it.each([
    ['easy', easy, LEVEL_SINGLES],
    ['medium', medium, LEVEL_MEDIUM],
    ['hard', hard, LEVEL_HARD],
  ] as const)('%s: 1000 unique, uniquely-solvable puzzles at the right level', (_, list, level) => {
    expect(list.length).toBe(1000);
    expect(new Set(list).size).toBe(1000);
    for (const p of list.slice(0, 100)) {
      const grid = parseGrid(p);
      expect(countSolutions(grid)).toBe(1);
      const g = grade(grid);
      expect(g.solved).toBe(true);
      expect(g.level).toBe(level);
    }
  });
});

describe('board operations', () => {
  it('entering a value removes that candidate from peers only', () => {
    const g = fresh();
    const cell = firstEmpty(g);
    const withNotes = autoCandidates(g.board);
    const d = g.solution[cell];
    const next = setValue(withNotes, g.given, cell, d);
    expect(next.values[cell]).toBe(d);
    expect(next.notes[cell]).toBe(0);
    for (const p of PEERS[cell]) expect(next.notes[p] & bit(d)).toBe(0);
    const nonPeer = next.values.findIndex((v, i) => !v && i !== cell && !PEERS[cell].includes(i) && withNotes.notes[i] & bit(d));
    if (nonPeer >= 0) expect(next.notes[nonPeer] & bit(d)).toBeTruthy();
  });

  it('givens cannot be changed', () => {
    const g = fresh();
    const given = g.given.indexOf(true);
    expect(setValue(g.board, g.given, given, 1)).toBe(g.board);
    expect(erase(g.board, g.given, given)).toBe(g.board);
    expect(toggleNote(g.board, g.given, given, 1)).toBe(g.board);
  });

  it('auto candidates replaces notes with valid digits', () => {
    const g = fresh();
    const cell = firstEmpty(g);
    const b = toggleNote(g.board, g.given, cell, 9);
    const auto = autoCandidates(b);
    expect(auto.notes[cell]).toBe(candidatesFor(g.board.values, cell));
    expect(autoCandidates(auto)).toBe(auto);
  });

  it('fill singles fills all single-note cells in one pass and cleans peers', () => {
    const values = new Array(81).fill(0);
    const notes = new Array(81).fill(0);
    notes[0] = bit(5); // single
    notes[1] = bit(5) | bit(6); // peer of 0 -> becomes {6}, but not filled this pass
    notes[80] = bit(3); // single, unrelated
    const b: Board = { values, notes };
    const next = fillSingles(b);
    expect(next.values[0]).toBe(5);
    expect(next.values[80]).toBe(3);
    expect(next.values[1]).toBe(0);
    expect(next.notes[1]).toBe(bit(6));
    const again = fillSingles(next);
    expect(again.values[1]).toBe(6);
    expect(fillSingles(again)).toBe(again);
  });

  it('hint prefers selected wrong cell', () => {
    const g = fresh();
    const cell = firstEmpty(g);
    const wrongDigit = (g.solution[cell] % 9) + 1;
    const b = setValue(g.board, g.given, cell, wrongDigit);
    expect(pickHintCell(b, g.given, g.solution, null)).toBe(cell);
  });
});

describe('undo / redo', () => {
  it('undo restores the value AND the auto-removed peer candidates in one step', () => {
    let g = fresh();
    g = gameReducer(g, { type: 'autoCandidates' })!;
    const beforeEnter = g.board;
    const cell = firstEmpty(g);
    g = gameReducer(g, { type: 'enter', cell, digit: g.solution[cell], notes: false })!;
    expect(g.board).not.toEqual(beforeEnter);
    g = gameReducer(g, { type: 'undo' })!;
    expect(g.board).toEqual(beforeEnter);
    g = gameReducer(g, { type: 'redo' })!;
    expect(g.board.values[cell]).toBe(g.solution[cell]);
  });

  it('no-op actions do not create history', () => {
    let g = fresh();
    g = gameReducer(g, { type: 'fillSingles' })!;
    expect(g.history.length).toBe(0);
  });

  it('auto candidates is flagged as used after the first press, and restart clears it', () => {
    let g = fresh();
    expect(g.autoCandidatesUsed).toBe(false);
    g = gameReducer(g, { type: 'autoCandidates' })!;
    expect(g.autoCandidatesUsed).toBe(true);
    g = gameReducer(g, { type: 'undo' })!;
    expect(g.autoCandidatesUsed).toBe(true);
    g = gameReducer(g, { type: 'restart' })!;
    expect(g.autoCandidatesUsed).toBe(false);
  });

  it('solving the puzzle marks it completed', () => {
    let g = fresh();
    g.board.values.forEach((v, i) => {
      if (!v) g = gameReducer(g, { type: 'enter', cell: i, digit: g.solution[i], notes: false })!;
    });
    expect(g.completed).toBe(true);
  });

  it('auto candidates + repeated fill singles solves an easy puzzle', () => {
    let g = fresh();
    for (let k = 0; k < 81 && !g.completed; k++) {
      g = gameReducer(g, { type: 'autoCandidates' })!;
      g = gameReducer(g, { type: 'fillSingles' })!;
    }
    expect(g.completed).toBe(true);
  });
});
