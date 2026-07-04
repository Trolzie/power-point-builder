# London System Trap Trainer

A single-page web app that drills you on punishing the top opening traps in the
**London System**, playing the **White** side. You play the winning moves; the
app gives instant feedback on every move.

- **Correct** → green tick + a coaching note, then Black's scripted reply auto-plays.
- **Legal but off the main line** → the move is judged by Stockfish:
  - roughly equal or better → yellow _"Also fine, but the main line is X."_
  - clearly worse → red _"Not best — the trap continues with X."_ (retry or reveal)
- **Illegal** → the piece snaps back silently (enforced by chess.js).

Progress (completed / attempts) is saved per-trap in `localStorage`.

## Stack

| Concern | Library |
| --- | --- |
| App | React 19 + Vite + TypeScript (strict) |
| Chess rules, legality, SAN/FEN | [`chess.js`](https://github.com/jhlywa/chess.js) |
| Board UI (drag & drop) | [`react-chessboard`](https://github.com/Clariity/react-chessboard) v5 |
| Eval backstop | [`stockfish`](https://github.com/nmrugg/stockfish.js) 18 (WASM), in a Web Worker |

No backend — everything runs in the browser.

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm install` pulls in the Stockfish engine. A `predev` / `prebuild` hook
(`scripts/copy-engine.mjs`) copies the engine into `public/engine/` for you, so
there is no manual step — just `npm run dev`.

```bash
npm run build    # type-check (tsc -b) + production build to dist/
npm run preview  # serve the production build
```

## How to use

1. Pick a trap from the list on the left.
2. Drag White's pieces to play the punishing line. Green means you found it.
3. Stuck? **Reveal next move** highlights the move; **Play hint** plays it for you.
4. **Restart** resets the trap, **Flip board** rotates it.
5. Finish the line to the winning position and the trap is marked completed
   (the badge persists across reloads).

## How the Stockfish worker is wired

WASM workers are fiddly, so all of it is isolated in
[`src/engine/stockfish.ts`](src/engine/stockfish.ts) behind a tiny API:
`getEngine().evaluate(fen)` → centipawns from White's point of view.

Key decisions:

- **Which build.** We ship the **lite, single-threaded** Stockfish 18
  (`stockfish-18-lite-single`, ~7 MB). Single-threaded means no
  `SharedArrayBuffer`, which means **no COOP/COEP cross-origin-isolation
  headers** are required — so it runs under a plain `npm run dev` with zero
  server configuration.
- **Where the files live.** `scripts/copy-engine.mjs` copies two files into
  `public/engine/` on `predev`/`prebuild`:
  - `stockfish.js` — the emscripten glue. This file **is itself a classic Web
    Worker script**, so we spawn it directly with
    `new Worker('/engine/stockfish.js')`. The engine therefore runs entirely off
    the main thread and never blocks the UI.
  - `stockfish.wasm` — the engine binary. The glue auto-locates it as
    `stockfish.wasm` next to the `.js`, which is exactly where we put it.

  (`public/engine/` is git-ignored — it's regenerated from `node_modules`.)
- **Protocol.** Communication is the UCI text protocol over `postMessage`:
  we send `position fen …` / `go depth …`; the worker streams back
  `info … score cp N …` and finally `bestmove …`. Scores come from the
  side-to-move's perspective and are flipped to White's perspective by the
  wrapper. Requests are queued so only one search runs at a time.
- **Graceful degradation.** Stockfish is only a *backstop* — the trap tree
  already knows the main line. If the worker can't load (old browser, blocked
  worker), `evaluate()` rejects and the trainer falls back to a neutral
  "off the main line" message instead of crashing.

## Trap data

Traps live in [`src/data/traps.ts`](src/data/traps.ts) as a move **tree**
(`Trap[]`). Each node is `{ move, side, note }` in SAN. You play White nodes;
Black nodes auto-play. Swap in your own curated lines here — the trainer just
reads this array.

The five seed lines were **verified programmatically**: every move was checked
for legality with chess.js, and every final position was confirmed by Stockfish
to be clearly winning for White (evaluations range from about +1.5 to +6.9).

## Project structure

```
src/
  data/traps.ts            # the 5 traps (move trees) + START_FEN
  engine/stockfish.ts      # isolated, commented Stockfish worker wrapper
  hooks/
    useTrapTrainer.ts      # core state machine + feedback rules
    useProgress.ts         # localStorage progress (completed / attempts)
  lib/moves.ts             # SAN normalisation + SAN→squares helpers
  components/
    BoardPanel.tsx         # react-chessboard wrapper (drag → onPieceDrop)
    TrapPicker.tsx         # trap list with progress badges
    FeedbackBar.tsx        # colored feedback banner
    Controls.tsx           # reveal / play hint / restart / flip + progress bar
  App.tsx                  # layout wiring
scripts/copy-engine.mjs    # copies Stockfish into public/engine on predev/prebuild
```

## Not built yet (deliberately out of scope)

Playing the Black/defending side, an engine-Black free-play mode, spaced
repetition, and accuracy stats over time.
