// Shared types for the London trap trainer.

/** One ply in a trap's scripted line. */
export interface TrapNode {
  /** Move in SAN, e.g. "d4", "Bf4", "Qxb2", "Nc7+", "O-O". */
  move: string;
  /** Which color makes this move. White nodes are the ones the user must find. */
  side: 'white' | 'black';
  /**
   * Coaching note shown when this move is played correctly. On white nodes it
   * explains why the move is the punish; on black nodes it flags the mistake.
   */
  note: string;
}

/** A single opening trap: a straight-line move tree the user drills. */
export interface Trap {
  id: string;
  name: string;
  description: string;
  /**
   * Starting position. Standard start unless a trap begins mid-game.
   * `START_FEN` is exported from data/traps.ts for the standard position.
   */
  startFEN: string;
  /** The scripted line, alternating sides, always ending on a White move. */
  line: TrapNode[];
}

/** Tone drives the color + icon of the feedback banner. */
export type FeedbackTone = 'green' | 'yellow' | 'red' | 'info' | 'neutral';

export interface Feedback {
  tone: FeedbackTone;
  title: string;
  detail: string;
}

/** High-level state of the trainer for the current trap. */
export type TrainerStatus =
  | 'awaiting' // waiting for the user's White move
  | 'evaluating' // an off-book move is being checked by Stockfish
  | 'blackReplying' // Black's scripted reply is animating in
  | 'complete'; // reached the winning position

export interface SquarePair {
  from: string;
  to: string;
}

/** Per-trap progress persisted to localStorage. */
export interface TrapProgress {
  completed: boolean;
  attempts: number;
  lastCompletedAt?: number;
}

export type ProgressMap = Record<string, TrapProgress>;
