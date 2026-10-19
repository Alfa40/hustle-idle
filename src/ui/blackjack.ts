/**
 * Blackjack contro il banco (1–7 giocatori allo stesso tavolo) con i soldi del gioco.
 *
 * Il banco è il server (`hustle-blackjack.js` accanto a server.js): sabot, carte, turni e pagamenti. Qui c'è solo quello
 * che vede il giocatore: lo stato del tavolo chiesto ogni secondo e i tasti (punta, carta, stai, raddoppia, dividi).
 * Soldi come nel poker (src/ui/poker.ts): le fiches si comprano entrando e tornano sul conto uscendo (`claimPoker`,
 * stessa lista sul server); al tavolo la partita è offline (`Game.enterAway`).
 */
import type { Game } from '../game';
import { toast } from '../sim/bus';
import { euro } from '../sim/state';
import { buyBox, cardHtml, casino, claimPoker, colorOfName, initialsOf, wireBuyBox } from './poker';

export interface BjHand {
  cards: string[];
  bet: number;
  total: number;
  soft: boolean;
  done: boolean;
  doubled: boolean;
  bj: boolean;
  result: string;
  win: number;
}
export interface BjSeat {
  name: string;
  chips: number;
  bet: number;
  sitOut: boolean;
  me: boolean;
  hands: BjHand[];
}
export interface BjState {
  code: string;
  v: number;
  min: number;
  max: number;
  minBuy: number;
  maxBuy: number;
  fame: number;
  phase: 'bet' | 'play' | 'done';
  betLeft: number;
  betMs: number;
  dealer: { cards: (string | null)[]; total: number; soft: boolean };
  seats: (BjSeat | null)[];
  mySeat: number;
  toAct: number;
  hand: number;
  turnLeft: number;
  turnMs: number;
  result: { dealer: number; dealerBJ: boolean; lines: { seat: number; name: string; net: number }[] } | null;
  nextIn: number;
  log: string[];
  my?: { canDouble: boolean; canSplit: boolean };
}
export interface BjInfo {
  code: string;
  min: number;
  max: number;
  fame: number;
  minBuy: number;
  maxBuy: number;
  players: string[];
  free: number;
  seated: boolean;
}

/** limiti del tavolo (come sul server): puntata da minima a 50 volte, fiches da 10 a 200 puntate minime */
export const BJ_MAX_BET_X = 50;
export const BJ_MIN_BUY_X = 10;
export const BJ_MAX_BUY_X = 200;

const bj = <T>(path: string, body: object, timeoutMs = 15000) => casino<T>('bj', path, body, timeoutMs);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const RESULT: Record<string, string> = { vince: 'Vinta', perde: 'Persa', pari: 'Pari', sballato: 'Sballato', blackjack: 'Blackjack!' };
const totalText = (h: { total: number; soft: boolean }) => (h.soft ? `${h.total - 10}/${h.total}` : String(h.total));

// posti degli altri giocatori attorno al tavolo (in %): il banco è in alto, tu sei sotto il tavolo
const SPOTS_P: [number, number][] = [[15, 84], [11, 60], [20, 37], [80, 37], [89, 60], [85, 84]];
const SPOTS_L: [number, number][] = [[12, 80], [8, 50], [22, 24], [78, 24], [92, 50], [88, 80]];

// puntata ricordata per "Ripeti" (per tavolo)
let lastBet = 0;

export class BlackjackTable {
  private el: HTMLDivElement;
  private s: BjState | null;
  private closed = '';
  private timer = 0;
  private polling = false;
  private fails = 0;
  private confirmExit = false;
  private busy = false;
  private msg = '';
  private exiting = false;
  private betAmt = 0;
  private rebuyAmt = 0;
  private bought: number;

