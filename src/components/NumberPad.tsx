interface Props {
  notesMode: boolean;
  /** How many of each digit (index 1-9) are on the board. */
  counts: number[];
  onDigit: (d: number) => void;
}

export function NumberPad({ notesMode, counts, onDigit }: Props) {
  return (
    <div className="grid grid-cols-9 gap-1 sm:gap-1.5 lg:grid-cols-3 lg:gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const done = counts[d] >= 9;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onDigit(d)}
            aria-label={`${notesMode ? 'Note' : 'Enter'} ${d}`}
            className={`relative flex aspect-[3/4] items-center lg:aspect-[4/3] justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition active:scale-95 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700 ${
              done ? 'opacity-30' : ''
            }`}
          >
            {notesMode ? (
              <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-1.5">
                {Array.from({ length: 9 }, (_, k) => (
                  <span
                    key={k}
                    className={`flex items-center justify-center text-[0.65rem] font-semibold text-sky-700 sm:text-xs lg:text-base dark:text-sky-300 ${
                      k === d - 1 ? '' : 'invisible'
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-2xl font-medium text-slate-800 sm:text-3xl dark:text-slate-100">{d}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
