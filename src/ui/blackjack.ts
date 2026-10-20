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
import { chipsHtml, chipStackHtml, DealQueue } from './tablefx';

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
  /** numero della mano (per riconoscere le carte nuove) */
  round: number;
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
/** punti delle carte già sul tavolo (come sul server: asso 11 o 1) */
function points(cards: string[]) {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]);
    if (c[0] === 'A') aces++;
  }
  while (t > 21 && aces) {
    t -= 10;
    aces--;
  }
  return { total: t, soft: aces > 0 && t < 21 };
}

// posti degli altri giocatori attorno al tavolo (in %): il banco è in alto, tu sei sotto il tavolo
const SPOTS_P: [number, number][] = [[15, 84], [11, 60], [20, 37], [80, 37], [89, 60], [85, 84]];
const SPOTS_L: [number, number][] = [[12, 80], [8, 50], [22, 24], [78, 24], [92, 50], [88, 80]];

// puntata ricordata per "Ripeti"
let lastBet = 0;
let lastStack: number[] = [];

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
  /** puntata fatta con le fiches: totale e fiches toccate (la stessa più volte = puntata più volte) */
  private betAmt = 0;
  private betStack: number[] = [];
  private rebuyAmt = 0;
  private bought: number;
  /** il mazziere: le carte arrivano una alla volta */
  private deal = new DealQueue(() => this.render());

  constructor(private game: Game, private code: string, first: BjState | null, bought: number, private onDone: () => void) {
    this.s = first;
    this.bought = bought;
    this.el = document.createElement('div');
    this.el.className = 'pk bj';
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  private onResize = () => this.render();

  /** chiavi delle carte (giocatore + carta, così restano uguali anche dividendo) */
  private cardKeys(seat: number | 'd', cards: (string | null)[]) {
    const seen = new Map<string, number>();
    return cards.map((c) => {
      const id = c ?? 'coperta';
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return `r${this.s!.round}${seat === 'd' ? 'd' : `p${seat}`}:${id}#${n}`;
    });
  }

  /** le carte sul tavolo nell'ordine del mazziere: un giro a testa e una al banco, poi il secondo giro */
  private dealKeys() {
    const s = this.s;
    if (!s || !s.round) return [];
    const seats = s.seats.map((p, i) => (p && p.hands.length ? i : -1)).filter((i) => i >= 0);
    const per = new Map(seats.map((i) => [i, s.seats[i]!.hands.map((h) => h.cards)]));
    const keyed = new Map(seats.map((i) => [i, this.cardKeys(i, per.get(i)!.flat())]));
    const dk = this.cardKeys('d', s.dealer.cards);
    const max = Math.max(s.dealer.cards.length, ...seats.flatMap((i) => per.get(i)!.map((c) => c.length)), 0);
    const keys: string[] = [];
    for (let c = 0; c < max; c++) {
      for (const i of seats) {
        let off = 0;
        for (const cards of per.get(i)!) {
          if (c < cards.length) keys.push(keyed.get(i)![off + c]);
          off += cards.length;
        }
      }
      if (c < dk.length) keys.push(dk[c]);
    }
    return keys;
  }

  private setState(st: BjState, instant = false) {
    this.s = st;
    this.deal.sync(this.dealKeys(), instant);
  }

  /** le carte di una mano già arrivate sul tavolo (con l'animazione di quelle appena date) */
  private visible(seat: number | 'd', cards: (string | null)[], all: (string | null)[] = cards, from = 0) {
    const keys = this.cardKeys(seat, all).slice(from, from + cards.length);
    return cards.map((c, i) => ({ c, k: keys[i] })).filter((x) => this.deal.has(x.k));
  }

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
        this.setState(j, !this.s);
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

  private handHtml(seat: number, k: number, size: 'sm' | 'md' | 'lg', active: boolean) {
    const hands = this.s!.seats[seat]!.hands;
    const h = hands[k];
    const from = hands.slice(0, k).reduce((a, x) => a + x.cards.length, 0);
    const vis = this.visible(seat, h.cards, hands.flatMap((x) => x.cards), from);
    const done = !this.deal.busy;
    const result = done ? h.result : '';
    const pts = points(vis.map((x) => x.c!));
    const tag = result ? `<span class="bj-res ${result}">${RESULT[result] ?? result}${h.win > 0 && result !== 'pari' ? ` +${euro(h.win - h.bet)}` : ''}</span>` : '';
    const total = !vis.length ? '' : h.bj && vis.length === h.cards.length ? 'BJ' : totalText(pts);
    return `<div class="bj-hand ${active && done ? 'on' : ''} ${result || ''}"><div class="bj-cards">${vis.map((x) => cardHtml(x.c, size, false, this.deal.age(x.k))).join('') || `<div class="pk-card slot ${size}"></div>`}</div>
      <div class="bj-hinfo">${total ? `<b class="bj-total">${total}</b>` : ''}<span class="bj-chip">${euro(h.bet)}${h.doubled ? ' ×2' : ''}</span>${tag}</div></div>`;
  }

  private seatHtml(i: number, [x, y]: [number, number]) {
    const s = this.s!;
    const p = s.seats[i]!;
    const turn = s.toAct === i;
    const line = this.deal.busy ? undefined : s.result?.lines.find((l) => l.seat === i);
    const hands = p.hands.length
      ? `<div class="bj-shands">${p.hands.map((_, k) => this.handHtml(i, k, 'sm', turn && s.hand === k)).join('')}</div>`
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
    const vis = this.visible('d', d.cards);
    const busy = this.deal.busy;
    const cards = vis.length ? vis.map((x) => cardHtml(x.c, 'md', false, this.deal.age(x.k))).join('') : '<div class="pk-card slot md"></div><div class="pk-card slot md"></div>';
    const faces = vis.filter((x) => x.c).map((x) => x.c!);
    const total = faces.length ? `<b class="bj-total">${s.result?.dealerBJ && !busy ? 'BJ' : totalText(points(faces))}</b>` : '';
    let line = '';
    const players = s.seats.filter(Boolean).length;
    if (busy && s.phase !== 'bet') line = s.phase === 'done' ? 'Gioca il banco…' : 'Il mazziere dà le carte…';
    else if (s.result) line = s.result.dealerBJ ? 'Il banco ha <b>blackjack</b>' : s.result.dealer > 21 ? `Il banco <b>sballa</b> (${s.result.dealer})` : `Il banco fa <b>${s.result.dealer}</b>`;
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
    if (this.deal.busy && s.phase !== 'bet') return `<div class="pk-note">${s.phase === 'done' ? 'Gioca il banco…' : 'Il mazziere dà le carte…'}</div>`;
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
      // si punta toccando le fiches: ogni tocco aggiunge quella fiche (fino alla puntata massima e alle fiches che hai)
      const max = Math.min(s.max, me.chips);
      if (this.betAmt > max) {
        this.betAmt = 0;
        this.betStack = [];
      }
      const ok = this.betAmt >= s.min;
      const again = lastBet >= s.min && lastBet <= max && lastBet !== this.betAmt;
      return `<div class="tbet">${chipStackHtml(this.betStack, s.min, this.betAmt)}<span class="tbet-min">${ok ? '' : `Puntata minima ${euro(s.min)}`}</span></div>
        ${chipsHtml(s.min, max, max - this.betAmt)}
        <div class="pk-presets"><button class="pk-chip" data-p="clear" ${this.betAmt ? '' : 'disabled'}>Togli</button>${again ? `<button class="pk-chip" data-p="again">Ripeti ${euro(lastBet)}</button>` : ''}</div>
        <div class="pk-acts"><button class="pk-btn good bj-bet-go" data-p="bet" ${busy} ${ok ? '' : 'disabled'}>Punta <b>${euro(this.betAmt)}</b></button></div>`;
    }
    if (s.phase === 'done') {
      const line = this.deal.busy ? undefined : s.result?.lines.find((l) => l.seat === s.mySeat);
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
      ? me.hands.map((_, k) => this.handHtml(s.mySeat, k, many ? 'md' : 'lg', s.toAct === s.mySeat && s.hand === k)).join('')
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
      const j = await bj<BjState & { closed?: string }>('act', { code: this.code, ...body });
      if (j.closed) this.closed = j.closed;
      else this.setState(j);
    } catch (e) {
      const d = (e as Error & { data?: { state?: BjState } }).data;
      if (d?.state) this.setState(d.state);
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
    const wasClosed = this.closed;
    const bought = this.bought;
    clearInterval(this.timer);
    this.deal.stop();
    removeEventListener('resize', this.onResize);
    this.el.remove();
    document.body.classList.remove('in-poker');
    this.game.leaveAway();
    this.onDone();
    // uscita dal tavolo e ritiro delle fiches proseguono dietro le quinte: si torna subito in città
    if (!wasClosed) {
      try {
        await bj('leave', { code: this.code }, 20000);
      } catch {
        /* se non risponde, il server toglie comunque chi sparisce e la vincita si ritira alla prossima apertura */
      }
    }
    const got = await claimPoker(this.game, true);
    const diff = got - bought;
    if (got > 0 || bought > 0) toast(diff > 0 ? `Blackjack: hai vinto ${euro(diff)}!` : diff < 0 ? `Blackjack: hai perso ${euro(-diff)}` : 'Blackjack: sei uscito pari', diff > 0 ? 'money' : 'info');
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
    else if (a.startsWith('chip:')) {
      // la stessa fiche toccata più volte si punta più volte
      const s = this.s;
      const me = this.me();
      const v = Number(a.slice(5));
      if (s && me && this.betAmt + v <= Math.min(s.max, me.chips)) {
        this.betAmt += v;
        this.betStack.push(v);
      }
      this.render();
    } else if (a === 'clear') {
      this.betAmt = 0;
      this.betStack = [];
      this.render();
    } else if (a === 'again') {
      this.betAmt = lastBet;
      this.betStack = [...lastStack];
      this.render();
    } else if (a === 'bet') {
      if (this.s && this.betAmt < this.s.min) return;
      lastBet = this.betAmt;
      lastStack = [...this.betStack];
      const amount = this.betAmt;
      this.betAmt = 0;
      this.betStack = [];
      void this.send({ action: 'bet', amount });
    } else if (a === 'rebuy') {
      const box = this.el.querySelector<HTMLElement>('.pk-amt');
      const v = this.rebuyAmt;
      if (box && (v < Number(box.dataset.min) || v > Number(box.dataset.max))) {
        this.msg = `Scegli una cifra da ${euro(Number(box.dataset.min))} a ${euro(Number(box.dataset.max))}`;
        this.render();
        return;
      }
      void this.rebuy(v);
    } else this.render();
  }
}
