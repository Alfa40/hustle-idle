import { BUSINESS, LEVEL, TIME } from '../config/balance';
import { BUSINESS_TYPE_IDS, BUSINESS_TYPES, bizType, roleName, ROLES, UPGRADES, UPGRADE_IDS, type BusinessType } from '../config/business';
import { VEHICLE_IDS, VEHICLES, WALK_SPEED, type VehicleId } from '../config/vehicles';
import { MONTH_NAMES, WEATHER, WEEKDAYS } from '../config/events';
import { activeToday, effectText, FORECAST_DAYS, forecast, sureEvents, weatherOf, weekday, type DayHappening } from '../sim/effects';
import { JOBS } from '../config/jobs';
import { LOTS, ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { SKILLS, SKILL_IDS } from '../config/skills';
import type { ActionPrompt, Game } from '../game';
import { drawMap, Minimap } from './map';
import { EdgePointers } from './pointers';
import { CITY_MAP, TILE } from '../config/map';
import { bus, toast } from '../sim/bus';
import type { OfflineReport } from '../sim/calendar';
import {
  autoCapacity, bizAtLot, buyLot, buyStock, buyUpgrade, estimateLot, estimateMonthlyProfit, fameMultiplier, fire, hasManager,
  hire, isAutonomous, isOpenHour, lotDef, lotPrice, lotZone, marketDemand, MAX_ORDERS, menuSlots, monthlyCosts, productDemand,
  stockCap, totalDemand, typesForLot, upg, vehiclesMonthly,
} from '../sim/economy';
import { addFame, addMoney, rank, skillLevel } from '../sim/progress';
import {
  day, dayOfMonth, euro, hourOf, monthIndex, wipeSave, yearOf,
  type Business, type Employee, type JobOffer, type ServiceOrder,
} from '../sim/state';


type Actions = Record<string, (arg: string) => void>;

interface Panel {
  render: () => string;
  actions: Actions;
  live?: boolean;
  small?: boolean;
  wide?: boolean;
  /** colore dell'intestazione */
  color?: string;
  title: string;
  /** dopo ogni render (es. per disegnare un canvas) */
  after?: (body: HTMLElement) => void;
  onClose?: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function demandBars(v: number, max = 4) {
  const n = Math.max(0, Math.min(5, Math.round((v / max) * 5)));
  return `<span class="demand">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function formatDate(minutes: number) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.floor(minutes % 60);
  return `${WEEKDAYS[d % 7]} ${dayOfMonth(d)} ${MONTH_NAMES[monthIndex(d)].slice(0, 3)} · ${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`;
}

export class UI {
  private root = document.getElementById('ui')!;
  private moneyEl!: HTMLElement;
  private dateEl!: HTMLElement;
  private eventEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private missionDot!: HTMLElement;
  private actionEl!: HTMLButtonElement;
  private actionIco!: HTMLElement;
  private actionTxt!: HTMLElement;
  private actionProg!: HTMLElement;
  private jobEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private modal: HTMLElement | null = null;
  private panel: Panel | null = null;
  private liveTimer = 0;
  private lastAction = '';
  private queue: Panel[] = [];
  private minimap!: Minimap;
  private rideEl!: HTMLButtonElement;
  private pointers!: EdgePointers;

  constructor(private game: Game) {
    this.buildHud();
    bus.on('toast', ({ text, kind }) => this.toast(text, kind));
    bus.on('missions', () => this.updateDot());
  }

  private get s() {
    return this.game.state;
  }

  // ---------------- HUD ----------------

  private buildHud() {
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.innerHTML = `
      <div class="pills">
        <div class="pill money" id="h-money">€0</div>
        <button class="pill date" id="h-date" style="border:none"></button>
        <div class="pill event" id="h-event" style="display:none"></div>
        <div class="pill info" id="h-info" style="display:none"></div>
      </div>`;
    this.root.appendChild(top);
    const right = document.createElement('div');
    right.className = 'hud-right';
    right.innerHTML = `
      <div class="hud-btns">
        <button class="hbtn c-orange" data-h="biz"><span class="i">🏢</span><span class="l">Attività</span></button>
        <button class="hbtn c-purple" data-h="missions"><span class="i">📋</span><span class="l">Missioni</span><span class="dot" id="h-dot" style="display:none">!</span></button>
        <button class="hbtn" data-h="profile"><span class="i">👤</span><span class="l">Profilo</span></button>
        <button class="hbtn c-green" data-h="home"><span class="i">🏠</span><span class="l">Casa</span></button>
        <button class="hbtn c-gray" data-h="settings"><span class="i">⚙️</span><span class="l">Opzioni</span></button>
      </div>`;
    this.root.appendChild(right);
    this.minimap = new Minimap(this.game, () => this.openMap());
    right.prepend(this.minimap.el);
    this.pointers = new EdgePointers(this.game, document.body);
    this.moneyEl = top.querySelector('#h-money')!;
    this.dateEl = top.querySelector('#h-date')!;
    this.eventEl = top.querySelector('#h-event')!;
    this.infoEl = top.querySelector('#h-info')!;
    this.dateEl.addEventListener('click', () => this.openCalendar());
    this.missionDot = right.querySelector('#h-dot')!;
    right.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.h;
        if (k === 'biz') this.openAgency('mie', false);
        if (k === 'missions') this.openMissions();
        if (k === 'profile') this.openProfile();
        if (k === 'home') this.game.goHome();
        if (k === 'settings') this.openSettings();
      }),
    );

    const job = document.createElement('div');
    job.className = 'jobbar';
    job.innerHTML = `<div class="row"><span id="j-title"></span><span id="j-time"></span><button class="quit" id="j-quit">Rinuncia</button></div>
      <div class="row muted small" id="j-status"></div><div class="track"><div class="fill" id="j-fill"></div></div>`;
    this.root.appendChild(job);
    job.querySelector('#j-quit')!.addEventListener('click', () => this.game.cancelJob());
    this.jobEl = job;

    const act = document.createElement('button');
    act.className = 'action';
    act.innerHTML = `<div class="prog"></div><div class="ico"></div><div class="txt"></div>`;
    this.actionIco = act.querySelector('.ico')!;
    this.actionTxt = act.querySelector('.txt')!;
    this.actionProg = act.querySelector('.prog')!;
    const inp = this.game.input;
    act.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      act.setPointerCapture(e.pointerId);
      inp.actionHeld = true;
      inp.actionPressed = true;
      act.classList.add('pressed');
    });
    const up = () => {
      inp.actionHeld = false;
      act.classList.remove('pressed');
    };
    act.addEventListener('pointerup', up);
    act.addEventListener('pointercancel', up);
    this.root.appendChild(act);
    this.actionEl = act;

    const ride = document.createElement('button');
    ride.className = 'ride-btn';
    ride.addEventListener('click', () => this.game.toggleRide());
    this.root.appendChild(ride);
    this.rideEl = ride;

    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    document.body.appendChild(this.toastsEl);
  }

  update(dt: number) {
    const s = this.s;
    const m = euro(s.money);
    if (this.moneyEl.textContent !== m) {
      this.moneyEl.textContent = m;
      this.moneyEl.classList.toggle('neg', s.money < 0);
    }
    const today = day(s);
    const d = `${WEATHER[weatherOf(s, today)].icon} ${formatDate(s.minutes)} 📅`;
    if (this.dateEl.textContent !== d) this.dateEl.textContent = d;
    const evText = activeToday(s).filter((x) => x.kind !== 'weather').map(({ h }) => `${h.icon} ${h.name}`).join(' · ');
    if (this.eventEl.textContent !== evText) {
      this.eventEl.textContent = evText;
      this.eventEl.style.display = evText ? '' : 'none';
    }
    const inside = this.game.interior;
    const info = inside
      ? `${BUSINESS_TYPES[inside.biz.type].icon} ${isOpenHour(s) ? 'Aperto' : 'Chiuso (apre alle 8)'} · coda ${inside.info.queue}/${BUSINESS.MAX_QUEUE}`
      : '';
    if (this.infoEl.textContent !== info) {
      this.infoEl.textContent = info;
      this.infoEl.style.display = info ? '' : 'none';
    }

    const run = this.game.run;
    if (run) {
      const f = run.timeLeft / run.timeTotal;
      (this.jobEl.querySelector('#j-title') as HTMLElement).textContent = run.title;
      (this.jobEl.querySelector('#j-time') as HTMLElement).textContent = `⏱ ${Math.ceil(run.timeLeft)}s`;
      (this.jobEl.querySelector('#j-status') as HTMLElement).textContent = run.status;
      const fill = this.jobEl.querySelector('#j-fill') as HTMLElement;
      fill.style.width = `${f * 100}%`;
      fill.className = 'fill' + (f < 0.2 ? ' danger' : f < 0.45 ? ' warn' : '');
    }

    this.minimap.update(dt);
    const r = s.riding;
    const rideTxt = !s.vehicles.length || this.game.interior ? '' : r ? `<span class="i">🚶</span><span class="l">Scendi</span>` : `<span class="i">${VEHICLES[s.vehicles[s.vehicles.length - 1]].icon}</span><span class="l">Sali</span>`;
    if (this.rideEl.dataset.k !== rideTxt) {
      this.rideEl.dataset.k = rideTxt;
      this.rideEl.innerHTML = rideTxt;
      this.rideEl.style.display = rideTxt ? '' : 'none';
    }
    this.pointers.update();

    if (this.panel?.live) {
      this.liveTimer += dt;
      if (this.liveTimer > 1) this.renderPanel();
    }
  }

  setAction(p: ActionPrompt | null) {
    const key = p ? p.icon + p.label : '';
    if (key !== this.lastAction) {
      this.lastAction = key;
      this.actionEl.classList.toggle('on', !!p);
      if (p) {
        this.actionIco.textContent = p.icon;
        this.actionTxt.textContent = p.label;
      }
    }
    this.actionProg.style.setProperty('--p', `${Math.round((p?.progress ?? 0) * 100)}%`);
  }

  jobBar(on: boolean) {
    this.jobEl.classList.toggle('on', on);
  }

  refresh() {
    this.updateDot();
    if (this.panel) this.renderPanel();
  }

  private updateDot() {
    const claimable = this.s.missions.some((m) => !m.claimed && m.progress >= m.target);
    this.missionDot.style.display = claimable ? '' : 'none';
  }

  toast(text: string, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild!.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ---------------- pannelli ----------------

  private open(p: Panel) {
    if (this.panel) {
      // un pannello alla volta: gli altri aspettano
      this.queue.push(p);
      return;
    }
    this.panel = p;
    this.game.paused = true;
    this.game.input.cancel();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="sheet ${p.small ? 'small' : ''} ${p.wide ? 'wide' : ''}" style="--hc:${p.color ?? 'var(--blue)'}"><div class="sheet-head"><h2></h2><button class="x">✕</button></div><div class="tabs-slot"></div><div class="sheet-body"></div></div>`;
    modal.querySelector('h2')!.textContent = p.title;
    modal.querySelector('.x')!.addEventListener('click', () => this.close());
    modal.addEventListener('pointerdown', (e) => {
      if (e.target === modal) this.close();
    });
    modal.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || !this.panel) return;
      const [name, arg = ''] = el.dataset.a!.split(':');
      this.panel.actions[name]?.(arg);
      if (this.panel && this.modal === modal) this.renderPanel();
      this.updateDot();
    });
    modal.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (!el.dataset.c || !this.panel) return;
      const [name, arg = ''] = el.dataset.c.split(':');
      this.panel.actions[name]?.(arg);
      this.renderPanel();
    });
    document.body.appendChild(modal);
    this.modal = modal;
    this.renderPanel();
  }

  private renderPanel() {
    if (!this.modal || !this.panel) return;
    this.liveTimer = 0;
    const body = this.modal.querySelector('.sheet-body') as HTMLElement;
    const scroll = body.scrollTop;
    const html = this.panel.render();
    const [tabs, content] = html.includes('<!--tabs-->') ? html.split('<!--tabs-->') : ['', html];
    (this.modal.querySelector('.tabs-slot') as HTMLElement).innerHTML = tabs;
    body.innerHTML = content;
    // prima si ridisegna (il canvas cambia l'altezza), poi si ripristina lo scorrimento
    this.panel.after?.(body);
    body.scrollTop = scroll;
    (this.modal.querySelector('h2') as HTMLElement).textContent = this.panel.title;
  }

  close() {
    const p = this.panel;
    this.modal?.remove();
    this.modal = null;
    this.panel = null;
    this.game.paused = false;
    p?.onClose?.();
    const next = this.queue.shift();
    if (next) this.open(next);
  }

  get isOpen() {
    return !!this.panel;
  }

  // ---------------- lavori ----------------

  openJobOffer(offer: JobOffer) {
    const def = JOBS[offer.type];
    this.open({
      title: `${def.icon} ${def.name}`,
      small: true,
      color: 'var(--orange)',
      render: () => `
        <div class="card tint row"><div class="icon-bubble" style="background:#fff">${def.icon}</div><p style="margin:0">${def.intro}</p></div>
        <div class="grid2">
          <div class="stat s-green"><b class="money-t">${euro(offer.pay)}</b><span>💰 paga (⭐⭐)</span></div>
          <div class="stat s-yellow"><b class="money-t">${euro(offer.pay * 1.35)}</b><span>🤩 paga con ⭐⭐⭐</span></div>
          <div class="stat s-purple"><b>Liv. ${offer.level}</b><span>📈 difficoltà</span></div>
          <div class="stat"><b>${SKILLS[def.skill].icon} ${SKILLS[def.skill].name}</b><span>esperienza che guadagni</span></div>
        </div>
        <p class="muted small center" style="margin:10px 0 0">Più sei veloce, più stelle prendi ⭐</p>
        <div class="btnrow"><button class="btn sec" data-a="no">No grazie</button><button class="btn good" data-a="yes">Accetta</button></div>`,
      actions: {
        yes: () => {
          this.close();
          this.game.startJob(offer);
        },
        no: () => this.close(),
      },
    });
  }

  openJobResult(offer: JobOffer, stars: number, pay: number, xp: number, fame: number) {
    const def = JOBS[offer.type];
    const st = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
    this.open({
      title: stars ? (stars === 3 ? '🎉 Perfetto!' : '👍 Lavoro completato!') : '😓 Lavoro fallito',
      small: true,
      color: stars ? 'var(--green)' : 'var(--red)',
      render: () => `
        <div class="stars">${st}</div>
        <p class="center muted" style="margin-top:0">${def.icon} ${def.name}</p>
        ${stars ? `<div class="grid2">
          <div class="stat s-green"><b class="money-t">+${euro(pay)}</b><span>💰 guadagno</span></div>
          <div class="stat s-purple"><b>+${xp} XP</b><span>${SKILLS[def.skill].icon} ${SKILLS[def.skill].name}</span></div>
          <div class="stat s-yellow"><b>+${fame.toFixed(1)}</b><span>⭐ fama ${SKILLS[def.skill].name}</span></div>
          <div class="stat"><b>Liv. ${skillLevel(this.s, def.skill)}</b><span>${SKILLS[def.skill].name}</span></div>
        </div>` : `<p class="center">Tempo scaduto o lavoro abbandonato.<br><span class="bad">-1 fama ${SKILLS[def.skill].name}</span></p>`}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  // ---------------- lotti e agenzia ----------------

  /** Scheda di un lotto con le attività che ci si possono aprire. */
  private lotCard(lotId: string, canBuy: boolean) {
    const s = this.s;
    const lot = lotDef(lotId);
    const zone = lotZone[lotId];
    const opts = typesForLot(lotId)
      .map((t) => {
        const def = bizType(t);
        const price = lotPrice(lotId, t);
        const est = estimateLot(s, lotId, t);
        const unit = def.kind === 'service' ? 'ordini' : 'clienti';
        return `<div class="card"><div class="row"><div class="icon-bubble" style="background:${def.color};color:#fff">${def.icon}</div>
            <div style="flex:1"><h3 style="margin:0">${def.name}</h3><div class="muted small">${def.desc}</div></div></div>
          <div class="grid3" style="margin-top:8px">
            <div class="stat s-purple"><b>${est.demand.toFixed(1)}/h</b><span>${unit} (${PRODUCTS[est.best].icon})</span></div>
            <div class="stat s-green"><b class="money-t">${euro(est.revenue)}</b><span>incasso/mese*</span></div>
            <div class="stat ${est.profit >= 0 ? 's-yellow' : 's-red'}"><b class="${est.profit >= 0 ? 'good' : 'bad'}">${euro(est.profit)}</b><span>utile/mese*</span></div>
          </div>
          <button class="btn good full" style="margin-top:10px" data-a="buy:${lotId}|${t}" ${!canBuy || s.money < price ? 'disabled' : ''}>🛒 Apri per ${euro(price)}</button>
          ${def.setupCost ? `<div class="muted small center" style="margin-top:4px">Lotto ${euro(lot.price)} + attrezzatura ${euro(def.setupCost)}</div>` : ''}
        </div>`;
      })
      .join('');
    return `<div class="grid2">
        <div class="stat s-purple"><b>📍 ${ZONES[zone].name}</b><span>zona · clienti ×${ZONES[zone].demand}</span></div>
        <div class="stat s-orange"><b>${euro(lot.rent)}</b><span>${lot.kind === 'truck' ? '🅿️ posteggio' : '🏠 affitto'} al mese</span></div>
      </div>
      ${canBuy ? '' : '<div class="card tint small" style="margin-top:10px">🏢 Per comprare vai all\'<b>agenzia affari</b> oppure davanti al lotto col cartello rosso.</div>'}
      <h3 class="sec-title">Cosa puoi aprire qui</h3>${opts}
      <p class="muted small">* Stima con la domanda di oggi, un dipendente per reparto e un manager. Bollette ${euro(BUSINESS.UTILITIES_MONTH)}/mese.</p>`;
  }

  private buyActions() {
    return {
      buy: (arg: string) => {
        const [lotId, t] = arg.split('|');
        const b = buyLot(this.s, lotId, t as BusinessType);
        if (!b) return;
        this.game.setupLot(lotId);
        this.game.save();
        this.close();
        this.openBusiness(b.id, bizType(b.type).kind === 'service' ? 'ordini' : 'prodotti');
      },
    };
  }

  openLot(lotId: string) {
    const lot = lotDef(lotId);
    this.open({
      title: `🏷️ ${lot.name}`,
      color: 'var(--red)',
      render: () => this.lotCard(lotId, true),
      actions: this.buyActions(),
    });
  }

  /** Agenzia affari: le tue attività, quelle in vendita, i resoconti e il mercato. */
  openAgency(tab = 'mie', atAgency = false) {
    let cur = tab;
    let sel: string | null = null;
    const tabs = [['mie', '🏢 Le mie'], ['compra', '🛒 In vendita'], ['resoconti', '📊 Resoconti'], ['mercato', '📈 Mercato']];
    this.open({
      title: atAgency ? '🏢 Agenzia affari' : '🏢 Attività',
      live: true,
      color: 'var(--purple)',
      render: () => {
        const head = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${cur === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        return head + this.agencyTab(cur, sel, atAgency);
      },
      actions: {
        tab: (k) => {
          cur = k;
          sel = null;
        },
        lot: (id) => (sel = id),
        back: () => (sel = null),
        open: (id) => {
          this.close();
          this.openBusiness(id);
        },
        ...this.buyActions(),
      },
    });
  }

  private agencyTab(tab: string, sel: string | null, atAgency: boolean): string {
    const s = this.s;
    if (tab === 'mie') {
      if (!s.businesses.length) {
        return `<div class="card center"><div class="hero"><div class="emoji">🏪</div></div><p>Non hai ancora nessuna attività.</p>
          <p class="muted">Metti da parte i soldi con i lavoretti, poi guarda la scheda <b>🛒 In vendita</b>. Il posteggio più economico costa ${euro(Math.min(...LOTS.map((l) => l.price)))}.</p></div>`;
      }
      return s.businesses
        .map((b) => {
          const def = bizType(b.type);
          const lot = lotDef(b.lotId);
          const extra = def.kind === 'service' && b.orders.length ? ` · <b>${b.orders.length} ordini in attesa</b>` : '';
          return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble" style="background:${def.color}">${def.icon}</div>
              <div><h3 style="margin:0">${def.name}</h3><div class="muted small">${lot.name}</div></div></div>${this.autoTag(b)}</div>
            <div class="row between small" style="margin-top:8px"><span>Oggi: <b class="money-t">${euro(b.today.revenue)}</b> · ${b.today.served} ${def.kind === 'service' ? 'ordini' : 'clienti'}${extra}</span>
            <button class="btn sm" data-a="open:${b.id}">Gestisci</button></div></div>`;
        })
        .join('');
    }
    if (tab === 'compra') {
      if (sel) {
        return `<button class="btn sm sec" data-a="back" style="margin-bottom:10px">◀ Tutti i lotti</button>
          <h3 class="sec-title" style="margin-top:0">🏷️ ${lotDef(sel).name}</h3>${this.lotCard(sel, atAgency)}`;
      }
      const free = LOTS.filter((l) => !bizAtLot(s, l.id)).sort((a, b) => a.price - b.price);
      if (!free.length) return '<div class="card center">Hai comprato tutti i lotti della città! 🏆</div>';
      const row = (l: (typeof LOTS)[number]) => {
        const types = typesForLot(l.id).map((t) => bizType(t).icon).join(' ');
        const from = Math.min(...typesForLot(l.id).map((t) => lotPrice(l.id, t)));
        return `<button class="card row" style="width:100%;border:none;text-align:left;cursor:pointer" data-a="lot:${l.id}">
          <div class="icon-bubble">${l.kind === 'truck' ? '🅿️' : '🏬'}</div>
          <div style="flex:1"><b>${l.name}</b><div class="muted small">📍 ${ZONES[lotZone[l.id]].name} · ${types}</div></div>
          <div style="text-align:right"><div class="muted small">da</div><b class="${s.money >= from ? 'money-t' : ''}">${euro(from)}</b></div></button>`;
      };
      const trucks = free.filter((l) => l.kind === 'truck').map(row).join('');
      const shops = free.filter((l) => l.kind === 'shop').map(row).join('');
      return `${atAgency ? '' : '<div class="card tint small">🏢 Qui puoi guardare. Per comprare vai all\'<b>agenzia affari</b> o davanti al lotto.</div>'}
        ${trucks ? `<h3 class="sec-title">🅿️ Posteggi per food truck</h3>${trucks}` : ''}
        ${shops ? `<h3 class="sec-title">🏬 Locali per negozi e imprese</h3>${shops}` : ''}`;
    }
    if (tab === 'resoconti') {
      if (!s.businesses.length) return '<div class="card center muted">Qui vedrai i conti e i confronti tra le tue attività.</div>';
      const rows = s.businesses.map((b) => {
        const c = monthlyCosts(s, b);
        const fixed = c.rent + c.utilities + b.staff.reduce((a, e) => a + e.salary, 0);
        return { b, def: bizType(b.type), month: b.month.revenue, est: estimateMonthlyProfit(s, b), fixed, served: b.month.served, lost: b.month.lost };
      }).sort((a, b) => b.month - a.month);
      const max = Math.max(1, ...rows.map((r) => r.month));
      const bars = rows.map((r) => `<div style="margin-bottom:8px"><div class="row between small"><span>${r.def.icon} <b>${lotDef(r.b.lotId).name}</b></span><b class="money-t">${euro(r.month)}</b></div>
        <div class="bar green" style="height:14px"><i style="width:${(r.month / max) * 100}%;background:${r.def.color}"></i></div></div>`).join('');
      const cards = rows.map((r) => `<div class="card"><div class="row between"><h3 style="margin:0">${r.def.icon} ${lotDef(r.b.lotId).name}</h3>${this.autoTag(r.b)}</div>
        <div class="grid3" style="margin-top:8px">
          <div class="stat s-green"><b class="money-t">${euro(r.b.today.revenue)}</b><span>oggi</span></div>
          <div class="stat s-yellow"><b>${euro(r.b.yesterday.revenue)}</b><span>ieri</span></div>
          <div class="stat s-orange"><b>${euro(r.month)}</b><span>mese</span></div>
          <div class="stat"><b>${r.served}</b><span>serviti (mese)</span></div>
          <div class="stat s-red"><b>${r.lost}</b><span>persi (mese)</span></div>
          <div class="stat s-purple"><b>${euro(r.fixed)}</b><span>costi fissi/mese</span></div>
        </div>
        <div class="row between" style="margin-top:8px"><span class="small">Utile stimato al mese</span><b class="${r.est >= 0 ? 'good' : 'bad'}">${isAutonomous(r.b) ? euro(r.est) : 'serve lo staff'}</b></div></div>`).join('');
      const totMonth = rows.reduce((a, r) => a + r.month, 0);
      const totFixed = rows.reduce((a, r) => a + r.fixed, 0) + vehiclesMonthly(s);
      return `<div class="grid2"><div class="stat s-green"><b class="money-t">${euro(totMonth)}</b><span>💰 incassi del mese (tutte)</span></div>
          <div class="stat s-red"><b>${euro(totFixed)}</b><span>🧾 costi fissi al mese (con veicoli)</span></div></div>
        <div class="card" style="margin-top:10px"><h3>🏆 Classifica incassi del mese</h3>${bars}</div>${cards}`;
    }
    // mercato
    const zones: ZoneId[] = ['periferia', 'residenziale', 'centro'];
    return `<p class="muted small">Clienti (o ordini) all'ora previsti oggi per ogni prodotto nelle tre zone. Cambia ogni giorno con stagioni, meteo ed eventi.</p>` +
      BUSINESS_TYPE_IDS.map((t) => {
        const def = bizType(t);
        const fm = fameMultiplier(s, t);
        const rows = def.products.map((p) => `<div class="row between small" style="margin-top:4px"><span style="flex:1">${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span>
          ${zones.map((z) => `<span style="width:58px;text-align:right">${(marketDemand(s, p, z) * fm).toFixed(1)}</span>`).join('')}</div>`).join('');
        return `<div class="card"><h3>${def.icon} ${def.name}</h3>
          <div class="row between small muted"><span style="flex:1"></span>${zones.map((z) => `<span style="width:58px;text-align:right">${ZONES[z].name.slice(0, 6)}</span>`).join('')}</div>${rows}</div>`;
      }).join('');
  }

  // ---------------- attività ----------------

  openBusinessList() {
    this.openAgency('mie', false);
  }

  private autoTag(b: Business) {
    return isAutonomous(b) ? '<span class="tag g">Autonoma</span>' : '<span class="tag y">Serve il titolare</span>';
  }

  openBusiness(bizId: string, tab?: string) {
    const s = this.s;
    const b = () => s.businesses.find((x) => x.id === bizId)!;
    const service = bizType(b().type).kind === 'service';
    let cur = tab ?? (service ? 'ordini' : 'panoramica');
    const tabs = [
      ...(service ? [['ordini', '📋 Ordini']] : []),
      ['panoramica', '📊 Panoramica'], ['prodotti', service ? '🧰 Servizi' : '🍔 Prodotti'],
      ['magazzino', service ? '🧴 Materiali' : '🧊 Magazzino'], ['personale', '👥 Personale'], ['migliorie', '⬆️ Migliorie'],
    ];
    this.open({
      title: `${bizType(b().type).icon} ${bizType(b().type).name} · ${lotDef(b().lotId).name}`,
      live: true,
      color: bizType(b().type).color,
      render: () => {
        const head = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${cur === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        return head + this.bizTab(b(), cur);
      },
      actions: {
        tab: (k) => (cur = k),
        toggleProduct: (p) => {
          const biz = b();
          const pid = p as ProductId;
          if (biz.products.includes(pid)) {
            if (biz.products.length > 1) biz.products = biz.products.filter((x) => x !== pid);
            else toast('Serve almeno un prodotto in vendita', 'bad');
          } else if (biz.products.length < menuSlots(biz)) {
            biz.products.push(pid);
          } else {
            toast('Menù pieno: togli un prodotto o compra "Più prodotti" nelle migliorie', 'bad');
          }
          this.game.setupLot(biz.lotId);
        },
        stock: (arg) => {
          const [p, q] = arg.split('|');
          const n = buyStock(s, b(), p as ProductId, q === 'max' ? 9999 : +q);
          if (!n) toast('Magazzino pieno o soldi insufficienti', 'bad');
        },
        autoRestock: () => (b().autoRestock = !b().autoRestock),
        hire: (id) => hire(s, b(), +id),
        fire: (id) => fire(s, b(), +id),
        upgrade: (id) => {
          buyUpgrade(s, b(), id as never);
          this.game.setupLot(b().lotId);
        },
        exec: (id) => {
          const o = b().orders.find((x) => x.id === +id);
          if (!o) return;
          this.close();
          this.game.startOrder(b(), o);
        },
      },
      onClose: () => this.game.save(),
    });
  }

  private bizTab(b: Business, tab: string): string {
    const s = this.s;
    const type = bizType(b.type);
    const service = type.kind === 'service';
    const lot = lotDef(b.lotId);
    const unit = service ? 'ordini' : 'clienti';
    if (tab === 'ordini') {
      if (isAutonomous(b)) {
        return `<div class="card center"><div class="hero"><div class="emoji">✅</div></div><p>I tuoi dipendenti eseguono gli ordini da soli.</p>
          <p class="muted small">Oggi: ${b.today.served} ordini · ${euro(b.today.revenue)}</p></div>`;
      }
      const list = b.orders
        .map((o) => {
          const pr = PRODUCTS[o.pid];
          const left = Math.max(0, (o.expires - s.minutes) / 60);
          const noStock = (b.stock[o.pid] ?? 0) <= 0;
          return `<div class="card row"><div class="icon-bubble">${pr.icon}</div>
            <div style="flex:1"><b>${pr.name}</b><div class="muted small">💰 ~${euro(pr.price)} · ⏳ scade tra ${left.toFixed(0)} h${noStock ? ' · <span class="bad">materiali finiti</span>' : ''}</div></div>
            <button class="btn sm good" data-a="exec:${o.id}" ${noStock || this.game.run ? 'disabled' : ''}>Esegui</button></div>`;
        })
        .join('');
      return `<div class="card tint small">Gli ordini arrivano nelle ore di apertura (${BUSINESS.OPEN_HOUR}–${BUSINESS.CLOSE_HOUR}). Puoi eseguirli tu (più stelle = paga più alta) oppure assumere staff e un manager per farli fare a loro.</div>
        <h3 class="sec-title">📋 Ordini in attesa (${b.orders.length}/${MAX_ORDERS})</h3>
        ${list || '<p class="muted small">Nessun ordine al momento. Torna più tardi!</p>'}`;
    }
    if (tab === 'panoramica') {
      const missing = type.roles.filter((r) => !b.staff.some((e) => e.role === r)).map((r) => roleName(b.type, r).toLowerCase());
      if (!hasManager(b)) missing.push('manager');
      const c = monthlyCosts(s, b);
      const fullSal = b.staff.reduce((a, e) => a + e.salary, 0);
      const dem = totalDemand(s, b);
      const cap = autoCapacity(b);
      const alone = service ? 'Fino ad allora gli ordini li esegui tu.' : 'Fino ad allora vende solo quando ci sei tu dentro.';
      return `
        <div class="card ${isAutonomous(b) ? '' : 'hl'}"><div class="row between"><h3>${isAutonomous(b) ? '✅' : '⚠️'} Stato</h3>${this.autoTag(b)}</div>
          ${missing.length ? `<p class="muted small" style="margin:0">Per farla lavorare da sola serve: <b>${missing.join(', ')}</b>. ${alone}</p>`
            : '<p class="muted small" style="margin:0">Lavora da sola anche quando sei altrove o offline.</p>'}
        </div>
        <div class="grid2">
          <div class="stat s-purple"><b>${dem.toFixed(2)}/h</b><span>🙋 ${unit} richiesti ora</span></div>
          <div class="stat"><b>${isAutonomous(b) ? cap.toFixed(2) + '/h' : '—'}</b><span>👥 capacità dipendenti</span></div>
          <div class="stat s-green"><b class="money-t">${euro(b.today.revenue)}</b><span>💰 oggi · ${b.today.served} ${unit}</span></div>
          <div class="stat s-red"><b>${b.today.lost}</b><span>😠 ${unit} persi oggi</span></div>
          <div class="stat s-yellow"><b>${euro(b.yesterday.revenue)}</b><span>📅 incasso ieri</span></div>
          <div class="stat s-orange"><b>${euro(b.month.revenue)}</b><span>🗓️ incasso del mese</span></div>
        </div>
        <div class="card" style="margin-top:10px"><h3>🧾 Costi mensili</h3>
          <div class="row between small"><span>${lot.kind === 'truck' ? 'Posteggio' : 'Affitto'}</span><span>${euro(c.rent)}</span></div>
          <div class="row between small"><span>Bollette</span><span>${euro(c.utilities)}</span></div>
          <div class="row between small"><span>Stipendi (${b.staff.length})</span><span>${euro(fullSal)}</span></div>
          <hr><div class="row between"><b>Utile stimato al mese</b><b class="${estimateMonthlyProfit(s, b) >= 0 ? 'good' : 'bad'}">${isAutonomous(b) ? euro(estimateMonthlyProfit(s, b)) : '—'}</b></div>
          <p class="muted small" style="margin-bottom:0">Aperto dalle ${BUSINESS.OPEN_HOUR}:00 alle ${BUSINESS.CLOSE_HOUR}:00. I costi si pagano il 1° del mese.</p>
        </div>`;
    }
    if (tab === 'prodotti') {
      const slots = menuSlots(b);
      return `<p class="muted small">Scegli cosa offrire guardando la domanda di oggi (${b.products.length}/${slots} posti). La domanda cambia ogni giorno, con le stagioni, il meteo e gli eventi.</p>` +
        type.products
          .map((p) => {
            const pr = PRODUCTS[p];
            const on = b.products.includes(p);
            const d = productDemand(s, b, p);
            const season = pr.season[monthIndex(day(s))];
            const next = pr.season[(monthIndex(day(s)) + 1) % 12];
            const trend = next > season * 1.05 ? '📈' : next < season * 0.95 ? '📉' : '➡️';
            const f2 = (n: number) => n.toFixed(2).replace('.', ',');
            return `<div class="card"><div class="row between"><h3>${pr.icon} ${pr.name}</h3>
              <label class="toggle"><input type="checkbox" ${on ? 'checked' : ''} data-c="toggleProduct:${p}"> in vendita</label></div>
              <div class="row between small"><span>Domanda oggi ${demandBars(d, service ? 1 : 4)} ${f2(d)}/h</span><span class="muted">stagione ${trend}</span></div>
              <div class="row between small muted"><span>Prezzo ${euro(pr.price)} · costo ${f2(pr.cost)}€</span><span>margine <b class="good">${f2(pr.price - pr.cost)}€</b></span></div></div>`;
          })
          .join('');
    }
    if (tab === 'magazzino') {
      const cap = stockCap(b);
      return `<div class="card"><label class="toggle"><input type="checkbox" ${b.autoRestock ? 'checked' : ''} data-c="autoRestock"> Riordino automatico</label>
        <p class="muted small" style="margin-bottom:0">${hasManager(b) ? 'Il manager riordina da solo quando le scorte scendono.' : 'Il riordino automatico funziona solo con un manager.'}
        ${service ? ' Ogni servizio consuma 1 unità di materiali.' : ''}</p></div>` +
        b.products
          .map((p) => {
            const pr = PRODUCTS[p];
            const n = b.stock[p] ?? 0;
            const fill = Math.max(0, cap - n);
            return `<div class="card"><div class="row between"><h3>${pr.icon} ${pr.name}</h3><b>${n}/${cap}</b></div>
              <div class="bar green"><i style="width:${(n / cap) * 100}%"></i></div>
              <div class="btnrow"><button class="btn sm sec" data-a="stock:${p}|10">+10 (${euro(10 * pr.cost)})</button>
              <button class="btn sm" data-a="stock:${p}|max" ${fill ? '' : 'disabled'}>Riempi (${euro(fill * pr.cost)})</button></div></div>`;
          })
          .join('');
    }
    if (tab === 'personale') {
      const staff = b.staff.length
        ? b.staff.map((e) => this.empCard(e, b.type, `<button class="btn sm danger" data-a="fire:${e.id}">Licenzia</button>`)).join('')
        : '<p class="muted small">Nessun dipendente.</p>';
      const cands = s.candidates
        .filter((e) => e.role === 'manager' || (type.roles as string[]).includes(e.role))
        .map((e) => this.empCard(e, b.type, `<button class="btn sm good" data-a="hire:${e.id}" ${e.role === 'manager' && hasManager(b) ? 'disabled' : ''}>Assumi</button>`))
        .join('');
      return `<p class="muted small">Serve almeno un dipendente per reparto (${type.roles.map((r) => roleName(b.type, r).toLowerCase()).join(', ')}) più un manager perché l'attività lavori senza di te. Più dipendenti nello stesso reparto = più ${unit} serviti.</p>
        <h3 class="sec-title">👥 Il tuo staff</h3>${staff}<h3 class="sec-title">📝 Candidati di oggi</h3><p class="muted small" style="margin-top:-4px">Nuovi candidati ogni giorno.</p>${cands}`;
    }
    // migliorie
    return UPGRADE_IDS.map((id) => {
      const u = UPGRADES[id];
      const lvl = upg(b, id);
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble">${u.icon}</div><h3 style="margin:0">${u.name}</h3></div><span class="tag">Liv. ${lvl}/${u.max}</span></div>
        <p class="muted small" style="margin:0 0 8px">${u.desc}</p>
        <button class="btn sm full ${maxed ? 'sec' : 'blue'}" data-a="upgrade:${id}" ${maxed || s.money < cost ? 'disabled' : ''}>${maxed ? 'Massimo' : 'Migliora · ' + euro(cost)}</button></div>`;
    }).join('');
  }

  private empCard(e: Employee, type: BusinessType, btn: string) {
    const r = ROLES[e.role];
    const st = (n: string, v: number) => `<div class="small">${n}<div class="bar"><i style="width:${v * 10}%"></i></div></div>`;
    return `<div class="card"><div class="row between"><div><b>${r.icon} ${esc(e.name)}</b> <span class="tag">Liv. ${e.level}</span><div class="muted small">${roleName(type, e.role)} · ${euro(e.salary)}/mese</div></div>${btn}</div>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">${st('Velocità', e.speed)}${st('Abilità', e.skill)}${st('Cortesia', e.kindness)}</div></div>`;
  }

  openOrderResult(biz: Business, order: ServiceOrder, stars: number, earned: number, xp: number) {
    const pr = PRODUCTS[order.pid];
    const st = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
    this.open({
      title: stars ? '🎉 Ordine completato!' : '😓 Ordine fallito',
      small: true,
      color: stars ? 'var(--green)' : 'var(--red)',
      render: () => `<div class="stars">${st}</div><p class="center muted" style="margin-top:0">${pr.icon} ${pr.name} · ${bizType(biz.type).name}</p>
        ${stars ? `<div class="grid2"><div class="stat s-green"><b class="money-t">+${euro(earned)}</b><span>💰 incasso</span></div>
          <div class="stat s-purple"><b>+${xp} XP</b><span>esperienza</span></div></div>` : '<p class="center">Il cliente non è soddisfatto: ordine perso.</p>'}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  // ---------------- veicoli ----------------

  openDealer() {
    const s = this.s;
    this.open({
      title: '🛵 Concessionaria',
      color: 'var(--blue)',
      render: () => `<p class="muted small">Con un veicolo attraversi la città molto più in fretta. Le auto hanno assicurazione e bollo da pagare ogni mese. Il pulsante <b>🛵</b> sopra quello giallo ti fa salire e scendere.</p>` +
        VEHICLE_IDS.map((id) => {
          const v = VEHICLES[id];
          const owned = s.vehicles.includes(id);
          const using = s.riding === id;
          const pct = Math.round((v.speed / WALK_SPEED) * 100 - 100);
          const btn = owned
            ? `<button class="btn sm ${using ? 'sec' : 'blue'}" data-a="use:${id}" ${using ? 'disabled' : ''}>${using ? 'In uso' : 'Usa'}</button>`
            : `<button class="btn sm good" data-a="buyv:${id}" ${s.money < v.price ? 'disabled' : ''}>Compra ${euro(v.price)}</button>`;
          return `<div class="card ${owned ? 'hl' : ''}"><div class="row"><div class="icon-bubble" style="font-size:30px;width:54px;height:54px">${v.icon}</div>
            <div style="flex:1"><h3 style="margin:0">${v.name} ${owned ? '<span class="tag g">tuo</span>' : ''}</h3><div class="muted small">${v.desc}</div></div></div>
            <div class="grid3" style="margin-top:8px">
              <div class="stat s-green"><b>+${pct}%</b><span>velocità</span></div>
              <div class="stat s-yellow"><b>${Math.round(v.speed * 3.6)} km/h</b><span>massima</span></div>
              <div class="stat s-purple"><b>${v.monthly ? euro(v.monthly) : 'gratis'}</b><span>al mese</span></div>
            </div><div class="row" style="justify-content:flex-end;margin-top:8px">${btn}</div></div>`;
        }).join(''),
      actions: {
        buyv: (id) => {
          const v = VEHICLES[id as VehicleId];
          if (s.vehicles.includes(id as VehicleId) || s.money < v.price) return;
          addMoney(s, -v.price);
          s.vehicles.push(id as VehicleId);
          toast(`${v.icon} Hai comprato: ${v.name}!`, 'good');
          this.game.save();
        },
        use: (id) => {
          this.close();
          this.game.mount(id as VehicleId);
        },
      },
    });
  }

  openGarage() {
    const s = this.s;
    this.open({
      title: '🔑 I tuoi veicoli',
      small: true,
      color: 'var(--blue)',
      render: () => s.vehicles.map((id) => {
        const v = VEHICLES[id];
        return `<button class="card row" style="width:100%;border:none;text-align:left" data-a="use:${id}"><div class="icon-bubble">${v.icon}</div>
          <div style="flex:1"><b>${v.name}</b><div class="muted small">${Math.round(v.speed * 3.6)} km/h</div></div><span class="tag b">Sali</span></button>`;
      }).join(''),
      actions: {
        use: (id) => {
          this.close();
          this.game.mount(id as VehicleId);
        },
      },
    });
  }

  // ---------------- missioni e calendario ----------------

  openMissions() {
    const s = this.s;
    this.open({
      title: '📋 Bacheca missioni',
      live: true,
      color: 'var(--purple)',
      render: () => {
        const ms = s.missions
          .map((m) => {
            const done = m.progress >= m.target;
            return `<div class="card ${done && !m.claimed ? 'hl' : ''}"><div class="row between"><b style="flex:1">${m.text}</b>${
              m.claimed ? '<span class="tag g">Riscossa</span>' : done ? `<button class="btn sm good" data-a="claim:${m.id}">Riscuoti</button>` : ''
            }</div>
            <div class="bar green"><i style="width:${(m.progress / m.target) * 100}%"></i></div>
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(m.progress)}/${m.target}</span><span>Premio ${euro(m.reward)} · +${m.fame.toFixed(0)} fama ${SKILLS[m.fameSkill].icon}</span></div></div>`;
          })
          .join('');
        const today = day(s);
        const evs = [0, 1, 2].map((k) => this.dayCard(today + k, false)).join('');
        const prods = (Object.keys(PRODUCTS) as ProductId[])
          .map((p) => {
            const d = marketDemand(s, p, 'periferia');
            return `<div class="row between small"><span>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span>${demandBars(d, 2.4)}</div>`;
          })
          .join('');
        return `<h3 class="sec-title">🎯 Missioni di oggi</h3><p class="muted small" style="margin-top:-4px">Cambiano ogni giorno. Le ricompense crescono con la tua fama.</p>${ms}
          <h3 class="sec-title">📅 Prossimi giorni</h3>${evs}
          <button class="btn blue full" data-a="cal" style="margin-bottom:10px">📅 Apri il calendario completo</button>
          <div class="card"><h3>📊 Domanda del giorno</h3>${prods}</div>`;
      },
      actions: {
        cal: () => {
          this.close();
          this.openCalendar();
        },
        claim: (id) => {
          const m = s.missions.find((x) => x.id === id);
          if (!m || m.claimed || m.progress < m.target) return;
          m.claimed = true;
          addMoney(s, m.reward, 'missione');
          addFame(s, m.fameSkill, m.fame);
          this.game.save();
        },
      },
    });
  }

  // ---------------- calendario ----------------

  private dayName(d: number) {
    const k = d - day(this.s);
    const date = `${WEEKDAYS[weekday(d)]} ${dayOfMonth(d)} ${MONTH_NAMES[monthIndex(d)]}`;
    return k === 0 ? `Oggi · ${date}` : k === 1 ? `Domani · ${date}` : date;
  }

  private happeningRow({ h, kind }: DayHappening) {
    const tag = kind === 'weekly' ? '<span class="tag b">ogni settimana</span>' : '<span class="tag g">sicuro</span>';
    const fx = effectText(h);
    return `<div class="row" style="margin-top:6px;align-items:flex-start"><div class="icon-bubble" style="width:36px;height:36px;font-size:19px">${h.icon}</div>
      <div style="flex:1"><div class="row between"><b>${h.name}</b>${tag}</div><div class="muted small">${h.desc}${fx ? ` <b style="color:var(--ink)">${fx}</b>` : ''}</div></div></div>`;
  }

  /** Scheda di un giorno: meteo (certo o previsto) + eventi sicuri. */
  private dayCard(d: number, full = true) {
    const s = this.s;
    const k = d - day(s);
    const events = sureEvents(s, d);
    let weather = '';
    if (k >= 0 && k <= FORECAST_DAYS) {
      const fc = forecast(s, d);
      const top = WEATHER[fc[0].w];
      if (k === 0) {
        weather = `<div class="row"><div class="icon-bubble" style="width:36px;height:36px;font-size:19px;background:#dff1ff">${top.icon}</div>
          <div style="flex:1"><b>${top.name}</b> <span class="tag b">meteo di oggi</span><div class="muted small">${top.desc} ${effectText(top) ? `<b style="color:var(--ink)">${effectText(top)}</b>` : ''}</div></div></div>`;
      } else {
        const probs = fc.slice(0, full ? 3 : 2).map((x) => `${WEATHER[x.w].icon} ${WEATHER[x.w].name} <b>${Math.round(x.p * 100)}%</b>`).join(' · ');
        weather = `<div class="row"><div class="icon-bubble" style="width:36px;height:36px;font-size:19px;background:#dff1ff">${top.icon}</div>
          <div style="flex:1"><b>Previsioni</b> <span class="tag">possono cambiare</span><div class="small" style="margin-top:2px">${probs}</div></div></div>`;
      }
    }
    const evs = events.map((e) => this.happeningRow(e)).join('');
    const empty = !weather && !evs ? '<div class="muted small">Nessun evento previsto.</div>' : '';
    return `<div class="card ${k === 0 ? 'hl' : ''}"><h3>${this.dayName(d)}</h3>${weather}${evs}${empty}</div>`;
  }

  openCalendar() {
    const s = this.s;
    let monthOff = 0;
    let sel = day(s);
    this.open({
      title: '📅 Calendario',
      color: 'var(--purple)',
      live: true,
      actions: {
        month: (v) => (monthOff = Math.max(0, Math.min(2, monthOff + +v))),
        sel: (v) => (sel = +v),
      },
      render: () => {
        const today = day(s);
        const curMonthStart = today - (today % 30);
        const start = curMonthStart + monthOff * 30;
        const lead = weekday(start);
        const cells: string[] = WEEKDAYS.map((w) => `<div class="cal-h">${w}</div>`);
        for (let i = 0; i < lead; i++) cells.push('<div></div>');
        for (let d = start; d < start + 30; d++) {
          const k = d - today;
          const icons = sureEvents(s, d).filter((e) => e.kind !== 'weekly').map((e) => e.h.icon).slice(0, 2).join('');
          let wx = '';
          if (k >= 0 && k <= FORECAST_DAYS) {
            const f = forecast(s, d)[0];
            wx = `<span class="cal-wx" style="opacity:${k === 0 ? 1 : 0.45 + f.p * 0.55}">${WEATHER[f.w].icon}</span>`;
          }
          cells.push(`<button class="cal-cell ${k === 0 ? 'today' : ''} ${k < 0 ? 'past' : ''} ${d === sel ? 'sel' : ''}" data-a="sel:${d}">
            <span class="cal-n">${dayOfMonth(d)}</span>${wx}<span class="cal-ev">${icons}</span></button>`);
        }
        const upcoming: string[] = [];
        for (let d = today + 1; d < today + 60 && upcoming.length < 5; d++) {
          for (const e of sureEvents(s, d)) {
            if (e.kind === 'weekly') continue;
            if (sureEvents(s, d - 1).some((x) => x.h.id === e.h.id)) continue;
            upcoming.push(`<div class="row between small" style="margin-top:4px"><span>${e.h.icon} <b>${e.h.name}</b></span><span class="tag ${d - today <= 3 ? 'y' : ''}">tra ${d - today} g</span></div>`);
          }
        }
        return `
          <div class="card">
            <div class="row between" style="margin-bottom:8px">
              <button class="btn sm sec" data-a="month:-1" ${monthOff === 0 ? 'disabled' : ''}>◀</button>
              <h3 style="margin:0">${MONTH_NAMES[monthIndex(start)]} · anno ${yearOf(start)}</h3>
              <button class="btn sm sec" data-a="month:1" ${monthOff === 2 ? 'disabled' : ''}>▶</button>
            </div>
            <div class="cal-grid">${cells.join('')}</div>
            <div class="legend" style="margin-top:8px"><span>🟨 Oggi</span><span>☀️ Meteo previsto (più chiaro = meno sicuro)</span><span>🎉 Evento sicuro</span></div>
          </div>
          <h3 class="sec-title">🔎 Giorno scelto</h3>${this.dayCard(sel)}
          <div class="card"><h3>🗓️ Prossimi eventi sicuri</h3>${upcoming.join('') || '<div class="muted small">Nessuno nei prossimi due mesi.</div>'}
            <p class="muted small" style="margin-bottom:0">Ogni sabato c'è il 🛒 mercato e ogni domenica 🌳 la gente va al parco. Il meteo si può prevedere al massimo ${FORECAST_DAYS} giorni prima.</p></div>`;
      },
    });
  }

  // ---------------- mappa ----------------

  openMap() {
    const game = this.game;
    const dirName = (dx: number, dz: number) => {
      const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
      return ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'][Math.round(((a + 360) % 360) / 45) % 8];
    };
    this.open({
      title: '🗺️ Mappa della città',
      actions: {},
      wide: true,
      live: true,
      color: 'var(--blue)',
      render: () => {
        const p = game.player.root.position;
        const markers = game.mapMarkers();
        const jobs = markers.filter((m) => m.kind === 'job' || m.kind === 'target').sort((a, b) => a.dist - b.dist);
        const list = jobs.length
          ? jobs.map((m) => `<div class="card row" style="padding:8px 12px;margin-bottom:6px"><div class="icon-bubble" style="background:${m.color}">${m.icon}</div>
              <div style="flex:1"><b>${m.label}</b><div class="muted small">${dirName(m.x - p.x, m.z - p.z)} ${Math.round(m.dist)} m da te</div></div></div>`).join('')
          : '<p class="muted small">Nessun lavoretto al momento: ne arriveranno altri a breve.</p>';
        const others = markers.filter((m) => m.kind === 'lot' || m.kind === 'biz' || m.kind === 'dealer' || m.kind === 'agency')
          .sort((a, b) => a.dist - b.dist)
          .map((m) => `<div class="card row" style="padding:8px 12px;margin-bottom:6px"><div class="icon-bubble" style="background:${m.color}">${m.icon}</div>
            <div style="flex:1"><b>${m.label}</b><div class="muted small">${dirName(m.x - p.x, m.z - p.z)} ${Math.round(m.dist)} m</div></div></div>`).join('');
        return `<div class="bigmap-layout"><div class="bigmap-wrap"><canvas class="bigmap"></canvas></div>
          <div class="bigmap-side">
            <div class="legend">
              <span>🔵 Tu</span><span>🟡 Lavoretti</span><span>🎯 Obiettivo</span><span>🏷️ In vendita</span>
              <span>🚚🥖 Le tue attività</span><span>📋 Bacheca</span><span>🏠 Casa</span><span>🛵 Concessionaria</span><span>🏢 Agenzia affari</span>
              <span><i style="background:#ffd66b"></i>Case</span><span><i style="background:#b3bde0"></i>Negozi</span>
              <span><i style="background:#ff9f6e"></i>Ristoranti</span><span><i style="background:#5cc46a"></i>Parchi</span>
            </div>
            <h3 class="sec-title">🔨 Lavori vicini</h3>${list}
            <h3 class="sec-title">🏪 Attività, lotti e negozi (dal più vicino)</h3>${others}
          </div></div>`;
      },
      after: (body) => {
        const cv = body.querySelector<HTMLCanvasElement>('.bigmap')!;
        const landscape = window.innerWidth > window.innerHeight;
        const avail = landscape ? Math.min(window.innerHeight - 110, window.innerWidth * 0.5) : Math.min(body.clientWidth - 40, window.innerHeight * 0.55);
        const size = Math.max(220, Math.floor(avail));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = cv.height = size * dpr;
        cv.style.width = cv.style.height = size + 'px';
        const g = cv.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const span = Math.max(CITY_MAP.length, CITY_MAP[0].length) * TILE + 4;
        drawMap(g, size, size, game, { cx: 0, cz: 0, span, full: true });
      },
    });
  }

  // ---------------- profilo ----------------

  openProfile() {
    const s = this.s;
    this.open({
      title: '👤 Profilo',
      live: true,
      color: 'var(--blue)',
      render: () => {
        const skills = SKILL_IDS.map((k) => {
          const lvl = skillLevel(s, k);
          const a = LEVEL.xpForLevel(lvl);
          const b = LEVEL.xpForLevel(lvl + 1);
          const f = s.fame[k];
          const bonus = Math.round((f / (f + 150)) * 100);
          return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble">${SKILLS[k].icon}</div><h3 style="margin:0">${SKILLS[k].name}</h3></div><span class="tag y">Liv. ${lvl}</span></div>
            <div class="bar purple"><i style="width:${((s.xp[k] - a) / (b - a)) * 100}%"></i></div>
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(s.xp[k] - a)}/${b - a} XP</span><span>Fama ${f.toFixed(1)} · +${bonus}% domanda</span></div></div>`;
        }).join('');
        return `<div class="card hero tint"><div class="emoji">🧑‍💼</div><div class="muted small">Il tuo rango</div><div class="big">${rank(s)}</div></div>
          <div class="grid2" style="margin-bottom:10px"><div class="stat s-green"><b class="money-t">${euro(s.totalEarned)}</b><span>💰 guadagnato in totale</span></div>
          <div class="stat s-orange"><b>${s.businesses.length}</b><span>🏢 attività</span></div></div>
          <p class="muted small">L'esperienza sale solo facendo il lavoro di persona. La fama sale anche quando lavorano i tuoi dipendenti, ma molto più piano. Più fama = più clienti e offerte di lavoro più ricche.</p>
          ${skills}`;
      },
      actions: {},
    });
  }

  // ---------------- casa ----------------

  openHome() {
    const s = this.s;
    this.open({
      title: '🏠 Casa tua',
      small: true,
      color: 'var(--green)',
      live: true,
      render: () => {
        const h = hourOf(s);
        const canSleep = h >= 19 || h < 6;
        return `<div class="hero"><div class="emoji">🏡</div></div>
          <p class="muted center">La casa è il tuo punto di teletrasporto: con il pulsante verde <b>🏠 Casa</b> ci torni all'istante da qualsiasi punto della città.</p>
          <button class="btn blue full" data-a="sleep" ${canSleep ? '' : 'disabled'}>😴 Dormi fino alle 7:00</button>
          <p class="center muted small">${canSleep ? 'Le attività sono chiuse di notte: dormire fa passare il tempo.' : 'Puoi dormire dalle 19:00 in poi.'}</p>`;
      },
      actions: {
        sleep: () => {
          this.game.sleep();
          this.close();
        },
      },
    });
  }

  // ---------------- impostazioni ----------------

  openSettings() {
    let confirm = false;
    this.open({
      title: '⚙️ Opzioni',
      small: true,
      color: 'var(--gray)',
      render: () => `
        <div class="card"><h3>Come si gioca</h3><p class="muted small" style="margin:0">
          Trascina il dito per muoverti (compare un joystick) oppure tocca un punto per andarci.
          Avvicinati alle persone con il <b>!</b> per un lavoretto e usa il pulsante giallo in basso a destra.
          Su PC: WASD o frecce, E o spazio per l'azione.</p></div>
        <div class="card"><h3>Tempo</h3><p class="muted small" style="margin:0">1 mese di gioco = 2 ore reali (una giornata dura 4 minuti). Con il gioco chiuso il tempo scorre ${TIME.OFFLINE_SLOWDOWN} volte più piano e le attività autonome guadagnano l'80% nelle prime 24 ore, il 50% nelle 48 ore dopo e poi il 20%.</p></div>
        <button class="btn danger full" data-a="reset">${confirm ? 'Sicuro? Tocca di nuovo per cancellare tutto' : 'Ricomincia da capo'}</button>
        <p class="muted small center">Grafica: Kenney.nl (CC0)</p>`,
      actions: {
        reset: () => {
          if (!confirm) {
            confirm = true;
            return;
          }
          this.game.resetting = true;
          wipeSave();
          location.reload();
        },
      },
    });
  }

  // ---------------- offline / benvenuto ----------------

  openOffline(r: OfflineReport) {
    const days = r.gameMinutes / 1440;
    this.open({
      title: '🌙 Bentornato!',
      small: true,
      color: 'var(--purple)',
      render: () => `
        <p class="muted">Sei stato via ${r.realHours < 1 ? Math.round(r.realHours * 60) + ' minuti' : r.realHours.toFixed(1).replace('.', ',') + ' ore'}.
        Nel gioco sono passati ${days < 1 ? Math.round(r.gameMinutes / 60) + ' ore' : days.toFixed(1).replace('.', ',') + ' giorni'}.</p>
        <div class="grid2">
          <div class="stat s-green"><b class="money-t">${euro(r.revenue)}</b><span>💰 incassi delle attività</span></div>
          <div class="stat ${r.net >= 0 ? 's-green' : 's-red'}"><b class="${r.net >= 0 ? 'good' : 'bad'}">${euro(r.net)}</b><span>🧾 saldo dopo i costi</span></div>
        </div>
        ${r.revenue === 0 ? '<p class="muted small">Solo le attività con un dipendente per reparto e un manager lavorano mentre sei via.</p>' : ''}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  openWelcome() {
    this.open({
      title: '👋 Benvenuto!',
      small: true,
      color: 'var(--orange)',
      render: () => `
        <div class="hero"><div class="emoji">💼</div><p style="margin:4px 0 12px">Hai <b class="money-t">${euro(this.s.money)}</b> in tasca e tanta voglia di fare!</p></div>
        <ul class="steps">
          <li><div class="icon-bubble">❗</div><span>Cerca le persone con il <b>!</b> giallo: offrono <b>lavoretti</b>. Le freccette ai bordi ti portano da loro.</span></li>
          <li><div class="icon-bubble">📋</div><span>Nella <b>bacheca</b> in piazza trovi le <b>missioni</b> del giorno.</span></li>
          <li><div class="icon-bubble">🚚</div><span>Con i risparmi compra un lotto <b>IN VENDITA</b> e apri il tuo <b>food truck</b>.</span></li>
          <li><div class="icon-bubble">👥</div><span>Assumi <b>dipendenti</b> e un <b>manager</b> per farlo lavorare da solo.</span></li>
          <li><div class="icon-bubble">🗺️</div><span>Tocca la <b>mappa</b> in alto per vedere tutta la città.</span></li>
        </ul>
        <p class="muted small center">Trascina il dito per muoverti oppure tocca dove vuoi andare. Il pulsante giallo fa le azioni.</p>
        <button class="btn full" data-a="ok">Iniziamo! 🚀</button>`,
      actions: {
        ok: () => {
          this.s.tutorialDone = true;
          this.close();
        },
      },
    });
  }
}
