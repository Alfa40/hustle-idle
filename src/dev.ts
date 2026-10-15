/**
 * Modalità developer: una partita di prova con tanti soldi e comandi rapidi, solo sul telefono dello
 * sviluppatore e mai in classifica.
 *
 * Si accende aprendo il gioco con il link segreto `?dev=<chiave>`: qui c'è solo l'impronta SHA-256 della
 * chiave (il codice è pubblico, la chiave no). Il telefono se lo ricorda (localStorage) e nella schermata
 * iniziale compare "🛠️ Partita developer", salvata in uno slot a parte (non tocca le 3 partite normali).
 * `?dev=off` la spegne su quel telefono.
 */
const DEV_HASH = 'c9973361080da099481708145340d318dc2f5bb1b66009b5207ed4b7a6ee41a5';
const DEV_KEY = 'hustle.dev';
/** slot della partita developer (le partite normali sono 1–3) */
export const DEV_SLOT = 9;

export function isDevDevice() {
  try {
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Prova una chiave scritta a mano (Crediti → tocca 7 volte "Versione"): serve nell'app installata sulla
 * schermata Home, che su iPhone ha la sua memoria separata da Safari e non può aprire il link con la chiave.
 */
export async function tryDevKey(key: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== DEV_HASH) return false;
    localStorage.setItem(DEV_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** All'avvio: legge `?dev=` dall'indirizzo, accende o spegne la modalità e lo toglie dall'indirizzo. */
export async function checkDevLink() {
  const url = new URL(location.href);
  const key = url.searchParams.get('dev');
  if (key === null) return;
  url.searchParams.delete('dev');
  history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  try {
    if (key === 'off') {
      localStorage.removeItem(DEV_KEY);
      return;
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex === DEV_HASH) localStorage.setItem(DEV_KEY, '1');
  } catch {
    /* niente */
  }
}

/** La partita in corso è quella developer: niente classifica, "sto giocando" né offerte. */
export let devGame = false;
export const setDevGame = (v: boolean) => (devGame = v);