  constructor(private game: Game, private code: string, first: BjState | null, bought: number, private onDone: () => void) {
    this.s = first;
    this.bought = bought;
    this.el = document.createElement('div');
    this.el.className = 'pk bj';
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  private onResize = () => this.render();

  open() {
    this.game.enterAway();
    addEventListener('resize', this.onResize);
    document.body.appendChild(this.el);
    document.body.classList.add('in-poker');
    this.render();
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), 1000);
  }

  private async poll() {
    if (this.polling || this.closed || this.exiting || document.hidden) return;
    this.polling = true;
    try {
      const j = await bj<BjState & { same?: boolean; closed?: string }>('state', { code: this.code, v: this.s?.v ?? -1 });
      this.fails = 0;
      if (j.closed) {
        this.closed = j.closed;
        this.render();
      } else if (j.same) {
        if (this.s) {
          this.s.turnLeft = j.turnLeft;
          this.s.betLeft = j.betLeft;
          this.tickText();
        }
      } else {
        this.s = j;
        this.render();
      }
    } catch {
      this.fails++;
      if (this.fails === 3) this.render();
    }
    this.polling = false;
  }

  /** secondi che mancano (puntate, turno) senza ridisegnare tutto: non si perde la cifra che si sta scrivendo */
  private tickText() {
    const el = this.el.querySelector('.bj-secs');
    if (el && this.s) el.textContent = String(Math.ceil((this.s.phase === 'bet' ? this.s.betLeft : this.s.turnLeft) / 1000));
  }

  private me() {
    return this.s && this.s.mySeat >= 0 ? this.s.seats[this.s.mySeat] : null;
  }

  private handHtml(h: BjHand, size: 'sm' | 'md' | 'lg', active: boolean) {
    const tag = h.result ? `<span class="bj-res ${h.result}">${RESULT[h.result] ?? h.result}${h.win > 0 && h.result !== 'pari' ? ` +${euro(h.win - h.bet)}` : ''}</span>` : '';
    return `<div class="bj-hand ${active ? 'on' : ''} ${h.result || ''}"><div class="bj-cards">${h.cards.map((c) => cardHtml(c, size)).join('')}</div>
      <div class="bj-hinfo"><b class="bj-total">${h.bj && !h.result ? 'BJ' : totalText(h)}</b><span class="bj-chip">${euro(h.bet)}${h.doubled ? ' ×2' : ''}</span>${tag}</div></div>`;
  }

  private seatHtml(i: number, [x, y]: [number, number]) {
    const s = this.s!;
    const p = s.seats[i]!;
    const turn = s.toAct === i;
    const line = s.result?.lines.find((l) => l.seat === i);
    const hands = p.hands.length
      ? `<div class="bj-shands">${p.hands.map((h, k) => this.handHtml(h, 'sm', turn && s.hand === k)).join('')}</div>`
      : p.bet > 0 ? `<div class="pk-tag">punta ${euro(p.bet)}</div>` : '';
    const timer = turn && s.turnLeft > 0 ? `<i class="pk-timer" style="animation-duration:${s.turnLeft}ms;--w:${Math.round((s.turnLeft / s.turnMs) * 100)}%"></i>` : '';
    const tag = line ? `<div class="pk-tag ${line.net > 0 ? 'won' : ''}">${line.net > 0 ? `+${euro(line.net)}` : line.net < 0 ? `-${euro(-line.net)}` : 'pari'}</div>` : p.sitOut ? '<div class="pk-tag">in pausa</div>' : '';
    return `<div class="pk-seat bj-seat ${turn ? 'turn' : ''} ${line && line.net > 0 ? 'win' : ''}" style="left:${x}%;top:${y}%">
        ${hands}<div class="pk-av" style="--c:${colorOfName(p.name)}">${esc(initialsOf(p.name))}</div>
        <div class="pk-plate"><b>${esc(p.name)}</b><span>${euro(p.chips)}</span>${timer}</div>${tag}</div>`;
  }

  private centerHtml() {
    const s = this.s!;
    const d = s.dealer;
    const cards = d.cards.length ? d.cards.map((c) => cardHtml(c, 'md')).join('') : '<div class="pk-card slot md"></div><div class="pk-card slot md"></div>';
    const total = d.cards.length ? `<b class="bj-total">${s.result?.dealerBJ ? 'BJ' : totalText(d)}</b>` : '';
    let line = '';
    const players = s.seats.filter(Boolean).length;
    if (s.result) line = s.result.dealerBJ ? 'Il banco ha <b>blackjack</b>' : s.result.dealer > 21 ? `Il banco <b>sballa</b> (${s.result.dealer})` : `Il banco fa <b>${s.result.dealer}</b>`;
    else if (s.phase === 'bet') line = s.betLeft > 0 ? `Puntate aperte: carte tra <b class="bj-secs">${Math.ceil(s.betLeft / 1000)}</b> s` : players > 1 ? 'Fate le vostre puntate' : 'Fai la tua puntata';
    else if (s.toAct >= 0 && s.seats[s.toAct] && s.toAct !== s.mySeat) line = `Tocca a <b>${esc(s.seats[s.toAct]!.name)}</b>`;
    return `<div class="bj-dealer"><div class="bj-dlabel">Banco ${total}</div><div class="bj-cards">${cards}</div>
        <div class="bj-rules">Blackjack paga 3 a 2<br>Il banco sta su 17</div></div>
      ${line ? `<div class="pk-line bj-line">${line}</div>` : ''}`;
  }

  private actionsHtml() {
    const s = this.s!;
    const me = this.me();
    if (!me) return '';
    const busy = this.busy ? 'disabled' : '';
    const money = this.game.state.money;
    const inRound = me.hands.length > 0 && s.phase === 'play';
    if (s.phase === 'play' && s.toAct === s.mySeat && s.my) {
      return `<div class="pk-note">Tocca a te: <b class="bj-secs">${Math.ceil(s.turnLeft / 1000)}</b> s</div><div class="pk-acts">
        <button class="pk-btn blue" data-p="hit" ${busy}>Carta</button><button class="pk-btn good" data-p="stand" ${busy}>Stai</button>
        ${s.my.canDouble ? `<button class="pk-btn" data-p="double" ${busy}>Raddoppia</button>` : ''}${s.my.canSplit ? `<button class="pk-btn" data-p="split" ${busy}>Dividi</button>` : ''}</div>`;
    }
    if (inRound) return `<div class="pk-note">${s.toAct >= 0 && s.seats[s.toAct] ? `Tocca a <b>${esc(s.seats[s.toAct]!.name)}</b>…` : 'Gioca il banco…'}</div>`;
    if (s.phase === 'bet' && me.bet > 0) return `<div class="pk-note">Hai puntato <b>${euro(me.bet)}</b>. ${s.betLeft > 0 ? `Carte tra <b class="bj-secs">${Math.ceil(s.betLeft / 1000)}</b> s` : 'Aspettiamo gli altri…'}</div>`;
    // fiches finite (meno della puntata minima): si ricomprano
    if (me.chips < s.min) {
      const max = Math.min(s.maxBuy - me.chips, Math.floor(money));
      const min = Math.min(max, s.minBuy);
      if (max < s.min) return `<div class="pk-note">Hai finito le fiches e sul conto non hai abbastanza per ricomprarle.</div>`;
      if (!this.rebuyAmt || this.rebuyAmt > max || this.rebuyAmt < min) this.rebuyAmt = max;
      return `<div class="pk-note">Hai finito le fiches. Quante ne ricompri?</div><div class="pk-rebuy">${buyBox('rb', min, max, this.rebuyAmt, s.min)}</div>
        <div class="pk-acts"><button class="pk-btn good pk-rebuy-go" data-p="rebuy" ${busy}>Ricompra <b>${euro(this.rebuyAmt)}</b></button></div>`;
    }
    if (s.phase === 'bet') {
      const max = Math.min(s.max, me.chips);
      if (!this.betAmt || this.betAmt > max || this.betAmt < s.min) this.betAmt = Math.min(max, lastBet >= s.min ? lastBet : s.min);
      return `<div class="pk-rebuy">${buyBox('bet', s.min, max, this.betAmt, s.min)}</div>
        <div class="pk-acts"><button class="pk-btn good bj-bet-go" data-p="bet" ${busy}>Punta <b>${euro(this.betAmt)}</b></button></div>`;
    }
    if (s.phase === 'done') {
      const line = s.result?.lines.find((l) => l.seat === s.mySeat);
      const txt = line ? (line.net > 0 ? `Hai vinto <b>${euro(line.net)}</b>!` : line.net < 0 ? `Hai perso ${euro(-line.net)}` : 'Pari: riprendi la puntata') : 'Prossima mano tra poco';
      return `<div class="pk-note">${txt}</div>`;
    }
    return '';
  }

  render() {
    if (this.closed) {
      this.el.innerHTML = `<div class="pk-closed"><div class="card"><h3>🎮 Blackjack</h3><p>${esc(this.closed)}</p><p class="small muted">Le fiches che avevi tornano sul tuo conto.</p>
        <button class="btn good full" data-p="done">Torna in città</button></div></div>`;
      return;
    }
    const s = this.s;
    if (!s) {
      this.el.innerHTML = '<div class="pk-closed"><div class="card"><p class="center">Mi collego al tavolo…</p></div></div>';
      return;
    }
    const spots = innerHeight >= innerWidth ? SPOTS_P : SPOTS_L;
    const mine = Math.max(0, s.mySeat);
    const others = s.seats.map((p, i) => (p && i !== s.mySeat ? i : -1)).filter((i) => i >= 0).sort((a, b) => ((a - mine + 7) % 7) - ((b - mine + 7) % 7));
    const seats = others.map((i, k) => this.seatHtml(i, spots[Math.round((k * 6) / Math.max(1, others.length)) % 6])).join('');
    const me = this.me();
    const many = (me?.hands.length ?? 0) > 1;
    const myHands = me?.hands.length
      ? me.hands.map((h, k) => this.handHtml(h, many ? 'md' : 'lg', s.toAct === s.mySeat && s.hand === k)).join('')
      : '<div class="bj-hand"><div class="bj-cards"><div class="pk-card slot lg"></div><div class="pk-card slot lg"></div></div></div>';
    const exitTxt = this.confirmExit ? (me?.hands.length && s.phase === 'play' ? 'Sicuro? Perdi la puntata' : 'Sicuro? Tocca ancora') : '‹ Esci';
    this.el.innerHTML = `
      <div class="pk-top"><button class="pk-exit ${this.confirmExit ? 'warn' : ''}" data-p="exit">${exitTxt}</button>
        <button class="pk-code" data-p="share">Tavolo <b>${s.code}</b> 🔗</button><span class="pk-blinds">Puntata ${euro(s.min)}–${euro(s.max)}</span></div>
      <div class="pk-felt"><div class="pk-oval bj-oval"></div>${this.centerHtml()}${seats}</div>
      <div class="pk-me">
        <div class="bj-mine ${many ? 'many' : ''}">${myHands}</div>
        <div class="bj-mybar"><span>Fiches <b>${euro(me?.chips ?? 0)}</b></span><span class="muted">Conto ${euro(this.game.state.money)}</span></div>
        ${this.fails >= 3 ? '<div class="pk-note bad">Connessione persa: riprovo…</div>' : ''}${this.msg ? `<div class="pk-note bad">${esc(this.msg)}</div>` : ''}
        ${this.actionsHtml()}
      </div>`;
    wireBuyBox(this.el, (k, v) => {
      if (k === 'bet') {
        this.betAmt = v;
        const b = this.el.querySelector('.bj-bet-go b');
        if (b) b.textContent = euro(v);
      } else {
        this.rebuyAmt = v;
        const b = this.el.querySelector('.pk-rebuy-go b');
        if (b) b.textContent = euro(v);
      }
    });
  }

  private async send(body: object) {
    this.busy = true;
    this.msg = '';
    this.render();
    try {
      const j = await bj<BjState & { closed?: string }>('act', { code: this.code, ...body });
      if (j.closed) this.closed = j.closed;
      else this.s = j;
    } catch (e) {
      const d = (e as Error & { data?: { state?: BjState } }).data;
      if (d?.state) this.s = d.state;
      this.msg = (e as Error).message;
    }
    this.busy = false;
    this.render();
  }

  private async rebuy(amount: number) {
    if (amount > this.game.state.money) {
      this.msg = 'Non hai abbastanza soldi sul conto';
      this.render();
      return;
    }
    this.busy = true;
    try {
      const j = await bj<{ bought: number; state: BjState }>('rebuy', { code: this.code, buy: amount });
      if (j.bought) {
        this.game.state.money -= j.bought;
        this.bought += j.bought;
        this.game.save();
      }
      this.s = j.state;
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
    if (!this.closed) {
      try {
        await bj('leave', { code: this.code }, 20000);
      } catch {
        /* se non risponde, il server toglie comunque chi sparisce e la vincita si ritira alla prossima apertura */
      }
    }
    const got = await claimPoker(this.game, true);
    clearInterval(this.timer);
    removeEventListener('resize', this.onResize);
    this.el.remove();
    document.body.classList.remove('in-poker');
    this.game.leaveAway();
    const diff = got - this.bought;
    if (got > 0 || this.bought > 0) toast(diff > 0 ? `Blackjack: hai vinto ${euro(diff)}!` : diff < 0 ? `Blackjack: hai perso ${euro(-diff)}` : 'Blackjack: sei uscito pari', diff > 0 ? 'money' : 'info');
    this.onDone();
  }

  private share() {
    const text = `Giochiamo a blackjack su Hustle Idle! Apri Sfide → Blackjack → Entra con il codice ${this.code}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text }).catch(() => {});
    else void navigator.clipboard?.writeText(this.code).then(() => toast('Codice del tavolo copiato', 'info')).catch(() => {});
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!el || this.busy) return;
    const a = el.dataset.p!;
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
    else if (a === 'hit' || a === 'stand' || a === 'double' || a === 'split') void this.send({ action: a });
    else if (a === 'bet' || a === 'rebuy') {
      const box = this.el.querySelector<HTMLElement>('.pk-amt');
      const v = a === 'bet' ? this.betAmt : this.rebuyAmt;
      if (box && (v < Number(box.dataset.min) || v > Number(box.dataset.max))) {
        this.msg = `Scegli una cifra da ${euro(Number(box.dataset.min))} a ${euro(Number(box.dataset.max))}`;
        this.render();
        return;
      }
      if (a === 'bet') {
        lastBet = v;
        void this.send({ action: 'bet', amount: v });
      } else void this.rebuy(v);
    } else this.render();
  }
}
