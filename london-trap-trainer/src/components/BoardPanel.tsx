import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import type { SquarePair } from '../types';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  canMove: boolean;
  lastMove: SquarePair | null;
  hint: SquarePair | null;
  onPieceDrop: (source: string, target: string, pieceType: string) => boolean;
}

const LAST_MOVE_STYLE = { background: 'rgba(255, 213, 79, 0.45)' };
const HINT_STYLE = {
  background: 'rgba(56, 189, 248, 0.55)',
  boxShadow: 'inset 0 0 0 3px rgba(14, 165, 233, 0.9)',
};

export function BoardPanel({ fen, orientation, canMove, lastMove, hint, onPieceDrop }: Props) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { ...LAST_MOVE_STYLE };
      styles[lastMove.to] = { ...LAST_MOVE_STYLE };
    }
    if (hint) {
      styles[hint.from] = { ...HINT_STYLE };
      styles[hint.to] = { ...HINT_STYLE };
    }
    return styles;
  }, [lastMove, hint]);

  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: canMove,
          squareStyles,
          animationDurationInMs: 250,
          // react-chessboard hands us the piece + squares; we forward to the trainer,
          // which returns true to keep the move or false to snap it back.
          onPieceDrop: ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
            if (!targetSquare) return false; // dragged off the board
            return onPieceDrop(sourceSquare, targetSquare, piece.pieceType);
          },
          // Only White pieces are ever draggable (the user plays White).
          canDragPiece: ({ piece }) => piece.pieceType[0] === 'w',
          darkSquareStyle: { backgroundColor: '#7c8a99' },
          lightSquareStyle: { backgroundColor: '#dce3ea' },
          id: 'trap-board',
        }}
      />
    </div>
  );
}
