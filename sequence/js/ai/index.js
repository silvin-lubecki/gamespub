// IA de Séquence (DESIGN-plateforme §7.3). Pure : le seul aléa vient du `rng` fourni.
// Facile : une fois sur deux un coup légal au hasard, sinon le meilleur coup Normal sans valet à un œil ; défausse toujours les cartes mortes.
// Normale : évaluation à 1 coup (fenêtres de 5 passant par la case) avec coût d'opportunité des valets.
import { WINDOWS, WINDOWS_BY_CELL, isCorner } from '../engine/board.js';
import { isOneEyed, isTwoEyed } from '../engine/cards.js';
import { deadCards, legalPlays, teamOf } from '../engine/index.js';
import { findNewSequences } from '../engine/sequences.js';

/** Potentiel offensif selon le nombre de jetons de l'équipe (coins compris) après le coup. */
export const OFFENSE = Object.freeze([0, 1, 3, 9, 27, 1000]);
/** Valeur de blocage selon le nombre de jetons adverses (coins compris) dans la fenêtre. */
export const BLOCK = Object.freeze([0, 0, 2, 8, 200]);
/** Coût d'opportunité d'un valet à deux yeux / à un œil. */
export const COST = Object.freeze({ two: 6, one: 4 });
const WIN = 1e6;

// Coup de pose (carte normale ou valet à deux yeux) : score, victoire immédiate, blocage d'un 4.
function scorePlacement(state, team, cell) {
  const board = state.board;
  let score = 0;
  let blocks4 = false;
  let maxOwn = 0;
  const mySequences = state.sequences.filter((s) => s.team === team);
  for (const k of WINDOWS_BY_CELL[cell]) {
    // une fenêtre qui partage 2 cases ou plus avec une séquence déjà acquise ne peut plus donner une séquence (H-SEQ-6)
    const dead = mySequences.some((s) => WINDOWS[k].filter((i) => s.cells.includes(i)).length >= 2);
    let own = 0; let opp = 0; let corners = 0; let mine = 0; let oppTeam = -1; let mixed = false;
    for (const i of WINDOWS[k]) {
      if (i === cell) continue;
      if (isCorner(i)) { corners++; continue; }
      const chip = board[i].chip;
      if (chip === null) continue;
      if (chip === team) mine++;
      else { opp++; if (oppTeam === -1) oppTeam = chip; else if (oppTeam !== chip) mixed = true; }
    }
    own = mine + corners;
    if (opp === 0) {
      if (dead) continue;
      score += OFFENSE[own + 1];
      if (own + 1 > maxOwn) maxOwn = own + 1;
    } else if (mine === 0 && !mixed) {
      const count = Math.min(4, opp + corners);
      score += BLOCK[count];
      if (count === 4) blocks4 = true;
    }
  }
  let wins = false;
  if (maxOwn === 5) { // une fenêtre est complétable : vérification exacte (règle de la case commune comprise)
    const b = board.slice();
    b[cell] = { ...b[cell], chip: team };
    const have = state.sequences.filter((s) => s.team === team).length;
    wins = have + findNewSequences(b, state.sequences, team, cell).length >= state.target;
  }
  return { score: wins ? score + WIN : score, wins, blocks4 };
}

// Menace de l'équipe `o` dans une fenêtre sans jeton d'une autre équipe : BLOCK[jetons de o + coins] (0 si déjà complète).
function windowThreat(board, k, o, skip) {
  let count = 0;
  for (const i of WINDOWS[k]) {
    if (isCorner(i)) { count++; continue; }
    if (i === skip) continue;
    const chip = board[i].chip;
    if (chip === o) count++;
    else if (chip !== null) return 0;
  }
  return count < 5 ? BLOCK[count] : 0;
}

function maxThreat(board, o, skip) {
  let best = 0;
  for (let k = 0; k < WINDOWS.length; k++) {
    const v = windowThreat(board, k, o, skip);
    if (v > best) best = v;
  }
  return best;
}

// Valet à un œil sur le jeton adverse `cell` : baisse du meilleur potentiel adverse (échelle de blocage), moins le coût.
function scoreRemoval(state, cell, cache) {
  const o = state.board[cell].chip;
  const base = (cache[o] ??= maxThreat(state.board, o, -1));
  const after = maxThreat(state.board, o, cell);
  return { score: base - after - COST.one, wins: false, blocks4: base === 200 && after < 200 };
}

/** Tous les coups de pose/retrait légaux avec leur score → [{ action, score, wins, blocks4, jack: null|'two'|'one' }]. */
export function scoreMoves(state, seat, { allowOneEyed = true } = {}) {
  const team = teamOf(seat, state.teams);
  const cache = {};
  const out = [];
  for (const action of legalPlays(state, seat)) {
    if (isOneEyed(action.card)) {
      if (!allowOneEyed) continue;
      out.push({ action, jack: 'one', ...scoreRemoval(state, action.cell, cache) });
    } else {
      const m = scorePlacement(state, team, action.cell);
      const two = isTwoEyed(action.card);
      out.push({ action, jack: two ? 'two' : null, ...m, score: two ? m.score - COST.two : m.score });
    }
  }
  return out;
}

function best(moves, rng) {
  let top = -Infinity;
  let ties = [];
  for (const m of moves) {
    if (m.score > top) { top = m.score; ties = [m]; } else if (m.score === top) ties.push(m);
  }
  return ties.length ? ties[Math.floor(rng() * ties.length)] : null;
}

/** Meilleur coup Normal (carte morte non comprise) ou null s'il n'y a aucun coup légal. */
export function normalPlay(state, seat, rng, opts) {
  const moves = scoreMoves(state, seat, opts);
  const plain = moves.filter((m) => m.jack === null);
  const jacks = moves.filter((m) => m.jack !== null);
  const winning = plain.filter((m) => m.wins);
  if (winning.length) return best(winning, rng).action;
  const bestPlain = best(plain, rng);
  const bestJack = best(jacks, rng);
  if (!bestJack) return bestPlain?.action ?? null;
  if (!bestPlain) return bestJack.action;
  if (bestJack.wins || bestJack.score > bestPlain.score || (bestJack.blocks4 && !bestPlain.blocks4)) return bestJack.action;
  return bestPlain.action;
}

const firstDead = (state, seat) => (state.deadUsed ? null : deadCards(state, seat)[0] ?? null);

/** Coup légal au hasard (uniforme). */
export function randomAction(state, seat, rng) {
  const plays = legalPlays(state, seat);
  return plays.length ? plays[Math.floor(rng() * plays.length)] : { type: 'pass' };
}

export function normalAction(state, seat, rng, opts) {
  const dead = firstDead(state, seat);
  if (dead) return { type: 'dead', card: dead };
  return normalPlay(state, seat, rng, opts) ?? { type: 'pass' };
}

export function easyAction(state, seat, rng) {
  const dead = firstDead(state, seat);
  if (dead) return { type: 'dead', card: dead };
  if (rng() < 0.5) return randomAction(state, seat, rng);
  return normalPlay(state, seat, rng, { allowOneEyed: false }) ?? randomAction(state, seat, rng);
}

/** Coup de repli toujours légal : un coup de pose, sinon une carte morte, sinon passer. */
export function fallback(state, seat) {
  const plays = legalPlays(state, seat);
  if (plays.length) return plays[0];
  const dead = firstDead(state, seat);
  return dead ? { type: 'dead', card: dead } : { type: 'pass' };
}

export const bots = {
  chooseAction(state, seat, level, rng) {
    return level === 'easy' ? easyAction(state, seat, rng) : normalAction(state, seat, rng);
  },
  fallback,
};
