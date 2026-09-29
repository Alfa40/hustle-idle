import type { GameState } from './state';
import { rank, totalFame } from './progress';
import { preloadLogo, safeLogo, type Logo } from '../logo';

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
  logo?: Logo | null;
  me?: boolean;
}
/** Un amico (o te) nella classifica tra amici, con le sue attività da mostrare sulla mappa. */
export interface FriendEntry extends LbEntry {
  code: string;
  bizs: { lot: string; type: string; lvl: number }[];
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
      body: JSON.stringify({
        game: 'hustle', player_id: playerId(), nickname: nick, fame, money: Math.floor(s.totalEarned), title: rank(s),
        logo: s.logo, bizs: s.businesses.map((b) => ({ lot: b.lotId, type: b.type, lvl: b.upgrades.ampliamento ?? 0 })),
      }),
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
    const d = (await r.json()) as LbData;
    for (const e of [...d.entries, ...(d.me ? [d.me] : [])]) e.logo = safeLogo(e.logo);
    return d;
  } catch {
    return null;
  }
}

// ---------------- amici ----------------

const FRIENDS_KEY = 'hustle.friends';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Il tuo codice amico: 6 caratteri ricavati dall'id (lo stesso calcolo è sul server). */
export function friendCode(id = playerId()) {
  const n = parseInt(id.slice(0, 8), 16) >>> 2;
  let code = '';
  for (let i = 5; i >= 0; i--) code += CODE_ALPHABET[(n >>> (i * 5)) & 31];
  return code;
}

export function friendCodes(): string[] {
  try {
    const v = JSON.parse(get(FRIENDS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Aggiunge un amico col suo codice; restituisce un messaggio d'errore o null. */
export function addFriend(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return 'Il codice ha 6 caratteri (lettere e numeri)';
  if (code === friendCode()) return 'Questo è il tuo codice!';
  const list = friendCodes();
  if (list.includes(code)) return 'Amico già aggiunto';
  if (list.length >= 50) return 'Hai già 50 amici';
  set(FRIENDS_KEY, JSON.stringify([...list, code]));
  return null;
}

export function removeFriend(code: string) {
  set(FRIENDS_KEY, JSON.stringify(friendCodes().filter((c) => c !== code)));
}

/** Classifica tra amici (te compreso), con loghi e attività; `missing` = codici che non esistono (ancora). */
export async function fetchFriends(): Promise<{ entries: FriendEntry[]; missing: string[] } | null> {
  try {
    const r = await fetch(`${API}/leaderboard/friends?game=hustle&player_id=${playerId()}&codes=${friendCodes().join(',')}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { entries: FriendEntry[]; missing: string[] };
    for (const e of d.entries) {
      e.logo = safeLogo(e.logo);
      e.bizs = Array.isArray(e.bizs) ? e.bizs : [];
    }
    // le foto dei loghi si decodificano prima di disegnarle
    await Promise.all(d.entries.map((e) => preloadLogo(e.logo)));
    return d;
  } catch {
    return null;
  }
}
