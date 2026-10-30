import { boxOf, colOf, rowOf, bit, UNITS } from '../sudoku/core';
import type { Board as BoardData } from '../game/board';

interface Props {
  board: BoardData;
  given: readonly boolean[];
  solution: readonly number[];
  selected: number | null;
  conflicts: Set<number>;
  autoCheck: boolean;
  paused: boolean;
  onSelect: (cell: number) => void;
}

const BOXES = UNITS.slice(18);

export function Board({ board, given, solution, selected, conflicts, autoCheck, paused, onSelect }: Props) {
  const selectedValue = selected !== null ? board.values[selected] : 0;

  const cellClass = (i: number) => {
    const v = board.values[i];
    const isSelected = i === selected;
    const sameValue = selectedValue !== 0 && v === selectedValue;
    const inScope =
      selected !== null &&
      (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected));
    const conflict = conflicts.has(i);
    const wrong = autoCheck && v !== 0 && !given[i] && v !== solution[i];

    let bg = 'bg-white dark:bg-slate-900';
    if (isSelected) bg = 'bg-sky-200 dark:bg-sky-800';
    else if (conflict) bg = 'bg-rose-100 dark:bg-rose-950';
    else if (sameValue) bg = 'bg-sky-200 dark:bg-sky-800';
    else if (inScope) bg = 'bg-slate-100 dark:bg-slate-800';

    let text = 'text-sky-700 dark:text-sky-300';
    if (given[i]) text = 'text-slate-900 dark:text-slate-100 font-semibold';
    if (!given[i] && (wrong || conflict)) text = 'text-rose-600 dark:text-rose-400';

    const ring = isSelected ? 'ring-2 ring-inset ring-sky-500 dark:ring-sky-400' : '';
    return `${bg} ${text} ${ring}`;
  };

  return (
    <div
      className="@container relative aspect-square w-full select-none rounded-md bg-slate-800 p-[2px] dark:bg-slate-500"
      role="grid"
      aria-label="Sudoku board"
    >
      <div className="grid h-full w-full grid-cols-3 gap-[2px]">
        {BOXES.map((cells, b) => (
          <div key={b} className="grid grid-cols-3 gap-px bg-slate-300 dark:bg-slate-700">
            {cells.map((i) => {
              const v = board.values[i];
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  aria-label={`Row ${rowOf(i) + 1} column ${colOf(i) + 1}${v ? `, ${v}` : ', empty'}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onSelect(i);
                  }}
                  className={`relative flex aspect-square items-center justify-center outline-none transition-colors duration-75 ${cellClass(i)}`}
                >
                  {paused ? null : v ? (
                    <span className="text-[6.5cqw] leading-none">{v}</span>
                  ) : board.notes[i] ? (
                    <Notes mask={board.notes[i]} highlight={selectedValue} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Notes({ mask, highlight }: { mask: number; highlight: number }) {
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[0.3cqw]">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <span
          key={d}
          className={`flex items-center justify-center rounded-full text-[2.5cqw] leading-none ${
            mask & bit(d)
              ? d === highlight
                ? 'bg-sky-600 font-bold text-white dark:bg-sky-500'
                : 'text-slate-600 dark:text-slate-300'
              : 'invisible'
          }`}
        >
          {d}
        </span>
      ))}
    </span>
  );
}
