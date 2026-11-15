// Écran Partie de Séquence (DESIGN-plateforme §7.4, SEQ-02) : plateau 10×10 en cartes SVG miniatures, jetons à symboles, main en cartes
// SVG complètes, bandeau des équipes. Le rendu est fait de fonctions pures (chaînes HTML/SVG, testées sans DOM) ; `mountGame` ne
// fait que de la délégation de clics et un re-rendu. Le jeu appelle ctx.onEnd(view) quand la partie est finie.
import { esc } from '../../common/ui/svg.js';
import { CELLS_OF, SIZE } from '../engine/board.js';
import { isJack, isOneEyed } from '../engine/cards.js';
import { targetsOf } from '../engine/index.js';
import { TEAM_COLORS, cardName, cardSvg, chipSvg, cornerSvg } from './svg-cards.js';

export const TEAM_NAMES = ['bleue', 'verte', 'rouge'];
const SOLO_NAMES = ['bleu', 'vert', 'rouge'];
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const SYMBOLS = ['●', '▲', '■'];

/** Messages de refus du moteur (codes de docs/DESIGN.md) ; `offline` vient du réseau. */
export const ERRORS = Object.freeze({
  over: 'La partie est terminée.',
  'not-your-turn': 'Ce n’est pas votre tour.',
  'bad-action': 'Action non valide.',
  'not-in-hand': 'Cette carte n’est plus dans votre main.',
  'bad-cell': 'Case non valide.',
  corner: 'Les coins sont libres pour tous : on n’y joue pas.',
  'wrong-cell': 'Cette carte ne se joue pas sur cette case.',
  occupied: 'Cette case est déjà occupée.',
  'empty-cell': 'Il n’y a aucun jeton à retirer ici.',
  'own-chip': 'Ce jeton est celui de votre équipe.',
  locked: 'Ce jeton fait partie d’une séquence : il ne peut plus être retiré.',
  'not-dead': 'Cette carte n’est pas morte.',
  'dead-used': 'Une seule carte morte par tour.',
  'cannot-pass': 'Vous avez encore un coup possible.',
  offline: 'Hors ligne : reconnexion en cours…',
});

// Les miniatures du plateau sont constantes : on les construit une fois.
const memo = new Map();
const cached = (key, make) => { if (!memo.has(key)) memo.set(key, make()); return memo.get(key); };
const miniOf = (card) => cached(`m${card}`, () => (card ? cardSvg(card, { size: 'mini' }) : cornerSvg()));
const fullOf = (card) => cached(`f${card}`, () => cardSvg(card));
const chipOf = (team, locked) => cached(`c${team}${locked}`, () => chipSvg(team, { locked }));

export const isDead = (view, card) => !isJack(card) && CELLS_OF[card].every((i) => view.board[i].chip !== null);
const isMine = (view) => view.phase === 'play' && view.current === view.you;
const playsOf = (view) => view.hand.flatMap((card) => targetsOf(view, view.you, card));
export const canPass = (view) => isMine(view) && playsOf(view).length === 0 && (view.deadUsed || !view.hand.some((c) => isDead(view, c)));

const teamLabel = (view, t) => (view.seatCount <= 3 ? cap(SOLO_NAMES[t]) : `Équipe ${TEAM_NAMES[t]}`);

/** Texte d'état (pur, testé). */
export function statusText(view) {
  if (view.phase === 'over') {
    if (view.winner === 'draw') return 'Partie nulle.';
    return view.seatCount <= 3 ? `Victoire de ${view.names[view.winner]} (${SOLO_NAMES[view.winner]}).` : `Victoire de l’équipe ${TEAM_NAMES[view.winner]}.`;
  }
  return view.current === view.you ? 'À vous de jouer' : `Au tour de ${view.names[view.current]}…`;
}

/** Bandeau : équipes (symbole, membres, séquences x/cible), dernière carte de chacun, pioche, état. */
export function bannerHtml(view) {
  const teams = [];
  for (let t = 0; t < view.teams; t++) {
    const members = [];
    for (let i = t; i < view.seatCount; i += view.teams) {
      const last = view.lastCards[i];
      members.push(`<li class="player${view.phase === 'play' && view.current === i ? ' is-current' : ''}${i === view.you ? ' is-you' : ''}" data-player="${i}">`
        + `<span class="player-name">${esc(view.names[i])}${i === view.you ? ' (vous)' : ''}</span>`
        + `<span class="player-cards" title="Cartes en main">${view.handCounts[i]} c.</span>`
        + `<span class="player-last" data-last-card="${last ?? ''}" title="Dernière carte jouée">${last ? miniOf(last) : ''}</span></li>`);
    }
    const seqs = view.sequences.filter((s) => s.team === t).length;
    teams.push(`<div class="team${t === view.team ? ' is-mine' : ''}" data-team="${t}" style="--team:${TEAM_COLORS[t]}">`
      + `<div class="team-head">${chipOf(t, false)}<b class="team-name">${esc(teamLabel(view, t))}</b>`
      + `<span class="team-seqs" title="Séquences">${seqs}/${view.target}</span></div><ul class="players">${members.join('')}</ul></div>`);
  }
  return `<div class="seq-banner"><div class="teams">${teams.join('')}</div>`
    + `<p class="deck-size">Pioche : ${view.deckSize}</p><p class="status">${esc(statusText(view))}</p></div>`;
}

