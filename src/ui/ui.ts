import { BUSINESS, LEVEL, TIME } from '../config/balance';
import { BUSINESS_TYPES, ROLES, UPGRADES, UPGRADE_IDS, type BusinessType } from '../config/business';
import { EVENT_BY_ID, MONTH_NAMES } from '../config/events';
import { JOBS } from '../config/jobs';
import { LOTS, ZONES } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { SKILLS, SKILL_IDS } from '../config/skills';
import type { ActionPrompt, Game } from '../game';
import { bus, toast } from '../sim/bus';
import type { OfflineReport } from '../sim/calendar';
import {
  autoCapacity, buyLot, buyStock, buyUpgrade, estimateMonthlyProfit, fameMultiplier, fire, hasManager,
  hire, isAutonomous, isOpenHour, lotDef, lotZone, marketDemand, menuSlots, monthlyCosts, productDemand,
  stockCap, totalDemand, upg,
} from '../sim/economy';
import { addFame, addMoney, rank, skillLevel } from '../sim/progress';
import {
  day, dayOfMonth, euro, hourOf, monthIndex, wipeSave, yearOf,
  type Business, type Employee, type JobOffer,
} from '../sim/state';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

type Actions = Record<string, (arg: string) => void>;

interface Panel {
  render: () => string;
  actions: Actions;
  live?: boolean;
  small?: boolean;
  title: string;
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
        <div class="pill" id="h-date"></div>
        <div class="pill event" id="h-event" style="display:none"></div>
        <div class="pill" id="h-info" style="display:none"></div>
      </div>
      <div class="hud-btns">
        <button class="hbtn" data-h="biz" title="Attività">🏢</button>
        <button class="hbtn" data-h="missions" title="Missioni">📋<span class="dot" id="h-dot" style="display:none"></span></button>
        <button class="hbtn" data-h="profile" title="Profilo">👤</button>
        <button class="hbtn" data-h="home" title="Vai a casa">🏠</button>
        <button class="hbtn" data-h="settings" title="Impostazioni">⚙️</button>
      </div>`;
    this.root.appendChild(top);
    this.moneyEl = top.querySelector('#h-money')!;
    this.dateEl = top.querySelector('#h-date')!;
    this.eventEl = top.querySelector('#h-event')!;
    this.infoEl = top.querySelector('#h-info')!;
    this.missionDot = top.querySelector('#h-dot')!;
    top.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.h;
        if (k === 'biz') this.openBusinessList();
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
    const d = formatDate(s.minutes);
    if (this.dateEl.textContent !== d) this.dateEl.textContent = d;
    const today = day(s);
    const ev = s.events.filter((e) => today >= e.startDay && today <= e.endDay).map((e) => EVENT_BY_ID[e.defId]);
    const evText = ev.map((e) => `${e.icon} ${e.name}`).join(' · ');
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
    modal.innerHTML = `<div class="sheet ${p.small ? 'small' : ''}"><div class="sheet-head"><h2></h2><button class="x">✕</button></div><div class="tabs-slot"></div><div class="sheet-body"></div></div>`;
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
      render: () => `
        <div class="card"><p style="margin:0">${def.intro}</p></div>
        <div class="grid2">
          <div class="stat"><b>${euro(offer.pay)}</b><span>paga base (2★)</span></div>
          <div class="stat"><b>Liv. ${offer.level}</b><span>difficoltà</span></div>
          <div class="stat"><b>${euro(offer.pay * 1.35)}</b><span>con 3★</span></div>
          <div class="stat"><b>${SKILLS[def.skill].icon} ${SKILLS[def.skill].name}</b><span>esperienza</span></div>
        </div>
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
      title: stars ? 'Lavoro completato!' : 'Lavoro fallito',
      small: true,
      render: () => `
        <div class="stars">${st}</div>
        <p class="center muted">${def.icon} ${def.name}</p>
        ${stars ? `<div class="grid2">
          <div class="stat"><b class="money-t">+${euro(pay)}</b><span>guadagno</span></div>
          <div class="stat"><b>+${xp} XP</b><span>${SKILLS[def.skill].name}</span></div>
          <div class="stat"><b>+${fame.toFixed(1)}</b><span>fama ${SKILLS[def.skill].name}</span></div>
          <div class="stat"><b>Liv. ${skillLevel(this.s, def.skill)}</b><span>${SKILLS[def.skill].name}</span></div>
        </div>` : `<p class="center">Tempo scaduto o lavoro abbandonato.<br><span class="bad">-1 fama ${SKILLS[def.skill].name}</span></p>`}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  // ---------------- lotti ----------------

  openLot(lotId: string) {
    const lot = lotDef(lotId);
    const zone = lotZone[lotId];
    const type: BusinessType = 'foodtruck';
    this.open({
      title: `🏷️ ${lot.name}`,
      small: true,
      render: () => {
        const s = this.s;
        const prods = BUSINESS_TYPES[type].products
          .map((p) => {
            const d = marketDemand(s, p, zone) * fameMultiplier(s, type);
            return `<div class="row between"><span>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span><span>${demandBars(d)} <span class="muted small">${d.toFixed(1)}/h</span></span></div>`;
          })
          .join('');
        return `
          <div class="grid2">
            <div class="stat"><b>${ZONES[zone].name}</b><span>zona (domanda ×${ZONES[zone].demand})</span></div>
            <div class="stat"><b>${euro(lot.rent)}/mese</b><span>posteggio</span></div>
          </div>
          <div class="card" style="margin-top:10px"><h3>🚚 Food truck</h3>
            <p class="muted small" style="margin-top:0">Clienti all'ora previsti oggi in questa zona:</p>${prods}
            <p class="muted small">Costi fissi: posteggio ${euro(lot.rent)} + bollette ${euro(BUSINESS.UTILITIES_MONTH)} al mese, più gli stipendi.</p>
          </div>
          <button class="btn full" data-a="buy" ${s.money < lot.price ? 'disabled' : ''}>Compra per ${euro(lot.price)}</button>
          ${s.money < lot.price ? `<p class="center muted small">Ti mancano ${euro(lot.price - s.money)}</p>` : ''}`;
      },
      actions: {
        buy: () => {
          const b = buyLot(this.s, lotId, type);
          if (!b) return;
          this.game.setupLot(lotId);
          this.game.save();
          this.close();
          this.openBusiness(b.id, 'prodotti');
        },
      },
    });
  }

  // ---------------- attività ----------------

  openBusinessList() {
    const s = this.s;
    if (s.businesses.length === 1) return this.openBusiness(s.businesses[0].id);
    this.open({
      title: '🏢 Le tue attività',
      live: true,
      render: () => {
        if (!s.businesses.length) {
          const cheapest = Math.min(...LOTS.map((l) => l.price));
          return `<div class="card center"><p>Non hai ancora nessuna attività.</p>
            <p class="muted">Fai lavoretti per mettere da parte i soldi, poi compra un lotto con il cartello rosso <b>IN VENDITA</b>. Il più economico costa ${euro(cheapest)}.</p></div>`;
        }
        return s.businesses
          .map((b) => {
            const lot = lotDef(b.lotId);
            return `<div class="card"><div class="row between"><h3>${BUSINESS_TYPES[b.type].icon} ${lot.name}</h3>${this.autoTag(b)}</div>
              <div class="row between muted small"><span>Oggi: ${euro(b.today.revenue)} · ${b.today.served} clienti</span>
              <button class="btn sm" data-a="open:${b.id}">Gestisci</button></div></div>`;
          })
          .join('');
      },
      actions: {
        open: (id) => {
          this.close();
          this.openBusiness(id);
        },
      },
    });
  }

  private autoTag(b: Business) {
    return isAutonomous(b) ? '<span class="tag g">Autonoma</span>' : '<span class="tag y">Serve il titolare</span>';
  }

  openBusiness(bizId: string, tab = 'panoramica') {
    let cur = tab;
    const s = this.s;
    const b = () => s.businesses.find((x) => x.id === bizId)!;
    const tabs = [
      ['panoramica', '📊 Panoramica'], ['prodotti', '🍔 Prodotti'], ['magazzino', '🧊 Magazzino'],
      ['personale', '👥 Personale'], ['migliorie', '⬆️ Migliorie'],
    ];
    this.open({
      title: `${BUSINESS_TYPES[b().type].icon} ${lotDef(b().lotId).name}`,
      live: true,
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
            this.game.setupLot(biz.lotId);
          } else {
            toast('Menù pieno: togli un prodotto o compra "Menù più grande"', 'bad');
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
      },
      onClose: () => this.game.save(),
    });
  }

  private bizTab(b: Business, tab: string): string {
    const s = this.s;
    const type = BUSINESS_TYPES[b.type];
    if (tab === 'panoramica') {
      const missing = type.roles.filter((r) => !b.staff.some((e) => e.role === r)).map((r) => ROLES[r].name.toLowerCase());
      if (!hasManager(b)) missing.push('manager');
      const c = monthlyCosts(s, b);
      const fullSal = b.staff.reduce((a, e) => a + e.salary, 0);
      const dem = totalDemand(s, b);
      const cap = autoCapacity(b);
      return `
        <div class="card"><div class="row between"><h3>Stato</h3>${this.autoTag(b)}</div>
          ${missing.length ? `<p class="muted small" style="margin:0">Per farla lavorare da sola serve: <b>${missing.join(', ')}</b>. Fino ad allora vende solo quando ci sei tu dentro.</p>`
            : '<p class="muted small" style="margin:0">Lavora da sola anche quando sei altrove o offline.</p>'}
        </div>
        <div class="grid2">
          <div class="stat"><b>${dem.toFixed(1)}/h</b><span>clienti richiesti ora</span></div>
          <div class="stat"><b>${isAutonomous(b) ? cap.toFixed(1) + '/h' : '—'}</b><span>capacità dipendenti</span></div>
          <div class="stat"><b class="money-t">${euro(b.today.revenue)}</b><span>incasso oggi · ${b.today.served} clienti</span></div>
          <div class="stat"><b>${b.today.lost}</b><span>clienti persi oggi</span></div>
          <div class="stat"><b>${euro(b.yesterday.revenue)}</b><span>incasso ieri</span></div>
          <div class="stat"><b>${euro(b.month.revenue)}</b><span>incasso del mese</span></div>
        </div>
        <div class="card" style="margin-top:10px"><h3>Costi mensili</h3>
          <div class="row between small"><span>Posteggio</span><span>${euro(c.rent)}</span></div>
          <div class="row between small"><span>Bollette</span><span>${euro(c.utilities)}</span></div>
          <div class="row between small"><span>Stipendi (${b.staff.length})</span><span>${euro(fullSal)}</span></div>
          <hr><div class="row between"><b>Utile stimato al mese</b><b class="${estimateMonthlyProfit(s, b) >= 0 ? 'good' : 'bad'}">${isAutonomous(b) ? euro(estimateMonthlyProfit(s, b)) : '—'}</b></div>
          <p class="muted small" style="margin-bottom:0">Aperto dalle ${BUSINESS.OPEN_HOUR}:00 alle ${BUSINESS.CLOSE_HOUR}:00. I costi si pagano il 1° del mese.</p>
        </div>`;
    }
    if (tab === 'prodotti') {
      const slots = menuSlots(b);
      return `<p class="muted small">Scegli cosa vendere guardando la domanda di oggi (${b.products.length}/${slots} posti nel menù). La domanda cambia ogni giorno, con le stagioni e con gli eventi.</p>` +
        type.products
          .map((p) => {
            const pr = PRODUCTS[p];
            const on = b.products.includes(p);
            const d = productDemand(s, b, p);
            const season = pr.season[monthIndex(day(s))];
            const next = pr.season[(monthIndex(day(s)) + 1) % 12];
            const trend = next > season * 1.05 ? '📈' : next < season * 0.95 ? '📉' : '➡️';
            return `<div class="card"><div class="row between"><h3>${pr.icon} ${pr.name}</h3>
              <label class="toggle"><input type="checkbox" ${on ? 'checked' : ''} data-c="toggleProduct:${p}"> in vendita</label></div>
              <div class="row between small"><span>Domanda oggi ${demandBars(d)} ${d.toFixed(1)}/h</span><span class="muted">stagione ${trend}</span></div>
              <div class="row between small muted"><span>Prezzo ${euro(pr.price)} · costo ${pr.cost.toFixed(2).replace('.', ',')}€</span><span>margine <b class="good">${(pr.price - pr.cost).toFixed(2).replace('.', ',')}€</b></span></div></div>`;
          })
          .join('');
    }
    if (tab === 'magazzino') {
      const cap = stockCap(b);
      return `<div class="card"><label class="toggle"><input type="checkbox" ${b.autoRestock ? 'checked' : ''} data-c="autoRestock"> Riordino automatico</label>
        <p class="muted small" style="margin-bottom:0">${hasManager(b) ? 'Il manager riordina da solo quando le scorte scendono.' : 'Il riordino automatico funziona solo con un manager.'}</p></div>` +
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
        ? b.staff.map((e) => this.empCard(e, `<button class="btn sm danger" data-a="fire:${e.id}">Licenzia</button>`)).join('')
        : '<p class="muted small">Nessun dipendente.</p>';
      const cands = s.candidates
        .map((e) => this.empCard(e, `<button class="btn sm good" data-a="hire:${e.id}" ${e.role === 'manager' && hasManager(b) ? 'disabled' : ''}>Assumi</button>`))
        .join('');
      return `<p class="muted small">Serve almeno un dipendente per reparto (${type.roles.map((r) => ROLES[r].name.toLowerCase()).join(', ')}) più un manager perché l'attività lavori senza di te. Più dipendenti nello stesso reparto = più clienti serviti.</p>
        <h3>Il tuo staff</h3>${staff}<h3>Candidati di oggi</h3><p class="muted small" style="margin-top:-4px">Nuovi candidati ogni giorno.</p>${cands}`;
    }
    // migliorie
    return UPGRADE_IDS.map((id) => {
      const u = UPGRADES[id];
      const lvl = upg(b, id);
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      return `<div class="card"><div class="row between"><h3>${u.icon} ${u.name}</h3><span class="tag">Liv. ${lvl}/${u.max}</span></div>
        <p class="muted small" style="margin:0 0 8px">${u.desc}</p>
        <button class="btn sm full" data-a="upgrade:${id}" ${maxed || s.money < cost ? 'disabled' : ''}>${maxed ? 'Massimo' : 'Migliora · ' + euro(cost)}</button></div>`;
    }).join('');
  }

  private empCard(e: Employee, btn: string) {
    const r = ROLES[e.role];
    const st = (n: string, v: number) => `<div class="small">${n}<div class="bar"><i style="width:${v * 10}%"></i></div></div>`;
    return `<div class="card"><div class="row between"><div><b>${r.icon} ${esc(e.name)}</b> <span class="tag">Liv. ${e.level}</span><div class="muted small">${r.name} · ${euro(e.salary)}/mese</div></div>${btn}</div>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">${st('Velocità', e.speed)}${st('Abilità', e.skill)}${st('Cortesia', e.kindness)}</div></div>`;
  }

  // ---------------- missioni e calendario ----------------

  openMissions() {
    const s = this.s;
    this.open({
      title: '📋 Bacheca',
      live: true,
      render: () => {
        const ms = s.missions
          .map((m) => {
            const done = m.progress >= m.target;
            return `<div class="card"><div class="row between"><b style="flex:1">${m.text}</b>${
              m.claimed ? '<span class="tag g">Riscossa</span>' : done ? `<button class="btn sm good" data-a="claim:${m.id}">Riscuoti</button>` : ''
            }</div>
            <div class="bar green"><i style="width:${(m.progress / m.target) * 100}%"></i></div>
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(m.progress)}/${m.target}</span><span>Premio ${euro(m.reward)} · +${m.fame.toFixed(0)} fama ${SKILLS[m.fameSkill].icon}</span></div></div>`;
          })
          .join('');
        const today = day(s);
        const evs = [...s.events].sort((a, b) => a.startDay - b.startDay)
          .map((e) => {
            const def = EVENT_BY_ID[e.defId];
            const active = today >= e.startDay;
            const when = active ? '<span class="tag y">In corso</span>' : `<span class="tag">tra ${e.startDay - today} g</span>`;
            return `<div class="card"><div class="row between"><b>${def.icon} ${def.name}</b>${when}</div><div class="muted small">${def.desc} (${e.endDay - e.startDay + 1} giorni)</div></div>`;
          })
          .join('') || '<p class="muted small">Nessun evento in programma.</p>';
        const mi = monthIndex(today);
        const prods = (Object.keys(PRODUCTS) as ProductId[])
          .map((p) => {
            const d = marketDemand(s, p, 'periferia');
            return `<div class="row between small"><span>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span>${demandBars(d, 2.4)}</div>`;
          })
          .join('');
        return `<h3>Missioni di oggi</h3><p class="muted small" style="margin-top:-4px">Cambiano ogni giorno. Le ricompense crescono con la tua fama.</p>${ms}
          <h3>📅 Calendario — ${MONTH_NAMES[mi]}, anno ${yearOf(today)}</h3>${evs}
          <div class="card"><h3>Domanda del giorno</h3>${prods}</div>`;
      },
      actions: {
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

  // ---------------- profilo ----------------

  openProfile() {
    const s = this.s;
    this.open({
      title: '👤 Profilo',
      live: true,
      render: () => {
        const skills = SKILL_IDS.map((k) => {
          const lvl = skillLevel(s, k);
          const a = LEVEL.xpForLevel(lvl);
          const b = LEVEL.xpForLevel(lvl + 1);
          const f = s.fame[k];
          const bonus = Math.round((f / (f + 150)) * 100);
          return `<div class="card"><div class="row between"><h3>${SKILLS[k].icon} ${SKILLS[k].name}</h3><span class="tag y">Liv. ${lvl}</span></div>
            <div class="bar"><i style="width:${((s.xp[k] - a) / (b - a)) * 100}%"></i></div>
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(s.xp[k] - a)}/${b - a} XP</span><span>Fama ${f.toFixed(1)} · +${bonus}% domanda</span></div></div>`;
        }).join('');
        return `<div class="card center"><div class="muted small">Rango</div><div class="big">${rank(s)}</div>
          <div class="muted small">Guadagnato in totale: <b class="money-t">${euro(s.totalEarned)}</b> · Attività: ${s.businesses.length}</div></div>
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
      live: true,
      render: () => {
        const h = hourOf(s);
        const canSleep = h >= 19 || h < 6;
        return `<p class="muted">La casa è il tuo punto di teletrasporto: con il pulsante 🏠 in alto ci torni all'istante da qualsiasi punto della città.</p>
          <button class="btn full" data-a="sleep" ${canSleep ? '' : 'disabled'}>😴 Dormi fino alle 7:00</button>
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
      title: '⚙️ Impostazioni',
      small: true,
      render: () => `
        <div class="card"><h3>Come si gioca</h3><p class="muted small" style="margin:0">
          Trascina il dito per muoverti (compare un joystick) oppure tocca un punto per andarci.
          Avvicinati alle persone con il <b>!</b> per un lavoretto e usa il pulsante giallo in basso a destra.
          Su PC: WASD o frecce, E o spazio per l'azione.</p></div>
        <div class="card"><h3>Tempo</h3><p class="muted small" style="margin:0">1 mese di gioco = 1 ora reale. Con il gioco chiuso il tempo scorre ${TIME.OFFLINE_SLOWDOWN} volte più piano e le attività autonome guadagnano l'80% nelle prime 24 ore, il 50% nelle 48 ore dopo e poi il 20%.</p></div>
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
      render: () => `
        <p class="muted">Sei stato via ${r.realHours < 1 ? Math.round(r.realHours * 60) + ' minuti' : r.realHours.toFixed(1).replace('.', ',') + ' ore'}.
        Nel gioco sono passati ${days < 1 ? Math.round(r.gameMinutes / 60) + ' ore' : days.toFixed(1).replace('.', ',') + ' giorni'}.</p>
        <div class="grid2">
          <div class="stat"><b class="money-t">${euro(r.revenue)}</b><span>incassi delle attività</span></div>
          <div class="stat"><b class="${r.net >= 0 ? 'good' : 'bad'}">${euro(r.net)}</b><span>saldo netto (dopo i costi)</span></div>
        </div>
        ${r.revenue === 0 ? '<p class="muted small">Solo le attività con un dipendente per reparto e un manager lavorano mentre sei via.</p>' : ''}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  openWelcome() {
    this.open({
      title: '👋 Benvenuto in Hustle Idle',
      small: true,
      render: () => `
        <p>Hai <b class="money-t">${euro(this.s.money)}</b> in tasca e tanta voglia di fare.</p>
        <p class="muted">1. Cerca le persone con il <b>!</b> giallo: offrono lavoretti. Più sei veloce, più stelle e soldi ottieni.<br>
        2. Controlla la <b>📋 bacheca</b> in piazza per le missioni del giorno.<br>
        3. Quando hai abbastanza soldi compra un lotto <b>IN VENDITA</b> e apri il tuo food truck.<br>
        4. Assumi dipendenti e un manager per farlo andare da solo, poi punta più in alto!</p>
        <p class="muted small">Muoviti trascinando il dito oppure tocca dove vuoi andare. Il pulsante giallo in basso a destra serve per le azioni.</p>
        <button class="btn full" data-a="ok">Iniziamo!</button>`,
      actions: {
        ok: () => {
          this.s.tutorialDone = true;
          this.close();
        },
      },
    });
  }
}
