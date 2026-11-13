// RDC-05 (DESIGN.md §5.3, §5.4) : messages français des erreurs du moteur et lignes du journal.
import { ARTISANS, CATALOG, RESOURCES } from '../engine/catalog.js';
import { currentSeat } from '../engine/index.js';

const ERRORS = {
  'game-over': 'La partie est terminée.',
  'bad-seat': 'Siège inconnu.',
  'bad-action': 'Action invalide.',
  'not-your-turn': "Ce n'est pas votre tour.",
  'wrong-phase': "Cette action n'est pas possible maintenant.",
  'active-limit': 'Vous avez déjà 3 commandes actives.',
  'bad-index': 'Cette commande n\'est plus dans la rivière.',
  'bad-target': 'Partenaire invalide.',
  'empty-offer': 'Une offre ne peut pas être vide.',
  friday: 'Artisans fermés le vendredi.',
  'insufficient-cards': 'Il vous manque des ressources.',
  locked: "Cet artisan n'est pas encore Renommé.",
  'not-proposer': "Vous n'êtes pas l'auteur de cette offre.",
  'not-recipient': "Cette offre ne s'adresse pas à vous.",
  'offer-not-open': "Cette offre n'est plus ouverte.",
  'offer-unavailable': "L'échange n'est plus possible.",
  'unknown-order': 'Commande inconnue.',
  offline: 'Connexion perdue : action non envoyée.',
  'not-started': "La partie n'a pas commencé.",
  'wrong-artisan': 'Une visite se fait chez un seul artisan.',
};

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
export const DAYS_SHORT = ['Lu', 'Ma', 'Me', 'Je', 'Ve'];

export const errorMessage = (code) => ERRORS[code] ?? 'Action impossible.';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const artisanName = (i) => `${ARTISANS[i].trade} ${ARTISANS[i].name}`;

/** `counts` (int[9]) → « 1 Cuir, 2 Soie » (« rien » si vide). */
export function formatCounts(counts) {
  const parts = counts.map((n, r) => (n > 0 ? `${n} ${RESOURCES[r].name}` : null)).filter(Boolean);
  return parts.length ? parts.join(', ') : 'rien';
}

/** « donne 1 Cuir, demande 1 Soie » ou « don de 1 Cuir ». */
export const offerText = (o) => (o.want.some((n) => n > 0)
  ? `donne ${formatCounts(o.give)}, demande ${formatCounts(o.want)}`
  : `don de ${formatCounts(o.give)}`);

/** Destinataire d'une offre : l'actif si elle vient du partenaire, sinon le partenaire. */
export const recipientOf = (offer, active) => (offer.by === active ? offer.partner : active);

/**
 * Lignes du journal pour `events`. Les noms viennent de `view.players`.
 * Mains cachées (H2) : `discard` n'expose jamais les cartes défaussées, seulement leur nombre.
 */
export function eventLines(events, view) {
  const name = (seat) => view.players[seat].name;
  const lines = [];
  for (const e of events) {
    switch (e.type) {
      case 'market': lines.push(`${name(e.seat)} ouvre le Marché (3 ressources révélées).`); break;
      case 'take': lines.push(`${name(e.seat)} prend « ${CATALOG[e.order.type].name} ».`); break;
      case 'deposit': lines.push(`${name(e.seat)} dépose « ${CATALOG[e.order.type].name} » chez ${artisanName(e.artisan)}.`); break;
      case 'produce': {
        const pay = e.payouts.map((p) => `${name(p.seat)} +${p.dh} DH`).join(', ');
        const maj = e.majority === null ? 'pas de majorité' : `majorité : ${name(e.majority)} (+2 DH)`;
        lines.push(`Production chez ${artisanName(e.artisan)} : ${pay} ; ${maj}${e.renowned ? ' ; devient Renommé ★' : ''}.`);
        break;
      }
      case 'trigger': lines.push(`${name(e.seat)} a 7 commandes produites : dernier tour de table.`); break;
      case 'discard': lines.push(`${name(e.seat)} défausse ${plural(e.cards.length, 'carte', 'cartes')} (limite de 10).`); break;
      case 'day': lines.push(`Nouveau jour : ${DAYS[e.day]}.`); break;
      case 'end': lines.push('Fin de la partie.'); break;
      case 'offer': {
        const o = e.offer;
        lines.push(`${name(o.by)} → ${name(recipientOf(o, currentSeat(view)))} : ${offerText(o)}.`);
        break;
      }
      case 'trade': {
        lines.push(`Échange : ${name(e.active)} donne ${formatCounts(e.gave)}, ${name(e.partner)} donne ${formatCounts(e.got)}.`);
        break;
      }
      case 'offer-closed': {
        const o = view.market?.offers.find((x) => x.id === e.id);
        if (!o) break;
        if (e.status === 'declined') lines.push(`${name(recipientOf(o, currentSeat(view)))} refuse l'offre de ${name(o.by)}.`);
        else if (e.status === 'cancelled') lines.push(`${name(o.by)} retire son offre.`);
        break; // accepted (ligne « Échange »), superseded et closed : pas de ligne
      }
      default: break; // river : sans ligne
    }
  }
  return lines;
}

/**
 * Toasts de négociation (DESIGN.md §7.2) pour le siège `view.you` : offre qui m'est adressée, offre qui me concerne
 * refusée, retirée ou remplacée, échange conclu avec moi.
 */
export function negotiationToasts(events, view) {
  const name = (seat) => view.players[seat].name;
  const active = currentSeat(view);
  const lines = [];
  for (const e of events) {
    if (e.type === 'offer' && e.offer.by !== view.you && recipientOf(e.offer, active) === view.you) {
      lines.push(`${name(e.offer.by)} vous propose : ${offerText(e.offer)}.`);
    } else if (e.type === 'trade' && (e.active === view.you || e.partner === view.you)) {
      lines.push(`Échange conclu avec ${name(e.active === view.you ? e.partner : e.active)}.`);
    } else if (e.type === 'offer-closed') {
      const o = view.market?.offers.find((x) => x.id === e.id);
      if (!o) continue;
      const toMe = recipientOf(o, active) === view.you;
      if (e.status === 'declined' && o.by === view.you) lines.push(`${name(recipientOf(o, active))} a refusé votre offre.`);
      else if (e.status === 'cancelled' && toMe) lines.push(`${name(o.by)} a retiré son offre.`);
      else if (e.status === 'superseded' && toMe) lines.push(`L'offre de ${name(o.by)} a été remplacée.`);
    }
  }
  return lines;
}
