/**
 * Poker multigiocatore (Texas Hold'em senza limite, 2–8 giocatori) con i soldi del gioco.
 *
 * Il tavolo vero sta sul server (`hustle-poker.js` accanto a server.js): mazzo, carte coperte, turni e regole. Qui c'è
 * solo quello che vede il giocatore: lo stato del tavolo chiesto ogni secondo e i tasti per giocare.
 * Soldi: entrando si comprano le fiches (tolte subito dal conto della partita); uscendo, o quando la stanza si chiude,
 * le fiches rimaste tornano sul conto (il server le tiene come "vincita da ritirare" per la partita giusta, così non si
 * perdono neanche se l'app si chiude a metà: si ritirano alla prossima apertura, `claimPoker`).
 * Mentre sei al tavolo la partita è offline (`Game.enterAway`): niente soldi al secondo, e uscendo arrivano i guadagni
 * offline di quel tempo come quando si riapre il gioco.
 */
import type { Game } from '../game';
import { DEV_SLOT } from '../dev';
import { previewPr } from '../preview';
import { toast } from '../sim/bus';
import { API, nickname as lbNickname, playerId } from '../sim/leaderboard';
import { currentSlot, euro } from '../sim/state';
import { chipsHtml, chipStackHtml, DealQueue } from './tablefx';

/** puntate dei tavoli (piccolo e grande buio): le stesse del server */
export const STAKES: [number, number][] = [
  [10, 20], [100, 200], [1000, 2000], [10000, 20000], [100000, 200000], [1000000, 2000000], [10000000, 20000000], [100000000, 200000000],
];
/** fama totale per sedersi a ogni tavolo (come sul server): i primi due liberi, poi circa ×2,5 a ogni tavolo */
export const STAKE_FAME = [0, 0, 2000, 5000, 12000, 30000, 80000, 200000];
export const MIN_BUY_BB = 20;
export const MAX_BUY_BB = 100;

export interface PkSeat {
  name: string;
  chips: number;
  bet: number;
  inHand: boolean;
  folded: boolean;
  allin: boolean;
  sitOut: boolean;
  last: string;
  me: boolean;
  cards: string[] | null;
  hasCards: boolean;
}
export interface PkState {
  code: string;
  v: number;
  /** numero della mano (per riconoscere le carte nuove) */
  handId: number;
  sb: number;
  bb: number;
  minBuy: number;
  maxBuy: number;
  seats: (PkSeat | null)[];
  mySeat: number;
  button: number;
  board: string[];
  street: string;
  pot: number;
  toAct: number;
  turnLeft: number;
  turnMs: number;
  result: { winners: { seat: number; name: string; amount: number; hand: string }[]; shown: Record<string, { hand: string; best: string[] }> } | null;
  nextHandIn: number;
  log: string[];
  started: boolean;
  my?: { toCall: number; canCheck: boolean; canRaise: boolean; minTo: number; maxTo: number; isBet: boolean };
  myHand?: string;
}
export interface PkInfo {
  code: string;
  sb: number;
  bb: number;
  /** fama che serve per sedersi (0 = libero) */
  fame: number;
  minBuy: number;
  maxBuy: number;
  players: string[];
  free: number;
  started: boolean;
  seated: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** giochi del casinò sul server: poker (`hustle-poker.js`) e blackjack (`hustle-blackjack.js`) */
export type CasinoGame = 'poker' | 'bj';

/** chiamata al server del poker (il primo collegamento può metterci fino a un minuto: il server si sveglia) */
export const pk = <T>(path: string, body: object, timeoutMs = 60000) => casino<T>('poker', path, body, timeoutMs);

/** chiamata al server di un gioco del casinò */
export async function casino<T>(game: CasinoGame, path: string, body: object, timeoutMs = 60000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}/hustle/${game}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: playerId(), ...(previewPr !== null ? { practice: true } : {}), ...body }), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `errore ${r.status}`), { data: j });
    return j as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('il server non risponde: riprova tra poco');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** perché qui non si può giocare a poker (null = si può) */
