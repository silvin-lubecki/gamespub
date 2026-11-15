// Descripteur de jeu (common/README.md).
import { engine, parseAction } from './engine/index.js';
import { bots } from './ai/index.js';
import { mountGame, renderEnd, rulesHtml } from './ui/game-screen.js';

export const game = {
  id: "blokus",
  title: "Blokus",
  protocolVersion: 1,
  seats: { min: 2, max: 4, counts: [2, 3, 4], default: 2 },
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'normal', label: 'Normale' }],
  defaultLevel: 'normal',
  engine,
  parseAction,
  bots,
  ui: { mountGame, renderEnd, rulesHtml, stage: 'landscape' },
};
