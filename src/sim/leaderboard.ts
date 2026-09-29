import type { GameState } from './state';
import { rank, totalFame } from './progress';

/**
 * Classifica mondiale per fama. Stesso servizio della classifica di Magic Trip,
 * ma con chiavi separate (`game: 'hustle'`). Identità anonima per dispositivo,
 * nickname scelto dal giocatore; la rete non deve mai bloccare il gioco.
 */
const API = 'https://crazy-town.onrender.com';
const ID_KEY = 'hustle.playerId';
const NICK_KEY = 'hustle.nickname';
const BEST_KEY = 'hustle.lbBest';
export const MAX_NICK = 20;

export interface LbEntry {
  rank: number;
  nickname: string;
  fame: number;
  money: number;
  title: string;
  me?: boolean;
}
export interface LbData {
  entries: LbEntry[];
  me: LbEntry | null;
  total: number;
}

const get = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modalità privata */
  }
};

export function playerId() {
  let id = get(ID_KEY);
  if (!/^[a-f0-9]{32}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    set(ID_KEY, id);
  }
  return id;
}

export const nickname = () => get(NICK_KEY);
export function setNickname(n: string) {
  const clean = [...n].filter((c) => c.charCodeAt(0) >= 32).join('').trim().slice(0, MAX_NICK);
  if (!clean) return false;
  set(NICK_KEY, clean);
  set(BEST_KEY, '0'); // col nuovo nome si reinvia subito il punteggio
  return true;
}

let lastSent = 0;

/**
 * Invia la fama della partita in corso. Un dispositivo ha un solo posto in classifica:
 * vale la partita con più fama (una partita nuova non cancella quella migliore).
 */
export async function submit(s: GameState, force = false) {
  const nick = nickname();
  if (!nick) return;
  const fame = Math.round(totalFame(s) * 10) / 10;
  const best = parseFloat(get(BEST_KEY)) || 0;
  if (fame < best) return;
  // al massimo un invio al minuto (la fama sale di continuo anche coi dipendenti)
  const since = performance.now() - lastSent;
  if (!force && (since < 60_000 || (fame === best && since < 5 * 60_000))) return;
  lastSent = performance.now();
  try {
    const r = await fetch(API + '/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'hustle', player_id: playerId(), nickname: nick, fame, money: Math.floor(s.totalEarned), title: rank(s) }),
    });
    if (r.ok) set(BEST_KEY, String(fame));
  } catch {
    /* offline: si riprova più tardi */
  }
}

export async function fetchBoard(limit = 50): Promise<LbData | null> {
  try {
    const r = await fetch(`${API}/leaderboard?game=hustle&limit=${limit}&player_id=${playerId()}`);
    if (!r.ok) return null;
    return (await r.json()) as LbData;
  } catch {
    return null;
  }
}