/** Plateau 10×10 ; une case n'est cliquable que si c'est notre tour, qu'une carte est choisie et que la case est une cible. */
export function boardHtml(view, { selected = null, mine = isMine(view) } = {}) {
  const targets = mine && selected ? new Set(targetsOf(view, view.you, selected)) : new Set();
  const removing = selected && isOneEyed(selected);
  const inSeq = new Set(view.sequences.flatMap((s) => s.cells));
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const c = view.board[i];
    const on = targets.has(i);
    const cls = ['cell', on ? (removing ? 'is-target is-remove' : 'is-target') : '', inSeq.has(i) ? 'is-seq' : '', view.last?.cell === i ? 'is-last' : ''].filter(Boolean).join(' ');
    const name = c.card ? cardName(c.card) : 'Coin libre';
    const owner = c.chip === null ? '' : `, jeton ${view.seatCount <= 3 ? SOLO_NAMES[c.chip] : `de l’équipe ${TEAM_NAMES[c.chip]}`}`;
    cells.push(`<button type="button" class="${cls}" data-cell="${i}"${c.chip === null ? '' : ` data-chip="${c.chip}"`} aria-label="${esc(name + owner)}"${on ? '' : ' disabled'}>`
      + `${miniOf(c.card)}${c.chip === null ? '' : chipOf(c.chip, c.locked || inSeq.has(i))}</button>`);
  }
  return `<div class="seq-board" data-mine="${mine}">${cells.join('')}</div>`;
}

/** Main : cartes SVG complètes, badge « morte » et bouton Échanger sur les cartes mortes. */
export function handHtml(view, { selected = null, mine = isMine(view) } = {}) {
  const slots = view.hand.map((card, idx) => {
    const isSel = card === selected && view.hand.indexOf(card) === idx; // deux exemplaires identiques : le premier porte la sélection
    const dead = isDead(view, card);
    const playable = mine && targetsOf(view, view.you, card).length > 0;
    const jack = isJack(card) ? ` data-jack="${isOneEyed(card) ? 'one' : 'two'}"` : '';
    return `<div class="hand-slot${dead ? ' is-dead' : ''}">`
      + `<button type="button" class="hand-card${isSel ? ' is-selected' : ''}" data-card="${card}" data-playable="${playable}"${jack} aria-pressed="${isSel}" aria-label="${esc(cardName(card))}">${fullOf(card)}</button>`
      + (dead ? `<span class="badge-dead">morte</span><button type="button" class="btn" data-act="exchange" data-card="${card}"${mine && !view.deadUsed ? '' : ' disabled'}>Échanger</button>` : '')
      + '</div>';
  });
  return `<div class="hand" style="--hand:${Math.max(view.hand.length, 1)}">${slots.join('')}</div>`;
}

function actionsHtml(view) {
  return '<p class="seq-actions">'
    + `${canPass(view) ? '<button type="button" class="btn" data-act="pass">Passer</button>' : ''}`
    + '<button type="button" class="btn secondary" data-act="rules">Règles</button>'
    + '<button type="button" class="btn secondary" data-act="quit">Quitter</button></p>';
}

export function gameHtml(view, { selected = null } = {}) {
  const mine = isMine(view);
  return `${bannerHtml(view)}${boardHtml(view, { selected, mine })}<div class="seq-side">${handHtml(view, { selected, mine })}${actionsHtml(view)}</div>`;
}

