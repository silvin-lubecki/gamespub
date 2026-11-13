// RDC-05 (DESIGN.md §10.2) : scène paysage 960×540 mise à l'échelle, plein écran et verrou d'orientation.
export const BASE = { w: 960, h: 540 };

/** Échelle et taille logique de la scène pour une fenêtre `w`×`h` (la scène occupe tout l'écran : largeur/hauteur ≥ base). */
export function computeStage(w, h, base = BASE) {
  const scale = Math.min(w / base.w, h / base.h);
  return { scale, width: w / scale, height: h / scale };
}

/** Marges de sécurité (encoche) : padding du conteneur, posé en CSS avec env(safe-area-inset-*). */
function insets(el, win) {
  const cs = el.parentElement && win.getComputedStyle?.(el.parentElement);
  const px = (v) => Number.parseFloat(v) || 0;
  return { x: px(cs?.paddingLeft) + px(cs?.paddingRight), y: px(cs?.paddingTop) + px(cs?.paddingBottom) };
}

/** Applique l'échelle à `el` et la recalcule sur resize / orientationchange / visualViewport (marges de sécurité déduites). */
export function installStage(el, win = window) {
  const update = () => {
    const vv = win.visualViewport?.scale === 1 ? win.visualViewport : null; // pincement : on garde la fenêtre de mise en page
    const pad = insets(el, win);
    const { scale, width, height } = computeStage((vv?.width || win.innerWidth) - pad.x, (vv?.height || win.innerHeight) - pad.y);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transform = `scale(${scale})`;
    el.style.setProperty('--scale', String(scale));
  };
  const targets = [win, win.visualViewport].filter(Boolean);
  const events = ['resize', 'orientationchange'];
  const bind = (method) => targets.forEach((t) => events.forEach((e) => t[method]?.(e, update)));
  bind('addEventListener');
  update();
  return { update, dispose: () => bind('removeEventListener') };
}

/**
 * Bascule le plein écran (`enterOnly` : ne fait qu'entrer, sans sortir si déjà actif) puis tente le verrou paysage ; toute erreur est ignorée.
 * Renvoie false si l'API plein écran est absente (iPhone : le message « Ajouter à l'écran d'accueil » s'affiche alors).
 */
export async function toggleFullscreen(doc = document, scr = globalThis.screen, { enterOnly = false } = {}) {
  if (doc.fullscreenElement) {
    if (enterOnly) return true;
    try { await doc.exitFullscreen?.(); } catch { /* ignoré */ }
    return true;
  }
  const root = doc.documentElement;
  if (!root?.requestFullscreen) return false;
  try { await root.requestFullscreen({ navigationUI: 'hide' }); } catch { /* ignoré */ }
  try { await scr?.orientation?.lock?.('landscape'); } catch { /* ignoré */ }
  return true;
}