export function pokerBlocked(): string | null {
  if (currentSlot === DEV_SLOT) return 'Con la partita developer non si gioca contro gli amici (avresti un miliardo di fiches).';
  return null;
}

export const pokerName = (game: Game) => lbNickname() || game.state.saveName || 'Giocatore';

/**
 * Vincite del casinò (poker e blackjack, stessa lista sul server) ancora da ritirare per questa partita (app chiusa al
 * tavolo, stanza chiusa…): sul conto.
 */
export async function claimPoker(game: Game, quiet = false) {
  // anteprime: tavoli di prova, le fiches tornano subito uscendo (niente da ritirare)
  if (pokerBlocked() || previewPr !== null) return 0;
  try {
    const j = await pk<{ amount: number }>('claim', { slot: currentSlot }, 30000);
    if (j.amount > 0) {
      game.state.money += j.amount;
      game.save();
      if (!quiet) toast(`Fiches del casinò tornate sul conto: +${euro(j.amount)}`, 'money');
    }
    return j.amount;
  } catch {
    return 0;
  }
}

// ---------------- fiches da portare ----------------

/** cifra scritta a mano ("10.000", "10000 €"…) → numero intero */
export const parseAmount = (v: string) => Number(v.replace(/[^0-9]/g, '')) || 0;
const plain = (n: number) => Math.round(n).toLocaleString('it-IT');

/**
 * Scelta delle fiches da portare: cifra da scrivere, cursore e scorciatoie (minimo, metà, massimo). `go` è il
 * pulsante che riporta la cifra nel testo (si aggiorna mentre scrivi, senza ridisegnare la finestra).
 */
export function buyBox(key: string, min: number, max: number, value: number, bb: number) {
  const v = Math.max(min, Math.min(max, value || min));
  const mid = Math.max(min, Math.min(max, Math.round(((min + max) / 2) / bb) * bb));
  return `<div class="pk-amt" data-k="${key}" data-min="${min}" data-max="${max}">
      <label class="pk-amt-row"><span>€</span><input class="lb-input pk-amt-in" inputmode="numeric" autocomplete="off" value="${plain(v)}"></label>
      <input type="range" class="pk-amt-range" min="${min}" max="${max}" step="${Math.max(1, bb)}" value="${v}">
      <div class="pk-amt-pre"><button class="chip" data-amt="${min}">Minimo</button>${mid > min && mid < max ? `<button class="chip" data-amt="${mid}">${euro(mid)}</button>` : ''}<button class="chip" data-amt="${max}">Massimo</button></div>
      <div class="small muted pk-amt-lim">da ${euro(min)} a ${euro(max)}<span class="bad pk-amt-err"></span></div></div>`;
}

/** Collega cifra, cursore e scorciatoie di ogni `buyBox` dentro `root`; `onChange(key, valore, valida)` a ogni modifica. */
export function wireBuyBox(root: HTMLElement, onChange: (key: string, v: number, ok: boolean) => void) {
  root.querySelectorAll<HTMLElement>('.pk-amt').forEach((box) => {
    const key = box.dataset.k!;
    const min = Number(box.dataset.min);
    const max = Number(box.dataset.max);
    const inp = box.querySelector<HTMLInputElement>('.pk-amt-in')!;
    const rng = box.querySelector<HTMLInputElement>('.pk-amt-range')!;
    const err = box.querySelector<HTMLElement>('.pk-amt-err')!;
    const set = (v: number, from: 'text' | 'range' | 'chip') => {
      const ok = v >= min && v <= max;
      err.textContent = ok ? '' : v < min ? ` · almeno ${euro(min)}` : ` · al massimo ${euro(max)}`;
      if (from !== 'range') rng.value = String(Math.max(min, Math.min(max, v)));
      if (from !== 'text') inp.value = plain(v);
      onChange(key, v, ok);
    };
    inp.addEventListener('input', () => set(parseAmount(inp.value), 'text'));
    inp.addEventListener('blur', () => {
      if (parseAmount(inp.value)) inp.value = plain(parseAmount(inp.value));
    });
    rng.addEventListener('input', () => set(Number(rng.value), 'range'));
    box.querySelectorAll<HTMLButtonElement>('[data-amt]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      set(Number(b.dataset.amt), 'chip');
    }));
  });
}