export function mountGame(el, controller, ctx) {
  const root = el.ownerDocument.createElement('div');
  root.className = 'seq-game';
  el.append(root);
  let selected = null;
  let view = controller.getView();
  // Région vocale stable (hors du innerHTML remplacé à chaque rendu) pour annoncer l'état et le tour.
  const live = el.ownerDocument.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  el.append(live);
  const render = (focusSelected = false) => {
    root.innerHTML = gameHtml(view, { selected });
    live.textContent = statusText(view);
    if (focusSelected) root.querySelector('.hand-card.is-selected')?.focus?.(); // le re-rendu détruit le bouton focalisé
  };
  const send = (action) => {
    Promise.resolve(controller.act(action)).then((r) => { if (r && r.ok === false) ctx.toast(ERRORS[r.error] ?? 'Coup refusé.'); });
  };
  const onClick = (e) => {
    const exchange = e.target.closest('[data-act="exchange"]');
    const cardBtn = e.target.closest('.hand-card');
    const cellBtn = e.target.closest('[data-cell]');
    if (exchange) { if (!exchange.disabled) send({ type: 'dead', card: exchange.dataset.card }); }
    else if (cardBtn) { const card = cardBtn.dataset.card; selected = selected === card ? null : card; render(true); }
    else if (cellBtn && selected) { if (!cellBtn.disabled) { send({ type: 'play', card: selected, cell: Number(cellBtn.dataset.cell) }); selected = null; render(); } }
    else if (e.target.closest('[data-act="pass"]')) send({ type: 'pass' });
    else if (e.target.closest('[data-act="rules"]')) ctx.onRules();
    else if (e.target.closest('[data-act="quit"]')) ctx.onQuit();
  };
  root.addEventListener('click', onClick);
  const off = controller.onChange((v) => {
    view = v;
    if (selected && !view.hand.includes(selected)) selected = null;
    render();
    if (view.phase === 'over') ctx.onEnd(view);
  });
  render();
  return { dispose() { off(); root.removeEventListener('click', onClick); root.remove?.(); live.remove?.(); } };
}

/** Écran de fin : vainqueur, bandeau, plateau final avec les séquences cerclées. */
export const renderEnd = (view) => `<div class="seq-end"><h2>${esc(statusText(view))}</h2>${bannerHtml({ ...view, phase: 'over' })}${boardHtml(view, { mine: false })}</div>`;

export const rulesHtml = () => `<h2>Règles</h2>
<p>Deux, trois, quatre, six, huit, neuf, dix ou douze joueurs. À 2 ou 3, chacun joue pour soi ; au-delà, deux ou trois équipes de même effectif,
dont les membres alternent autour de la table. Chaque équipe a sa couleur et son symbole (● bleu, ▲ vert, ■ rouge).</p>
<h3>Le tour</h3>
<ol>
  <li>Facultatif, une fois par tour : échanger une <b>carte morte</b> (ses deux cases du plateau sont déjà occupées) contre une nouvelle carte.</li>
  <li>Jouer une carte de sa main : poser un jeton de son équipe sur l’une des deux cases du plateau qui portent cette carte.</li>
  <li>Piocher une carte (automatique).</li>
</ol>
<ul>
  <li><b>Valets à deux yeux</b> (carreau et trèfle, « Joker ») : jeton sur n’importe quelle case libre.</li>
  <li><b>Valets à un œil</b> (pique et cœur, « Retrait ») : retire un jeton adverse qui ne fait pas partie d’une séquence ; le tour s’arrête là.</li>
  <li>Les quatre coins sont libres : ils comptent pour toutes les équipes.</li>
</ul>
<h3>Gagner</h3>
<p>Une <b>séquence</b> est une ligne de 5 jetons de l’équipe (ligne, colonne ou diagonale, coins compris) ; elle ne peut plus être brisée.
Il faut <b>2 séquences</b> à 2 joueurs ou 2 équipes, <b>1 séquence</b> à 3 joueurs ou 3 équipes. La seconde séquence peut partager une seule
case avec la première. Quand la pioche est épuisée, les défausses sont mélangées pour la refaire.</p>
<h3>Hypothèses de cette adaptation</h3>
<ul>
  <li><b>H-SEQ-1</b> La disposition du plateau est originale (elle n’est pas celle du plateau édité).</li>
  <li><b>H-SEQ-2</b> Valets à deux yeux : carreau et trèfle ; valets à un œil : pique et cœur.</li>
  <li><b>H-SEQ-3</b> Le premier joueur est tiré au sort.</li>
  <li><b>H-SEQ-4</b> La pioche est automatique : pas de règle « carte oubliée » ni de « table talk ».</li>
  <li><b>H-SEQ-5</b> Sans aucun coup possible (après une éventuelle carte morte), on passe ; si tout le monde passe d’affilée, la partie est nulle.</li>
  <li><b>H-SEQ-6</b> Une ligne de 6 à 8 jetons ne compte que pour une séquence (une ligne de 9 en donne deux).</li>
  <li><b>H-SEQ-7</b> Les séquences sont reconnues automatiquement, sans annonce.</li>
</ul>
<h3>Crédits</h3>
<p>Adaptation non officielle d’un jeu d’alignement de cartes de type Sequence® (marque de ses ayants droit), sans lien avec eux.
Plateau, cartes, figures et jetons sont dessinés pour ce projet ; le réseau passe par PeerJS (licence MIT).</p>`;
