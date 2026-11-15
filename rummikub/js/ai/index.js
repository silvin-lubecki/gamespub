// Bots du Rummikub : Facile (RUM-01) et Normale (RUM-02, niveau par défaut).
import { chooseEasy } from './easy.js';
import { chooseNormal } from './normal.js';

export const bots = {
  chooseAction: (state, seat, level) => (level === 'easy' ? chooseEasy(state, seat) : chooseNormal(state, seat)),
  fallback: (state) => ({ type: state.pool.length ? 'draw' : 'pass' }),
};
