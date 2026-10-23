import { API, nickname, setNickname } from './leaderboard';
import { sandbox } from '../preview';

/**
 * Account del giocatore: il nome (unico, uno per giocatore) + una password. Con l'account le partite si salvano
 * sul server (da sole, ogni tanto e quando si chiude l'app) e su un altro telefono si rientra con nome e password:
 * tornano le partite, gli amici, il codice amico e il posto in classifica (stesso id del giocatore).
 * Server: hustle-account.js nel repository della classifica. La rete non blocca mai il gioco.
 */

const TOKEN_KEY = 'hustle.acctToken';
const SAVED_KEY = 'hustle.acctSavedAt';
/** il server ha detto che il nome è già di un altro giocatore: va scelto un altro nome */
const TAKEN_KEY = 'hustle.nickTaken';
export const MIN_PASSWORD = 6;

/** Cosa va nel salvataggio sul server: le partite (non quella developer), il nome, l'id, gli amici, le impostazioni. */
const SAVE_KEYS = ['hustleidle.slot.1', 'hustleidle.slot.2', 'hustleidle.slot.3', 'hustleidle.lastSlot', 'hustleidle.settings', 'hustle.nickname', 'hustle.playerId', 'hustle.friends', 'hustle.logo'];

const get = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const set = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* modalità privata */
  }
};

export const loggedIn = () => /^[a-f0-9]{48}$/.test(get(TOKEN_KEY));
export const lastCloudSave = () => Number(get(SAVED_KEY)) || 0;
export const nameTaken = () => get(TAKEN_KEY) === '1';
export const setNameTaken = (v: boolean) => set(TAKEN_KEY, v ? '1' : '');

async function post<T>(path: string, body: object): Promise<{ status: number; data: T & { error?: string } }> {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  return { status: r.status, data };
}

const pid = () => get('hustle.playerId');

export type NameResult = 'ok' | 'taken' | 'offline' | 'bad';

/**
 * Sceglie (o cambia) il nome: prima si chiede al server se è libero. Senza rete il nome si tiene lo stesso:
 * lo controlla il server al primo invio del punteggio (se è di un altro, il gioco chiede di cambiarlo).
 */
export async function chooseName(raw: string): Promise<NameResult> {
  const clean = [...raw].filter((c) => c.charCodeAt(0) >= 32).join('').trim();
  if (!clean) return 'bad';
  // sito di prova o anteprima: il nome resta sul telefono, non si prenota sul server
  if (sandbox) {
    setNickname(clean);
    return 'ok';
  }
  try {
    const { status } = await post('/hustle/name/claim', { player_id: pid(), name: clean });
    if (status === 409) return 'taken';
    if (status >= 400) return status === 400 ? 'bad' : 'offline';
  } catch {
    setNickname(clean);
    return 'offline';
  }
  setNickname(clean);
  setNameTaken(false);
  return 'ok';
}

