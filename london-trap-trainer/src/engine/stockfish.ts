/**
 * ============================================================================
 * Stockfish engine wrapper  (the "eval backstop")
 * ============================================================================
 *
 * WASM workers are fiddly, so all the fiddliness is isolated here. The rest of
 * the app only ever calls `getEngine().evaluate(fen)` and gets back a plain
 * number of centipawns from White's point of view.
 *
 * HOW IT'S WIRED
 * --------------
 * `scripts/copy-engine.mjs` copies two files into /public/engine on predev:
 *
 *     /engine/stockfish.js    <- emscripten glue. This file IS itself a
 *                                classic Web Worker script (it wires up its own
 *                                `onmessage`), so we spawn it directly with
 *                                `new Worker('/engine/stockfish.js')`. That runs
 *                                the whole engine off the main thread — the UI
 *                                never blocks while Stockfish thinks.
 *     /engine/stockfish.wasm  <- the engine binary. The glue auto-locates it as
 *                                "stockfish.wasm" sitting next to the .js, which
 *                                is exactly where we put it.
 *
 * We use the LITE SINGLE-THREADED build. Single-threaded means no
 * SharedArrayBuffer, which means no COOP/COEP headers are required — so this
 * works under a plain `npm run dev` with zero server configuration.
 *
 * PROTOCOL
 * --------
 * Communication is the UCI text protocol over postMessage:
 *   - we `postMessage('uci')`, `postMessage('position fen ...')`, `postMessage('go depth N')`
 *   - the worker posts back lines like:
 *         "info depth 12 ... score cp -37 ... pv e7e5 ..."
 *         "bestmove e7e5 ponder g1f3"
 *   Scores are always from the SIDE-TO-MOVE's perspective; we convert to White.
 *
 * GRACEFUL DEGRADATION
 * --------------------
 * Stockfish is only a *backstop* — the trap tree already knows the main line.
 * If the worker fails to load (old browser, blocked worker, missing files),
 * `evaluate()` rejects and the trainer falls back to a neutral "off the main
 * line" message instead of crashing. `isAvailable()` reports engine health.
 */

export interface EvalResult {
  /** Centipawns from White's perspective (positive = good for White). Present unless `mate` is. */
  cp?: number;
  /** Mate distance from White's perspective: +N = White mates in N, -N = White gets mated. */
  mate?: number;
  /** The engine's preferred move in UCI notation, e.g. "e2e4" (for reference/debugging). */
  bestMove?: string;
}

interface PendingEval {
  fen: string;
  depth: number;
  resolve: (r: EvalResult) => void;
  reject: (e: Error) => void;
  timer: number | null;
  lastScore: EvalResult | null;
}

/** Per-search wall-clock ceiling. Feedback should feel instant, so keep it low. */
const EVAL_TIMEOUT_MS = 6000;

class StockfishEngine {
  private worker: Worker | null = null;
  private dead = false;
  /** Only one search runs at a time; extra requests wait in this queue. */
  private queue: PendingEval[] = [];
  private active: PendingEval | null = null;

  constructor() {
    try {
      // The glue script is a classic (non-module) worker.
      this.worker = new Worker('/engine/stockfish.js');
      this.worker.onmessage = (e: MessageEvent) => this.onLine(e.data);
      this.worker.onerror = (e) => this.onFatal(e.message || 'stockfish worker error');
      // Kick off the UCI handshake. `ucinewgame` clears any stale hash.
      this.send('uci');
      this.send('ucinewgame');
      this.send('isready');
    } catch (err) {
      // e.g. Worker constructor blocked, or file 404 in some environments.
      this.onFatal(err instanceof Error ? err.message : String(err));
    }
  }

  /** True while the worker is alive (it may still be finishing its handshake). */
  isAvailable(): boolean {
    return !this.dead && this.worker !== null;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  /**
   * Evaluate a position. Resolves with the score from White's perspective.
   * Rejects if the engine is unavailable or the search times out — callers
   * should treat a rejection as "couldn't judge, stay neutral".
   */
  evaluate(fen: string, opts: { depth?: number } = {}): Promise<EvalResult> {
    if (this.dead || !this.worker) {
      return Promise.reject(new Error('Stockfish unavailable'));
    }
    return new Promise<EvalResult>((resolve, reject) => {
      this.queue.push({
        fen,
        depth: opts.depth ?? 12,
        resolve,
        reject,
        timer: null,
        lastScore: null,
      });
      this.pump();
    });
  }

  /** Start the next queued search if the engine is idle. */
  private pump() {
    if (this.active || this.queue.length === 0 || this.dead) return;
    const job = this.queue.shift()!;
    this.active = job;
    // Guard against a search that never reports (dead engine, lost message).
    job.timer = setTimeout(() => this.finishActive(new Error('eval timeout')), EVAL_TIMEOUT_MS) as unknown as number;
    this.send(`position fen ${job.fen}`);
    this.send(`go depth ${job.depth}`);
  }

  /** Handle one line of UCI output from the worker. */
  private onLine(data: unknown) {
    if (typeof data !== 'string') return;

    // Handshake acks — nothing to do, but don't mistake them for eval output.
    if (data === 'uciok' || data === 'readyok') return;

    const job = this.active;
    if (!job) return;

    if (data.startsWith('info') && data.includes(' score ')) {
      const parsed = this.parseScore(data, job.fen);
      if (parsed) job.lastScore = parsed;
      return;
    }

    if (data.startsWith('bestmove')) {
      const best = data.split(/\s+/)[1];
      const result: EvalResult = job.lastScore ?? {};
      if (best && best !== '(none)') result.bestMove = best;
      this.finishActive(null, result);
    }
  }

  /**
   * Parse "... score cp N ..." or "... score mate N ..." out of an info line
   * and flip it to White's perspective based on whose move it is in `fen`.
   */
  private parseScore(line: string, fen: string): EvalResult | null {
    const m = line.match(/score (cp|mate) (-?\d+)/);
    if (!m) return null;
    const whiteToMove = fen.split(' ')[1] === 'w';
    const sign = whiteToMove ? 1 : -1;
    const value = parseInt(m[2], 10) * sign;
    return m[1] === 'mate' ? { mate: value } : { cp: value };
  }

  /** Resolve/reject the active job and move on to the next queued one. */
  private finishActive(err: Error | null, result?: EvalResult) {
    const job = this.active;
    this.active = null;
    if (job) {
      if (job.timer !== null) clearTimeout(job.timer);
      if (err) job.reject(err);
      else job.resolve(result ?? {});
    }
    this.pump();
  }

  /** Engine died: reject everything and mark unavailable so callers can fall back. */
  private onFatal(message: string) {
    if (this.dead) return;
    this.dead = true;
    // eslint-disable-next-line no-console
    console.warn(`[stockfish] engine unavailable, falling back to tree-only feedback: ${message}`);
    const fail = (j: PendingEval) => {
      if (j.timer !== null) clearTimeout(j.timer);
      j.reject(new Error('Stockfish unavailable'));
    };
    if (this.active) fail(this.active);
    this.active = null;
    this.queue.forEach(fail);
    this.queue = [];
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
  }
}

// Lazily-created singleton so we build (and download the ~7 MB wasm) only once,
// and only in the browser (never during SSR / build).
let singleton: StockfishEngine | null = null;

export function getEngine(): StockfishEngine {
  if (!singleton) singleton = new StockfishEngine();
  return singleton;
}

export type { StockfishEngine };
