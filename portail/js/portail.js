// Page d'accueil (PORT-01, DESIGN-plateforme §6) : masque les jeux non publiés et affiche la version des autres.
// Un jeu est publié si `./<slug>/VERSION` répond ; un 404 (la page 404 de GitHub Pages est du HTML) le masque.
// Pas de service worker : une portée `/gamespub/` intercepterait tous les jeux (D11).

const VERSION_TEXT = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;

/**
 * Interprète la réponse de `./<slug>/VERSION`.
 * @returns {{state: 'missing'} | {state: 'published', version: string} | {state: 'unknown'}}
 *   `unknown` (erreur serveur, contenu inattendu) laisse la carte visible, sans badge.
 */
export function versionStatus(status, text) {
  if (status === 404) return { state: 'missing' };
  if (status >= 200 && status < 300) {
    const version = String(text ?? '').trim();
    if (VERSION_TEXT.test(version)) return { state: 'published', version };
  }
  return { state: 'unknown' };
}

async function fetchStatus(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, { cache: 'no-store' });
    return versionStatus(response.status, response.ok ? await response.text() : '');
  } catch {
    return { state: 'unknown' }; // réseau coupé : on laisse la carte
  }
}

/**
 * @param {Document} doc
 * @param {{fetchImpl?: typeof fetch, search?: string}} [options] `?all=1` marque les jeux absents « Bientôt » au lieu de les retirer.
 */
export async function init(doc, { fetchImpl = fetch, search = '' } = {}) {
  const showAll = new URLSearchParams(search).get('all') === '1';
  const cards = [...doc.querySelectorAll('li.game')];
  await Promise.all(cards.map(async (card) => {
    const slug = card.dataset.slug;
    const status = await fetchStatus(fetchImpl, new URL(`./${slug}/VERSION`, doc.baseURI));
    const badge = card.querySelector('.version');
    if (status.state === 'published') {
      badge.textContent = `v${status.version}`;
      badge.hidden = false;
    } else if (status.state === 'missing') {
      if (!showAll) {
        card.remove();
        return;
      }
      card.classList.add('soon');
      badge.textContent = 'Bientôt';
      badge.hidden = false;
      const link = card.querySelector('a.play');
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    }
  }));
  doc.getElementById('empty').hidden = doc.querySelectorAll('li.game').length > 0;
}

if (typeof document !== 'undefined') {
  init(document, { search: location.search });
}
