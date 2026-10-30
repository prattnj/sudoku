import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Board } from './components/Board';
import { NumberPad } from './components/NumberPad';
import { Modal, ModalButton } from './components/Modal';
import { BulbIcon, EraseIcon, GridIcon, MenuIcon, PauseIcon, PencilIcon, PlayIcon, RedoIcon, SparkIcon, UndoIcon } from './components/Icons';
import { findConflicts } from './sudoku/core';
import { isFull, pickHintCell } from './game/board';
import { DIFFICULTIES, gameReducer, loadGame, newGame, saveGame, type Difficulty, type Game } from './game/gameState';
import { loadPuzzles } from './game/puzzles';
import {
  applyTheme,
  formatTime,
  loadDifficulty,
  loadSettings,
  loadStats,
  recordSolve,
  resetStats,
  saveDifficulty,
  saveSettings,
  type Settings,
  type Theme,
} from './game/storage';

type ModalKind = 'menu' | 'stats' | 'solved' | 'help' | 'confirmCandidates' | null;

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty);
  const [puzzles, setPuzzles] = useState<string[] | null>(null);
  const [game, dispatch] = useReducer(gameReducer, null);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [stats, setStats] = useState(loadStats);
  const [modal, setModal] = useState<ModalKind>(null);

  // ----- Theme -----
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(settings.theme === 'dark' || (settings.theme === 'system' && mq.matches));
    apply();
    if (settings.theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // ----- Loading -----
  useEffect(() => {
    let cancelled = false;
    setPuzzles(null);
    loadPuzzles(difficulty).then((list) => {
      if (cancelled) return;
      setPuzzles(list);
      dispatch({ type: 'load', game: loadGame(difficulty, list) });
      setSelected(null);
      setPaused(false);
    });
    saveDifficulty(difficulty);
    return () => {
      cancelled = true;
    };
  }, [difficulty]);

  // ----- Persistence (timer-only changes are saved at most every 5s, and when the app is hidden) -----
  const gameRef = useRef<Game | null>(null);
  const lastSaveAt = useRef(0);
  useEffect(() => {
    const prev = gameRef.current;
    gameRef.current = game;
    if (!game) return;
    const timeOnly =
      prev !== null &&
      prev.difficulty === game.difficulty &&
      prev.index === game.index &&
      prev.board === game.board &&
      prev.completed === game.completed;
    if (timeOnly && Date.now() - lastSaveAt.current < 5000) return;
    saveGame(game);
    lastSaveAt.current = Date.now();
  }, [game]);

  useEffect(() => {
    const flush = () => gameRef.current && saveGame(gameRef.current);
    const onVisibility = () => {
      setVisible(!document.hidden);
      if (document.hidden) flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // ----- Timer -----
  const running = !!game && !game.completed && !paused && visible && puzzles !== null;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', ms: now - last });
      last = now;
    }, 1000);
    return () => {
      clearInterval(id);
      dispatch({ type: 'tick', ms: performance.now() - last });
    };
  }, [running]);

  // ----- Completion -----
  const completedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const key = `${game.difficulty}:${game.index}`;
    if (!game.completed) {
      completedKey.current = key;
      return;
    }
    // Only celebrate transitions observed in this session (not reloading an already-solved game).
    if (completedKey.current === key) {
      completedKey.current = null;
      setStats(recordSolve(game.difficulty, game.elapsedMs, game.hintsUsed));
      setSelected(null);
      setModal('solved');
    }
  }, [game]);

  // ----- Derived -----
  const conflicts = useMemo(() => (game ? findConflicts(game.board.values) : new Set<number>()), [game]);
  const counts = useMemo(() => {
    const c = new Array(10).fill(0);
    game?.board.values.forEach((v) => c[v]++);
    return c;
  }, [game]);
  const full = !!game && isFull(game.board) && !game.completed;

  // ----- Actions -----
  const canPlay = !!game && !game.completed && !paused;

  const enterDigit = useCallback(
    (d: number, invertNotes = false) => {
      if (!canPlay || selected === null) return;
      dispatch({ type: 'enter', cell: selected, digit: d, notes: notesMode !== invertNotes });
    },
    [canPlay, selected, notesMode],
  );

  const eraseSelected = useCallback(() => {
    if (canPlay && selected !== null) dispatch({ type: 'erase', cell: selected });
  }, [canPlay, selected]);

  const hint = useCallback(() => {
    if (!canPlay || !game) return;
    const cell = pickHintCell(game.board, game.given, game.solution, selected);
    if (cell === null) return;
    dispatch({ type: 'reveal', cell });
    setSelected(cell);
  }, [canPlay, game, selected]);

  const act = useCallback(
    (type: 'undo' | 'redo' | 'fillSingles') => {
      if (canPlay) dispatch({ type });
    },
    [canPlay],
  );

  const requestAutoCandidates = useCallback(() => {
    if (!canPlay || !game) return;
    if (game.autoCandidatesUsed) setModal('confirmCandidates');
    else dispatch({ type: 'autoCandidates' });
  }, [canPlay, game]);

  const goToPuzzle = useCallback(
    (index: number) => {
      if (!puzzles) return;
      const i = ((index % puzzles.length) + puzzles.length) % puzzles.length;
      dispatch({ type: 'load', game: newGame(difficulty, i, puzzles[i]) });
      setSelected(null);
      setPaused(false);
      setModal(null);
    },
    [puzzles, difficulty],
  );

  const restart = () => {
    if (!window.confirm('Restart this puzzle? All progress and the timer will be reset.')) return;
    dispatch({ type: 'restart' });
    setSelected(null);
    setPaused(false);
    setModal(null);
  };

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  // ----- Keyboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        act(e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        act('redo');
        return;
      }
      if (mod || e.altKey) return;

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        enterDigit(Number(digit[1]), e.shiftKey);
        return;
      }
      const arrows: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (e.key in arrows) {
        e.preventDefault();
        const [dr, dc] = arrows[e.key];
        setSelected((s) => {
          if (s === null) return 40;
          const r = (Math.floor(s / 9) + dr + 9) % 9;
          const c = ((s % 9) + dc + 9) % 9;
          return r * 9 + c;
        });
        return;
      }
      switch (e.key) {
        case 'Backspace':
        case 'Delete':
        case '0':
          e.preventDefault();
          eraseSelected();
          break;
        case 'n':
        case 'N':
          setNotesMode((n) => !n);
          break;
        case 'a':
        case 'A':
          requestAutoCandidates();
          break;
        case 's':
        case 'S':
          act('fillSingles');
          break;
        case 'p':
        case 'P':
        case ' ':
          e.preventDefault();
          if (game && !game.completed) setPaused((p) => !p);
          break;
        case 'Escape':
          setSelected(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, act, enterDigit, eraseSelected, game]);

  // ----- Render -----
  return (
    <div className="flex min-h-dvh flex-col items-center px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <header className="flex w-full max-w-5xl items-center justify-between py-1">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="text-sky-600 dark:text-sky-400">
            <GridIcon />
          </span>
          Sudoku
        </h1>
        <button
          type="button"
          onClick={() => setModal('menu')}
          aria-label="Menu"
          className="rounded-full p-2 hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <MenuIcon />
        </button>
      </header>

      <nav className="mb-2 flex w-full max-w-xs rounded-xl bg-slate-200 p-1 dark:bg-slate-800" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficulty(d)}
            aria-pressed={d === difficulty}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              d === difficulty
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {LABELS[d]}
          </button>
        ))}
      </nav>

      <main className="flex w-full flex-1 flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-center lg:gap-8 lg:pt-4">
        <section className="w-[min(100vw-1.5rem,100dvh-23rem,34rem)] min-w-[18rem] lg:w-[min(100dvh-10rem,38rem)]">
          <div className="mb-1.5 flex items-center justify-between px-0.5 text-sm">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              {game && puzzles && game.difficulty === difficulty
                ? `${LABELS[difficulty]} #${game.index + 1} of ${puzzles.length}`
                : 'Loading…'}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <span className="text-slate-700 dark:text-slate-300">{formatTime(game?.elapsedMs ?? 0)}</span>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                disabled={!game || game.completed}
                aria-label={paused ? 'Resume' : 'Pause'}
                className="rounded-full p-1 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800 [&_svg]:h-5 [&_svg]:w-5"
              >
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
            </span>
          </div>

          <div className="relative">
            {game && puzzles && game.difficulty === difficulty ? (
              <Board
                board={game.board}
                given={game.given}
                solution={game.solution}
                selected={paused ? null : selected}
                conflicts={conflicts}
                autoCheck={settings.autoCheck}
                paused={paused}
                onSelect={(i) => !paused && setSelected(i)}
              />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
            )}
            {paused && (
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-white/70 text-lg font-semibold backdrop-blur-sm dark:bg-slate-900/70"
              >
                <PlayIcon />
                Paused — tap to resume
              </button>
            )}
          </div>

          <div className="mt-2 min-h-6 text-center text-sm">
            {game?.completed ? (
              <span className="inline-flex items-center gap-3">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Solved in {formatTime(game.elapsedMs)}
                </span>
                <button
                  type="button"
                  onClick={() => goToPuzzle(game.index + 1)}
                  className="rounded-lg bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-700"
                >
                  Next puzzle
                </button>
              </span>
            ) : full ? (
              <span className="font-medium text-rose-600 dark:text-rose-400">
                Not quite — something on the board isn't right.
              </span>
            ) : null}
          </div>
        </section>

        <section className="flex w-[min(100vw-1.5rem,100dvh-23rem,34rem)] min-w-[18rem] flex-col gap-3 lg:w-80">
          <div className="grid grid-cols-5 gap-1">
            <ToolButton label="Undo" onClick={() => act('undo')} disabled={!canPlay || !game?.history.length}>
              <UndoIcon />
            </ToolButton>
            <ToolButton label="Redo" onClick={() => act('redo')} disabled={!canPlay || !game?.future.length}>
              <RedoIcon />
            </ToolButton>
            <ToolButton label="Erase" onClick={eraseSelected} disabled={!canPlay}>
              <EraseIcon />
            </ToolButton>
            <ToolButton label="Notes" onClick={() => setNotesMode((n) => !n)} active={notesMode} badge={notesMode ? 'ON' : 'OFF'}>
              <PencilIcon />
            </ToolButton>
            <ToolButton label="Hint" onClick={hint} disabled={!canPlay}>
              <BulbIcon />
            </ToolButton>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AssistButton onClick={requestAutoCandidates} disabled={!canPlay}>
              <GridIcon />
              Auto candidates
            </AssistButton>
            <AssistButton onClick={() => act('fillSingles')} disabled={!canPlay}>
              <SparkIcon />
              Fill singles
            </AssistButton>
          </div>

          <NumberPad notesMode={notesMode} counts={counts} onDigit={(d) => enterDigit(d)} />

          <p className="hidden text-center text-xs text-slate-500 lg:block dark:text-slate-400">
            Press{' '}
            <button type="button" className="underline" onClick={() => setModal('help')}>
              ?
            </button>{' '}
            for keyboard shortcuts
          </p>
        </section>
      </main>

      {/* ----- Modals ----- */}
      <Modal open={modal === 'menu'} title="Menu" onClose={() => setModal(null)}>
        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700">
            <span>
              <span className="block font-medium">Auto-check</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Mark incorrect numbers in red</span>
            </span>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={settings.autoCheck}
              onChange={(e) => updateSettings({ ...settings, autoCheck: e.target.checked })}
            />
            <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-sky-600 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 dark:bg-slate-600" />
          </label>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">Theme</span>
            <div className="flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-900" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === t.value}
                  onClick={() => updateSettings({ ...settings, theme: t.value })}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                    settings.theme === t.value
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <ModalButton onClick={() => setModal('stats')}>Statistics</ModalButton>
          <ModalButton onClick={() => setModal('help')}>How to play &amp; shortcuts</ModalButton>
          <ModalButton onClick={() => game && goToPuzzle(game.index + 1)}>Skip to next puzzle</ModalButton>
          <ModalButton onClick={restart} danger>
            Restart puzzle
          </ModalButton>
        </div>
      </Modal>

      <Modal open={modal === 'confirmCandidates'} title="Reset all notes?" onClose={() => setModal(null)}>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          This replaces every note with the full set of candidates, including ones you removed. You can undo it.
        </p>
        <div className="flex flex-col gap-1">
          <ModalButton
            primary
            onClick={() => {
              setModal(null);
              if (canPlay) dispatch({ type: 'autoCandidates' });
            }}
          >
            Reset notes
          </ModalButton>
          <ModalButton onClick={() => setModal(null)}>Cancel</ModalButton>
        </div>
      </Modal>

      <Modal open={modal === 'stats'} title="Statistics" onClose={() => setModal(null)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th className="pb-2 font-medium" />
              <th className="pb-2 text-right font-medium">Solved</th>
              <th className="pb-2 text-right font-medium">Best</th>
              <th className="pb-2 text-right font-medium">Average</th>
            </tr>
          </thead>
          <tbody>
            {DIFFICULTIES.map((d) => {
              const s = stats[d];
              return (
                <tr key={d} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-2 font-medium">{LABELS[d]}</td>
                  <td className="py-2 text-right tabular-nums">{s.solved}</td>
                  <td className="py-2 text-right tabular-nums">{s.bestMs !== null ? formatTime(s.bestMs) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{s.solved ? formatTime(s.totalMs / s.solved) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Best times only count puzzles solved without hints.</p>
        <div className="mt-3">
          <ModalButton
            danger
            onClick={() => window.confirm('Reset all statistics?') && setStats(resetStats())}
          >
            Reset statistics
          </ModalButton>
        </div>
      </Modal>

      <Modal open={modal === 'solved'} title="Solved! 🎉" onClose={() => setModal(null)}>
        {game && (
          <>
            <p className="mb-1 text-slate-600 dark:text-slate-300">
              {LABELS[game.difficulty]} #{game.index + 1} in <strong>{formatTime(game.elapsedMs)}</strong>
              {game.hintsUsed > 0 && ` with ${game.hintsUsed} hint${game.hintsUsed === 1 ? '' : 's'}`}.
            </p>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {stats[game.difficulty].solved} {LABELS[game.difficulty].toLowerCase()} puzzle
              {stats[game.difficulty].solved === 1 ? '' : 's'} solved
              {stats[game.difficulty].bestMs !== null && ` · best ${formatTime(stats[game.difficulty].bestMs!)}`}
            </p>
            <div className="flex flex-col gap-1">
              <ModalButton primary onClick={() => goToPuzzle(game.index + 1)}>
                Next puzzle →
              </ModalButton>
              <ModalButton onClick={() => setModal(null)}>View board</ModalButton>
            </div>
          </>
        )}
      </Modal>

      <Modal open={modal === 'help'} title="How to play" onClose={() => setModal(null)}>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>Fill every row, column and 3×3 box with the digits 1–9.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Notes</b> switches the number pad to pencil-mark candidates.</li>
            <li><b>Auto candidates</b> fills every empty cell with all digits not already in its row, column or box. After the first use, it asks before resetting your notes.</li>
            <li><b>Fill singles</b> fills every cell whose notes contain exactly one candidate.</li>
            <li>Entering a number removes it from notes in the same row, column and box. Undo reverts all of it.</li>
          </ul>
          <table className="w-full">
            <tbody className="[&_td]:py-0.5 [&_td:first-child]:pr-3 [&_td:first-child]:font-mono [&_td:first-child]:whitespace-nowrap">
              <Shortcut keys="1–9" desc="Enter number" />
              <Shortcut keys="Shift + 1–9" desc="Toggle note (or number in notes mode)" />
              <Shortcut keys="0 / ⌫ / Del" desc="Erase" />
              <Shortcut keys="Arrows" desc="Move selection" />
              <Shortcut keys="N" desc="Toggle notes mode" />
              <Shortcut keys="A" desc="Auto candidates" />
              <Shortcut keys="S" desc="Fill singles" />
              <Shortcut keys="Ctrl+Z" desc="Undo" />
              <Shortcut keys="Ctrl+Y" desc="Redo" />
              <Shortcut keys="P / Space" desc="Pause" />
            </tbody>
          </table>
        </div>
      </Modal>

      <HelpKey onOpen={() => setModal('help')} disabled={modal !== null} />
    </div>
  );
}

function HelpKey({ onOpen, disabled }: { onOpen: () => void; disabled: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') onOpen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, disabled]);
  return null;
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <tr>
      <td>{keys}</td>
      <td>{desc}</td>
    </tr>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-35 ${
        active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300'
      } hover:bg-slate-200 disabled:hover:bg-transparent dark:hover:bg-slate-800`}
    >
      <span className="relative">
        {children}
        {badge && (
          <span
            className={`absolute -top-1.5 -right-4 rounded-full px-1 text-[0.6rem] leading-4 font-bold ${
              active ? 'bg-sky-600 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
            }`}
          >
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

function AssistButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium shadow-sm transition active:scale-[0.98] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-sky-600 dark:[&_svg]:text-sky-400"
    >
      {children}
    </button>
  );
}
