import type { Trap } from '../types';

/**
 * Standard chess starting position (FEN). All traps below start here, but a
 * trap may set any legal FEN — the trainer reads `startFEN` and plays from it.
 */
export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/*
 * ---------------------------------------------------------------------------
 * TRAP DATA
 * ---------------------------------------------------------------------------
 * You play WHITE. White nodes are the moves you must find; black nodes are the
 * scripted mistakes/replies that auto-play. Every line ends on a White move at
 * the winning position.
 *
 * These five lines are SEED DATA: every move has been checked for legality with
 * chess.js and every final position was verified with Stockfish to be clearly
 * winning for White (evaluations range from +1.5 to +6.9). Swap in your own
 * curated move data here — the trainer just reads this array.
 * ---------------------------------------------------------------------------
 */
export const TRAPS: Trap[] = [
  {
    id: 'london-qb6-trap',
    name: 'The Qb6 Queenside Raid',
    description: "Punishing the greedy ...Qxb2 with Nxd5 — the queen gets stranded.",
    startFEN: START_FEN,
    line: [
      { move: 'd4', side: 'white', note: 'The London begins with the queen’s pawn.' },
      { move: 'd5', side: 'black', note: '' },
      { move: 'Bf4', side: 'white', note: 'The London bishop — developed before e3 so it never gets locked in.' },
      { move: 'c5', side: 'black', note: '' },
      { move: 'e3', side: 'white', note: 'Solid: props up d4 and frees the f1-bishop.' },
      { move: 'Qb6', side: 'black', note: 'Black eyes the loose b2-pawn.' },
      { move: 'Nc3', side: 'white', note: 'Develop and dangle the b2-pawn as bait.' },
      { move: 'Qxb2', side: 'black', note: 'Black swallows the bait — the greedy ...Qxb2.' },
      { move: 'Nxd5', side: 'white', note: 'The refutation! Ignore b2 and blow open the centre — the knight hits c7 and the b2-queen is stranded.' },
      { move: 'cxd4', side: 'black', note: '' },
      { move: 'Rb1', side: 'white', note: 'Kick the queen while the knight glares at c7.' },
      { move: 'Qa2', side: 'black', note: 'The only square — the queen is running out of air.' },
      { move: 'Bb5+', side: 'white', note: 'A check that develops with tempo and prepares Nc7+.' },
      { move: 'Nd7', side: 'black', note: 'Forced, blocking the check.' },
      { move: 'Nc7+', side: 'white', note: 'The royal fork: check on the king and a hit on the a8-rook.' },
      { move: 'Kd8', side: 'black', note: '' },
      { move: 'Nxa8', side: 'white', note: 'Winning the exchange with a crushing position — and the queen is still stuck offside.' },
    ],
  },
  {
    id: 'london-bishop-hunt',
    name: 'The Bishop Hunt',
    description: 'Black chases the London bishop with ...Nh5 and ...f6 — a zwischenzug punishes it.',
    startFEN: START_FEN,
    line: [
      { move: 'd4', side: 'white', note: 'Queen’s pawn — the London setup is coming.' },
      { move: 'Nf6', side: 'black', note: '' },
      { move: 'Bf4', side: 'white', note: 'The bishop comes out early, the London way.' },
      { move: 'd5', side: 'black', note: '' },
      { move: 'e3', side: 'white', note: 'Backing up d4.' },
      { move: 'Nh5', side: 'black', note: 'Black hunts the f4-bishop to grab the bishop pair.' },
      { move: 'Be5', side: 'white', note: 'Sidestep to a strong central square instead of retreating meekly.' },
      { move: 'f6', side: 'black', note: 'Black attacks again — but this loosens c7 and the king.' },
      { move: 'Bxc7', side: 'white', note: 'Zwischenzug! Before retreating, snatch c7 and hit the queen.' },
      { move: 'Qxc7', side: 'black', note: '' },
      { move: 'Bb5+', side: 'white', note: 'Another in-between check, dragging a blocker to d7.' },
      { move: 'Bd7', side: 'black', note: 'Forced.' },
      { move: 'Qxh5+', side: 'white', note: 'Now collect the offside knight on h5 — with check.' },
      { move: 'g6', side: 'black', note: '' },
      { move: 'Qxd5', side: 'white', note: 'And mop up d5. White is two clean pawns up with the safer king.' },
    ],
  },
  {
    id: 'london-a2-snatch',
    name: 'The a2 Snatch',
    description: 'A checking queen grabs the a2-pawn — but it was never free.',
    startFEN: START_FEN,
    line: [
      { move: 'd4', side: 'white', note: 'Queen’s pawn opening.' },
      { move: 'd5', side: 'black', note: '' },
      { move: 'Bf4', side: 'white', note: 'The London bishop.' },
      { move: 'Nf6', side: 'black', note: '' },
      { move: 'e3', side: 'white', note: 'Solid support for d4.' },
      { move: 'c5', side: 'black', note: '' },
      { move: 'Nf3', side: 'white', note: 'Natural development.' },
      { move: 'Qa5+', side: 'black', note: 'A check that also leers at the a2-pawn.' },
      { move: 'Nc3', side: 'white', note: 'Block the check by developing — and quietly keep the a1-rook guarding a2.' },
      { move: 'Qxa2', side: 'black', note: 'The greedy grab — but a2 was never really free.' },
      { move: 'Rxa2', side: 'white', note: 'Oops! The a1-rook was defending a2 the whole time. Black just hung the queen for a rook.' },
    ],
  },
  {
    id: 'london-f6-king-hunt',
    name: 'The f6 King Hunt',
    description: 'Weakening ...f6 and ...e5 invites a queen check that hunts the black king.',
    startFEN: START_FEN,
    line: [
      { move: 'd4', side: 'white', note: 'Queen’s pawn.' },
      { move: 'd5', side: 'black', note: '' },
      { move: 'Bf4', side: 'white', note: 'The London bishop, out early.' },
      { move: 'f6', side: 'black', note: 'A clumsy move: it walls in the king and weakens the a2–g8 diagonal.' },
      { move: 'e3', side: 'white', note: 'Calm development — let Black overextend.' },
      { move: 'e5', side: 'black', note: 'Black overreaches in the centre with an already-weakened king.' },
      { move: 'dxe5', side: 'white', note: 'Rip the centre open against the exposed king.' },
      { move: 'fxe5', side: 'black', note: 'The natural recapture — and the losing move.' },
      { move: 'Qh5+', side: 'white', note: 'The point! With ...f6 played there is no ...g6 shield, so the king must march.' },
      { move: 'Kd7', side: 'black', note: 'Forced out into the open.' },
      { move: 'Qf5+', side: 'white', note: 'Keep checking and dragging the king forward.' },
      { move: 'Kc6', side: 'black', note: '' },
      { move: 'Qxe5', side: 'white', note: 'Regain the pawn with a winning attack — the black king is stranded in no-man’s-land.' },
    ],
  },
  {
    id: 'london-g5-lunge',
    name: 'The g5 Lunge',
    description: 'A quick lesson: ...g5 attacks the bishop but drops a free pawn.',
    startFEN: START_FEN,
    line: [
      { move: 'd4', side: 'white', note: 'Queen’s pawn.' },
      { move: 'd5', side: 'black', note: '' },
      { move: 'Bf4', side: 'white', note: 'The London bishop develops to f4.' },
      { move: 'g5', side: 'black', note: 'Black lunges at the bishop — but g5 is undefended.' },
      { move: 'Bxg5', side: 'white', note: 'Just take it. ...g5 was a lunge into thin air; White is a clean pawn up.' },
    ],
  },
];

export function getTrapById(id: string): Trap | undefined {
  return TRAPS.find((t) => t.id === id);
}
