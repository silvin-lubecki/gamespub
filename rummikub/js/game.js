// Descripteur de jeu (common/README.md). Niveaux : Facile (RUM-01) et Normale (RUM-02, par défaut).
import { engine, parseAction } from './engine/index.js';
import { bots } from './ai/index.js';
import { timeBots } from './bot-timing.js';
import { mountGame, renderEnd } from './ui/game-screen.js';
import { rulesHtml } from './ui/rules.js';

export const game = {
  id: 'rummikub',
  title: 'Rummikub',
  protocolVersion: 1,
  seats: { min: 2, max: 4, counts: [2, 3, 4], default: 2 },
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'normal', label: 'Normale' }],
  defaultLevel: 'normal',
  engine,
  parseAction,
  bots: timeBots(bots),
  ui: { mountGame, renderEnd, rulesHtml, stage: 'landscape' },
};