// ---------------- carte ----------------

const SUIT_PATH: Record<string, string> = {
  s: 'M12 2C9.2 6 4 9 4 13.2a4 4 0 0 0 6.9 2.7L10 21h4l-.9-5.1a4 4 0 0 0 6.9-2.7C20 9 14.8 6 12 2z',
  h: 'M12 21s-8.5-5.4-8.5-11.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.6C20.5 15.6 12 21 12 21z',
  d: 'M12 2l7.2 10L12 22 4.8 12z',
  c: 'M12 2.6a3.7 3.7 0 0 0-3.5 4.9 3.7 3.7 0 1 0 1.8 6.5L9.6 21h4.8l-.7-7a3.7 3.7 0 1 0 1.8-6.5A3.7 3.7 0 0 0 12 2.6z',
};
const suitSvg = (s: string) => `<svg viewBox="0 0 24 24" class="pk-suit"><path d="${SUIT_PATH[s]}"/></svg>`;
const rankText = (r: string) => (r === 'T' ? '10' : r);

/**
 * una carta: scoperta (es. "As") o coperta (null); `hl` = fa parte della combinazione vincente; `age` = da quanti ms
 * il mazziere l'ha appena data (animazione dell'arrivo, -1 = ferma)
 */
export function cardHtml(c: string | null, size: 'sm' | 'md' | 'lg' = 'md', hl = false, age = -1) {
  const anim = age >= 0 ? ` deal" style="animation-delay:-${Math.round(age)}ms` : '';
  if (!c) return `<div class="pk-card back ${size}${anim}"></div>`;
  const red = c[1] === 'h' || c[1] === 'd';
  return `<div class="pk-card ${size} ${red ? 'red' : ''} ${hl ? 'hl' : ''}${anim}"><b>${rankText(c[0])}</b>${suitSvg(c[1])}</div>`;
}

