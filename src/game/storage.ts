import type { Difficulty } from './gameState';

export interface DifficultyStats {
  solved: number;
  solvedWithoutHints: number;
  totalMs: number;
  /** Best time among puzzles solved without hints. */
  bestMs: number | null;
}

export type Stats = Record<Difficulty, DifficultyStats>;

const STATS_KEY = 'sudoku:v1:stats';
const SETTINGS_KEY = 'sudoku:v1:settings';
const DIFFICULTY_KEY = 'sudoku:v1:difficulty';

const emptyStats = (): DifficultyStats => ({ solved: 0, solvedWithoutHints: 0, totalMs: 0, bestMs: null });

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const loadStats = (): Stats =>
  read(STATS_KEY, { easy: emptyStats(), medium: emptyStats(), hard: emptyStats() });

export function recordSolve(difficulty: Difficulty, elapsedMs: number, hintsUsed: number): Stats {
  const stats = loadStats();
  const s = { ...emptyStats(), ...stats[difficulty] };
  s.solved++;
  s.totalMs += elapsedMs;
  if (hintsUsed === 0) {
    s.solvedWithoutHints++;
    s.bestMs = s.bestMs === null ? elapsedMs : Math.min(s.bestMs, elapsedMs);
  }
  const next = { ...stats, [difficulty]: s };
  write(STATS_KEY, next);
  return next;
}

export function resetStats(): Stats {
  write(STATS_KEY, null);
  return loadStats();
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  autoCheck: boolean;
  theme: Theme;
}

export const loadSettings = (): Settings => read(SETTINGS_KEY, { autoCheck: false, theme: 'system' as Theme });
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

/** Keep in sync with the inline script in index.html, which applies the theme before first paint. */
export function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#f8fafc');
}

export function loadDifficulty(): Difficulty {
  const d = localStorage.getItem(DIFFICULTY_KEY);
  return d === 'medium' || d === 'hard' ? d : 'easy';
}
export const saveDifficulty = (d: Difficulty) => localStorage.setItem(DIFFICULTY_KEY, d);

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
