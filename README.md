# sudoku

An offline-first Sudoku PWA built with React, TypeScript and Tailwind CSS. It includes 1,000 bundled puzzles each for
Easy, Medium and Hard, and plays much like NYT Sudoku.

## Features

- **Normal and Notes modes**: notes are pencil-mark candidates. Entering a number removes that candidate from every
  note in the same row, column and box.
- **Auto candidates** fills every empty cell with the digits not already in its row, column or box. This replaces
  any notes already there. After the first use in a puzzle, it asks for confirmation before resetting your notes.
- **Fill singles** fills every cell whose notes contain exactly one candidate, in a single pass.
- **Undo/redo** treats each action as one step, including candidates that were removed automatically.
- **Highlighting**: selecting a cell highlights its row, column and box, and every matching number, including in notes.
- **Mistakes**: conflicts are always highlighted. Optional **Auto-check** (in the menu) marks incorrect entries in red.
- **Hints, timer, pause and restart**. **Statistics** record solved count and best/average time per difficulty. Best
  times only count puzzles solved without hints.
- Puzzles are played in order (Easy #1, #2, …). Each difficulty keeps its own in-progress game in `localStorage`.
- Theme can be set to System, Light or Dark in the menu. Desktop keyboard shortcuts are listed under `?`.

## Puzzles

Puzzles are generated once and committed as `src/data/{easy,medium,hard}.json`. Each is an 81-character string with
`0` for empty cells. Every puzzle has a unique solution, and difficulty is graded by the hardest technique needed to
solve it without guessing:

| Level  | Techniques required                                                          |
|--------|------------------------------------------------------------------------------|
| Easy   | Naked/hidden singles only (35–39 clues)                                      |
| Medium | Locked candidates and naked/hidden pairs and triples                         |
| Hard   | At least one of X-Wing, Swordfish, Y-Wing, XYZ-Wing, or naked/hidden quads   |

To regenerate (output is deterministic for a given seed):

```sh
npm run generate-puzzles -- --count 1000 --seed 2026
```

> Regenerating changes which puzzle is at each number, so saved in-progress games start fresh.

## Development

```sh
npm install
npm run dev        # Vite dev server
npm test           # unit tests (game logic + puzzle validity)
npm run build      # type-check + production build to dist/
npm start          # serve dist/ with the tiny Node server (PORT, default 3000)
```

App icons are generated from `public/favicon.svg` with `npm run generate-icons`.

## Docker

The image builds the app and serves it with a zero-dependency Node static server (`server/server.mjs`) on internal
port 3000. `docker-compose.yml` maps it to the host port in `$PORT_SUDOKU`:

```sh
export PORT_SUDOKU=8085   # or set it system-wide
docker compose up -d --build
```

Health check endpoint: `/healthz`.

**HTTPS is required** for the service worker, which handles installing to the home screen and offline play. Put the
container behind your HTTPS reverse proxy. After the first visit, the app works fully offline.

## Original instructions

I have an empty git repository here, and I'd like a Sudoku app. It should have three levels (easy, medium, hard)
and a nearly-unlimited amount of each of them (not really unlimited, but around a thousand of each would be nice).
The player should have the ability to fill in each cell with obviously the number they think it might be, but
also with notes for "candidates". It should roughly play like the NYT Sudoku. Like NYT, there should be a button
that automatically fills each empty cell with potential candidates, purely based off what numbers are NOT in their
shared row/column/square. Unlike NYT, there should also be a button that automatically fills any cell that has only
one candidate with that candidate. When filling a cell with a number, all candidates of that number in the same
row, column, or square should be removed. There should be an undo button, which takes ALL changes (including any
automatically-removed candidates from the last step) into account. When a cell with a number is selected, all
instances of that number should likewise appear as if they were selected.  

The design should be simple, nothing too fancy, but still should look nice. As far as tech stack goes, this will
primarily be used on my phone, but I could see myself using it on the computer too. Because of this, I'd like a
PWA built with React, Typescript, and Tailwind CSS. I'd like to play it offline on my phone, so I think there
doesn't really need to be a server. If so, just a really lightweight one that doesn't do much. There doesn't need
to be any sort of auth. It will be hosted on my home server, and I'll use Docker. Because of this, create the
necessary files for Docker. It will run on a port (external port, the internal to Docker port doesn't matter) that
is defined by the system environment variable $PORT_SUDOKU.  

I'm sure you will have many questions, please ask them.
