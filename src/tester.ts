/**
 * Modalità tester: un portale per proporre modifiche al gioco, senza account. Si accende su un telefono col
 * link segreto `?tester=<chiave>` (o scrivendo la chiave in Crediti dopo 7 tocchi su "Versione", per l'app sulla
 * Home). Non cambia niente della partita: vale per tutte le partite già iniziate, i salvataggi e le classifiche
 * restano uguali; aggiunge solo il tasto 📝 Proponi sul bordo dello schermo. Nel codice c'è solo l'impronta SHA-256; la
 * chiave resta sul telefono perché il server delle proposte la controlla a ogni invio. `?tester=off` la spegne.
 */
const TESTER_HASHES = ['29fd6a5f47282398df31aa65c6a6b6fb3ebe6c5182ef93ddea156a7c9af9556a'];
const TESTER_KEY = 'hustle.tester';

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** chiave tester salvata su questo telefono ('' se non è un telefono tester) */
export function testerKey() {
  try {
    return localStorage.getItem(TESTER_KEY) ?? '';
  } catch {
    return '';
  }
}

export const isTesterDevice = () => testerKey() !== '';

/** Prova una chiave tester (link o Crediti): se è giusta la ricorda su questo telefono. */
export async function tryTesterKey(key: string) {
  const k = key.trim();
  try {
    if (!TESTER_HASHES.includes(await sha256(k))) return false;
    localStorage.setItem(TESTER_KEY, k);
    return true;
  } catch {
    return false;
  }
}

/** All'avvio: legge `?tester=` dall'indirizzo, accende o spegne la modalità e lo toglie dall'indirizzo. */
export async function checkTesterLink() {
  const url = new URL(location.href);
  const key = url.searchParams.get('tester');
  if (key === null) return;
  url.searchParams.delete('tester');
  history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  if (key === 'off') {
    try {
      localStorage.removeItem(TESTER_KEY);
    } catch {
      /* niente */
    }
    return;
  }
  await tryTesterKey(key);
}
