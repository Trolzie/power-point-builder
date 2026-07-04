import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import type { Feedback, SquarePair, Trap, TrainerStatus, TrapNode } from '../types';
import { getEngine } from '../engine/stockfish';
import { sanEquals, sanToSquares } from '../lib/moves';

/** Delay before Black's scripted reply auto-plays, so the user sees it happen. */
const BLACK_REPLY_DELAY_MS = 500;

/**
 * How much worse than equality (centipawns, White's view) an off-book move may
 * be before we call it "clearly worse" rather than "also fine". A move that
 * keeps White roughly equal-or-better (>= -50cp) is fine; below that it has
 * genuinely let Black back into the game.
 */
const ALSO_FINE_CP_FLOOR = -50;

interface Callbacks {
  onAttempt?: (trapId: string) => void;
  onComplete?: (trapId: string) => void;
}

export interface TrainerApi {
  fen: string;
  status: TrainerStatus;
  feedback: Feedback | null;
  orientation: 'white' | 'black';
  /** Squares of the last move played, for highlighting. */
  lastMove: SquarePair | null;
  /** Squares highlighted by "reveal hint". */
  hint: SquarePair | null;
  /** How many plies of the line have been completed (for a progress bar). */
  ply: number;
  totalPlies: number;
  /** True once the user is allowed to drag a White piece. */
  canMove: boolean;
  onPieceDrop: (source: string, target: string, pieceType: string) => boolean;
  reveal: () => void;
  playHint: () => void;
  restart: () => void;
  flip: () => void;
}

