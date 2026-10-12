// Création de partie et boucle de tour compétitive (DESIGN.md §5.3, §6.1, §6.2, §6.6).
// Hypothèses utilisées : H4 (Y voyelle, joker ignoré, test à la distribution initiale seulement),
// H5 (premier joueur : joker re-tiré, égalité re-tirée), H9 (fin « sac insuffisant »), H12′ (coop : un seul
// chevalet d'équipe, siège 0, pas de tour), H10′ (coop : passer = terminer), H18 (état v2). Le mode coopératif
// (§7) est branché ici (LU-06, LU-15).
import { CELLS, JOKER, PAWNS, RACK_SIZE, STATE_VERSION, VOWELS } from './constants.js';
import { createBag, draw, returnTiles } from './bag.js';
import { COOP_MOTIFS, motteCells } from './layout.js';
import { seedState, shuffle } from './rng.js';
import { placeTiles, validatePlay } from './placement.js';
import { height } from './board.js';
import { applyTerritories } from './territory.js';
import { coopResult, isCoopMax } from './coop.js';

/** Vrai si les lettres non-joker sont toutes des voyelles ou toutes des consonnes (H4). */
export function isUnbalancedRack(rack) {
  const letters = rack.filter((t) => t !== JOKER);
  if (letters.length === 0) return false;
  const vowels = letters.filter((t) => VOWELS.has(t)).length;
  return vowels === 0 || vowels === letters.length;
}

/**
 * Tirage du premier joueur (H5) : chaque joueur tire une tuile ; la plus proche de A gagne.
 * Joker → remis au sac, re-mélangé, re-tiré ; égalité → les deux tuiles sont re-tirées.
 * Les tuiles sont remises et le sac re-mélangé à la fin.
 * → { current, firstDraw, bag, rng }
 */
export function drawFirstPlayer(bag, rng) {
  for (;;) {
    let d = draw(bag, 2);
    bag = d.bag;
    const tiles = d.tiles;
    for (let p = 0; p < 2; p++) {
      while (tiles[p] === JOKER) {
        ({ bag, rng } = returnTiles(bag, [tiles[p]], rng));
        d = draw(bag, 1);
        bag = d.bag;
        tiles[p] = d.tiles[0];
      }
    }
    ({ bag, rng } = returnTiles(bag, tiles, rng));
    if (tiles[0] !== tiles[1]) {
      return { current: tiles[0] < tiles[1] ? 0 : 1, firstDraw: tiles, bag, rng };
    }
  }
}

function dealRack(bag, rng) {
  for (;;) {
    const d = draw(bag, RACK_SIZE);
    if (!isUnbalancedRack(d.tiles)) return { rack: d.tiles, bag: d.bag, rng };
    ({ bag, rng } = returnTiles(d.bag, d.tiles, rng));
  }
}

