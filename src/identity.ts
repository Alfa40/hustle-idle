import { randomLogo, type Logo } from './logo';
import { nickname } from './sim/leaderboard';
import { listSlots, type GameState } from './sim/state';

/**
 * Il giocatore, uguale in tutte le partite: nome (già in `hustle.nickname`, sim/leaderboard.ts) e logo. Si scelgono
 * alla **prima apertura del gioco** (schermata iniziale: ospite, crea account o entra), poi si cambiano dal 👤 Profilo.
 * Ogni partita usa il logo del giocatore (`syncLogo`); la carriera invece si sceglie partita per partita.
 */

const LOGO_KEY = 'hustle.logo';
const DONE_KEY = 'hustle.onboarded';

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modalità privata */
  }
};

export function profileLogo(): Logo | null {
  try {
    const l = JSON.parse(get(LOGO_KEY) ?? 'null') as Logo | null;
    return l && typeof l.symbol === 'string' ? l : null;
  } catch {
    return null;
  }
}

export const setProfileLogo = (l: Logo) => set(LOGO_KEY, JSON.stringify(l));

/** Prima apertura già fatta? Chi giocava già prima (nome e partite salvate) non la rifà. */
export function onboarded() {
  if (get(DONE_KEY) === '1') return true;
  if (nickname() && listSlots().some(Boolean)) {
    set(DONE_KEY, '1');
    return true;
  }
  return false;
}

export const setOnboarded = () => set(DONE_KEY, '1');

/** un logo nuovo per la schermata della prima apertura */
export const draftLogo = () => profileLogo() ?? randomLogo();

/**
 * All'avvio di una partita: usa il logo del giocatore. Partite di prima senza logo del giocatore: il loro logo
 * (se scelto) diventa quello del giocatore.
 */
export function syncLogo(s: GameState) {
  const l = profileLogo();
  if (l) {
    s.logo = { ...l };
    s.logoChosen = true;
  } else if (s.logoChosen) setProfileLogo(s.logo);
}
