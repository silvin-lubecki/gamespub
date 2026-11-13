// RDC-07 (DESIGN.md §9.4, H13, H14) : barre réseau superposée à l'écran Partie : joueurs déconnectés (l'hôte peut
// « Confier à l'IA »), sièges joués par l'IA, connexion perdue côté invité. Rendu en chaîne HTML (testable sans DOM).
import { esc } from './cards.js';

/** `status` : statut de la session invitée ('open' | 'lost' | 'closed'…) ; l'hôte est toujours 'open'. */
export function netBarHtml({ role, you, status = 'open', seats }) {
  const lines = [];
  if (role === 'guest' && status !== 'open') {
    lines.push(`<li class="net-line is-alert">${status === 'closed'
      ? 'Hôte absent : partie suspendue. Rouvrez le lien quand l’hôte aura repris.'
      : 'Connexion perdue, reconnexion…'}</li>`); // H13 : sans l'hôte, la partie est suspendue
  }
  seats.forEach((s, i) => {
    if (i === you || s.kind !== 'guest') return;
    if (s.delegated) {
      lines.push(`<li class="net-line">${esc(s.name)} : joué par l’IA jusqu’à son retour.</li>`);
    } else if (!s.connected) {
      const btn = role === 'host' ? ` <button type="button" class="btn" data-net="confide" data-seat="${i}">Confier à l’IA</button>` : '';
      lines.push(`<li class="net-line is-alert">${esc(s.name)} est déconnecté(e).${btn}</li>`);
    }
  });
  return lines.length ? `<ul class="net-bar" role="status">${lines.join('')}</ul>` : '';
}
