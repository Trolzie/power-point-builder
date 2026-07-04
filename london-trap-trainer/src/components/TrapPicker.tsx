import type { ProgressMap, Trap } from '../types';

interface Props {
  traps: Trap[];
  selectedId: string;
  progress: ProgressMap;
  onSelect: (id: string) => void;
}

export function TrapPicker({ traps, selectedId, progress, onSelect }: Props) {
  return (
    <nav className="picker" aria-label="Trap list">
      <h2 className="picker__heading">Traps</h2>
      <ul className="picker__list">
        {traps.map((trap, i) => {
          const p = progress[trap.id];
          const done = p?.completed;
          return (
            <li key={trap.id}>
              <button
                type="button"
                className={`picker__item${trap.id === selectedId ? ' is-active' : ''}`}
                onClick={() => onSelect(trap.id)}
                aria-current={trap.id === selectedId ? 'true' : undefined}
              >
                <span className={`picker__badge${done ? ' is-done' : ''}`} aria-hidden="true">
                  {done ? '✓' : i + 1}
                </span>
                <span className="picker__body">
                  <span className="picker__name">{trap.name}</span>
                  <span className="picker__desc">{trap.description}</span>
                  {p && p.attempts > 0 && (
                    <span className="picker__stats">
                      {done ? 'Completed' : 'In progress'} · {p.attempts}{' '}
                      {p.attempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
