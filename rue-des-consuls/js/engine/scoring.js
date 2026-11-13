// RDC-02 (DESIGN.md §6.1 « Décompte ») : scores finaux. Hypothèses : H9 (entiers, net négatif possible), H11 (égalités).
import { ACTIVE_PENALTY } from "./catalog.js";

/**
 * Classement en compétition (1, 1, 3…) par net, puis commandes produites.
 * Les commandes en file ne comptent ni en bonus ni en pénalité ; `winners` = sièges de rang 1 (victoire partagée possible).
 */
export function finalScores(state) {
  const rows = state.players.map((p, seat) => {
    const penalty = ACTIVE_PENALTY * p.active.length;
    return { seat, dh: p.dh, penalty, net: p.dh - penalty, produced: p.produced.length, rank: 0 };
  });
  const better = (a, b) => b.net - a.net || b.produced - a.produced;
  for (const row of rows) row.rank = 1 + rows.filter((o) => better(o, row) < 0).length;
  rows.sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  return { players: rows, winners: rows.filter((r) => r.rank === 1).map((r) => r.seat) };
}