const PAL = ['#e8590c', '#2d9cdb', '#27ae60', '#9b51e0', '#f2b705', '#eb5757', '#00a8a8', '#d35fb7'];
const colorOf = (name: string) => PAL[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || '?';

// posti attorno al tavolo (in %), a partire dal tuo in basso e poi in senso orario
export const colorOfName = colorOf;
export const initialsOf = initials;

const SPOTS_P: [number, number][] = [[50, 90], [12, 74], [8, 46], [16, 20], [50, 13], [84, 20], [92, 46], [88, 74]];
const SPOTS_L: [number, number][] = [[50, 86], [20, 82], [7, 52], [20, 22], [50, 17], [80, 22], [93, 52], [80, 82]];

// ---------------- tavolo ----------------

export class PokerTable {
  private el: HTMLDivElement;
  private s: PkState | null;
  private closed = '';
  private timer = 0;
  private polling = false;
  private fails = 0;
  private raiseOpen = false;
  /** rilancio fatto con le fiches: quanto hai aggiunto sopra la puntata da pareggiare, e le fiches toccate */
  private raiseAdd = 0;
  private raiseStack: number[] = [];
  private confirmExit = false;
  private busy = false;
  private msg = '';
  private exiting = false;
  /** fiches da ricomprare (cifra scelta) */
  private rebuyAmt = 0;
  /** fiches comprate in tutto (per dire quanto si è vinto o perso uscendo) */
  private bought: number;
  /** il mazziere: le carte arrivano una alla volta */
  private deal = new DealQueue(() => this.render());

  constructor(private game: Game, private code: string, first: PkState | null, bought: number, private onDone: () => void) {
    this.s = first;
    this.bought = bought;
    this.el = document.createElement('div');
    this.el.className = 'pk';
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  /** le carte sul tavolo nell'ordine del mazziere: due giri di carte coperte dal primo dopo il bottone, poi il tavolo */
  private dealKeys() {
    const s = this.s;
    if (!s || !s.handId) return [];
    const order: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const i = (s.button + k) % 8;
      const p = s.seats[i];
      if (p && (p.hasCards || p.cards)) order.push(i);
    }
    const keys: string[] = [];
    for (let r = 0; r < 2; r++) for (const i of order) keys.push(this.holeKey(i, r));
    s.board.forEach((_, i) => keys.push(`b${s.handId}-${i}`));
    return keys;
  }
  private holeKey(seat: number, r: number) {
    return `h${this.s!.handId}-${seat}-${r}`;
  }
  /** nuovo stato dal server: le carte nuove entrano nella coda del mazziere */
  private setState(st: PkState, instant = false) {
    this.s = st;
    this.deal.sync(this.dealKeys(), instant);
  }

  private onResize = () => this.render();

  open() {
    this.game.enterAway();
    addEventListener('resize', this.onResize);
    document.body.appendChild(this.el);
    document.body.classList.add('in-poker');
    if (this.s) this.setState(this.s, true);
    this.render();
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), 1000);
  }

  private async poll() {
    if (this.polling || this.closed || this.exiting || document.hidden) return;
    this.polling = true;
    try {
      const j = await pk<PkState & { same?: boolean; closed?: string }>('state', { code: this.code, v: this.s?.v ?? -1 }, 15000);
      this.fails = 0;
      if (j.closed) {
        this.closed = j.closed;
        this.render();
      } else if (j.same) {
        if (this.s) this.s.turnLeft = j.turnLeft;
      } else {
        const turned = this.s?.toAct !== j.toAct || this.s?.street !== j.street;
        this.setState(j, !this.s);
        if (turned) this.closeRaise();
        this.render();
      }
    } catch {
      this.fails++;
      if (this.fails === 3) this.render();
    }
    this.polling = false;
  }

  private me() {
    return this.s && this.s.mySeat >= 0 ? this.s.seats[this.s.mySeat] : null;
  }

  private closeRaise() {
    this.raiseOpen = false;
    this.raiseAdd = 0;
    this.raiseStack = [];
  }

  /** il risultato della mano, solo quando il mazziere ha finito di girare le carte */
  private result() {
    return this.deal.busy ? null : this.s?.result ?? null;
  }

  /** le carte della combinazione vincente (si illuminano sul tavolo) */
  private winBest() {
    const r = this.result();
    return r ? r.winners.flatMap((w) => r.shown[String(w.seat)]?.best ?? []) : [];
  }

  private seatHtml(i: number, spot: number, spots: [number, number][]) {
    const s = this.s!;
    const p = s.seats[i]!;
    const [x, y] = spots[spot];
    const turn = s.toAct === i;
    const res = this.result();
    const win = res?.winners.find((w) => w.seat === i);
    const shown = res?.shown[String(i)];
    const best = this.winBest();
    const k0 = this.holeKey(i, 0);
    const k1 = this.holeKey(i, 1);
    const has = [this.deal.has(k0), this.deal.has(k1)];
    const one = (c: string | null, r: number, k: string) => (has[r] ? cardHtml(c, 'sm', !!c && best.includes(c), this.deal.age(k)) : '');
    const tag = win ? `+${euro(win.amount)}` : p.sitOut ? 'in pausa' : p.allin && p.inHand ? 'all-in' : p.folded && s.street !== 'done' ? 'fuori' : p.last;
    const cards = p.me
      ? ''
      : !has[0] ? ''
        : p.cards && !this.deal.busy
          ? `<div class="pk-scards">${one(p.cards[0], 0, k0)}${one(p.cards[1], 1, k1)}</div>`
          : p.hasCards || p.cards ? `<div class="pk-scards">${one(null, 0, k0)}${one(null, 1, k1)}</div>` : '';
    const timer = turn && s.turnLeft > 0 ? `<i class="pk-timer" style="animation-duration:${s.turnLeft}ms;--w:${Math.round((s.turnLeft / s.turnMs) * 100)}%"></i>` : '';
    // la puntata davanti al giocatore, verso il centro del tavolo
    const bx = 50 + (x - 50) * 0.58;
    const by = 50 + (y - 50) * 0.58;
    const bet = p.bet > 0 ? `<div class="pk-bet" style="left:${bx}%;top:${by}%"><i></i>${euro(p.bet)}</div>` : '';
    const dealer = s.button === i && s.started ? '<b class="pk-dealer">D</b>' : '';
    return `<div class="pk-seat ${turn ? 'turn' : ''} ${p.folded && s.street !== 'done' ? 'out' : ''} ${p.me ? 'me' : ''} ${win ? 'win' : ''}" style="left:${x}%;top:${y}%">
        ${cards}<div class="pk-av" style="--c:${colorOf(p.name)}">${esc(initials(p.name))}${dealer}</div>
        <div class="pk-plate"><b>${p.me ? 'Tu' : esc(p.name)}</b><span>${euro(p.chips)}</span>${timer}</div>
        ${tag ? `<div class="pk-tag ${win ? 'won' : ''}">${esc(tag)}${shown && !win ? ` · ${esc(shown.hand)}` : win && win.hand ? ` · ${esc(win.hand)}` : ''}</div>` : ''}
      </div>${bet}`;
  }

  private centerHtml() {
    const s = this.s!;
    const best = this.winBest();
    const board = Array.from({ length: 5 }, (_, i) => {
      const k = `b${s.handId}-${i}`;
      return s.board[i] && this.deal.has(k) ? cardHtml(s.board[i], 'md', best.includes(s.board[i]), this.deal.age(k)) : '<div class="pk-card slot md"></div>';
    }).join('');
    const players = s.seats.filter(Boolean).length;
    const res = this.result();
    let line = '';
    if (this.deal.busy && (s.street === 'preflop' || s.street === 'done') && !s.board.some((_, i) => this.deal.has(`b${s.handId}-${i}`))) line = 'Il mazziere dà le carte…';
    else if (res) line = res.winners.map((w) => `<b>${esc(w.name)}</b> vince ${euro(w.amount)}${w.hand ? ` con ${esc(w.hand)}` : ''}`).join('<br>');
    else if (!s.started || (s.street === 'wait' || s.street === 'done')) line = players < 2 ? 'Aspettiamo un altro giocatore…' : 'Si danno le carte…';
    return `<div class="pk-center">${s.pot > 0 ? `<div class="pk-pot">Piatto <b>${euro(s.pot)}</b></div>` : ''}<div class="pk-board">${board}</div>${line ? `<div class="pk-line">${line}</div>` : ''}</div>`;
  }

  private actionsHtml() {
    const s = this.s!;
    const me = this.me();
    if (!me) return '';
    const money = this.game.state.money;
    if (me.sitOut) return `<div class="pk-note">Sei in pausa: non hai giocato in tempo per due volte.</div><div class="pk-acts"><button class="pk-btn good" data-p="back">▶ Torno a giocare</button></div>`;
    if (me.chips <= 0 && !me.inHand) {
      const max = Math.min(s.maxBuy, Math.floor(money));
      if (money < s.minBuy) return `<div class="pk-note">Hai finito le fiches e sul conto non hai i ${euro(s.minBuy)} per ricomprarle.</div>`;
      if (!this.rebuyAmt) this.rebuyAmt = max;
      return `<div class="pk-note">Hai finito le fiches. Quante ne ricompri?</div><div class="pk-rebuy">${buyBox('rb', s.minBuy, max, this.rebuyAmt, s.bb)}</div>
        <div class="pk-acts"><button class="pk-btn good pk-rebuy-go" data-p="rebuy">Ricompra <b>${euro(Math.max(s.minBuy, Math.min(max, this.rebuyAmt)))}</b></button></div>`;
    }
    const my = s.my;
    if (!my) {
      if (s.toAct >= 0 && s.seats[s.toAct]) return `<div class="pk-note">Tocca a <b>${esc(s.seats[s.toAct]!.name)}</b>…</div>`;
      if (this.deal.busy) return '<div class="pk-note">Il mazziere dà le carte…</div>';
      if (s.result || s.street === 'done') return `<div class="pk-note">${s.nextHandIn > 0 ? 'Tra poco la prossima mano' : 'Si danno le carte…'}</div>`;
      if (s.seats.filter(Boolean).length < 2) return `<div class="pk-note">Manda il codice <b>${s.code}</b> ai tuoi amici: si gioca appena entra qualcuno.</div>`;
      return '';
    }
    // le carte stanno ancora arrivando: si gioca quando il mazziere ha finito
    if (this.deal.busy) return '<div class="pk-note">Il mazziere dà le carte…</div>';
    const busy = this.busy ? 'disabled' : '';
    if (this.raiseOpen && my.canRaise) {
      // rilancio con le fiches: ogni fiche toccata si aggiunge sopra la puntata da pareggiare
      const base = me.bet + my.toCall;
      const room = my.maxTo - base;
      const to = base + this.raiseAdd;
      const ok = to >= my.minTo || to === my.maxTo;
      const verb = my.isBet ? 'Punta' : 'Rilancia a';
      return `<div class="pk-raise">
          <div class="tbet">${chipStackHtml(this.raiseStack, s.bb, this.raiseAdd)}<span class="tbet-min">${ok ? `${my.isBet ? 'Puntata' : 'Rilancio'} totale ${euro(to)}` : `Almeno ${euro(my.minTo - base)} di fiches`}</span></div>
          ${chipsHtml(s.bb, room, room - this.raiseAdd)}
          <div class="pk-presets"><button class="pk-chip" data-p="raiseClose">Annulla</button><button class="pk-chip" data-p="clear" ${this.raiseAdd ? '' : 'disabled'}>Togli</button><button class="pk-chip" data-p="allin">All-in</button></div>
          <div class="pk-acts"><button class="pk-btn good" data-p="raiseGo" ${busy} ${ok ? '' : 'disabled'}>${verb} <b>${euro(to)}</b></button></div></div>`;
    }
    const callAll = my.toCall >= me.chips;
    return `<div class="pk-acts">
        <button class="pk-btn bad" data-p="fold" ${busy}>Lascia</button>
        ${my.canCheck ? `<button class="pk-btn" data-p="check" ${busy}>Passa</button>` : `<button class="pk-btn blue" data-p="call" ${busy}>${callAll ? 'All-in' : 'Chiama'} <b>${euro(my.toCall)}</b></button>`}
        ${my.canRaise ? `<button class="pk-btn good" data-p="raiseOpen" ${busy}>${my.isBet ? 'Punta' : 'Rilancia'}</button>` : ''}</div>`;
  }

  render() {
    if (this.closed) {
      this.el.innerHTML = `<div class="pk-closed"><div class="card"><h3>🎮 Poker</h3><p>${esc(this.closed)}</p><p class="small muted">Le fiches che avevi tornano sul tuo conto.</p>
        <button class="btn good full" data-p="done">Torna in città</button></div></div>`;
      return;
    }
    const s = this.s;
    if (!s) {
      this.el.innerHTML = '<div class="pk-closed"><div class="card"><p class="center">Mi collego al tavolo…</p></div></div>';
      return;
    }
    const portrait = innerHeight >= innerWidth;
    const spots = portrait ? SPOTS_P : SPOTS_L;
    // i giocatori sparsi attorno al tavolo (tu in basso, gli altri in senso orario, a distanze uguali)
    const mine = Math.max(0, s.mySeat);
    const order = s.seats.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).sort((a, b) => ((a - mine + 8) % 8) - ((b - mine + 8) % 8));
    const seats = order.map((i, k) => this.seatHtml(i, Math.round((k * 8) / order.length) % 8, spots)).join('');
    const me = this.me();
    const myCards = me?.cards ?? null;
    const shownMe = this.result()?.shown[String(s.mySeat)];
    const hand = this.deal.busy ? '' : s.myHand || shownMe?.hand || '';
    const mk = [this.holeKey(Math.max(0, s.mySeat), 0), this.holeKey(Math.max(0, s.mySeat), 1)];
    const mineHtml = myCards && this.deal.has(mk[0])
      ? myCards.map((c, r) => (this.deal.has(mk[r]) ? cardHtml(c, 'lg', this.winBest().includes(c), this.deal.age(mk[r])) : '<div class="pk-card slot lg"></div>')).join('')
      : '<div class="pk-card slot lg"></div><div class="pk-card slot lg"></div>';
    const exitTxt = this.confirmExit ? (me?.inHand && !me.folded ? 'Sicuro? Lasci la mano' : 'Sicuro? Tocca ancora') : '‹ Esci';
    this.el.innerHTML = `
      <div class="pk-top"><button class="pk-exit ${this.confirmExit ? 'warn' : ''}" data-p="exit">${exitTxt}</button>
        <button class="pk-code" data-p="share">Stanza <b>${s.code}</b> 🔗</button><span class="pk-blinds">Bui ${euro(s.sb)}/${euro(s.bb)}</span></div>
      <div class="pk-felt"><div class="pk-oval"></div>${this.centerHtml()}${seats}</div>
      <div class="pk-me">
        <div class="pk-hand">${mineHtml}
          <div class="pk-hinfo">${hand ? `<b>${esc(hand)}</b>` : ''}<span>Fiches <b>${euro(me?.chips ?? 0)}</b></span><span class="muted">Conto ${euro(this.game.state.money)}</span></div></div>
        ${this.fails >= 3 ? '<div class="pk-note bad">Connessione persa: riprovo…</div>' : ''}${this.msg ? `<div class="pk-note bad">${esc(this.msg)}</div>` : ''}
        ${this.actionsHtml()}
      </div>`;
    wireBuyBox(this.el, (_k, v) => {
      this.rebuyAmt = v;
      const b = this.el.querySelector('.pk-rebuy-go b');
      if (b) b.textContent = euro(v);
    });
  }

  private async send(body: object) {
    this.busy = true;
    this.msg = '';
    this.render();
    try {
      const j = await pk<PkState & { closed?: string }>('act', { code: this.code, ...body }, 15000);
      if (j.closed) this.closed = j.closed;
      else this.setState(j);
      this.closeRaise();
    } catch (e) {
      const d = (e as Error & { data?: { state?: PkState } }).data;
      if (d?.state) this.setState(d.state);
      this.msg = (e as Error).message;
    }
    this.busy = false;
    this.render();
  }

  private async rebuy(amount: number, back = false) {
    const money = this.game.state.money;
    if (amount > money) {
      this.msg = 'Non hai abbastanza soldi sul conto';
      this.render();
      return;
    }
    this.busy = true;
    try {
      const j = await pk<{ bought: number; state: PkState }>('rebuy', { code: this.code, buy: amount || undefined, back }, 15000);
      if (j.bought) {
        this.game.state.money -= j.bought;
        this.bought += j.bought;
        this.game.save();
      }
      this.setState(j.state);
      this.msg = '';
    } catch (e) {
      this.msg = (e as Error).message;
    }
    this.busy = false;
    this.render();
  }

  private async exit() {
    if (this.exiting) return;
    this.exiting = true;
    this.el.innerHTML = '<div class="pk-closed"><div class="card"><p class="center">Esco dal tavolo…</p></div></div>';
    let left = 0;
    if (!this.closed) {
      try {
        left = (await pk<{ chips: number }>('leave', { code: this.code }, 20000)).chips || 0;
      } catch {
        /* se non risponde, il server toglie comunque chi sparisce e la vincita si ritira alla prossima apertura */
      }
    }
    // anteprime: tavolo di prova, le fiches rimaste tornano subito sul conto della partita di prova
    if (previewPr !== null && left > 0) {
      this.game.state.money += left;
      this.game.save();
    }
    const got = previewPr !== null ? left : await claimPoker(this.game, true);
    clearInterval(this.timer);
    this.deal.stop();
    removeEventListener('resize', this.onResize);
    this.el.remove();
    document.body.classList.remove('in-poker');
    this.game.leaveAway();
    const diff = got - this.bought;
    if (got > 0 || this.bought > 0) toast(diff > 0 ? `Poker: hai vinto ${euro(diff)}!` : diff < 0 ? `Poker: hai perso ${euro(-diff)}` : 'Poker: sei uscito pari', diff > 0 ? 'money' : 'info');
    this.onDone();
  }

  private share() {
    const text = `Giochiamo a poker su Hustle Idle! Apri Sfide → Poker → Entra con il codice ${this.code}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text }).catch(() => {});
    else void navigator.clipboard?.writeText(this.code).then(() => toast('Codice della stanza copiato', 'info')).catch(() => {});
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!el || this.busy) return;
    const [a, arg = ''] = el.dataset.p!.split(':');
    if (a !== 'exit') this.confirmExit = false;
    if (a === 'exit') {
      if (!this.confirmExit) {
        this.confirmExit = true;
        this.render();
        return;
      }
      void this.exit();
    } else if (a === 'done') void this.exit();
    else if (a === 'share') this.share();
    else if (a === 'fold' || a === 'check' || a === 'call') void this.send({ action: a });
    else if (a === 'raiseOpen') {
      this.closeRaise();
      this.raiseOpen = true;
      this.render();
    } else if (a === 'raiseClose') {
      this.closeRaise();
      this.render();
    } else if (a === 'chip' || a === 'allin' || a === 'clear') {
      const s = this.s;
      const me = this.me();
      const my = s?.my;
      if (!s || !me || !my) return;
      const room = my.maxTo - (me.bet + my.toCall);
      if (a === 'clear') {
        this.raiseAdd = 0;
        this.raiseStack = [];
      } else if (a === 'allin') {
        this.raiseAdd = room;
        this.raiseStack = [];
      } else {
        // la stessa fiche toccata più volte si punta più volte
        const v = Number(arg);
        if (this.raiseAdd + v <= room) {
          this.raiseAdd += v;
          this.raiseStack.push(v);
        }
      }
      this.render();
    } else if (a === 'raiseGo') {
      const me = this.me();
      const my = this.s?.my;
      if (me && my) void this.send({ action: 'raise', amount: me.bet + my.toCall + this.raiseAdd });
    }
    else if (a === 'rebuy') {
      const box = this.el.querySelector<HTMLElement>('.pk-amt');
      const v = this.rebuyAmt;
      if (box && (v < Number(box.dataset.min) || v > Number(box.dataset.max))) {
        this.msg = `Scegli una cifra da ${euro(Number(box.dataset.min))} a ${euro(Number(box.dataset.max))}`;
        this.render();
        return;
      }
      void this.rebuy(v);
    }
    else if (a === 'back') void this.rebuy(0, true);
    else this.render();
  }
}