export function useTrapTrainer(trap: Trap, cb: Callbacks = {}): TrainerApi {
  const gameRef = useRef<Chess>(new Chess(trap.startFEN));
  const lineIndexRef = useRef(0);
  // Bumped on every user-visible transition so a slow async engine result that
  // belongs to a stale position can be discarded when it finally resolves.
  const tokenRef = useRef(0);

  const [fen, setFen] = useState(trap.startFEN);
  const [status, setStatus] = useState<TrainerStatus>('awaiting');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [lastMove, setLastMove] = useState<SquarePair | null>(null);
  const [hint, setHint] = useState<SquarePair | null>(null);
  const [ply, setPly] = useState(0);

  // Keep the latest callbacks without making every memoised fn depend on them.
  const onAttemptRef = useRef(cb.onAttempt);
  const onCompleteRef = useRef(cb.onComplete);
  onAttemptRef.current = cb.onAttempt;
  onCompleteRef.current = cb.onComplete;

  /** Play any scripted Black nodes sitting at the front of the line right now. */
  const autoplayLeadingBlack = useCallback(() => {
    while (
      lineIndexRef.current < trap.line.length &&
      trap.line[lineIndexRef.current].side === 'black'
    ) {
      gameRef.current.move(trap.line[lineIndexRef.current].move);
      lineIndexRef.current += 1;
    }
  }, [trap]);

  /** (Re)initialise the board for the current trap and count it as an attempt. */
  const load = useCallback(() => {
    tokenRef.current += 1;
    gameRef.current = new Chess(trap.startFEN);
    lineIndexRef.current = 0;
    autoplayLeadingBlack();
    setFen(gameRef.current.fen());
    setPly(lineIndexRef.current);
    setLastMove(null);
    setHint(null);
    setStatus(lineIndexRef.current >= trap.line.length ? 'complete' : 'awaiting');
    setFeedback({
      tone: 'info',
      title: trap.name,
      detail: `${trap.description} You play White — find the moves.`,
    });
    onAttemptRef.current?.(trap.id);
  }, [trap, autoplayLeadingBlack]);

  // Reload whenever the selected trap changes. The ref guard makes this run
  // exactly once per trap id, so React StrictMode's double-invoke in dev doesn't
  // double-count attempts. Explicit restarts go through restart()/load() instead.
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedIdRef.current === trap.id) return;
    loadedIdRef.current = trap.id;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trap.id]);

  const finishTrap = useCallback(
    (winningNote: string) => {
      setStatus('complete');
      setFeedback({
        tone: 'green',
        title: '✓ Trap complete!',
        detail: `${winningNote} You reached the winning position — Black is lost.`,
      });
      onCompleteRef.current?.(trap.id);
    },
    [trap.id],
  );

  /** After a correct White move, play Black's scripted reply (if any). */
  const scheduleBlackReply = useCallback(() => {
    const myToken = tokenRef.current;
    setStatus('blackReplying');
    window.setTimeout(() => {
      if (myToken !== tokenRef.current) return; // superseded by restart / trap change
      const idx = lineIndexRef.current;
      if (idx >= trap.line.length) return;
      const node = trap.line[idx];
      const mv = gameRef.current.move(node.move);
      lineIndexRef.current = idx + 1;
      setFen(gameRef.current.fen());
      setPly(lineIndexRef.current);
      if (mv) setLastMove({ from: mv.from, to: mv.to });

      if (lineIndexRef.current >= trap.line.length) {
        finishTrap(node.note || ''); // lines end on White, so this is a safety net
        return;
      }
      // Narrate Black's reply if it carries a note; otherwise keep the green banner.
      if (node.note) {
        setFeedback({ tone: 'info', title: `Black replies ${node.move}`, detail: node.note });
      }
      setStatus('awaiting');
    }, BLACK_REPLY_DELAY_MS);
  }, [trap, finishTrap]);

  /**
   * Commit a verified-correct White move. The move must ALREADY be applied to
   * `gameRef`; `lineIndexRef` still points at the node just played. Shared by
   * the drag handler and "Play hint".
   */
  const commitCorrect = useCallback(
    (mv: Move, node: TrapNode) => {
      tokenRef.current += 1;
      lineIndexRef.current += 1;
      setFen(gameRef.current.fen());
      setPly(lineIndexRef.current);
      setLastMove({ from: mv.from, to: mv.to });
      setHint(null);
      setFeedback({ tone: 'green', title: `Correct — ${mv.san}`, detail: node.note });
      if (lineIndexRef.current >= trap.line.length) finishTrap(node.note);
      else scheduleBlackReply();
    },
    [trap, finishTrap, scheduleBlackReply],
  );

  /** Judge an off-book but legal move with Stockfish, then advise. */
  const judgeOffBook = useCallback((fenAfter: string, expectedSan: string) => {
    const myToken = tokenRef.current;
    setStatus('evaluating');
    setFeedback({ tone: 'info', title: 'Checking that move…', detail: 'Asking the engine.' });

    const neutralAdvice = () =>
      setFeedback({
        tone: 'neutral',
        title: 'Off the main line',
        detail: `The trap continues with ${expectedSan}. Try again or reveal the hint. (Engine eval unavailable.)`,
      });

    getEngine()
      .evaluate(fenAfter, { depth: 12 })
      .then((res) => {
        if (myToken !== tokenRef.current) return; // user already moved on
        const mateForWhite = res.mate !== undefined && res.mate > 0;
        const mateForBlack = res.mate !== undefined && res.mate < 0;
        const okByCp = res.cp !== undefined && res.cp >= ALSO_FINE_CP_FLOOR;

        if (mateForWhite || okByCp) {
          setFeedback({
            tone: 'yellow',
            title: 'Also fine — but not the main line',
            detail: `That holds up (${formatEval(res)}), but the trap’s main line is ${expectedSan}. Play it to continue.`,
          });
        } else if (mateForBlack || res.cp !== undefined) {
          setFeedback({
            tone: 'red',
            title: 'Not best — that lets Black off the hook',
            detail: `The engine gives ${formatEval(res)}. The trap continues with ${expectedSan}. Try again or reveal the hint.`,
          });
        } else {
          neutralAdvice();
        }
        setStatus('awaiting');
      })
      .catch(() => {
        if (myToken !== tokenRef.current) return;
        neutralAdvice();
        setStatus('awaiting');
      });
  }, []);

  const onPieceDrop = useCallback(
    (source: string, target: string, pieceType: string): boolean => {
      // Gate: only White pieces, only when it's the user's turn to find a move.
      if (status !== 'awaiting' && status !== 'evaluating') return false;
      if (!pieceType || pieceType[0] !== 'w') return false;
      const idx = lineIndexRef.current;
      if (idx >= trap.line.length) return false;
      const expected = trap.line[idx];
      if (expected.side !== 'white') return false;

      // Auto-queen promotions (none of the seed traps promote, but be safe).
      const promotion = pieceType === 'wP' && target[1] === '8' ? 'q' : undefined;

      // Try the move on a clone first, so an illegal move just snaps back.
      const clone = new Chess(gameRef.current.fen());
      let mv: Move | null;
      try {
        mv = clone.move({ from: source, to: target, promotion });
      } catch {
        return false; // illegal — react-chessboard snaps the piece back
      }
      if (!mv) return false;

      setHint(null);

      if (sanEquals(mv.san, expected.move)) {
        gameRef.current.move({ from: source, to: target, promotion });
        commitCorrect(mv, expected);
        return true;
      }

      // Legal but off-book: don't commit (snap back), judge with the engine.
      tokenRef.current += 1;
      judgeOffBook(clone.fen(), expected.move);
      return false;
    },
    [status, trap, commitCorrect, judgeOffBook],
  );

  const reveal = useCallback(() => {
    const idx = lineIndexRef.current;
    if (idx >= trap.line.length || trap.line[idx].side !== 'white') return;
    const expected = trap.line[idx];
    setHint(sanToSquares(gameRef.current.fen(), expected.move));
    setFeedback({
      tone: 'info',
      title: 'Hint',
      detail: `Play ${expected.move}. (Use “Play hint” to make the move for you.)`,
    });
  }, [trap]);

  const playHint = useCallback(() => {
    if (status !== 'awaiting' && status !== 'evaluating') return;
    const idx = lineIndexRef.current;
    if (idx >= trap.line.length || trap.line[idx].side !== 'white') return;
    const expected = trap.line[idx];
    let mv: Move | null;
    try {
      mv = gameRef.current.move(expected.move); // guaranteed legal by construction
    } catch {
      return;
    }
    if (mv) commitCorrect(mv, expected);
  }, [status, trap, commitCorrect]);

  const restart = useCallback(() => load(), [load]);
  const flip = useCallback(
    () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
    [],
  );

  return {
    fen,
    status,
    feedback,
    orientation,
    lastMove,
    hint,
    ply,
    totalPlies: trap.line.length,
    canMove: status === 'awaiting' || status === 'evaluating',
    onPieceDrop,
    reveal,
    playHint,
    restart,
    flip,
  };
}

function formatEval(res: { cp?: number; mate?: number }): string {
  if (res.mate !== undefined) {
    return res.mate > 0 ? `mate in ${res.mate}` : `Black mates in ${-res.mate}`;
  }
  if (res.cp !== undefined) {
    const pawns = res.cp / 100;
    return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
  }
  return 'unclear';
}
