import { day, playStats, type GameState } from './state';
import { rank, totalFame, totalLevel } from './progress';
import { estimateMonthlyProfit, isAutonomous } from './economy';
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
  /** valore della classifica scelta (fama, soldi, lavoretti…) */
  value?: number;
  title: string;
  logo?: Logo | null;
  me?: boolean;
}

/** Classifiche disponibili (oltre alla fama). */
export type BoardKind = 'fame' | 'money' | 'jobs' | 'biz' | 'served';

/** Statistiche principali inviate al server: le vedono gli amici nell'anteprima del profilo. */
export interface PublicStats {
  jobs?: number;
  jobs3?: number;
  served?: number;
  orders?: number;
  bizOpened?: number;
  bizFailed?: number;
  missions?: number;
  playSec?: number;
  days?: number;
  level?: number;
  perSec?: number;
}

/** Quanto rendono al secondo (tempo reale) le attività che lavorano da sole: 1 mese di gioco = 2 ore. */
export function moneyPerSecond(s: GameState) {
  return s.businesses.filter(isAutonomous).reduce((a, b) => a + estimateMonthlyProfit(s, b), 0) / 7200;
}

export function publicStats(s: GameState): PublicStats {
  const st = playStats(s);
  return {
    jobs: st.jobs, jobs3: st.jobs3, served: st.served, orders: st.orders, bizOpened: st.bizOpened, bizFailed: st.bizFailed,
    missions: st.missions, playSec: Math.round(st.playSec), days: day(s) - st.startDay + 1, level: totalLevel(s),
    perSec: Math.round(moneyPerSecond(s) * 100) / 100,
  };
}
/** Un amico (o te) nella classifica tra amici, con le sue attività da mostrare sulla mappa. */
export interface FriendEntry extends LbEntry {
  code: string;
  /** sta giocando adesso (furgone aperto, piano con le luci accese) */
  online?: boolean;
  bizs: { lot: string; type: string; lvl: number }[];
  stats?: PublicStats;
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
/**
 * Browser pilotato da un programma (le prove automatiche headless): non scrive niente sul server,
 * così le partite di prova non finiscono in classifica.
 */
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;

export async function submit(s: GameState, force = false) {
  const nick = nickname();
  if (!nick || automated) return;
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
        stats: publicStats(s),
      }),
    });
    if (r.ok) set(BEST_KEY, String(fame));
  } catch {
    /* offline: si riprova più tardi */
  }
}

export async function fetchBoard(limit = 50, kind: BoardKind = 'fame'): Promise<LbData | null> {
  try {
    const r = await fetch(`${API}/leaderboard?game=hustle&limit=${limit}&kind=${kind}&player_id=${playerId()}`);
    if (!r.ok) return null;
    const d = (await r.json()) as LbData;
    for (const e of [...d.entries, ...(d.me ? [d.me] : [])]) e.logo = safeLogo(e.logo);
    return d;
  } catch {
    return null;
  }
}

/** "Sto giocando": i tuoi amici vedono aperto il tuo furgone (e accese le luci del tuo piano). */
export async function ping() {
  if (!nickname() || document.hidden || automated) return;
  try {
    await fetch(API + '/leaderboard/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'hustle', player_id: playerId() }),
    });
  } catch {
    /* offline */
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
      e.stats = e.stats && typeof e.stats === 'object' ? e.stats : {};
    }
    // le foto dei loghi si decodificano prima di disegnarle
    await Promise.all(d.entries.map((e) => preloadLogo(e.logo)));
    return d;
  } catch {
    return null;
  }
}

// ---------------- richieste di amicizia ----------------

/** Chi ha aggiunto il tuo codice e aspetta che ricambi. */
export interface FriendRequest {
  code: string;
  nickname: string;
  fame: number;
  title: string;
  logo?: Logo | null;
}

/** Aggiungendo un amico gli arriva la richiesta: può ricambiare con un tocco. */
export async function sendFriendRequest(code: string): Promise<'ok' | 'missing' | 'error'> {
  if (automated) return 'error';
  try {
    const r = await fetch(API + '/leaderboard/friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'hustle', player_id: playerId(), code }),
    });
    return r.ok ? 'ok' : r.status === 404 ? 'missing' : 'error';
  } catch {
    return 'error';
  }
}

/** Richieste ricevute (senza quelle di chi è già tuo amico). */
export async function fetchFriendRequests(): Promise<FriendRequest[] | null> {
  try {
    const r = await fetch(`${API}/leaderboard/friend-requests?game=hustle&player_id=${playerId()}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { requests: FriendRequest[] };
    const mine = friendCodes();
    const list = (d.requests ?? []).filter((x) => !mine.includes(x.code));
    for (const x of list) x.logo = safeLogo(x.logo);
    await Promise.all(list.map((x) => preloadLogo(x.logo)));
    return list;
  } catch {
    return null;
  }
}

/** Accetta (aggiunge l'amico, senza scambiarsi i codici) o rifiuta una richiesta. */
export async function answerFriendRequest(code: string, accept: boolean) {
  if (accept) addFriend(code);
  try {
    await fetch(API + '/leaderboard/friend-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'hustle', player_id: playerId(), code }),
    });
  } catch {
    /* offline: la richiesta resta, ma è già tra gli amici e non si vede più */
  }
}
