import { parseGrid, solve } from '../sudoku/core';
import {
  autoCandidates,
  erase,
  fillSingles,
  isSolved,
  revealCell,
  setValue,
  toggleNote,
  type Board,
} from './board';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const MAX_HISTORY = 1000;

export interface Game {
  difficulty: Difficulty;
  /** 0-based index into the difficulty's puzzle list. */
  index: number;
  puzzle: string;
  solution: number[];
  given: boolean[];
  board: Board;
  history: Board[];
  future: Board[];
  elapsedMs: number;
  hintsUsed: number;
  completed: boolean;
  /** Set after the first Auto candidates press; later presses ask for confirmation. */
  autoCandidatesUsed: boolean;
}

export function newGame(difficulty: Difficulty, index: number, puzzle: string): Game {
  const values = parseGrid(puzzle);
  const solution = solve(values, 1)[0];
  if (!solution) throw new Error(`Puzzle ${difficulty} #${index + 1} has no solution`);
  return {
    difficulty,
    index,
    puzzle,
    solution,
    given: values.map((v) => v !== 0),
    board: { values, notes: new Array(81).fill(0) },
    history: [],
    future: [],
    elapsedMs: 0,
    hintsUsed: 0,
    completed: false,
    autoCandidatesUsed: false,
  };
}

export type GameAction =
  | { type: 'load'; game: Game }
  | { type: 'enter'; cell: number; digit: number; notes: boolean }
  | { type: 'erase'; cell: number }
  | { type: 'autoCandidates' }
  | { type: 'fillSingles' }
  | { type: 'reveal'; cell: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'restart' }
  | { type: 'tick'; ms: number };

function commit(game: Game, board: Board, extra: Partial<Game> = {}): Game {
  if (board === game.board) return game;
  const history = [...game.history, game.board];
  if (history.length > MAX_HISTORY) history.shift();
  return { ...game, ...extra, board, history, future: [], completed: isSolved(board, game.solution) };
}

export function gameReducer(game: Game | null, action: GameAction): Game | null {
  if (action.type === 'load') return action.game;
  if (!game) return game;
  if (game.completed && action.type !== 'restart') return game;

  switch (action.type) {
    case 'enter': {
      const { cell, digit, notes } = action;
      const op = notes ? toggleNote : setValue;
      return commit(game, op(game.board, game.given, cell, digit));
    }
    case 'erase':
      return commit(game, erase(game.board, game.given, action.cell));
    case 'autoCandidates':
      return commit(game, autoCandidates(game.board), { autoCandidatesUsed: true });
    case 'fillSingles':
      return commit(game, fillSingles(game.board));
    case 'reveal': {
      const board = revealCell(game.board, game.solution, action.cell);
      return commit(game, board, { hintsUsed: game.hintsUsed + 1 });
    }
    case 'undo': {
      if (!game.history.length) return game;
      const board = game.history[game.history.length - 1];
      return { ...game, board, history: game.history.slice(0, -1), future: [game.board, ...game.future] };
    }
    case 'redo': {
      if (!game.future.length) return game;
      const [board, ...future] = game.future;
      return { ...game, board, future, history: [...game.history, game.board], completed: isSolved(board, game.solution) };
    }
    case 'restart':
      return newGame(game.difficulty, game.index, game.puzzle);
    case 'tick':
      return { ...game, elapsedMs: game.elapsedMs + action.ms };
  }
}

// ---------- Persistence ----------

const encodeNotes = (notes: number[]) => notes.map((n) => n.toString(32).padStart(2, '0')).join('');
const decodeNotes = (s: string) => Array.from({ length: 81 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 32));
const encodeBoard = (b: Board): [string, string] => [b.values.join(''), encodeNotes(b.notes)];
const decodeBoard = ([v, n]: [string, string]): Board => ({ values: parseGrid(v), notes: decodeNotes(n) });

interface SavedGame {
  index: number;
  puzzle: string;
  board: [string, string];
  history: [string, string][];
  future: [string, string][];
  elapsedMs: number;
  hintsUsed: number;
  completed: boolean;
  autoCandidatesUsed?: boolean;
}

const gameKey = (d: Difficulty) => `sudoku:v1:game:${d}`;

export function saveGame(game: Game) {
  const saved: SavedGame = {
    index: game.index,
    puzzle: game.puzzle,
    board: encodeBoard(game.board),
    history: game.history.map(encodeBoard),
    future: game.future.map(encodeBoard),
    elapsedMs: Math.round(game.elapsedMs),
    hintsUsed: game.hintsUsed,
    completed: game.completed,
    autoCandidatesUsed: game.autoCandidatesUsed,
  };
  try {
    localStorage.setItem(gameKey(game.difficulty), JSON.stringify(saved));
  } catch {
    // Storage full or unavailable: drop history and try again.
    try {
      localStorage.setItem(gameKey(game.difficulty), JSON.stringify({ ...saved, history: [], future: [] }));
    } catch {
      /* ignore */
    }
  }
}

/** Restores the saved game if it still matches the bundled puzzle at its index. */
export function loadGame(difficulty: Difficulty, puzzles: readonly string[]): Game {
  try {
    const raw = localStorage.getItem(gameKey(difficulty));
    if (raw) {
      const s = JSON.parse(raw) as SavedGame;
      if (puzzles[s.index] === s.puzzle) {
        const base = newGame(difficulty, s.index, s.puzzle);
        const board = decodeBoard(s.board);
        return {
          ...base,
          board,
          // Saves from before this flag existed: assume used if the board has any notes.
          autoCandidatesUsed: s.autoCandidatesUsed ?? board.notes.some(Boolean),
          history: s.history.map(decodeBoard),
          future: s.future.map(decodeBoard),
          elapsedMs: s.elapsedMs,
          hintsUsed: s.hintsUsed,
          completed: s.completed,
        };
      }
      if (s.index < puzzles.length) return newGame(difficulty, s.index, puzzles[s.index]);
    }
  } catch {
    /* fall through to a fresh game */
  }
  return newGame(difficulty, 0, puzzles[0]);
}
