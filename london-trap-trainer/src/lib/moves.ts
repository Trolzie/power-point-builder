import { Chess } from 'chess.js';
import type { SquarePair } from '../types';

/**
 * Strip decorations so two SAN strings can be compared for "same move".
 * Removes check/mate marks (+, #), annotation glyphs (!, ?) and normalises
 * castling zeros to letters ("0-0" -> "O-O"). Piece-letter case is preserved
 * (that's significant in SAN), so we do NOT lowercase.
 */
export function normalizeSan(san: string): string {
  return san
    .replace(/[+#!?]/g, '')
    .replace(/0/g, 'O')
    .trim();
}

/** True if two SAN strings denote the same move, ignoring decorations. */
export function sanEquals(a: string, b: string): boolean {
  return normalizeSan(a) === normalizeSan(b);
}

/**
 * Resolve a SAN move to its from/to squares by playing it on a throwaway board.
 * Returns null if the move is not legal in `fen` (bad data / wrong position).
 */
export function sanToSquares(fen: string, san: string): SquarePair | null {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    return move ? { from: move.from, to: move.to } : null;
  } catch {
    return null;
  }
}