// ---------------- salvataggio compresso ----------------

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzip(b64: string) {
  const bin = atob(b64);
  const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function pack() {
  const data: Record<string, string> = {};
  for (const k of SAVE_KEYS) {
    const v = get(k);
    if (v) data[k] = v;
  }
  return `gz1:${await gzip(JSON.stringify(data))}`;
}

async function unpack(s: string): Promise<Record<string, string> | null> {
  try {
    if (!s.startsWith('gz1:')) return null;
    const d = JSON.parse(await gunzip(s.slice(4)));
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

// ---------------- account ----------------

/** Crea l'account col nome di adesso e una password, e salva subito le partite. */
export async function register(password: string): Promise<string | null> {
  if (sandbox) return 'Nella versione di prova l\'account non c\'è';
  if (password.length < MIN_PASSWORD) return `La password deve avere almeno ${MIN_PASSWORD} caratteri`;
  const name = nickname();
  if (!name) return 'Prima scegli il tuo nome';
  try {
    const { status, data } = await post<{ token: string }>('/hustle/account/register', { player_id: pid(), name, password });
    if (status === 409) return data.error === 'nome già usato' ? 'Questo nome è già di un altro giocatore: cambialo' : 'Hai già un account: entra con nome e password';
    if (status !== 200 || !data.token) return data.error ?? 'Qualcosa non va: riprova';
    set(TOKEN_KEY, data.token);
    setNameTaken(false);
  } catch {
    return 'Serve internet per creare l\'account';
  }
  await cloudSave(true);
  return null;
}

/**
 * Entra con nome e password: le partite dell'account prendono il posto di quelle di questo telefono
 * (anche l'id del giocatore, così amici e classifica restano gli stessi). Poi il gioco ripartirà.
 */
export async function login(name: string, password: string): Promise<string | null> {
  if (sandbox) return 'Nella versione di prova l\'account non c\'è';
  if (!name.trim() || !password) return 'Scrivi nome e password';
  try {
    const { status, data } = await post<{ token: string; player_id: string; name: string; save: string | null; savedAt: number }>('/hustle/account/login', { name: name.trim(), password });
    if (status === 401) return 'Nome o password sbagliati';
    if (status === 429) return 'Troppi tentativi: riprova tra 15 minuti';
    if (status !== 200 || !data.token) return data.error ?? 'Qualcosa non va: riprova';
    const saved = data.save ? await unpack(data.save) : null;
    if (data.save && !saved) return 'Il salvataggio dell\'account non si legge: riprova';
    // le partite di questo telefono lasciano il posto a quelle dell'account
    for (const k of SAVE_KEYS) set(k, '');
    for (const [k, v] of Object.entries(saved ?? {})) if (SAVE_KEYS.includes(k)) set(k, v);
    set('hustle.playerId', data.player_id);
    set('hustle.nickname', data.name);
    set('hustle.lbBest', '0');
    set(TOKEN_KEY, data.token);
    set(SAVED_KEY, String(data.savedAt || ''));
    setNameTaken(false);
    return null;
  } catch {
    return 'Serve internet per entrare';
  }
}

let lastUp = 0;
let busy = false;

/**
 * Salva le partite sul server (se c'è l'account). Da solo al massimo ogni 90 secondi; `force` subito
 * (quando si chiude l'app o col tasto "Salva adesso"). Ritorna true se è andato a buon fine.
 */
export async function cloudSave(force = false): Promise<boolean> {
  if (sandbox) return false;
  if (!loggedIn() || busy) return false;
  const now = Date.now();
  if (!force && now - lastUp < 90_000) return false;
  busy = true;
  lastUp = now;
  try {
    const { status, data } = await post<{ savedAt: number }>('/hustle/account/save', { token: get(TOKEN_KEY), data: await pack() });
    if (status === 401) {
      // accesso scaduto: si rientra con nome e password (le partite restano sul telefono)
      set(TOKEN_KEY, '');
      return false;
    }
    if (status !== 200) return false;
    set(SAVED_KEY, String(data.savedAt || now));
    return true;
  } catch {
    return false;
  } finally {
    busy = false;
  }
}

export async function changePassword(old: string, next: string): Promise<string | null> {
  if (next.length < MIN_PASSWORD) return `La password nuova deve avere almeno ${MIN_PASSWORD} caratteri`;
  try {
    const { status, data } = await post('/hustle/account/password', { token: get(TOKEN_KEY), old, password: next });
    if (status === 401) return data.error === 'accesso scaduto' ? 'Accesso scaduto: entra di nuovo' : 'La password di adesso è sbagliata';
    return status === 200 ? null : data.error ?? 'Qualcosa non va: riprova';
  } catch {
    return 'Serve internet';
  }
}

/** Esce dall'account su questo telefono: le partite restano qui, ma non si salvano più sul server. */
export async function logout() {
  await cloudSave(true);
  const token = get(TOKEN_KEY);
  set(TOKEN_KEY, '');
  try {
    await post('/hustle/account/logout', { token });
  } catch {
    /* offline: la sessione scadrà da sola */
  }
}
