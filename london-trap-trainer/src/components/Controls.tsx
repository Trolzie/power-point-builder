import type { TrainerStatus } from '../types';

interface Props {
  status: TrainerStatus;
  ply: number;
  totalPlies: number;
  onReveal: () => void;
  onPlayHint: () => void;
  onRestart: () => void;
  onFlip: () => void;
}

export function Controls({ status, ply, totalPlies, onReveal, onPlayHint, onRestart, onFlip }: Props) {
  const complete = status === 'complete';
  const busy = status === 'blackReplying';
  const pct = totalPlies > 0 ? Math.round((ply / totalPlies) * 100) : 0;

  return (
    <div className="controls">
      <div className="progress" aria-label="Line progress">
        <div className="progress__bar" style={{ width: `${pct}%` }} />
        <span className="progress__label">
          {ply} / {totalPlies} moves
        </span>
      </div>
      <div className="controls__buttons">
        <button type="button" onClick={onReveal} disabled={complete || busy}>
          Reveal next move
        </button>
        <button type="button" onClick={onPlayHint} disabled={complete || busy}>
          Play hint
        </button>
        <button type="button" onClick={onRestart}>
          Restart
        </button>
        <button type="button" onClick={onFlip}>
          Flip board
        </button>
      </div>
    </div>
  );
}
