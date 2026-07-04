// Copies the Stockfish engine (lite, single-threaded build) out of node_modules
// and into public/engine so Vite serves it at /engine/*. Runs automatically via
// the `predev` / `prebuild` npm hooks, so a fresh `npm install && npm run dev`
// just works with no manual step.
//
// We use the *lite single-threaded* flavor on purpose:
//   - ~7 MB (vs >100 MB for the full build) -> fast to load.
//   - single-threaded -> does NOT need SharedArrayBuffer, which would require
//     COOP/COEP cross-origin-isolation headers. That keeps `npm run dev` header-free.
//
// The engine's emscripten glue looks for its wasm as "stockfish.wasm" sitting
// next to the .js file, so we rename both to that stem.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const binDir = resolve(root, 'node_modules', 'stockfish', 'bin');
const outDir = resolve(root, 'public', 'engine');

const files = [
  ['stockfish-18-lite-single.js', 'stockfish.js'],
  ['stockfish-18-lite-single.wasm', 'stockfish.wasm'],
];

mkdirSync(outDir, { recursive: true });

for (const [src, dest] of files) {
  const from = resolve(binDir, src);
  const to = resolve(outDir, dest);
  if (!existsSync(from)) {
    console.error(
      `[copy-engine] Missing ${from}. Did "npm install" run? The "stockfish" package should provide it.`,
    );
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`[copy-engine] ${src} -> public/engine/${dest}`);
}
