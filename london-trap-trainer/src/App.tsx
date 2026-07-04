import { useEffect, useMemo, useState } from 'react';
import { TRAPS, getTrapById } from './data/traps';
import { useProgress } from './hooks/useProgress';
import { useTrapTrainer } from './hooks/useTrapTrainer';
import { getEngine } from './engine/stockfish';
import { BoardPanel } from './components/BoardPanel';
import { TrapPicker } from './components/TrapPicker';
import { FeedbackBar } from './components/FeedbackBar';
import { Controls } from './components/Controls';
import './App.css';

export default function App() {
  const { progress, recordAttempt, recordCompletion } = useProgress();
  const [selectedId, setSelectedId] = useState<string>(TRAPS[0].id);
  const trap = useMemo(() => getTrapById(selectedId) ?? TRAPS[0], [selectedId]);

  // Warm the engine up in the background so off-book feedback is snappy. Safe to
  // call repeatedly — it's a singleton and degrades gracefully if WASM fails.
  useEffect(() => {
    getEngine();
  }, []);

  const trainer = useTrapTrainer(trap, {
    onAttempt: recordAttempt,
    onComplete: recordCompletion,
  });

  const completedCount = TRAPS.filter((t) => progress[t.id]?.completed).length;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">London System Trap Trainer</h1>
          <p className="app__subtitle">
            Play the White side and punish Black’s greedy tries. Instant feedback on every move.
          </p>
        </div>
        <div className="app__score" title="Traps completed">
          {completedCount} / {TRAPS.length} completed
        </div>
      </header>

      <main className="app__main">
        <aside className="app__sidebar">
          <TrapPicker
            traps={TRAPS}
            selectedId={selectedId}
            progress={progress}
            onSelect={setSelectedId}
          />
        </aside>

        <section className="app__stage">
          <div className="stage__board">
            <BoardPanel
              fen={trainer.fen}
              orientation={trainer.orientation}
              canMove={trainer.canMove}
              lastMove={trainer.lastMove}
              hint={trainer.hint}
              onPieceDrop={trainer.onPieceDrop}
            />
          </div>

          <div className="stage__side">
            <div className="stage__trapname">
              <h2>{trap.name}</h2>
              <p>{trap.description}</p>
            </div>

            <FeedbackBar feedback={trainer.feedback} />

            <Controls
              status={trainer.status}
              ply={trainer.ply}
              totalPlies={trainer.totalPlies}
              onReveal={trainer.reveal}
              onPlayHint={trainer.playHint}
              onRestart={trainer.restart}
              onFlip={trainer.flip}
            />
          </div>
        </section>
      </main>

      <footer className="app__footer">
        Rules &amp; legality by <code>chess.js</code> · board by <code>react-chessboard</code> ·
        off-book moves judged by a <code>stockfish.js</code> (WASM) worker.
      </footer>
    </div>
  );
}