export function createGame({ mode, seed, coop } = {}) {
  if (mode !== 'versus' && mode !== 'coop') {
    throw new Error(`createGame: mode invalide « ${mode} » (attendu : 'versus' ou 'coop')`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error('createGame: seed doit être un entier');
  }
  let coopState = null;
  let mottes = [];
  if (mode === 'coop') {
    const level = coop?.level;
    const motif = coop?.motif;
    if (!COOP_MOTIFS[level] || !COOP_MOTIFS[level].includes(motif)) {
      throw new Error(`createGame: motif « ${motif} » invalide pour le niveau « ${level} »`);
    }
    coopState = {
      level, motif, brownLeft: PAWNS.coopBrown, treesLeft: PAWNS.coopTrees,
      territories: 0, trees: 0, traverses: 0,
    };
    mottes = motteCells(motif);
  }

  let rng = seedState(seed);
  let bag;
  ({ array: bag, rng } = shuffle(createBag(), rng));
  // H12′ : coop = un seul siège (équipe), pas de tirage du premier joueur.
  const first = mode === 'coop' ? { current: 0, firstDraw: null } : drawFirstPlayer(bag, rng);
  if (mode !== 'coop') ({ bag, rng } = first);
  const players = [];
  for (let i = 0; i < (mode === 'coop' ? 1 : 2); i++) {
    const dealt = dealRack(bag, rng);
    ({ bag, rng } = dealt);
    players.push({ rack: dealt.rack, pawnsLeft: PAWNS.versus });
  }

  return {
    v: STATE_VERSION,
    mode,
    coop: coopState,
    rng,
    bag,
    players,
    board: Array.from({ length: CELLS }, () => []),
    locked: Array(CELLS).fill(false),
    mottes,
    orientation: null,
    edges: {},
    current: first.current,
    turn: 1,
    firstDraw: first.firstDraw,
    passes: 0,
    status: 'playing',
    result: null,
  };
}

/** Vue d'un joueur : sans sac (→ bagCount), sans rng, main adverse réduite à rackCount (DESIGN.md §5.3). */
export function viewFor(state, player) {
  const { bag, rng, players, ...rest } = structuredClone(state);
  return {
    ...rest,
    bagCount: bag.length,
    you: player,
    players: players.map(({ rack, ...p }, i) => (i === player ? { ...p, rack } : { ...p, rackCount: rack.length })),
  };
}

const countTerritories = (state, player) =>
  Object.values(state.edges).filter((e) => e.owner === player).length;

function endGame(state, events, result) {
  state.status = 'ended';
  state.result = result;
  events.push({ type: 'game-over', result });
}

// Fin de coup coop : repioche jusqu'à 6 (sac vide ≠ fin), puis fins `max` / chevalet vide (H10′, H12′).
function finishCoopPlay(state, player, events) {
  state.passes = 0;
  const need = RACK_SIZE - state.players[player].rack.length;
  const drawn = draw(state.bag, need);
  state.bag = drawn.bag;
  state.players[player].rack.push(...drawn.tiles);
  if (drawn.tiles.length > 0) events.push({ type: 'drew', player, count: drawn.tiles.length });
  if (isCoopMax(state)) {
    endGame(state, events, coopResult(state, 'max'));
  } else if (state.players[player].rack.length === 0) {
    endGame(state, events, coopResult(state, 'stuck'));
  } else {
    state.turn++;
  }
  return { ok: true, state, events };
}

function applyPass(state, player) {
  const events = [{ type: 'passed', player }];
  state.passes++;
  // H10′ : un seul chevalet, sans échange → passer (« Terminer ») termine la partie pour toute l'équipe.
  endGame(state, events, coopResult(state, 'stuck'));
  return { ok: true, state, events };
}

function applyPlay(state, player, action, dict) {
  const check = validatePlay(state, player, action.placements, dict);
  if (!check.ok) return check;
  const events = [];
  const { rack } = state.players[player];
  const placements = action.placements;
  const tiles = placements.map(({ cell, letter }) => ({ cell, letter }));

  const covering = new Set(placements.filter((p) => height(state.board, p.cell) > 0).map((p) => p.cell));
  state.board = placeTiles(state.board, rack, placements);
  const used = new Set(placements.map((p) => p.rackIndex));
  state.players[player].rack = rack.filter((_, i) => !used.has(i));
  state.orientation = check.orientation;
  events.push({ type: 'played', player, words: check.words, tiles });

  const territories = applyTerritories(state, player, check.words, { covering });
  Object.assign(state, territories.state);
  events.push(...territories.events);

  if (state.mode === 'coop') return finishCoopPlay(state, player, events);

  if (state.players[player].pawnsLeft === 0) {
    endGame(state, events, { winner: player, reason: 'pawns' });
    return { ok: true, state, events };
  }

  // Repioche jusqu'à 6 ; H9 : si le sac ne suffit pas, on pioche le reste et la partie s'arrête.
  const need = RACK_SIZE - state.players[player].rack.length;
  const drawn = draw(state.bag, need);
  state.bag = drawn.bag;
  state.players[player].rack.push(...drawn.tiles);
  if (drawn.tiles.length > 0) events.push({ type: 'drew', player, count: drawn.tiles.length });
  if (drawn.tiles.length < need) {
    const mine = countTerritories(state, player), theirs = countTerritories(state, 1 - player);
    endGame(state, events, { winner: mine === theirs ? null : (mine > theirs ? player : 1 - player), reason: 'bag' });
    return { ok: true, state, events };
  }
  state.current = 1 - player;
  state.turn++;
  return { ok: true, state, events };
}

function applyRenew(state, player, action) {
  const { rackIndices } = action;
  const rack = state.players[player].rack;
  if (!Array.isArray(rackIndices)) return { ok: false, error: 'bad-action' };
  if (rackIndices.length === 0) return { ok: false, error: 'renew-empty' };
  if (new Set(rackIndices).size !== rackIndices.length
    || rackIndices.some((i) => !Number.isInteger(i) || i < 0 || i >= rack.length)) {
    return { ok: false, error: 'bad-action' };
  }
  if (state.bag.length < rackIndices.length) return { ok: false, error: 'bag-too-small' };

  // On pioche d'abord, puis on remet les tuiles défaussées et on re-mélange.
  const drawn = draw(state.bag, rackIndices.length);
  const discarded = rackIndices.map((i) => rack[i]);
  rackIndices.forEach((i, k) => { rack[i] = drawn.tiles[k]; });
  ({ bag: state.bag, rng: state.rng } = returnTiles(drawn.bag, discarded, state.rng));
  state.current = 1 - player;
  state.turn++;
  return { ok: true, state, events: [{ type: 'renewed', player, count: rackIndices.length }] };
}

/**
 * Applique une action → `{ ok, state, events }` | `{ ok: false, error }`. Ne mute jamais `state`.
 * Actions : `{ type: 'play', placements }`, `{ type: 'renew', rackIndices }` (compétitif), `{ type: 'pass' }` (coop).
 */
export function applyAction(state, player, action, dict) {
  if (state.status !== 'playing') return { ok: false, error: 'game-over' };
  if (state.current !== player) return { ok: false, error: 'not-your-turn' };
  if (action === null || typeof action !== 'object') return { ok: false, error: 'bad-action' };
  const next = structuredClone(state);
  switch (action.type) {
    case 'play':
      return applyPlay(next, player, action, dict);
    case 'renew':
      return state.mode === 'versus' ? applyRenew(next, player, action) : { ok: false, error: 'renew-forbidden' };
    case 'pass':
      return state.mode === 'coop' ? applyPass(next, player) : { ok: false, error: 'pass-forbidden' };
    default:
      return { ok: false, error: 'bad-action' };
  }
}
