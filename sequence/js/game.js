// Descripteur de jeu de Séquence (DESIGN-plateforme §5.1, §7). L'interface est dans js/ui/ (SEQ-02).
import { engine, parseAction, teamCount } from './engine/index.js';
import { bots } from './ai/index.js';
import { mountGame, renderEnd, rulesHtml } from './ui/game-screen.js';
import { TEAM_COLORS } from './ui/svg-cards.js';

const COUNTS = [2, 3, 4, 6, 8, 9, 10, 12];
const HAS_CHOICE = (n) => n === 6 || n === 12;

/** Réglages normalisés pour `seatCount` sièges : seul `teams` (2 ou 3) existe, et seulement à 6 et 12 joueurs. */
function parse(raw, seatCount) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!HAS_CHOICE(seatCount)) return { teams: teamCount(seatCount) };
  const t = Number(raw.teams ?? 2);
  return t === 2 || t === 3 ? { teams: t } : null;
}

function settingsHtml(settings, { editable, seatCount } = {}) {
  if (!HAS_CHOICE(seatCount)) {
    const k = teamCount(seatCount, settings);
    return `<p class="hint">${seatCount <= 3 ? 'Chacun pour soi' : `${k} équipes, sièges alternés`}</p>`;
  }
  const t = Number(settings?.teams) === 3 ? 3 : 2;
  return `<label>Équipes <select name="teams"${editable ? '' : ' disabled'}>`
    + [2, 3].map((k) => `<option value="${k}"${k === t ? ' selected' : ''}>${k} équipes</option>`).join('')
    + '</select></label>';
}

function validateStart(seatCount, settings) {
  if (!COUNTS.includes(seatCount)) return 'Nombre de joueurs non pris en charge.';
  if (!parse(settings, seatCount)) return 'Réglage des équipes invalide : 2 ou 3 équipes.';
  if (!HAS_CHOICE(seatCount) && Number(settings.teams) !== teamCount(seatCount)) return `Avec ${seatCount} joueurs, il y a ${teamCount(seatCount)} ${seatCount <= 3 ? 'joueurs seuls' : 'équipes'} : le réglage ne peut pas changer.`;
  return null;
}

const TEAM_LABELS = ['Équipe bleue', 'Équipe verte', 'Équipe rouge'];
const SOLO_LABELS = ['Bleu', 'Vert', 'Rouge'];

function seatInfo(seat, { seatCount = 2, settings } = {}) {
  const team = seat % teamCount(seatCount, settings);
  return { color: TEAM_COLORS[team], label: (seatCount <= 3 ? SOLO_LABELS : TEAM_LABELS)[team] };
}

export const game = {
  id: 'sequence',
  title: 'Séquence',
  protocolVersion: 1,
  seats: { min: 2, max: 12, counts: COUNTS, default: 2 },
  levels: [{ id: 'easy', label: 'Facile' }, { id: 'normal', label: 'Normale' }],
  defaultLevel: 'normal',
  settings: { defaults: { teams: 2 }, parse, html: settingsHtml },
  validateStart,
  seatInfo,
  engine,
  parseAction,
  bots,
  ui: { mountGame, renderEnd, rulesHtml },
};
