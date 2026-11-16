// RDC-02 (DESIGN.md §6.1 « Décompte ») : scores finaux. Hypothèses : H9 (entiers, net négatif possible), H11 (égalités).
import { ACTIVE_PENALTY, CATALOG } from "./catalog.js";

/**
 * Demi-paiement final : chaque commande de `seat` restée dans une file incomplète rapporte la moitié de sa valeur
 * imprimée, arrondie à l'inférieur (par carte), sans prime ni majorité. Port de `compensation` (engine.py).
 */
export function compensation(state, seat) {
  let total = 0;
  for (const slot of state.artisans) {
    for (const e of slot.queue) if (e.owner === seat) total += Math.floor(CATALOG[e.order.type].reward / 2);
  }
  return total;
}

/**
 * Classement en compétition (1, 1, 3…) par net (`dh + compensation − pénalité`), puis commandes produites.
 * Les commandes en file ne comptent ni pour le seuil ni pour le départage ; `winners` = sièges de rang 1
 * (victoire partagée possible).
 */
export function finalScores(state) {
  const rows = state.players.map((p, seat) => {
    const penalty = ACTIVE_PENALTY * p.active.length;
    const bonus = compensation(state, seat);
    return { seat, dh: p.dh, compensation: bonus, penalty, net: p.dh + bonus - penalty, produced: p.produced.length, rank: 0 };
  });
  const better = (a, b) => b.net - a.net || b.produced - a.produced;
  for (const row of rows) row.rank = 1 + rows.filter((o) => better(o, row) < 0).length;
  rows.sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  return { players: rows, winners: rows.filter((r) => r.rank === 1).map((r) => r.seat) };
}
