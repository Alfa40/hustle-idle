import * as THREE from 'three';
import { BUSINESS, LEVEL, TIME } from '../config/balance';
import { BUSINESS_TYPE_IDS, BUSINESS_TYPES, bizType, EXTRA_ROLES, roleName, ROLES, UPGRADES, UPGRADE_IDS, type BusinessType, type Role, type UpgradeId } from '../config/business';
import { VEHICLE_IDS, VEHICLES, WALK_SPEED, type VehicleId } from '../config/vehicles';
import { MONTH_NAMES, WEATHER, WEEKDAYS } from '../config/events';
import { extraRoom, hasInterior, LAYOUTS, productLevel } from '../config/recipes';
import { activeToday, effectText, FORECAST_DAYS, forecast, sureEvents, weatherOf, weekday, type DayHappening } from '../sim/effects';
import { jobInfo, JOBS, JOB_TYPES } from '../config/jobs';
import { LOTS, ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { SKILLS, SKILL_IDS } from '../config/skills';
import type { ActionPrompt, Game, MapMarker } from '../game';
import { Minimap } from './map';
import { settingsAction, settingsHtml } from './settingsview';
import { actSide, moveSide, onSettings, settings, type HudKey } from '../settings';
import { layout } from './layout';
import { PulseGlow } from '../world/pulse';
import { MapScreen } from './mapscreen';
import { ACCESSORIES, accById, ACC_SLOT_NAME, STYLES, type AccSlot } from '../world/style';
import { EdgePointers } from './pointers';
import { bus, toast } from '../sim/bus';
import { bizReport, ensurePartials } from '../sim/report';
import { canUpgrade, chainGroups, chainOf, chainTypes, deleteGroup, groupFill, groupProduct, groupUpgrade, groupUpgradeCost, hasMenu, saveGroup } from '../sim/chains';
import { CRAFT_JOBS, SPECIALS_PER_DAY, specialOrders, specialTime } from '../sim/specials';
import { GLAZES, VASES, vaseSvg } from '../world/ceramics';
import { canRent, RENT_MAX_HOURS, weeklyDaysLeft, type OfflineReport } from '../sim/calendar';
import {
  bizAtLot, capacityAt, shiftOf, buyLot, buyStock, buyUpgrade, estimateLot, estimateMonthlyProfit, canMove, canTrain, empStat, moveEmployee, moveTargets, fmtRate, MAX_LEVEL, MAX_STARS, PARTIAL_DAYS, partialIn, REPORT_DAYS, startTraining, trainingCost, trainingDays, xpForEmpLevel, resetBizStats, weekDays, fameMultiplier, fire, hasManager,
  hire, isAutonomous, isOpenHour, lotDef, lotPrice, lotZone, marketDemand, MAX_ORDERS, menuSlots, monthlyCosts, productDemand,
  refreshCandidates, stockCap, totalDemand, typesForLot, upg, vehiclesMonthly,
} from '../sim/economy';
import { addFame, addMoney, lineLevel, rank, sectorXp, skillLevel, totalFame, totalLevel } from '../sim/progress';
import { careerLine, EVOLVE_EVERY, linesOf } from '../config/careers';
import { addFriend, answerFriendRequest, fetchBoard, fetchFriends, friendCode, MAX_NICK, moneyPerSecond, nickname as lbNickname, removeFriend, sendFriendRequest, setNickname as setLbNickname, submit as submitScore, type BoardKind, type FriendEntry, type LbData, type LbEntry } from '../sim/leaderboard';
import { drawLogo, photoPicker, shrinkImage, LOGO_COLORS, LOGO_SHAPES, LOGO_SYMBOLS, logoImg, logoUrl, newPhotoEdit, photoData, preloadLogo, randomLogo, renderPhoto, SHAPE_ICON, type Logo, type PhotoEdit } from '../logo';
import {
  currentSlot, day, dayOfMonth, euro, hourOf, monthIndex, playStats, wipeSave, yearOf,
  type Business, type Employee, type JobOffer, type Mission, type ServiceOrder, type SpecialOrder,
} from '../sim/state';


type Actions = Record<string, (arg: string) => void>;

/** Migliorie che cambiano la cucina e si possono provare prima di comprarle. */
const PREVIEW_UPGRADES: UpgradeId[] = ['ampliamento', 'fuochi', 'banco', 'ripiano', 'attrezzatura'];

interface Panel {
  render: () => string;
  actions: Actions;
  live?: boolean;
  small?: boolean;
  wide?: boolean;
  /** colore dell'intestazione */
  color?: string;
  title: string;
  /** non si chiude con ✕ o toccando fuori: solo con i suoi pulsanti */
  locked?: boolean;
  /** dopo ogni render (es. per disegnare un canvas) */
  after?: (body: HTMLElement) => void;
  onClose?: () => void;
  /** finestra da cui si è arrivati: il tasto "‹ Indietro" ci riporta lì */
  back?: Panel;
  /** mostra i tuoi soldi nell'intestazione (negozio, migliorie, acquisti); con una funzione, solo quando serve */
  money?: boolean | (() => boolean);
}

/**
 * Salva lo scorrimento (orizzontale e verticale) di ogni elemento che scorre dentro `root` e restituisce
 * la funzione che lo rimette dopo aver ridisegnato il contenuto. Gli elementi si ritrovano per classi e
 * posizione (la n-esima riga di schede resta la n-esima).
 */
function keepScroll(root: HTMLElement) {
  const saved: { sel: string; i: number; left: number; top: number }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (!el.scrollLeft && !el.scrollTop) continue;
    const sel = el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + CSS.escape(c)).join('');
    const i = [...root.querySelectorAll(sel)].indexOf(el);
    saved.push({ sel, i, left: el.scrollLeft, top: el.scrollTop });
  }
  return () => {
    for (const k of saved) {
      const el = root.querySelectorAll<HTMLElement>(k.sel)[k.i];
      if (!el) continue;
      el.scrollLeft = k.left;
      el.scrollTop = k.top;
      // controllo (solo in sviluppo): se lo scorrimento non torna dov'era è un bug da sistemare
      // (le prove automatiche lo vedono come errore in console)
      if (import.meta.env.DEV && (Math.abs(el.scrollLeft - k.left) > 2 || Math.abs(el.scrollTop - k.top) > 2) &&
        el.scrollWidth - el.clientWidth >= k.left && el.scrollHeight - el.clientHeight >= k.top) {
        console.error(`[scroll] posizione persa dopo il ridisegno: ${k.sel} (${k.left},${k.top} → ${el.scrollLeft},${el.scrollTop})`);
      }
    }
  };
}

/** Soldi al secondo con i centesimi (es. "€1,70/s"). */
const perSec = (v: number) => `€${v.toFixed(2).replace('.', ',')}/s`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function demandBars(v: number, max = 4) {
  const n = Math.max(0, Math.min(5, Math.round((v / max) * 5)));
  return `<span class="demand">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** "Mar 1 Maggio" */
const dayName = (d: number) => `${WEEKDAYS[d % 7]} ${dayOfMonth(d)} ${MONTH_NAMES[monthIndex(d)]}`;

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
  /** zona da toccare (invisibile) sull'oggetto */
  private actionEl!: HTMLButtonElement;
  /** zona da toccare sul cerchio a terra dove stare */
  private standEl!: HTMLButtonElement;
  /** cerchio semitrasparente sopra la testa: si riempie tenendo premuto (o in un lampo con un tocco) */
  private ringEl!: HTMLButtonElement;
  /** scritta dell'azione in alto, sotto il riquadro */
  private labelEl!: HTMLDivElement;
  private actionPrompt: ActionPrompt | null = null;
  private flashT = 0;
  private jobEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private modal: HTMLElement | null = null;
  private panel: Panel | null = null;
  private liveTimer = 0;
  private lastAction = '';
  private queue: Panel[] = [];
  /** finestra in cui si è appena toccato un pulsante: se apre un'altra finestra, ci si potrà tornare */
  private navFrom: Panel | null = null;
  /** finestra appena lasciata durante una navigazione (diventa il "back" della prossima) */
  private backCandidate: Panel | null = null;
  private minimap!: Minimap;
  private mapScreen!: MapScreen;
  private rideEl!: HTMLButtonElement;
  private camEl!: HTMLDivElement;
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
        <button class="pill date" style="border:none"><span id="h-date"></span><small class="pill-event" id="h-event" style="display:none"></small></button>
        <div class="pill info" id="h-info" style="display:none"></div>
      </div>`;
    this.root.appendChild(top);
    const right = document.createElement('div');
    right.className = 'hud-right';
    right.innerHTML = `
      <div class="hud-btns">
        <button class="hbtn c-orange" data-h="biz"><span class="i">🏢</span><span class="l">Attività</span></button>
        <button class="hbtn c-purple" data-h="missions"><span class="i">📋</span><span class="l">Missioni</span><span class="dot" id="h-dot" style="display:none">!</span></button>
        <button class="hbtn" data-h="profile"><span class="i">👤</span><span class="l">Profilo</span><span class="dot" id="h-dot-p" style="display:none">!</span></button>
        <button class="hbtn c-green" data-h="home"><span class="i">🏠</span><span class="l">Casa</span></button>
        <button class="hbtn c-pink" data-h="shop"><span class="i">🛍️</span><span class="l">Negozio</span></button>
        <button class="hbtn c-gray" data-h="settings"><span class="i">⚙️</span><span class="l">Opzioni</span></button>
        <div class="hud-menu"><button class="hbtn c-dark hud-menu-btn" aria-label="Menu"><span class="i">☰</span><span class="l">Menu</span><span class="dot" id="h-dot2" style="display:none">!</span></button><div class="hud-drop"></div></div>
      </div>`;
    this.root.appendChild(right);
    this.minimap = new Minimap(this.game, () => this.openMap());
    this.mapScreen = new MapScreen(this.game, { openDetails: (m) => this.openFromMap(m) });
    right.prepend(this.minimap.el);
    this.pointers = new EdgePointers(this.game, document.body);
    this.moneyEl = top.querySelector('#h-money')!;
    this.dateEl = top.querySelector('#h-date')!;
    this.eventEl = top.querySelector('#h-event')!;
    this.infoEl = top.querySelector('#h-info')!;
    // feste ed eventi: una riga piccola dentro la stessa etichetta della data (toccandola si apre il calendario)
    (this.dateEl.parentElement as HTMLElement).addEventListener('click', () => this.openCalendar());
    this.missionDot = right.querySelector('#h-dot')!;
    right.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.h;
        if (k === 'biz') this.openAgency('mie', false);
        if (k === 'missions') this.openMissions();
        if (k === 'profile') this.openProfile();
        if (k === 'home') this.game.goHome();
        if (k === 'shop') this.openShop();
        if (k === 'settings') this.openSettings();
        this.hudMenuEl.classList.remove('open');
      }),
    );
    this.hudMenuEl = right.querySelector('.hud-menu')!;
    this.hudMenuEl.querySelector('.hud-menu-btn')!.addEventListener('click', () => this.hudMenuEl.classList.toggle('open'));

    const job = document.createElement('div');
    job.className = 'jobbar';
    job.innerHTML = `<div class="row"><span id="j-title"></span><span id="j-time"></span><button class="quit" id="j-quit">Rinuncia</button></div>
      <div class="row muted small" id="j-status"></div><div class="track"><div class="fill" id="j-fill"></div></div>`;
    this.root.appendChild(job);
    job.querySelector('#j-quit')!.addEventListener('click', () => this.game.cancelJob());
    this.jobEl = job;

    // azione: si tocca l'oggetto (zona invisibile un po' più grande dell'oggetto) oppure il cerchio
    // sopra la testa; la scritta sta in alto. Fuori da #ui: sopra i riquadri, sotto le finestre.
    const act = document.createElement('button');
    act.className = 'action';
    act.setAttribute('aria-label', 'Azione');
    const ring = document.createElement('button');
    ring.className = 'act-ring';
    ring.setAttribute('aria-label', 'Azione');
    ring.innerHTML = '<i></i>';
    const lbl = document.createElement('div');
    lbl.className = 'act-label';
    // seconda zona da toccare: il cerchio a terra dove stare
    const stand = document.createElement('button');
    stand.className = 'action act-stand';
    stand.setAttribute('aria-label', 'Azione');
    // area delle azioni: la metà dello schermo senza joystick (non si vede: serve alla manina del tutorial)
    const zone = document.createElement('div');
    zone.className = 'act-zone';
    const inp = this.game.input;
    // tocco nell'area delle azioni (gestito da Input): con un'azione "tocca" il cerchio sopra la testa
    // si riempie in un lampo, per far vedere che è partita
    inp.onActionDown = () => {
      document.body.classList.add('act-pressed');
      if (this.actionPrompt && this.actionPrompt.progress === undefined) this.flashT = performance.now();
    };
    inp.onActionUp = () => document.body.classList.remove('act-pressed');
    // prima persona: toccare l'oggetto dell'azione fa l'azione, altrove si gira la visuale
    inp.onTargetHit = (x, y) => this.actionHit(x, y);
    document.body.append(act, ring, stand, zone, lbl);
    const side = () => document.body.classList.toggle('swap-controls', settings.swapControls);
    side();
    onSettings(side);
    this.actionEl = act;
    this.standEl = stand;
    this.ringEl = ring;
    this.labelEl = lbl;

    // comandi della camera (terza persona)
    const cam = document.createElement('div');
    cam.className = 'camctl';
    cam.innerHTML = `
      <button class="cam-toggle hbtn c-gray" aria-label="Camera"><span class="i">🎥</span><span class="l">Camera</span></button>
      <div class="cam-grid">
      <button data-v="spin:1" aria-label="Ruota a sinistra">⟲</button><button data-v="spin:-1" aria-label="Ruota a destra">⟳</button>
      <button data-v="zoom:1" aria-label="Avvicina">＋</button><button data-v="zoom:-1" aria-label="Allontana">－</button>
      <button data-v="tilt:1" aria-label="Più dall'alto">▲</button><button data-v="tilt:-1" aria-label="Più di lato">▼</button>
      <button data-v="reset" class="wide" aria-label="Visuale standard">⌂ Visuale</button></div>`;
    const view = this.game.view;
    cam.querySelectorAll<HTMLButtonElement>('[data-v]').forEach((b) => {
      const [k, d] = b.dataset.v!.split(':');
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (k === 'reset') view.reset();
        else view.hold(k as 'spin' | 'zoom' | 'tilt', +d);
      });
      const stop = () => k !== 'reset' && view.hold(k as 'spin' | 'zoom' | 'tilt', 0);
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointerleave', stop);
      b.addEventListener('pointercancel', stop);
    });
    cam.querySelector('.cam-toggle')!.addEventListener('click', () => cam.classList.toggle('open'));
    this.root.querySelector('.hud-right .hud-btns')!.appendChild(cam);
    this.camEl = cam;
    this.layoutHud();
    onSettings(() => this.layoutHud());
    layout.on(() => this.layoutHud(), false);
    // rotellina = zoom, Q/R = ruota (su PC)
    window.addEventListener('wheel', (e) => {
      if (this.panel || (e.target as HTMLElement).closest?.('.mapscreen,.modal')) return;
      view.zoomBy(Math.exp(e.deltaY * 0.001));
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'KeyQ') view.hold('spin', 1);
      if (e.code === 'KeyR') view.hold('spin', -1);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyQ' || e.code === 'KeyR') view.hold('spin', 0);
    });

    const ride = document.createElement('button');
    ride.className = 'ride-btn';
    // pointerdown e non click: su telefono il "click" non arriva se un altro dito sta già
    // tenendo il joystick, così si può salire/scendere anche mentre ci si muove
    ride.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.toggleRide();
    });
    this.root.appendChild(ride);
    this.rideEl = ride;

    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    document.body.appendChild(this.toastsEl);
  }

  private hudMenuEl!: HTMLElement;

  /**
   * Pulsanti a destra nell'ordine scelto; quelli "nel menu" vanno nella tendina ☰.
   * Quanti ne stanno lo decide lo spazio (LayoutManager): la colonna va dalla minimappa al
   * pulsante giallo; in orizzontale può diventare di 2 colonne. Quelli che non ci stanno
   * finiscono da soli nel ☰ (dopo quelli scelti dal giocatore).
   */
  private layoutHud() {
    const col = this.root.querySelector('.hud-right .hud-btns') as HTMLElement;
    const drop = this.hudMenuEl.querySelector('.hud-drop') as HTMLElement;
    const el = (k: HudKey): HTMLElement => (k === 'camera' ? this.camEl : (col.querySelector(`[data-h="${k}"]`) ?? drop.querySelector(`[data-h="${k}"]`)) as HTMLElement);
    const info = layout.info;
    const btn = Math.max(44, 54 * info.scale);
    const act = Math.max(82, 96 * info.scale);
    const step = btn + 7;
    const mmVisible = settings.minimap && this.minimap.el.style.display !== 'none';
    const mm = !mmVisible ? 0 : info.orientation === 'landscape' && info.h < 480 ? Math.max(72, 84 * info.scale) : Math.max(84, 104 * info.scale);
    const top = Math.max(info.safe.top, info.orientation === 'landscape' ? 10 : 34) + (mm ? mm + 8 + 8 : 0);
    const bottom = Math.max(info.safe.bottom, info.orientation === 'landscape' ? 10 : 12) + 22 + act + 14;
    const rows = Math.max(1, Math.floor((info.h - top - bottom + 7) / step));
    const wanted = settings.hudOrder.filter((k) => !settings.hudMenu.includes(k));
    // in orizzontale, se una colonna non basta, se ne usano due
    const cols = info.orientation === 'landscape' && wanted.length + (settings.hudMenu.length ? 1 : 0) > rows ? 2 : 1;
    const cap = rows * cols;
    const needMenu = settings.hudMenu.length > 0 || wanted.length > cap;
    const shown = needMenu ? wanted.slice(0, cap - 1) : wanted;
    for (const k of settings.hudOrder) {
      if (shown.includes(k)) col.appendChild(el(k));
      else drop.appendChild(el(k));
    }
    // il pulsante ☰ c'è solo se qualcosa è nel menu, sempre in fondo alla colonna
    col.appendChild(this.hudMenuEl);
    this.hudMenuEl.style.display = needMenu ? '' : 'none';
    this.hudMenuEl.classList.remove('open');
    this.camEl.classList.toggle('in-menu', !shown.includes('camera'));
    col.style.setProperty('--hud-cols', String(cols));
    document.documentElement.style.setProperty('--hud-w', `${cols * btn + (cols - 1) * 7}px`);
    this.hudShown = shown;
  }
  /** pulsanti visibili nella colonna (gli altri sono nel ☰) */
  private hudShown: HudKey[] = [];

  update(dt: number) {
    this.placeTopStack();
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
      (this.jobEl.querySelector('#j-time') as HTMLElement).textContent = run.frozen ? '🎓 senza tempo' : `⏱ ${Math.ceil(run.timeLeft)}s`;
      (this.jobEl.querySelector('#j-status') as HTMLElement).textContent = run.status;
      const fill = this.jobEl.querySelector('#j-fill') as HTMLElement;
      fill.style.width = `${f * 100}%`;
      fill.className = 'fill' + (f < 0.2 ? ' danger' : f < 0.45 ? ' warn' : '');
    }

    this.minimap.el.style.display = settings.minimap ? '' : 'none';
    if (settings.minimap) this.minimap.update(dt);
    this.camEl.style.display = this.game.viewFirstPerson ? 'none' : '';
    this.camEl.classList.toggle('changed', this.game.view.changed);
    const r = s.riding;
    // nei minigiochi il veicolo c'è solo nella via delle consegne
    const rideTxt = !s.vehicles.length || this.game.interior || this.game.house || (this.game.arena && !('houses' in this.game.arena)) ? '' : r ? `<span class="i">🚶</span><span class="l">Scendi</span>` : `<span class="i">${VEHICLES[s.lastRide && s.vehicles.includes(s.lastRide) ? s.lastRide : s.vehicles[s.vehicles.length - 1]].icon}</span><span class="l">Sali</span>`;
    if (this.rideEl.dataset.k !== rideTxt) {
      this.rideEl.dataset.k = rideTxt;
      this.rideEl.innerHTML = rideTxt;
      this.rideEl.style.display = rideTxt ? '' : 'none';
    }
    this.pointers.update();

    if (this.panel?.live) {
      this.liveTimer += dt;
      // niente aggiornamenti mentre il dito scorre il pannello (interromperebbero lo scorrimento)
      const busy = this.touching || performance.now() - this.lastScroll < 900;
      if (this.liveTimer > 1 && !busy) this.renderPanel(true);
    }
    // i soldi nell'intestazione salgono anche mentre la finestra è aperta (incassi delle attività)
    if (this.panel?.money) {
      this.moneyT += dt;
      if (this.moneyT > 0.5) {
        this.moneyT = 0;
        this.updateHeadMoney();
      }
    }
  }

  private moneyT = 0;

  /**
   * Azione disponibile: un anello che lampeggia sopra l'oggetto da usare, con la scritta sotto.
   * Si tocca (o si tiene premuto) l'oggetto stesso: niente pulsante fisso.
   */
  /** l'oggetto dell'azione pulsa (al posto di cerchi sullo schermo) */
  private pulse = new PulseGlow();

  setAction(p: ActionPrompt | null) {
    this.actionPrompt = p;
    this.pulse.set(p?.obj);
    this.pulse.update();
    const key = p ? p.icon + p.label : '';
    if (key !== this.lastAction) {
      const appeared = !this.lastAction && !!p;
      this.lastAction = key;
      // le zone sull'oggetto e sul cerchio a terra servono solo a posizionare la manina del tutorial
      this.actionEl.classList.toggle('on', !!p);
      this.labelEl.classList.toggle('on', !!p);
      document.body.classList.toggle('act-ready', !!p);
      if (p) {
        const hold = p.progress !== undefined;
        // prima il gesto (tocca / tieni premuto), poi cosa fai
        this.labelEl.innerHTML = `${p.at ? `<span class="act-how">${hold ? '✊ Tieni premuto' : '👆 Tocca'}</span> ` : ''}${esc(p.icon)} ${esc(p.label.replace(/^Tieni premuto:\s*/, ''))}`;
      }
      // l'azione è appena diventata disponibile: il telefono vibra un attimo
      if (appeared) {
        try {
          navigator.vibrate?.(12);
        } catch {
          /* non supportato */
        }
      }
    }
    // cerchio: solo per le azioni da tenere premute (si riempie), o un lampo dopo un tocco
    const flash = (performance.now() - this.flashT) / 260;
    const hold = !!p && p.progress !== undefined;
    // il lampo resta anche se l'azione è appena finita (l'oggetto preso non ha più un'azione)
    // in prima persona niente cerchio in mezzo alla vista: l'avanzamento riempie la scritta in alto
    const fp = this.game.viewFirstPerson;
    const showRing = !fp && (hold || flash < 1.3);
    this.ringEl.classList.toggle('on', showRing);
    // pieno solo mentre si tiene premuto o durante il lampo di un tocco
    const fill = hold ? p!.progress! : flash < 1.3 ? Math.min(1, flash) : 0;
    this.ringEl.style.setProperty('--p', `${Math.round(Math.min(1, fill) * 100)}%`);
    this.labelEl.style.setProperty('--p', `${Math.round(Math.min(1, fill) * 100)}%`);
    this.labelEl.classList.toggle('filling', fp && fill > 0);

    this.ringEl.classList.toggle('full', !hold && flash >= 1);
    if (p) this.placeAction(p, showRing);
  }

  private hitNdc = new THREE.Vector2();
  private hitRay = new THREE.Raycaster();
  /**
   * Prima persona: il dito (x, y) è sull'oggetto dell'azione (quello che pulsa)? Conta solo l'oggetto
   * stesso, con un piccolo margine per il dito: il vuoto attorno e il cerchio a terra no.
   */
  actionHit(x: number, y: number) {
    const p = this.actionPrompt;
    if (!p || !p.at) return false;
    const list = p.hit?.length ? p.hit : p.obj ? [p.obj] : [];
    if (!list.length) return false;
    const cam = this.game.activeCamera;
    cam.updateMatrixWorld();
    const { w, h } = layout.info;
    this.hitRay.far = 8;
    // il dito sopra l'oggetto vero (non il suo riquadro): il punto toccato o poco attorno (la punta del dito)
    const hits = (px: number, py: number) => {
      this.hitRay.setFromCamera(this.hitNdc.set((px / w) * 2 - 1, -(py / h) * 2 + 1), cam);
      return this.hitRay.intersectObjects(list, true).length > 0;
    };
    if (hits(x, y)) return true;
    const r = 14;
    for (let i = 0; i < 8; i++) if (hits(x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * r)) return true;
    return false;
  }

  private actionV = new THREE.Vector3();
  private actionV2 = new THREE.Vector3();
  /**
   * Zona da toccare sull'oggetto (un po' più grande dell'oggetto sullo schermo), cerchio poco sopra
   * la testa del personaggio, scritta in alto subito sotto il riquadro (soldi, lavoretto o "in mano").
   */
  private placeAction(p: ActionPrompt, ring: boolean) {
    const g = this.game;
    const v = this.actionV;
    const { w, h, safe } = layout.info;
    const cam = g.activeCamera;
    cam.updateMatrixWorld();
    const toScreen = (q: THREE.Vector3) => ({ x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h });
    if (p.at) v.copy(p.at);
    else v.copy(g.player.root.position).setY(1.1);
    // zona da toccare: quanto un oggetto di 1,6 m sullo schermo, tra 76 e 116 px
    const side = this.actionV2.setFromMatrixColumn(cam.matrixWorld, 0).normalize().multiplyScalar(1.6).add(v).project(cam);
    v.project(cam);
    const o = toScreen(v);
    const sd = toScreen(side);
    const d = Math.round(THREE.MathUtils.clamp(Math.hypot(sd.x - o.x, sd.y - o.y), 76, 116));
    const r = d / 2;
    this.actionEl.style.setProperty('--hit', `${d}px`);
    this.actionEl.style.left = `${Math.round(THREE.MathUtils.clamp(o.x, safe.left + r, w - safe.right - r))}px`;
    this.actionEl.style.top = `${Math.round(THREE.MathUtils.clamp(o.y, safe.top + r, h - safe.bottom - r))}px`;
    // cerchio a terra: anche lì si può toccare
    if (p.stand) {
      const st = toScreen(v.copy(p.stand).setY(0.1).project(cam));
      this.standEl.style.setProperty('--hit', `${d}px`);
      this.standEl.style.left = `${Math.round(THREE.MathUtils.clamp(st.x, safe.left + r, w - safe.right - r))}px`;
      this.standEl.style.top = `${Math.round(THREE.MathUtils.clamp(st.y, safe.top + r, h - safe.bottom - r))}px`;
    }
    // cerchio poco sopra la testa
    if (ring && g.viewFirstPerson) {
      // prima persona: la testa non si vede, il cerchio sta al centro della vista (sotto il mirino)
      this.ringEl.style.left = `${Math.round(w / 2 + (cam.view?.offsetX ? -cam.view.offsetX : 0))}px`;
      this.ringEl.style.top = `${Math.round(h * 0.58 + (cam.view?.offsetY ? -cam.view.offsetY : 0))}px`;
    } else if (ring) {
      const head = toScreen(v.copy(g.player.root.position).setY(p.headY ?? 2.6).project(cam));
      const rr = this.ringEl.offsetWidth / 2 || 42;
      this.ringEl.style.left = `${Math.round(THREE.MathUtils.clamp(head.x, safe.left + rr, w - safe.right - rr))}px`;
      this.ringEl.style.top = `${Math.round(THREE.MathUtils.clamp(head.y - rr * 0.6, safe.top + rr, h - safe.bottom - rr))}px`;
    }
    // scritta: subito sotto i riquadri in alto (e sotto il messaggio, se c'è): mai sulla scena
    this.labelEl.style.left = `${Math.round(this.stackLeft)}px`;
    this.labelEl.style.top = `${Math.round(this.stackBottom + 6)}px`;
  }

  jobBar(on: boolean) {
    this.jobEl.classList.toggle('on', on);
    document.body.classList.toggle('job-on', on);
  }

  refresh() {
    this.updateDot();
    if (this.panel) this.renderPanel();
  }

  private updateDot() {
    const claimable = [...this.s.missions, ...(this.s.weekly ?? [])].some((m) => !m.claimed && m.progress >= m.target);
    this.missionDot.style.display = claimable ? '' : 'none';
    // se Missioni è nel menu, il "!" compare anche sul pulsante ☰
    const dot2 = this.root.querySelector('#h-dot2') as HTMLElement | null;
    // richieste di amicizia: pallino su Profilo (e sul ☰ se Profilo è nel menu)
    const req = this.game.friendRequests.length > 0;
    const dotP = this.root.querySelector('#h-dot-p') as HTMLElement | null;
    if (dotP) dotP.style.display = req ? '' : 'none';
    if (dot2) dot2.style.display = (claimable && !this.hudShown.includes('missions')) || (req && !this.hudShown.includes('profile')) ? '' : 'none';
  }

  /**
   * Messaggi a comparsa rapida: uno alla volta (il nuovo sostituisce il vecchio), al centro dello
   * schermo, un po' sopra la metà (sopra il personaggio, sotto i riquadri in alto). Durano poco.
   */
  toast(text: string, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    // il testo in un elemento a parte: le 2 righe si tagliano pulite (il bordo non mostra la terza)
    const span = document.createElement('span');
    span.textContent = text;
    t.appendChild(span);
    this.toastsEl.replaceChildren(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3200);
  }

  /** dove finiscono i riquadri in alto a sinistra (lì sotto: messaggi, poi la scritta dell'azione) */
  private stackBottom = 0;
  private stackLeft = 0;

  /**
   * Colonna in alto a sinistra (in orizzontale: pannello a sinistra): riquadri del gioco, poi la
   * striscia dei messaggi (altezza fissa: le stanze la tengono sempre libera), poi la scritta dell'azione.
   */
  private placeTopStack() {
    const { h, safe } = layout.info;
    let top = safe.top;
    let left = safe.left;
    for (const sel of ['.hud-top .pills', '.jobbar.on', '.preview-bar', '.hand-badge', '.tut-bubble']) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (getComputedStyle(el).display === 'none') continue;
        const b = el.getBoundingClientRect();
        if (b.height < 2 || b.top > h / 2) continue;
        if (b.bottom > top) {
          top = b.bottom;
          left = b.left;
        }
      }
    }
    // messaggi rapidi: al centro dello schermo, un po' sopra la metà e comunque sotto i riquadri in alto;
    // non vanno mai sopra la colonna dei pulsanti a destra né (in orizzontale) sopra il pannello a sinistra
    const { w } = layout.info;
    const y = Math.round(Math.max(top + 10, h * 0.3));
    const band = (b: DOMRect) => b.height > 2 && b.top < y + 64 && b.bottom > y;
    let lo = safe.left;
    let hi = w - safe.right;
    for (const el of document.querySelectorAll<HTMLElement>('.hud-right .hud-btns, .hud-right .minimap')) {
      const b = el.getBoundingClientRect();
      if (band(b)) hi = Math.min(hi, b.left - 8);
    }
    if (document.body.classList.contains('is-landscape')) {
      for (const sel of ['.hud-top .pills', '.jobbar.on', '.preview-bar', '.hand-badge', '.tut-bubble', '.act-label.on']) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const b = el.getBoundingClientRect();
          if (getComputedStyle(el).display !== 'none' && band(b)) lo = Math.max(lo, b.right + 8);
        }
      }
    }
    // al centro dello schermo se c'è posto, altrimenti al centro dello spazio libero
    const cx = Math.min(Math.max(w / 2, lo + 60), hi - 60);
    const half = Math.max(80, Math.min(cx - lo, hi - cx));
    this.toastsEl.style.left = `${Math.round(cx)}px`;
    this.toastsEl.style.top = `${y}px`;
    this.toastsEl.style.maxWidth = `${Math.round(Math.min(420, half * 2))}px`;
    this.stackLeft = left;
    // la scritta dell'azione va subito sotto i riquadri
    this.stackBottom = top;
  }

  // ---------------- pannelli ----------------

  private open(p: Panel) {
    if (this.panel) {
      // da un pulsante di una finestra si apre un'altra finestra: si va avanti (con "Indietro")
      if (this.navFrom && this.panel === this.navFrom) this.close();
      else {
        // un pannello alla volta: gli altri aspettano
        this.queue.push(p);
        return;
      }
    }
    if (this.backCandidate && this.backCandidate !== p && !p.locked) p.back = this.backCandidate;
    this.backCandidate = null;
    this.panel = p;
    this.game.paused = true;
    this.game.input.cancel();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="sheet ${p.small ? 'small' : ''} ${p.wide ? 'wide' : ''}" style="--hc:${p.color ?? 'var(--blue)'}"><div class="sheet-head">${p.back ? '<button class="back" aria-label="Indietro">‹</button>' : ''}<h2></h2><span class="head-money" hidden></span><button class="x">✕</button></div><div class="tabs-slot"></div><div class="sheet-body"></div></div>`;
    modal.querySelector('h2')!.textContent = p.title;
    modal.querySelector('.x')!.addEventListener('click', () => this.close());
    modal.querySelector('.back')?.addEventListener('click', () => this.goBack());
    if (p.locked) (modal.querySelector('.x') as HTMLElement).style.display = 'none';
    modal.addEventListener('pointerdown', (e) => {
      if (e.target === modal && !this.panel?.locked) this.close();
    });
    modal.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || !this.panel) return;
      const [name, arg = ''] = el.dataset.a!.split(':');
      this.navFrom = this.panel;
      try {
        this.panel.actions[name]?.(arg);
      } finally {
        this.navFrom = null;
        this.backCandidate = null;
      }
      if (this.panel && this.modal === modal) this.renderPanel();
      // il pulsante ha chiuso la finestra senza aprirne un'altra: ora tocca a quelle in attesa
      if (!this.panel && this.queue.length) this.open(this.queue.shift()!);
      this.updateDot();
    });
    modal.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (!el.dataset.c || !this.panel) return;
      const [name, arg = ''] = el.dataset.c.split(':');
      this.panel.actions[name]?.(arg);
      this.renderPanel();
    });
    const sb = modal.querySelector('.sheet-body') as HTMLElement;
    sb.addEventListener('touchstart', () => (this.touching = true), { passive: true });
    sb.addEventListener('touchend', () => (this.touching = false), { passive: true });
    sb.addEventListener('touchcancel', () => (this.touching = false), { passive: true });
    // anche le righe interne che scorrono di lato (l'evento non sale: si ascolta in cattura)
    modal.addEventListener('scroll', () => (this.lastScroll = performance.now()), { passive: true, capture: true });
    modal.addEventListener('touchstart', () => (this.touching = true), { passive: true });
    modal.addEventListener('touchend', () => (this.touching = false), { passive: true });
    this.touching = false;
    this.lastHtml = '';
    document.body.appendChild(modal);
    this.modal = modal;
    this.renderPanel();
  }

  private touching = false;
  private lastScroll = 0;
  private lastHtml = '';

  private renderPanel(onlyIfChanged = false) {
    if (!this.modal || !this.panel) return;
    this.liveTimer = 0;
    const body = this.modal.querySelector('.sheet-body') as HTMLElement;
    const scroll = body.scrollTop;
    const html = this.panel.render();
    // contenuto uguale: non si tocca nulla (lo scorrimento resta fluido)
    if (onlyIfChanged && html === this.lastHtml) return;
    this.lastHtml = html;
    const [tabs, content] = html.includes('<!--tabs-->') ? html.split('<!--tabs-->') : ['', html];
    const tabsEl = this.modal.querySelector('.tabs-slot') as HTMLElement;
    // REGOLA: ridisegnare una finestra non deve mai far perdere dove l'utente ha scorso, né in verticale
    // né nelle righe che scorrono di lato (schede, gruppi, carte): si salvano e si rimettono uguali
    const keepTabs = keepScroll(tabsEl);
    const keepBody = keepScroll(body);
    if (tabsEl.innerHTML !== tabs) tabsEl.innerHTML = tabs;
    body.innerHTML = content;
    // prima si ridisegna (il canvas cambia l'altezza), poi si ripristina lo scorrimento
    this.panel.after?.(body);
    body.scrollTop = scroll;
    keepTabs();
    keepBody();
    (this.modal.querySelector('h2') as HTMLElement).textContent = this.panel.title;
    this.updateHeadMoney();
  }

  /** I tuoi soldi nell'intestazione delle finestre dove si compra (aggiornati anche mentre spendi). */
  private updateHeadMoney() {
    const el = this.modal?.querySelector('.head-money') as HTMLElement | null;
    const m = this.panel?.money;
    if (!el) return;
    const show = typeof m === 'function' ? m() : !!m;
    el.hidden = !show;
    if (show) el.textContent = `💰 ${euro(this.s.money)}`;
  }

  close() {
    const p = this.panel;
    this.modal?.remove();
    this.modal = null;
    this.panel = null;
    this.game.paused = false;
    p?.onClose?.();
    // chiusa da un suo pulsante: se subito dopo si apre un'altra finestra, potrà tornare qui
    if (p && p === this.navFrom) {
      this.backCandidate = p;
      return;
    }
    const next = this.queue.shift();
    if (next) this.open(next);
  }

  /** "‹ Indietro": si torna alla finestra precedente (con la sua scheda e il suo stato). */
  goBack() {
    const prev = this.panel?.back;
    if (!prev) return;
    const p = this.panel!;
    this.modal?.remove();
    this.modal = null;
    this.panel = null;
    p.onClose?.();
    this.open(prev);
  }

  get isOpen() {
    return !!this.panel;
  }

  // ---------------- lavori ----------------

  openJobOffer(offer: JobOffer) {
    const def = jobInfo(offer.type, offer.level);
    // il tutorial è acceso solo finché non hai completato quel lavoretto (vale per ogni livello, ma ogni
    // versione nuova del lavoretto, ogni 10 livelli, ha il suo); dopo resta spento, ma lo puoi riaccendere
    let tut = !this.game.tutorial.isDone(def.key);
    this.open({
      title: `${def.icon} ${def.name}`,
      small: true,
      color: 'var(--orange)',
      render: () => `
        <div class="grid2">
          <div class="stat s-green"><b class="money-t">${euro(offer.pay)}</b><span>💰 paga (⭐⭐)</span></div>
          <div class="stat s-yellow"><b class="money-t">${euro(offer.pay * 1.35)}</b><span>🤩 paga con ⭐⭐⭐</span></div>
          <div class="stat s-purple"><b>Liv. ${offer.level}</b><span>📈 difficoltà</span></div>
          <div class="stat"><b>${SKILLS[def.skill].icon} ${SKILLS[def.skill].name}</b><span>esperienza che guadagni</span></div>
        </div>
        <button class="card set-toggle tut-toggle" data-a="tut" style="margin-top:10px"><div style="flex:1;text-align:left"><b>🎓 Con il tutorial</b><div class="muted small">${tut ? 'Ti guida passo passo sul posto, e il tempo è fermo.' : 'Il tutorial di questo lavoretto l\'hai già fatto: puoi rifarlo.'}</div></div>
          <span class="switch ${tut ? 'on' : ''}"><i></i></span></button>
        <p class="muted small center" style="margin:10px 0 0">${tut ? '🎓 Il tutorial è una prova: niente soldi né esperienza, ma il lavoretto resta disponibile per farlo sul serio' : 'Più sei veloce, più stelle prendi ⭐'}</p>
        <div class="btnrow"><button class="btn sec" data-a="no">No grazie</button><button class="btn good" data-a="yes">Accetta</button></div>`,
      actions: {
        tut: () => (tut = !tut),
        yes: () => {
          this.close();
          this.game.startJob(offer, tut);
        },
        no: () => this.close(),
      },
    });
  }

  /** Fine del tutorial: nessuna ricompensa, il lavoretto resta da fare (la scheda si riapre da qui). */
  openTutorialDone(offer: JobOffer) {
    const def = jobInfo(offer.type, offer.level);
    this.open({
      title: '🎓 Tutorial completato!',
      small: true,
      color: 'var(--purple)',
      render: () => `<div class="card hero tint"><div class="emoji">${def.icon}</div><div class="big">Ora sai come si fa</div></div>
        <p class="muted center">Il tutorial era una prova: niente soldi né esperienza. Il lavoretto <b>${def.name}</b> è ancora disponibile: fallo sul serio per essere pagato, più sei veloce più stelle prendi ⭐</p>
        <div class="btnrow"><button class="btn sec" data-a="later">Più tardi</button><button class="btn good" data-a="go">▶ Fallo adesso</button></div>`,
      actions: {
        later: () => this.close(),
        go: () => {
          this.close();
          this.game.startJob(offer, false);
        },
      },
    });
  }

  openJobResult(offer: JobOffer, stars: number, pay: number, xp: number, fame: number) {
    const def = jobInfo(offer.type, offer.level);
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
          <div class="stat"><b>${careerLine(offer.type)?.icon ?? def.icon} Liv. ${lineLevel(this.s, offer.type)}</b><span>${careerLine(offer.type)?.name ?? def.name} · ${SKILLS[def.skill].name} Liv. ${skillLevel(this.s, def.skill)}</span></div>
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
        if (def.kind === 'craft') {
          // laboratorio: niente clienti, si guadagna coi lavori fatti a mano
          return `<div class="card"><div class="row"><div class="icon-bubble" style="background:${def.color};color:#fff">${def.icon}</div>
              <div style="flex:1"><h3 style="margin:0">${def.name}</h3><div class="muted small">${def.desc}</div></div></div>
            <div class="grid2" style="margin-top:8px">
              <div class="stat s-purple"><b>${SPECIALS_PER_DAY} al giorno</b><span>🛠️ lavori su richiesta</span></div>
              <div class="stat s-green"><b class="money-t">${euro(150)}–${euro(400)}+</b><span>a lavoro, fatto da te</span></div>
            </div>
            <button class="btn good full" style="margin-top:10px" data-a="buy:${lotId}|${t}" ${!canBuy || s.money < price ? 'disabled' : ''}>🛒 Apri per ${euro(price)}</button>
            ${def.setupCost ? `<div class="muted small center" style="margin-top:4px">Lotto ${euro(lot.price)} + attrezzatura ${euro(def.setupCost)}</div>` : ''}
          </div>`;
        }
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
      ${canBuy ? '' : `<div class="card tint small" style="margin-top:10px">🏢 Per comprare vai all'<b>agenzia affari</b> oppure davanti al lotto col cartello rosso.</div>
        <button class="btn blue full" data-a="target:${lotId}" style="margin-top:8px">📍 Imposta come obiettivo sulla mappa</button>`}
      <h3 class="sec-title">Cosa puoi aprire qui</h3>${opts}
      <p class="muted small">* Stima con la domanda di oggi, due dipendenti per reparto (turni da 8 ore: coprono tutta la giornata) e un manager. Bollette ${euro(BUSINESS.UTILITIES_MONTH)}/mese.</p>`;
  }

  private buyActions() {
    return {
      // il lotto diventa l'obiettivo sulla mappa: la linea e le frecce portano lì
      target: (lotId: string) => {
        this.game.setLotTarget(lotId);
        this.close();
      },
      buy: (arg: string) => {
        const [lotId, t] = arg.split('|');
        const b = buyLot(this.s, lotId, t as BusinessType);
        if (!b) return;
        this.game.setupLot(lotId);
        this.game.save();
        this.close();
        const k = bizType(b.type).kind;
        this.openBusiness(b.id, k === 'service' ? 'ordini' : k === 'craft' ? 'lavori' : 'prodotti');
      },
    };
  }

  openLot(lotId: string) {
    const lot = lotDef(lotId);
    this.open({
      money: true,
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
      money: true,
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
        chain: (t) => {
          this.close();
          this.openChain(t as BusinessType);
        },
        staff: (id) => {
          this.close();
          this.openBusiness(id, 'personale');
        },
        stockOf: (id) => {
          this.close();
          this.openBusiness(id, 'magazzino');
        },
        bizTab: (arg) => {
          const [id, tab] = arg.split('|');
          this.close();
          this.openBusiness(id, tab);
        },
        report: (id) => {
          this.close();
          this.openReport(id);
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
      // catene: 2 o più attività dello stesso tipo si gestiscono insieme
      const chains = chainTypes(s).map((t) => {
        const d = bizType(t);
        const n = chainOf(s, t).length;
        return `<button class="card chain-card" data-a="chain:${t}" style="--sc:${d.color}"><div class="icon-bubble" style="background:${d.color};color:#fff">🔗</div>
          <div style="flex:1;text-align:left"><b>Catena ${d.icon} ${d.name}</b><div class="muted small">${n} attività · gestiscile insieme o a gruppi</div></div><span class="shop-go">›</span></button>`;
      }).join('');
      return (chains ? `<h3 class="sec-title">🔗 Le tue catene</h3>${chains}<h3 class="sec-title">🏪 Tutte le attività</h3>` : '') + s.businesses
        .map((b) => {
          const def = bizType(b.type);
          const lot = lotDef(b.lotId);
          const extra = def.kind === 'service' && b.orders.length ? ` · <b>${b.orders.length} ordini in attesa</b>` : '';
          return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble" style="background:${def.color}">${def.icon}</div>
              <div><h3 style="margin:0">${def.name}</h3><div class="muted small">${lot.name}</div></div></div>${this.autoTag(b)}</div>
            <div class="row between small" style="margin-top:8px"><span>Oggi: <b class="money-t">${euro(b.today.revenue)}</b> · ${b.today.served} ${def.kind === 'service' ? 'ordini' : def.kind === 'craft' ? 'lavori' : 'clienti'}${extra}</span>
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
      ensurePartials(s);
      if (!s.businesses.length) return '<div class="card center muted">Qui vedrai i conti e i confronti tra le tue attività.</div>';
      const rows = s.businesses.map((b) => {
        const c = monthlyCosts(s, b);
        const fixed = c.rent + c.utilities + b.staff.reduce((a, e) => a + e.salary, 0);
        // avvisi e clienti dal resoconto di fine giornata (si aggiorna una volta al giorno)
        const rep = (b.report ?? b.partial)?.data;
        const warn = (rep?.advice ?? []).filter((a) => a.kind === 'short' || a.kind === 'stock' || a.kind === 'excess' || a.kind === 'info');
        return { b, def: bizType(b.type), month: b.month.revenue, est: estimateMonthlyProfit(s, b), fixed, rep, warn };
      }).sort((a, b) => b.month - a.month);
      const max = Math.max(1, ...rows.map((r) => r.month));
      const bars = rows.map((r) => `<div style="margin-bottom:8px"><div class="row between small"><span>${r.def.icon} <b>${lotDef(r.b.lotId).name}</b></span><b class="money-t">${euro(r.month)}</b></div>
        <div class="bar green" style="height:14px"><i style="width:${(r.month / max) * 100}%;background:${r.def.color}"></i></div></div>`).join('');
      // avvisi sul personale: clienti persi perché manca personale, costi alti per dipendenti di troppo
      const alerts = (r: (typeof rows)[number]) => r.warn.map((w) => `<div class="report-alert ${w.kind}"><span>${w.icon} ${w.text}</span>${w.tab ? `<button class="btn sm" data-a="bizTab:${r.b.id}|${w.tab}">${w.label}</button>` : ''}</div>`).join('');
      const cards = rows.map((r) => `<div class="card report-card ${r.warn.some((w) => w.kind !== 'info') ? 'has-alert' : ''}" data-a="report:${r.b.id}"><div class="row between"><h3 style="margin:0">${r.def.icon} ${lotDef(r.b.lotId).name}</h3>${this.autoTag(r.b)}</div>${alerts(r)}
        <div class="grid3" style="margin-top:8px">
          <div class="stat s-green"><b class="money-t">${euro(r.b.today.revenue)}</b><span>oggi</span></div>
          <div class="stat s-yellow"><b>${euro(r.b.yesterday.revenue)}</b><span>ieri</span></div>
          <div class="stat s-orange"><b>${euro(r.month)}</b><span>mese</span></div>
          <div class="stat"><b>${r.rep ? fmtRate(r.rep.avg.served) : '—'}</b><span>serviti al giorno</span></div>
          <div class="stat s-red"><b>${r.rep ? fmtRate(r.rep.avg.lost) : '—'}</b><span>persi al giorno</span></div>
          <div class="stat s-purple"><b>${euro(r.fixed)}</b><span>costi fissi/mese</span></div>
        </div>
        <div class="row between" style="margin-top:8px"><span class="small">Utile stimato al mese</span><b class="${r.est >= 0 ? 'good' : 'bad'}">${isAutonomous(r.b) ? euro(r.est) : 'serve lo staff'}</b></div>
        ${r.b.report ? '' : `<div class="report-wait">🧑‍💼 Il manager deve raccogliere ulteriori informazioni prima di fornire un resoconto della settimana.${r.rep ? ` Intanto c'è un <b>resoconto provvisorio</b> di ${fmtRate(Math.floor(r.b.partial!.days * 10) / 10)} giornate.` : ` ${this.partialWhen(r.b)}`}${this.reportProgress(r.b, false)}</div>`}
        <div class="report-more">${r.b.report ? 'Tocca per il resoconto della settimana: orario di punta, personale, cosa vendere e consigli ›' : r.rep ? 'Tocca per il resoconto provvisorio ›' : 'Tocca per i dettagli ›'}</div></div>`).join('');
      const totMonth = rows.reduce((a, r) => a + r.month, 0);
      const totFixed = rows.reduce((a, r) => a + r.fixed, 0) + vehiclesMonthly(s);
      const nWarn = rows.filter((r) => r.warn.some((w) => w.kind !== 'info')).length;
      const top = nWarn ? `<div class="report-alert short big">⚠️ <b>${nWarn} ${nWarn === 1 ? 'attività ha' : 'attività hanno'} qualcosa da sistemare</b>: clienti persi (personale o magazzino) o dipendenti di troppo. Sotto trovi cosa fare per ognuna.</div>` : '';
      return top + `<p class="muted small" style="margin:0 0 8px">📊 Consigli e clienti vengono dal resoconto della settimana del manager (7 giornate di dati; dal ${PARTIAL_DAYS}° giorno uno provvisorio); incassi e costi sono quelli di adesso.</p><div class="grid2"><div class="stat s-green"><b class="money-t">${euro(totMonth)}</b><span>💰 incassi del mese (tutte)</span></div>
          <div class="stat s-red"><b>${euro(totFixed)}</b><span>🧾 costi fissi al mese (con veicoli)</span></div></div>
        <div class="card" style="margin-top:10px"><h3>🏆 Classifica incassi del mese</h3>${bars}</div>${cards}`;
    }
    // mercato
    const zones: ZoneId[] = ['periferia', 'residenziale', 'centro'];
    return `<p class="muted small">Clienti (o ordini) all'ora previsti oggi per ogni prodotto nelle tre zone. Cambia ogni giorno con stagioni, meteo ed eventi.</p>` +
      BUSINESS_TYPE_IDS.filter((t) => bizType(t).products.length).map((t) => {
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
    if (bizType(b.type).kind === 'craft') return '<span class="tag y">Lavori su richiesta</span>';
    return isAutonomous(b) ? '<span class="tag g">Autonoma</span>' : '<span class="tag y">Serve il titolare</span>';
  }

  openBusiness(bizId: string, tab?: string) {
    const s = this.s;
    const b = () => s.businesses.find((x) => x.id === bizId)!;
    const service = bizType(b().type).kind === 'service';
    const craft = bizType(b().type).kind === 'craft';
    let cur = tab ?? (service ? 'ordini' : craft ? 'lavori' : 'panoramica');
    // laboratorio dell'artigiano: solo lavori su richiesta (niente prodotti, magazzino né personale)
    const tabs = craft ? [['lavori', '🛠️ Lavori su richiesta'], ['panoramica', '📊 Panoramica'], ['migliorie', '⬆️ Migliorie']] : [
      ...(service ? [['ordini', '📋 Ordini']] : []),
      ['panoramica', '📊 Panoramica'],
      ['prodotti', service ? '🧰 Servizi' : '🍔 Prodotti'],
      ['magazzino', service ? '🧴 Materiali' : '🧊 Magazzino'], ['personale', '👥 Personale'], ['migliorie', '⬆️ Migliorie'],
    ];
    this.open({
      money: () => cur === 'migliorie' || cur === 'magazzino' || cur === 'personale',
      title: `${bizType(b().type).icon} ${bizType(b().type).name} · ${lotDef(b().lotId).name}`,
      live: true,
      color: bizType(b().type).color,
      render: () => {
        const head = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${cur === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        // fa parte di una catena: un tocco per gestire tutti i negozi dello stesso tipo insieme
        const n = chainOf(s, b().type).length;
        const chain = cur === 'panoramica' && n >= 2
          ? `<button class="card chain-card" data-a="chain" style="--sc:${bizType(b().type).color}"><div class="icon-bubble" style="background:${bizType(b().type).color};color:#fff">🔗</div><div style="flex:1;text-align:left"><b>Catena: ${n} attività</b><div class="muted small">Modifiche a tutti i negozi insieme o a gruppi</div></div><span class="shop-go">›</span></button>`
          : '';
        return head + chain + this.bizTab(b(), cur);
      },
      actions: {
        chain: () => {
          const t = b().type;
          this.close();
          this.openChain(t);
        },
        tab: (k) => (cur = k),
        toggleProduct: (p) => {
          const biz = b();
          const pid = p as ProductId;
          if (biz.products.includes(pid)) {
            if (biz.products.length > 1) {
              biz.products = biz.products.filter((x) => x !== pid);
              resetBizStats(s, biz, `tolto dalla vendita ${PRODUCTS[pid].name}`);
            }
            else toast('Serve almeno un prodotto in vendita', 'bad');
          } else if (productLevel(biz.type, pid) > upg(biz, 'ampliamento')) {
            toast(`🔒 Serve l'ampliamento del locale (livello ${productLevel(biz.type, pid)})`, 'bad');
          } else if (biz.products.length < menuSlots(biz)) {
            biz.products.push(pid);
            resetBizStats(s, biz, `messo in vendita ${PRODUCTS[pid].name}`);
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
        reroll: () => {
          if (s.money < 40) return;
          addMoney(s, -40);
          refreshCandidates(s);
        },
        fire: (id) => fire(s, b(), +id),
        move: (id) => (this.moveOpen = this.moveOpen === +id ? null : +id),
        moveTo: (arg) => {
          const [id, to] = arg.split('|');
          const dest = s.businesses.find((x) => x.id === to);
          if (dest && moveEmployee(s, b(), dest, +id)) this.moveOpen = null;
        },
        train: (id) => {
          const e = b().staff.find((x) => x.id === +id);
          if (e) startTraining(s, b(), e);
        },
        upgrade: (id) => {
          buyUpgrade(s, b(), id as never);
          this.game.setupLot(b().lotId);
        },
        previewUpg: (id) => this.previewUpgrade(b(), id as UpgradeId),
        previewHire: (id) => this.previewHire(b(), +id),
        special: (id) => {
          const o = specialOrders(s, b()).find((x) => x.id === +id);
          if (o) this.game.startSpecial(b(), o);
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

  /**
   * Resoconto completo di un'attività: giornata media, orario di punta ora per ora, personale rispetto
   * alle ore di punta, cosa si vende oggi, consigli (con dove andare per seguirli) e costi del mese.
   * Il giocatore decide cosa seguire: il resoconto gli evita di entrare in ogni attività a controllare.
   */
  openReport(bizId: string) {
    const s = this.s;
    const b = () => s.businesses.find((x) => x.id === bizId)!;
    this.open({
      money: true,
      live: true,
      title: `📊 ${bizType(b().type).icon} ${lotDef(b().lotId).name}`,
      color: bizType(b().type).color,
      render: () => {
        const biz = b();
        const def = bizType(biz.type);
        ensurePartials(s);
        const full = biz.report;
        const snap = full ?? biz.partial;
        if (!snap) return this.reportWaiting(biz);
        // statistiche dal resoconto della settimana; la domanda dei prodotti invece è quella di oggi
        // (cambia ogni giorno: i consigli su cosa vendere restano aggiornati)
        const isMarket = (a: { icon: string }) => ['📈', '🎉', '🏗️', '🍔'].includes(a.icon);
        const live = bizReport(s, biz);
        // nel provvisorio niente consigli di licenziare: con pochi giorni di dati è presto per dirlo
        const r = { ...snap.data, products: live.products, advice: [...snap.data.advice.filter((a) => !isMarket(a) && a.kind !== 'ok' && (full || a.kind !== 'excess')), ...live.advice.filter(isMarket)] };
        if (!r.advice.length) r.advice.push({ kind: 'ok', icon: '✅', text: 'Tutto in ordine: personale giusto per le ore di punta e magazzino pieno' });
        const n1 = fmtRate;
        const lostPct = r.avg.arrived ? Math.round((r.avg.lost / r.avg.arrived) * 100) : 0;
        const unit = def.kind === 'service' ? 'ordini' : 'clienti';
        // giornata media
        const day = `<div class="card"><h3>📅 Una giornata media <span class="muted small">(media di ${n1(Math.floor(r.days * 10) / 10)} giornate di apertura)</span></h3>
          <div class="grid2"><div class="stat s-blue"><b>${n1(r.avg.arrived)}</b><span>${unit} arrivati al giorno</span></div>
          <div class="stat s-green"><b>${n1(r.avg.served)}</b><span>serviti al giorno</span></div>
          <div class="stat ${lostPct >= 10 ? 's-red' : ''}"><b>${n1(r.avg.lost)} <small>(${lostPct}%)</small></b><span>persi al giorno</span></div>
          <div class="stat s-yellow"><b class="money-t">${euro(r.avg.revenue)}</b><span>incasso al giorno</span></div></div>
          ${r.avg.lost ? `<div class="small muted" style="margin-top:6px">Persi questa settimana: ${r.lostWhy.staff} per personale insufficiente · ${r.lostWhy.stock} per prodotti finiti · ${r.lostWhy.queue} in fila mentre lavoravi tu${r.lostWhy.unknown ? ` · ${r.lostWhy.unknown} prima che il gioco registrasse il motivo` : ''}</div>` : ''}</div>`;
        // orario di punta: barre ora per ora (verde serviti, rosso persi)
        const max = Math.max(0.1, ...r.hours.map((x) => x.arrived));
        const bars = r.hours.map((x) => {
          const hh = (x.arrived / max) * 100;
          const lh = x.arrived ? (x.lost / x.arrived) * hh : 0;
          return `<div class="hb ${x.h === r.peak.h ? 'peak' : ''}"><div class="hb-col"><i class="hb-ok" style="height:${hh - lh}%"></i><i class="hb-lost" style="height:${lh}%"></i></div><span>${x.h}</span></div>`;
        }).join('');
        const peakCard = `<div class="card"><h3>⏰ Orario di punta: ${r.peak.h}–${r.peak.h + 1}</h3>
          <div class="small">In quell'ora arrivano circa <b>${n1(r.peakRate)} ${unit}</b>${r.hasData ? ' (media della settimana)' : ' (stima dalla domanda: ancora pochi dati registrati)'}. Il personale va calcolato su quest'ora, non sulla media.</div>
          <div class="hours">${bars}</div><div class="small muted"><i class="lg ok"></i> serviti <i class="lg lost"></i> persi</div></div>`;
        // personale per reparto
        const staffRows = r.staff.map((x) => `<div class="staff-row"><div><b>${x.name}</b> · ${x.n} ${x.n === 1 ? 'persona' : 'persone'}
            <div class="shifts">${x.shifts.map((sh) => `<span class="shift">${esc(sh.name)} ${sh.start}–${sh.end}</span>`).join('') || '<span class="muted small">nessuno</span>'}</div>
            <div class="small muted">${x.status === 'short' ? `scoperto nelle ore ${x.short.join(', ')} · ne servono ~${x.need}` : x.status === 'excess' ? `ne basterebbero ~${x.need}` : 'tutta la giornata coperta'}</div></div>
          <span class="tag ${x.status === 'ok' ? 'g' : x.status === 'short' ? 'r' : 'y'}">${x.status === 'ok' ? '✅ giusto' : x.status === 'short' ? '⚠️ pochi' : '💸 troppi'}</span></div>`).join('');
        const staffCard = r.staff.length ? `<div class="card"><h3>👥 Personale e turni</h3><div class="small muted">Aperti dalle ${BUSINESS.OPEN_HOUR} alle ${BUSINESS.CLOSE_HOUR} (14 ore), turni di massimo 8 ore: il manager mette più persone nelle ore di punta (circa ${n1(r.peakRate)} ${unit} all'ora) e meno nelle ore morte.</div>${staffRows}</div>` : '';
        // cosa si vende oggi
        const pmax = Math.max(0.1, ...r.products.map((x) => x.demand));
        const prod = r.products.length ? `<div class="card"><h3>📈 Cosa si vende oggi in questa zona</h3>${r.products.map((x) => `<div class="prod-row"><div class="pr-top"><span class="pr-name">${PRODUCTS[x.pid].icon} ${PRODUCTS[x.pid].name}</span>
            ${x.selling ? '<span class="tag g">in vendita</span>' : x.locked ? '<span class="tag">🔒 ampliamento</span>' : '<span class="tag">non in menù</span>'}${x.event > 1.15 ? `<span class="tag y">🎉 +${Math.round((x.event - 1) * 100)}%</span>` : ''}<b class="small pr-val">${n1(x.demand)}/h</b></div>
            <div class="bar green"><i style="width:${(x.demand / pmax) * 100}%"></i></div></div>`).join('')}</div>` : '';
        // consigli
        const advice = `<div class="card"><h3>💡 Consigli</h3><div class="small muted" style="margin-bottom:4px">Sono suggerimenti: scegli tu quali seguire.</div>${r.advice.map((a) => `<div class="report-alert ${a.kind === 'grow' ? 'grow' : a.kind === 'ok' ? 'ok' : a.kind}"><span>${a.icon} ${a.text}</span>${a.tab ? `<button class="btn sm" data-a="go:${a.tab}">${a.label}</button>` : ''}</div>`).join('')}</div>`;
        // costi
        const tot = r.costs.rent + r.costs.utilities + r.costs.salaries;
        const costs = `<div class="card"><h3>🧾 Costi del mese</h3>
          <div class="row between small"><span>Affitto</span><span>${euro(r.costs.rent)}</span></div>
          <div class="row between small"><span>Bollette</span><span>${euro(r.costs.utilities)}</span></div>
          <div class="row between small"><span>Stipendi (${biz.staff.length})</span><span>${euro(r.costs.salaries)}</span></div>
          <div class="row between" style="margin-top:6px"><b>Totale</b><b>${euro(tot)}</b></div>
          <div class="row between" style="margin-top:6px"><span>Utile stimato al mese</span><b class="${(r.profit ?? 0) >= 0 ? 'good' : 'bad'}">${r.profit === null ? 'serve lo staff completo' : euro(r.profit)}</b></div></div>`;
        return `<div class="row between" style="margin-bottom:8px"><span class="muted small">${def.name} · 📍 ${ZONES[lotZone[biz.lotId]].name}</span>${this.autoTag(biz)}</div>
          ${full ? `<div class="report-date">📅 Resoconto della settimana · dal ${esc(dayName(Math.floor(snap.from / 1440)))} al ${esc(dayName(snap.day))}<br>${this.reportProgress(biz, true)}</div>`
            : `<div class="report-date partial">📋 <b>Resoconto provvisorio</b> · ${n1(Math.floor(biz.partial!.days * 10) / 10)} giornate su ${REPORT_DAYS} (dal ${esc(dayName(Math.floor(snap.from / 1440)))} al ${esc(dayName(snap.day))})<br><span class="small">Il manager sta ancora raccogliendo informazioni: con pochi giorni i numeri possono cambiare. Si aggiorna ogni sera alla chiusura; il resoconto completo arriva a ${REPORT_DAYS} giornate.</span>${this.reportProgress(biz, false)}</div>`}` + advice + day + peakCard + staffCard + prod + costs;
      },
      actions: {
        go: (tab) => {
          this.close();
          this.openBusiness(bizId, tab);
        },
      },
    });
  }

  /**
   * Catena: le attività dello stesso tipo (2 o più). Si sceglie a chi applicare le modifiche (tutta la
   * catena, una zona o un gruppo tuo) e si cambiano insieme prodotti, migliorie e magazzino.
   */
  openChain(type: BusinessType, startGroup = 'all') {
    const s = this.s;
    const def = bizType(type);
    let gid = startGroup;
    let tab = hasMenu(type) ? 'prodotti' : 'migliorie';
    const report = (msg: string, ok: boolean) => toast(msg, ok ? 'good' : 'bad');
    const sel = () => chainGroups(s, type).find((g) => g.id === gid) ?? chainGroups(s, type)[0];
    this.open({
      money: true,
      live: true,
      title: `🔗 Catena ${def.icon} ${def.name}`,
      color: def.color,
      render: () => {
        const groups = chainGroups(s, type);
        const g = sel();
        const chips = groups.map((x) => `<button class="chip ${x.id === g.id ? 'on' : ''}" data-a="group:${x.id}">${x.icon} ${esc(x.name)} <b>${x.bizs.length}</b></button>`).join('') +
          `<button class="chip add" data-a="newGroup">＋ Nuovo gruppo</button>`;
        const today = g.bizs.reduce((a, b) => a + b.today.revenue, 0);
        const month = g.bizs.reduce((a, b) => a + b.month.revenue, 0);
        const auto = g.bizs.filter((b) => isAutonomous(b)).length;
        const shops = g.bizs.map((b) => `<div class="card chain-shop"><div class="row between"><div><b>${esc(lotDef(b.lotId).name)}</b><div class="muted small">📍 ${ZONES[lotZone[b.lotId]].name} · oggi ${euro(b.today.revenue)} · ${b.products.map((p) => PRODUCTS[p].icon).join('') || '—'}</div></div>
            <div class="row" style="gap:6px">${this.autoTag(b)}<button class="btn sm" data-a="shop:${b.id}">Gestisci</button></div></div></div>`).join('');
        const tabs = [...(hasMenu(type) ? [['prodotti', '🍔 Prodotti']] : []), ['migliorie', '⬆️ Migliorie'], ...(hasMenu(type) ? [['magazzino', '🧊 Magazzino']] : []), ['negozi', `🏪 Negozi (${g.bizs.length})`]];
        let body = '';
        if (tab === 'prodotti') {
          body = `<p class="muted small">Metti o togli un prodotto in tutti i negozi del gruppo insieme (dove c'è posto nel menù e il locale è abbastanza grande).</p>` +
            def.products.map((p) => {
              const n = g.bizs.filter((b) => b.products.includes(p)).length;
              return `<div class="card row between"><div><b>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</b><div class="muted small">In vendita in ${n} su ${g.bizs.length}</div></div>
                <div class="row" style="gap:6px"><button class="btn sm sec" data-a="prod:${p}|0" ${n ? '' : 'disabled'}>Togli</button><button class="btn sm good" data-a="prod:${p}|1" ${n === g.bizs.length ? 'disabled' : ''}>Metti</button></div></div>`;
            }).join('');
        } else if (tab === 'migliorie') {
          const kitchenOnly = ['ampliamento', 'fuochi', 'banco', 'ripiano'];
          body = `<p class="muted small">Migliora di un livello tutti i negozi del gruppo in un tocco (quelli già al massimo o senza spazio si saltano).</p>` +
            UPGRADE_IDS.filter((id) => !kitchenOnly.includes(id) || hasInterior(type)).map((id) => {
              const u = UPGRADES[id];
              const lv = g.bizs.map((b) => upg(b, id));
              const lo = Math.min(...lv);
              const hi = Math.max(...lv);
              const can = g.bizs.filter((b) => canUpgrade(b, id)).length;
              const cost = groupUpgradeCost(g.bizs, id);
              return `<div class="card"><div class="row between"><div><b>${u.icon} ${u.name}</b><div class="muted small">Liv. ${lo === hi ? lo : `${lo}–${hi}`} / ${u.max}</div></div></div>
                <button class="btn sm full ${can ? 'blue' : 'sec'}" style="margin-top:6px" data-a="upg:${id}" ${!can || s.money < cost ? 'disabled' : ''}>${can ? `Migliora ${can} ${can === 1 ? 'negozio' : 'negozi'} · ${euro(cost)}` : 'Tutti al massimo'}</button></div>`;
            }).join('');
        } else if (tab === 'magazzino') {
          const allAuto = g.bizs.every((b) => b.autoRestock);
          body = `<div class="card"><b>🧊 Riempi i magazzini</b><div class="muted small">Ogni prodotto in vendita fino al massimo, in tutti i negozi del gruppo.</div>
              <button class="btn full" style="margin-top:8px" data-a="fill">Riempi tutto</button></div>
            <button class="card set-toggle" data-a="auto"><div style="flex:1;text-align:left"><b>🔁 Riordino automatico</b><div class="muted small">Il manager (o il magazziniere) riordina da solo in tutti i negozi del gruppo.</div></div>
              <span class="switch ${allAuto ? 'on' : ''}"><i></i></span></button>`;
        } else {
          body = shops;
        }
        const head = `<div class="chips">${chips}</div><!--tabs-->`;
        const sum = `<div class="grid3"><div class="stat s-green"><b class="money-t">${euro(today)}</b><span>💰 oggi</span></div>
          <div class="stat s-purple"><b class="money-t">${euro(month)}</b><span>📅 mese</span></div>
          <div class="stat"><b>${auto}/${g.bizs.length}</b><span>autonome</span></div></div>
          ${g.custom ? `<div class="row" style="gap:6px;margin-top:8px"><button class="btn sm sec" data-a="editGroup">✏️ Modifica gruppo</button><button class="btn sm danger" data-a="delGroup">🗑️ Elimina gruppo</button></div>` : ''}
          <div class="tabs" style="margin-top:10px">${tabs.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div>`;
        return head + sum + body;
      },
      actions: {
        group: (id) => (gid = id),
        tab: (k) => (tab = k),
        shop: (id) => {
          this.close();
          this.openBusiness(id);
        },
        prod: (arg) => {
          const [p, a] = arg.split('|');
          const r = groupProduct(s, sel().bizs, p as ProductId, a === '1');
          for (const b of sel().bizs) this.game.setupLot(b.lotId);
          const why = [r.full ? `${r.full} col menù pieno` : '', r.locked ? `${r.locked} senza l'ampliamento` : '', r.last ? `${r.last} con un solo prodotto` : ''].filter(Boolean).join(', ');
          report(`${PRODUCTS[p as ProductId].icon} ${a === '1' ? 'Messo' : 'Tolto'} in ${r.done} ${r.done === 1 ? 'negozio' : 'negozi'}${why ? ` (saltati: ${why})` : ''}`, r.done > 0);
        },
        upg: (id) => {
          const r = groupUpgrade(s, sel().bizs, id as UpgradeId);
          for (const b of sel().bizs) this.game.setupLot(b.lotId);
          report(`${UPGRADES[id as UpgradeId].icon} Migliorati ${r.done} negozi · ${euro(r.spent)}${r.skipped ? ` (${r.skipped} saltati)` : ''}`, r.done > 0);
        },
        fill: () => {
          const r = groupFill(s, sel().bizs);
          report(r.items ? `🧊 Magazzini riempiti · ${euro(r.spent)}` : 'Magazzini già pieni o soldi insufficienti', r.items > 0);
        },
        auto: () => {
          const on = !sel().bizs.every((b) => b.autoRestock);
          for (const b of sel().bizs) b.autoRestock = on;
        },
        newGroup: () => this.openChainGroup(type),
        editGroup: () => {
          const g = sel().custom;
          if (g) this.openChainGroup(type, g.id);
        },
        delGroup: () => {
          const g = sel().custom;
          if (!g) return;
          deleteGroup(s, g.id);
          gid = 'all';
          toast(`🗑️ Gruppo "${g.name}" eliminato`, 'info');
        },
      },
      onClose: () => this.game.save(),
    });
  }

  /** Il manager sta ancora raccogliendo i dati: meno di 7 giornate dalla fine dell'ultimo resoconto o dall'ultimo cambio. */
  private reportWaiting(biz: Business) {
    const why = biz.statsWhy && (biz.week?.from ?? 0) === biz.statsFrom ? `<p class="muted small">🔄 La raccolta è ripartita dopo l'ultimo cambio (<b>${esc(biz.statsWhy)}</b>): i dati di prima non valgono più.</p>` : '';
    return `<div class="card center"><div class="hero"><div class="emoji">🧑‍💼</div></div>
      <p><b>Il manager deve raccogliere ulteriori informazioni prima di fornire un resoconto della settimana.</b></p>
      ${this.reportProgress(biz, false)}${why}
      <p><b>📋 ${this.partialWhen(biz)}</b></p>
      <p class="muted small">Il resoconto provvisorio si vede dal ${PARTIAL_DAYS}° giorno di raccolta e si aggiorna ogni sera alla chiusura (${BUSINESS.CLOSE_HOUR}:00); quello completo arriva quando le giornate raccolte sono ${REPORT_DAYS}: con la media della settimana, l'orario di punta, il personale e i consigli.</p></div>`;
  }

  /** Quando arriva il resoconto provvisorio (stasera, domani sera, tra N giorni). */
  private partialWhen(biz: Business) {
    const w = partialIn(this.s, biz);
    if (w === null) return '';
    const when = w === 0 ? 'stasera' : w === 1 ? 'domani sera' : `tra ${w} giorni`;
    return `Il resoconto provvisorio arriva ${when} alla chiusura (${BUSINESS.CLOSE_HOUR}:00).`;
  }

  /** Giornate raccolte per il prossimo resoconto (con la barra). */
  private reportProgress(biz: Business, next: boolean) {
    const done = Math.min(REPORT_DAYS, weekDays(this.s, biz));
    const shown = Math.floor(done * 10) / 10;
    return `<div class="report-prog"><span>${next ? 'Prossimo resoconto' : 'Giornate raccolte'}: <b>${fmtRate(shown)} di ${REPORT_DAYS}</b></span><div class="bar purple"><i style="width:${(done / REPORT_DAYS) * 100}%"></i></div></div>`;
  }

  /** Crea o modifica un gruppo della catena: nome e negozi (per zona o come preferisci). */
  private openChainGroup(type: BusinessType, groupId?: string) {
    const s = this.s;
    const old = (s.chainGroups ?? []).find((g) => g.id === groupId);
    const picked = new Set<string>(old?.bizIds ?? []);
    let name = old?.name ?? '';
    this.open({
      title: old ? '✏️ Modifica gruppo' : '＋ Nuovo gruppo',
      small: true,
      color: bizType(type).color,
      render: () => `<label class="small muted">Nome del gruppo</label>
        <input class="lb-input text-in" style="width:100%;box-sizing:border-box" data-c="name" maxlength="24" placeholder="Es. Centro, I più grandi…" value="${esc(name)}">
        <p class="small muted" style="margin:10px 0 4px">Negozi del gruppo</p>
        ${chainOf(s, type).map((b) => `<button class="card set-toggle" data-a="pick:${b.id}"><div style="flex:1;text-align:left"><b>${esc(lotDef(b.lotId).name)}</b><div class="muted small">📍 ${ZONES[lotZone[b.lotId]].name}</div></div><span class="switch ${picked.has(b.id) ? 'on' : ''}"><i></i></span></button>`).join('')}
        <div class="btnrow"><button class="btn sec" data-a="cancel">Annulla</button><button class="btn good" data-a="save" ${picked.size && name.trim() ? '' : 'disabled'}>Salva</button></div>`,
      actions: {
        name: () => (name = (this.modal?.querySelector('.text-in') as HTMLInputElement | null)?.value ?? name),
        pick: (id) => {
          name = (this.modal?.querySelector('.text-in') as HTMLInputElement | null)?.value ?? name;
          if (picked.has(id)) picked.delete(id);
          else picked.add(id);
        },
        cancel: () => this.goBack(),
        save: () => {
          name = (this.modal?.querySelector('.text-in') as HTMLInputElement | null)?.value ?? name;
          if (!name.trim() || !picked.size) return;
          const g = saveGroup(s, type, name.trim(), [...picked], old?.id);
          this.close();
          this.openChain(type, 'g:' + g.id);
        },
      },
    });
  }

  private bizTab(b: Business, tab: string): string {
    const s = this.s;
    const type = bizType(b.type);
    const service = type.kind === 'service';
    const lot = lotDef(b.lotId);
    const unit = service ? 'ordini' : 'clienti';
    if (type.kind === 'craft' && tab === 'panoramica') {
      const c = monthlyCosts(s, b);
      const lv = skillLevel(s, 'artigianato');
      return `<div class="grid2"><div class="stat s-green"><b class="money-t">${euro(b.today.revenue)}</b><span>💰 oggi · ${b.today.served} lavori</span></div>
          <div class="stat s-purple"><b class="money-t">${euro(b.month.revenue)}</b><span>📅 questo mese</span></div>
          <div class="stat s-orange"><b>${euro(c.rent + c.utilities)}</b><span>🏠 affitto e bollette al mese</span></div>
          <div class="stat s-yellow"><b>🎨 Liv. ${lv}</b><span>artigianato</span></div></div>
        <div class="card tint small" style="margin-top:10px">🛠️ Qui si lavora solo a mano: ogni giorno arrivano <b>lavori su richiesta</b> che fai tu in prima persona, pagati più dei lavoretti. Niente clienti al bancone e niente dipendenti. Più sale l'esperienza in artigianato, più i lavori sono difficili e pagati meglio. Migliorando il laboratorio si sbloccheranno nuovi tipi di lavoro.</div>`;
    }
    if (type.kind === 'craft' && tab === 'migliorie') {
      const jobs = CRAFT_JOBS.map((j) => `<div class="card row between"><span>${j.icon} <b>${j.name}</b><div class="muted small">${j.desc}</div></span>${j.ready ? '<span class="tag g">Sbloccato</span>' : '<span class="tag">🔜 In arrivo</span>'}</div>`).join('');
      return `<p class="muted small">Migliorando il laboratorio sbloccherai nuovi tipi di lavoro su richiesta. I prossimi sono in preparazione.</p>${jobs}`;
    }
    if (tab === 'lavori') {
      const list = specialOrders(s, b);
      const cards = list.map((o) => {
        const v = VASES[o.shape];
        const glaze = GLAZES.find((g) => g.color === o.glaze)?.name ?? '';
        const dots = [1, 2, 3, 4].map((i) => `<i class="${i <= v.diff ? 'on' : ''}"></i>`).join('');
        return `<div class="card special ${o.done ? 'done' : ''}"><div class="sp-pic">${vaseSvg(v.profile, o.glaze, { w: 64, h: 74 })}</div>
          <div class="sp-info"><b>${v.name}</b><div class="muted small">Smalto ${glaze} · ⏱ ${specialTime(o)} s</div>
            <div class="small sp-diff">Difficoltà <span class="dots">${dots}</span></div>
            <div class="sp-pay"><b class="money-t">${euro(o.reward)}</b> <span class="muted small">(⭐⭐⭐ ${euro(Math.round(o.reward * 1.35))})</span></div></div>
          ${o.done ? '<span class="tag g">✅ Consegnato</span>' : `<button class="btn sm good" data-a="special:${o.id}">🏺 Realizza</button>`}</div>`;
      }).join('');
      return `<div class="card tint small">🛠️ <b>Lavori su richiesta</b>: li fai tu, a mano, in prima persona, e pagano più dei lavoretti. <b>🏺 Vasi in ceramica</b>: prendi l'argilla, mettila sul tornio e modellala finché somiglia alla foto (dito verso il centro stringe, verso i lati allarga), falla essiccare, dipingila, incartala e lasciala sul ripiano delle consegne. Nuovi lavori ogni giorno; con l'esperienza diventano più difficili e pagati meglio.</div>${cards}`;
    }
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
      const cap = capacityAt(s, b, hourOf(s));
      const alone = service ? 'Fino ad allora gli ordini li esegui tu.' : 'Fino ad allora vende solo quando ci sei tu dentro.';
      return `
        <div class="card ${isAutonomous(b) ? '' : 'hl'}"><div class="row between"><h3>${isAutonomous(b) ? '✅' : '⚠️'} Stato</h3>${this.autoTag(b)}</div>
          ${missing.length ? `<p class="muted small" style="margin:0">Per farla lavorare da sola serve: <b>${missing.join(', ')}</b>. ${alone}</p>`
            : '<p class="muted small" style="margin:0">Lavora da sola anche quando sei altrove o offline.</p>'}
        </div>
        <div class="grid2">
          <div class="stat s-purple"><b>${dem.toFixed(2)}/h</b><span>🙋 ${unit} richiesti ora</span></div>
          <div class="stat"><b>${isAutonomous(b) ? cap.toFixed(2) + '/h' : '—'}</b><span>👥 capacità ora (chi è di turno)</span></div>
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
          // i prodotti che servono un ampliamento non ancora comprato non si mostrano
          .filter((p) => productLevel(b.type, p) <= upg(b, 'ampliamento'))
          .map((p) => {
            const pr = PRODUCTS[p];
            const on = b.products.includes(p);
            const d = productDemand(s, b, p);
            const season = pr.season[monthIndex(day(s))];
            const next = pr.season[(monthIndex(day(s)) + 1) % 12];
            const trend = next > season * 1.05 ? '📈' : next < season * 0.95 ? '📉' : '➡️';
            const f2 = (n: number) => n.toFixed(2).replace('.', ',');
            const need = productLevel(b.type, p);
            const locked = need > upg(b, 'ampliamento');
            const steps = hasInterior(b.type) ? (LAYOUTS[b.type].recipes[p]?.steps ?? []) : [];
            const path = steps.map((id) => LAYOUTS[b.type as keyof typeof LAYOUTS].stations.find((x) => x.id === id)?.icon).join(' → ');
            return `<div class="card" ${locked ? 'style="opacity:.6"' : ''}><div class="row between"><h3>${pr.icon} ${pr.name}</h3>
              ${locked ? `<span class="tag">🔒 Ampliamento ${need}</span>` : `<label class="toggle"><input type="checkbox" ${on ? 'checked' : ''} data-c="toggleProduct:${p}"> in vendita</label>`}</div>
              ${path ? `<div class="small muted">Lavorazione: ${path} → ${LAYOUTS[b.type as keyof typeof LAYOUTS].stations.find((x) => x.kind === 'counter')?.icon}</div>` : ''}
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
      // dipendenti divisi per mansione: prima i reparti che servono, poi quelli in più, infine il manager
      // i ruoli in più (magazziniere, cameriere) solo quando l'attività ha l'ampliamento che li rende utili:
      // le mansioni che non servono non si vedono proprio (né il reparto, né i candidati, né la spiegazione)
      const extras = hasInterior(b.type) ? EXTRA_ROLES.filter((x) => upg(b, 'ampliamento') >= x.level || b.staff.some((e) => e.role === x.role)) : [];
      const order: Role[] = [...(type.roles as Role[]), ...extras.map((x) => x.role), 'manager'];
      const needed = new Set<Role>([...(type.roles as Role[]), 'manager']);
      const group = (list: Employee[], card: (e: Employee) => string, empty: (r: Role) => string) =>
        order
          .map((r) => {
            const es = list.filter((e) => e.role === r);
            const none = empty(r);
            if (!es.length && !none) return '';
            return `<div class="role-group"><h4 class="role-title">${ROLES[r].icon} ${roleName(b.type, r)}${es.length ? ` <span class="tag">${es.length}</span>` : ''}</h4>${es.length ? es.map(card).join('') : none}</div>`;
          })
          .join('');
      const staff = group(
        b.staff,
        (e) => {
          const sh = shiftOf(s, b, e);
          // con almeno una stella è fidato: si può spostare in un'altra attività dove c'è lo stesso lavoro
          const targets = canMove(e) ? moveTargets(s, b, e) : [];
          const btns = `<div class="row emp-btns">${canMove(e) ? `<button class="btn sm sec" data-a="move:${e.id}">↔️ Sposta</button>` : ''}<button class="btn sm danger" data-a="fire:${e.id}">Licenzia</button></div>`;
          const move = this.moveOpen === e.id ? `<div class="emp-move"><b>↔️ Sposta ${esc(e.name.split(' ')[0])} in:</b>${targets.length
            ? targets.map((t) => `<button class="btn sm full" data-a="moveTo:${e.id}|${t.id}">${bizType(t.type).icon} ${esc(lotDef(t.lotId).name)} <span class="small">· ${roleName(t.type, e.role).toLowerCase()} già lì: ${t.staff.filter((x) => x.role === e.role).length}</span></button>`).join('')
            : `<span class="small">${e.role === 'manager' ? 'Le altre tue attività hanno già un manager.' : `Nessun'altra tua attività dove fa lo stesso lavoro (${roleName(b.type, e.role).toLowerCase()}).`}</span>`}</div>` : '';
          return this.empCard(e, b.type, btns, (e.trainingEnd ? ' · 🎓 in formazione' : sh ? ` · 🕐 turno ${sh.start}–${sh.end}` : ''), b.id, move);
        },
        (r) => (needed.has(r) ? `<p class="muted small role-empty">Nessuno${r === 'manager' ? ': senza manager l\'attività non lavora da sola' : ': serve almeno un dipendente qui'}</p>` : ''),
      );
      const cands = group(
        s.candidates.filter((e) => order.includes(e.role)),
        (e) => this.empCard(e, b.type, `<div class="row emp-btns">${hasInterior(b.type) && e.role !== 'manager' ? `<button class="btn sm purple" data-a="previewHire:${e.id}">👁️ Prova</button>` : ''}<button class="btn sm good" data-a="hire:${e.id}" ${e.role === 'manager' && hasManager(b) ? 'disabled' : ''}>Assumi</button></div>`),
        () => '',
      ) || '<p class="muted small">Nessun candidato per questa attività oggi.</p>';
      return `<p class="muted small">Serve almeno un dipendente per reparto (${type.roles.map((r) => roleName(b.type, r).toLowerCase()).join(', ')}) più un manager perché l'attività lavori senza di te. Più dipendenti nello stesso reparto = più ${unit} serviti.</p>
        <h3 class="sec-title">👥 Il tuo staff</h3>${staff}${hasInterior(b.type) ? `<div class="card tint small"><b>Aree del locale</b><br>🍳 <b>Cucina</b>: i cuochi preparano da zero e si dividono il lavoro; chi è libero fa il jolly.<br>💰 <b>Cassa</b>: i cassieri portano i pronti ai clienti e incassano.<br>${extras.map((x) => `${ROLES[x.role].icon} <b>${ROLES[x.role].name}</b>: ${x.desc}`).join('<br>')}</div>` : ''}
        <h3 class="sec-title">📝 Candidati di oggi</h3><p class="muted small" style="margin-top:-4px">Puoi assumere quanti dipendenti vuoi: più cuochi = più aiuto in cucina. Nuovi candidati ogni giorno.</p>${cands}
        <button class="btn sec full" data-a="reroll" ${s.money < 40 ? 'disabled' : ''}>🔄 Cerca altri candidati · €40</button>`;
    }
    // migliorie (l'ampliamento c'è solo per le attività con un interno)
    const kitchenOnly = ['ampliamento', 'fuochi', 'banco', 'ripiano'];
    return UPGRADE_IDS.filter((id) => !kitchenOnly.includes(id) || hasInterior(b.type)).map((id) => {
      const u = UPGRADES[id];
      const lvl = upg(b, id);
      const cost = u.cost(lvl);
      // fuochi e banchi extra hanno bisogno di spazio libero nel locale
      const noRoom = (id === 'fuochi' || id === 'banco') && hasInterior(b.type) &&
        extraRoom(b.type, Math.min(2, upg(b, 'ampliamento')), upg(b, 'fuochi'), upg(b, 'banco')) <= 0;
      const maxed = lvl >= u.max;
      const buyBtn = `<button class="btn sm full ${maxed ? 'sec' : 'blue'}" data-a="upgrade:${id}" ${maxed || (!noRoom && s.money < cost) ? 'disabled' : ''}>${maxed ? 'Massimo' : noRoom ? `📏 Niente spazio sul muro: amplia prima ${b.type === 'foodtruck' ? 'il furgone' : 'il locale'}` : 'Migliora · ' + euro(cost)}</button>`;
      // prova gratis prima di comprare (solo le migliorie che cambiano la cucina)
      const canTry = hasInterior(b.type) && PREVIEW_UPGRADES.includes(id) && !maxed && !noRoom;
      return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble">${u.icon}</div><h3 style="margin:0">${u.name}</h3></div><span class="tag">Liv. ${lvl}/${u.max}</span></div>
        <p class="muted small" style="margin:0 0 8px">${u.desc}${id === 'ampliamento' && !maxed ? `<br><b style="color:var(--ink)">Sblocca: ${this.expansionUnlocks(b, lvl + 1)}</b>` : ''}</p>
        ${canTry ? `<div class="btnrow upg-btns"><button class="btn sm purple" data-a="previewUpg:${id}">👁️ Prova</button>${buyBtn}</div>` : buyBtn}</div>`;
    }).join('');
  }

  /** Prova gratis di una miglioria: una copia del locale con un livello in più. */
  private previewUpgrade(b: Business, id: UpgradeId) {
    const s = this.s;
    const u = UPGRADES[id];
    const lvl = upg(b, id);
    const cur = () => s.businesses.find((x) => x.id === b.id);
    this.game.previewBusiness(b.id, (c) => {
      c.upgrades[id] = lvl + 1;
      // l'ampliamento sblocca prodotti nuovi: nella prova i clienti li ordinano già
      if (id === 'ampliamento' && hasInterior(c.type)) {
        const lay = LAYOUTS[c.type];
        for (const p of Object.keys(lay.recipes) as ProductId[]) if (lay.recipes[p]!.level === lvl + 1 && !c.products.includes(p)) c.products.push(p);
      }
    }, {
      what: `${u.icon} ${u.name} · Liv. ${lvl + 1}`,
      buyLabel: `Compra · ${euro(u.cost(lvl))}`,
      blocked: () => {
        const c = cur();
        if (!c || upg(c, id) !== lvl) return 'Già comprato';
        return s.money < u.cost(lvl) ? `Mancano ${euro(u.cost(lvl) - s.money)}` : null;
      },
      buy: () => {
        const c = cur();
        return !!c && buyUpgrade(s, c, id);
      },
    }, 'migliorie');
  }

  /** Prova gratis di un candidato: lavora nella copia del locale insieme allo staff attuale. */
  private previewHire(b: Business, candId: number) {
    const s = this.s;
    const e = s.candidates.find((x) => x.id === candId);
    if (!e) return;
    this.game.previewBusiness(b.id, (c) => c.staff.push({ ...e }), {
      what: `${ROLES[e.role].icon} ${esc(e.name)} · ${roleName(b.type, e.role)} · ${euro(e.salary)}/mese`,
      buyLabel: 'Assumi',
      blocked: () => (s.candidates.some((x) => x.id === candId) ? null : 'Non più disponibile'),
      buy: () => {
        const c = s.businesses.find((x) => x.id === b.id);
        if (!c) return false;
        const n = c.staff.length;
        hire(s, c, candId);
        return c.staff.length > n;
      },
    }, 'personale');
  }

  /** Cosa aggiunge un livello di ampliamento: postazioni e prodotti. */
  private expansionUnlocks(b: Business, level: number) {
    if (!hasInterior(b.type)) return '';
    const lay = LAYOUTS[b.type];
    const st = lay.stations.filter((x) => x.level === level).map((x) => `${x.icon} ${x.name}`);
    const pr = (Object.keys(lay.recipes) as ProductId[]).filter((p) => lay.recipes[p]!.level === level).map((p) => `${PRODUCTS[p].icon} ${PRODUCTS[p].name}`);
    return [...st, ...pr, 'stanza più grande', 'ordini più ricchi'].join(', ');
  }

  /**
   * Scheda di un dipendente: stelle (0–5) e livello (0–10), esperienza per il prossimo livello, valori
   * veri (crescono piano con livello e stelle) e, a livello 10, il corso di formazione per la stella.
   * `bizId`: è un tuo dipendente (si può mandare al corso).
   */
  /** dipendente di cui è aperta la scelta "Sposta in…" nel Personale */
  private moveOpen: number | null = null;

  private empCard(e: Employee, type: BusinessType, btn: string, extra = '', bizId?: string, after = '') {
    const r = ROLES[e.role];
    const stars = e.stars ?? 0;
    const st = (n: string, k: 'speed' | 'skill' | 'kindness') => {
      const v = empStat(e, k);
      return `<div class="small">${n} <b>${v.toFixed(1).replace('.', ',')}</b><div class="bar"><i style="width:${v * 10}%"></i></div></div>`;
    };
    const starRow = `<span class="emp-stars" aria-label="${stars} stelle">${'★'.repeat(stars)}<i>${'★'.repeat(MAX_STARS - stars)}</i></span>`;
    const complete = stars >= MAX_STARS && e.level >= MAX_LEVEL;
    const xpBar = complete || e.level >= MAX_LEVEL ? '' : `<div class="emp-xp small muted">Esperienza per il livello ${e.level + 1}<div class="bar green"><i style="width:${Math.min(100, (e.xp / xpForEmpLevel(e)) * 100)}%"></i></div></div>`;
    let train = '';
    if (bizId && e.trainingEnd) {
      const left = Math.max(0, e.trainingEnd - this.s.minutes);
      train = `<div class="emp-train on">🎓 Al corso di formazione: torna tra ${Math.ceil(left / 1440)} ${Math.ceil(left / 1440) === 1 ? 'giorno' : 'giorni'} con ${'★'.repeat(stars + 1)} (intanto non lavora)</div>`;
    } else if (bizId && canTrain(e)) {
      train = `<div class="emp-train">🎓 Livello 10: pronto per la ${stars + 1}ª stella. Torna a livello 0 ma lavora meglio e più in fretta
        <button class="btn sm purple full" data-a="train:${e.id}" ${this.s.money < trainingCost(e) ? 'disabled' : ''}>Corso di formazione · ${euro(trainingCost(e))} · ${trainingDays(e)} giorni</button></div>`;
    } else if (complete) {
      train = '<div class="emp-train done">🏆 Dipendente completo: 5 stelle e livello 10, tutto al massimo</div>';
    }
    return `<div class="card ${e.trainingEnd ? 'emp-away' : ''}"><div class="row between"><div><b>${r.icon} ${esc(e.name)}</b> ${starRow} <span class="tag">Liv. ${e.level}</span><div class="muted small">${roleName(type, e.role)} · ${euro(e.salary)}/mese${extra}</div></div>${btn}</div>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:6px">${st('Velocità', 'speed')}${st('Abilità', 'skill')}${st('Cortesia', 'kindness')}</div>${xpBar}${train}${after}</div>`;
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

  openSpecialResult(biz: Business, o: SpecialOrder, stars: number, pay: number, xp: number) {
    const v = VASES[o.shape];
    const st = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
    this.open({
      title: stars ? '🎉 Vaso consegnato!' : '😓 Ordine fallito',
      small: true,
      color: stars ? 'var(--green)' : 'var(--red)',
      render: () => `<div class="stars">${st}</div><div class="center">${vaseSvg(v.profile, o.glaze, { w: 70, h: 80 })}</div>
        <p class="center muted" style="margin-top:4px">${v.name} · ${bizType(biz.type).name}</p>
        ${stars ? `<div class="grid2"><div class="stat s-green"><b class="money-t">+${euro(pay)}</b><span>💰 ricompensa</span></div>
          <div class="stat s-purple"><b>+${xp} XP</b><span>🎨 artigianato</span></div></div>
          <p class="center muted small">${stars === 3 ? 'Forma perfetta e consegna veloce!' : 'Per 3 stelle: forma più vicina alla foto e meno tempo.'}</p>` : '<p class="center">Il cliente non ha avuto il suo vaso: ordine perso.</p>'}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  // ---------------- negozio ----------------

  /** Negozio: accesso veloce a concessionaria, agenzia immobiliare e stile del personaggio. */
  openShop() {
    const card = (a: string, icon: string, title: string, sub: string, color: string) =>
      `<button class="shop-card" data-a="${a}" style="--sc:${color}"><span class="shop-ico">${icon}</span><span><b>${title}</b><small>${sub}</small></span><span class="shop-go">›</span></button>`;
    this.open({
      money: true,
      title: '🛍️ Negozio',
      small: true,
      color: '#e84393',
      render: () => `
        ${card('dealer', '🛵', 'Concessionaria', 'Monopattini, scooter e auto per girare più in fretta', 'var(--blue)')}
        ${card('houses', '🏡', 'Agenzia immobiliare', 'Compra case: vivici o affittale per un\'entrata ogni giorno', 'var(--green)')}
        ${card('style', '👕', 'Stile e accessori', 'Cambia look: collane, cappelli, occhiali, zaini…', 'var(--purple)')}
`,
      actions: {
        dealer: () => {
          this.close();
          this.openDealer(true);
        },
        houses: () => {
          this.close();
          this.openRealEstate();
        },
        style: () => {
          this.close();
          this.openStyle();
        },
      },
    });
  }

  /** Agenzia immobiliare: case in vendita, le tue case (vivici, affittale, vendile). */
  openRealEstate() {
    const s = this.s;
    const g = this.game;
    this.open({
      money: true,
      title: '🏡 Agenzia immobiliare',
      color: 'var(--green)',
      live: true,
      render: () => {
        const rows = g.houseSlots.map((h, i) => {
          const own = s.houses.find((x) => x.i === i);
          const price = g.housePrice(i);
          const rent = g.houseRent(i);
          const zone = ZONES[h.zone].name;
          const rentable = canRent(s);
          const home = s.homeIdx === i;
          const state = !own ? '' : home ? '<span class="tag g">🏠 ci vivi</span>' : own.rent ? '<span class="tag y">🔑 in affitto</span>' : '<span class="tag b">tua, libera</span>';
          const btns = !own
            ? `<button class="btn sm good" data-a="buy:${i}" ${s.money < price ? 'disabled' : ''}>Compra ${euro(price)}</button>`
            : `${home ? '' : `<button class="btn sm" data-a="live:${i}">🏠 Vivi qui</button>`}
               ${home || !rentable ? '' : `<button class="btn sm ${own.rent ? 'sec' : 'blue'}" data-a="rent:${i}">${own.rent ? 'Togli dall\'affitto' : `🔑 Affitta +${euro(rent)}/ora`}</button>`}
               <button class="btn sm danger" data-a="sell:${i}">Vendi ${euro(Math.round(price * 0.85))}</button>`;
          return `<div class="card ${own ? 'hl' : ''}"><div class="row between"><div><h3 style="margin:0">🏡 Casa ${i + 1} ${state}</h3><div class="muted small">${zone} · affitto ${euro(rent)} all'ora mentre sei offline</div></div>
            <button class="btn sm sec" data-a="map:${i}" aria-label="Mostra sulla mappa">📍</button></div>
            <div class="row" style="justify-content:flex-end;gap:6px;margin-top:8px;flex-wrap:wrap">${btns}</div></div>`;
        }).join('');
        const tot = canRent(s) ? s.houses.filter((x) => x.rent).reduce((a, x) => a + g.houseRent(x.i), 0) : 0;
        return `<div class="card tint small">Compra una casa per <b>viverci</b> (il pulsante 🏠 Casa ti porta lì e lì dormi). Con <b>almeno 2 case</b> (conta anche quella di partenza) puoi <b>affittare</b> quelle dove non vivi: l'affitto si guadagna <b>solo mentre il gioco è chiuso</b> (fino a ${RENT_MAX_HOURS} ore). Rivendendola recuperi l'85% del prezzo.</div>
          ${tot ? `<div class="stat s-green" style="margin-bottom:10px"><b class="money-t">+${euro(tot)}/ora</b><span>🔑 affitti mentre sei offline</span></div>` : ''}

          ${s.homeIdx >= 0 ? '<button class="btn sm sec" data-a="live:-1" style="margin-bottom:10px">🏠 Torna a vivere nella casa di partenza</button>' : ''}${rows}`;
      },
      actions: {
        buy: (a) => {
          const i = +a;
          const price = g.housePrice(i);
          if (s.houses.some((x) => x.i === i) || s.money < price) return;
          addMoney(s, -price);
          s.houses.push({ i, rent: false, price });
          toast(`🏡 Hai comprato la casa ${i + 1}!`, 'good');
          g.refreshHomes();
          g.save();
        },
        live: (a) => {
          const i = +a;
          s.homeIdx = i;
          const own = s.houses.find((x) => x.i === i);
          if (own) own.rent = false;
          toast(i >= 0 ? `🏠 Ora vivi nella casa ${i + 1}` : '🏠 Sei tornato nella casa di partenza', 'good');
          g.refreshHomes();
          g.save();
        },
        rent: (a) => {
          const own = s.houses.find((x) => x.i === +a);
          if (!own || s.homeIdx === own.i || !canRent(s)) return;
          own.rent = !own.rent;
          g.refreshHomes();
          g.save();
        },
        sell: (a) => {
          const i = +a;
          if (!s.houses.some((x) => x.i === i)) return;
          s.houses = s.houses.filter((x) => x.i !== i);
          if (s.homeIdx === i) s.homeIdx = -1;
          // con una casa sola non si affitta più
          if (!canRent(s)) for (const h of s.houses) h.rent = false;
          const back = Math.round(g.housePrice(i) * 0.85);
          addMoney(s, back);
          toast(`💰 Casa ${i + 1} venduta: +${euro(back)}`, 'money');
          g.refreshHomes();
          g.save();
        },
        map: (a) => {
          const h = g.houseSlots[+a];
          g.setWaypoint({ id: 'house:' + a, x: h.pos.x, z: h.pos.z, icon: '🏡', label: `Casa ${+a + 1}`, color: '#35c46a', kind: 'home', cat: 'places', dist: 0 });
          toast('📍 Segui le frecce fino alla casa', 'good');
          this.close();
        },
      },
    });
  }

  /** Stile del personaggio (modello) e accessori: si comprano una volta, poi si indossano quando vuoi. */
  openStyle() {
    const s = this.s;
    const st = s.style;
    const apply = () => {
      this.game.applyStyle();
      this.game.save();
    };
    this.open({
      money: true,
      title: '👕 Stile e accessori',
      color: 'var(--purple)',
      render: () => {
        const styles = STYLES.map((d) => {
          const own = st.owned.includes(d.id);
          const on = st.model === d.id;
          return `<button class="st-opt ${on ? 'on' : ''}" data-a="${own ? 'wear' : 'buys'}:${d.id}" ${!own && s.money < d.price ? 'disabled' : ''}>
            <span class="st-ico">${d.id.includes('female') ? '👩' : '🧑'}</span><b>${d.name}</b><small>${on ? '✅ indossato' : own ? 'Indossa' : euro(d.price)}</small></button>`;
        }).join('');
        const slots = (Object.keys(ACC_SLOT_NAME) as AccSlot[]).map((slot) => {
          const items = ACCESSORIES.filter((a) => a.slot === slot).map((a) => {
            const own = st.accOwned.includes(a.id);
            const on = st.acc.includes(a.id);
            return `<button class="st-opt ${on ? 'on' : ''}" data-a="${own ? 'toggle' : 'buya'}:${a.id}" ${!own && s.money < a.price ? 'disabled' : ''}>
              <span class="st-ico">${a.icon}</span><b>${a.name}</b><small>${on ? '✅ indossato' : own ? 'Indossa' : euro(a.price)}</small></button>`;
          }).join('');
          return `<h4 class="lg-h">${ACC_SLOT_NAME[slot]}</h4><div class="st-grid">${items}</div>`;
        }).join('');
        return `<div class="card tint small">Quello che compri resta tuo in questa partita: puoi cambiare quando vuoi.</div>
          <h4 class="lg-h">Stile</h4><div class="st-grid">${styles}</div>${slots}`;
      },
      actions: {
        buys: (id) => {
          const d = STYLES.find((x) => x.id === id);
          if (!d || st.owned.includes(id) || s.money < d.price) return;
          addMoney(s, -d.price);
          st.owned.push(id);
          st.model = id;
          toast(`👕 Nuovo stile: ${d.name}!`, 'good');
          apply();
        },
        wear: (id) => {
          st.model = id;
          apply();
        },
        buya: (id) => {
          const a = accById(id);
          if (!a || st.accOwned.includes(id) || s.money < a.price) return;
          addMoney(s, -a.price);
          st.accOwned.push(id);
          st.acc = [...st.acc.filter((x) => accById(x)?.slot !== a.slot), id];
          toast(`${a.icon} Hai comprato: ${a.name}!`, 'good');
          apply();
        },
        toggle: (id) => {
          const a = accById(id);
          if (!a) return;
          // un accessorio per parte del corpo
          st.acc = st.acc.includes(id) ? st.acc.filter((x) => x !== id) : [...st.acc.filter((x) => accById(x)?.slot !== a.slot), id];
          apply();
        },
      },
    });
  }

  // ---------------- veicoli ----------------

  openDealer(canBuy = true) {
    const s = this.s;
    this.open({
      money: true,
      title: '🛵 Concessionaria',
      color: 'var(--blue)',
      render: () => `${canBuy ? '' : '<div class="card tint small">🛵 Per comprare vai alla <b>concessionaria</b> in centro.</div>'}<p class="muted small">Con un veicolo attraversi la città molto più in fretta. Le auto hanno assicurazione e bollo da pagare ogni mese. Il pulsante <b>🛵</b> sopra quello giallo ti fa salire e scendere.</p>` +
        VEHICLE_IDS.map((id) => {
          const v = VEHICLES[id];
          const owned = s.vehicles.includes(id);
          const using = s.riding === id;
          const pct = Math.round((v.speed / WALK_SPEED) * 100 - 100);
          const btn = owned
            ? `<button class="btn sm ${using ? 'sec' : 'blue'}" data-a="use:${id}" ${using ? 'disabled' : ''}>${using ? 'In uso' : 'Usa'}</button>`
            : `<button class="btn sm good" data-a="buyv:${id}" ${s.money < v.price || !canBuy ? 'disabled' : ''}>Compra ${euro(v.price)}</button>`;
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
        const card = (m: Mission) => {
            const done = m.progress >= m.target;
            return `<div class="card ${done && !m.claimed ? 'hl' : ''}"><div class="row between"><b style="flex:1">${m.text}</b>${
              m.claimed ? '<span class="tag g">Riscossa</span>' : done ? `<button class="btn sm good" data-a="claim:${m.id}">Riscuoti</button>` : ''
            }</div>
            <div class="bar green"><i style="width:${(m.progress / m.target) * 100}%"></i></div>
            ${m.kind === 'variety' ? `<div class="small muted" style="margin-top:4px">Fatti: ${JOB_TYPES.map((t) => { const n = m.types?.filter((x) => x === t).length ?? 0; return `<span style="opacity:${n ? 1 : 0.35}">${JOBS[t].icon} ${n}/3</span>`; }).join(' · ')}</div>` : ''}
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(m.progress)}/${m.target}</span><span>Premio ${euro(m.reward)} · +${m.fame.toFixed(0)} fama ${SKILLS[m.fameSkill].icon}</span></div></div>`;
        };
        const ms = s.missions.map(card).join('');
        const left = weeklyDaysLeft(s);
        const wk = (s.weekly ?? []).map(card).join('');
        const today = day(s);
        const evs = [0, 1, 2].map((k) => this.dayCard(today + k, false)).join('');
        const prods = (Object.keys(PRODUCTS) as ProductId[])
          .map((p) => {
            const d = marketDemand(s, p, 'periferia');
            return `<div class="row between small"><span>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span>${demandBars(d, 2.4)}</div>`;
          })
          .join('');
        return `<h3 class="sec-title">🎯 Missioni di oggi</h3><p class="muted small" style="margin-top:-4px">Cambiano ogni giorno. Le ricompense crescono con la tua fama. I premi delle missioni non contano per "Guadagna".</p>${ms}
          <h3 class="sec-title">🗓️ Missioni della settimana</h3><p class="muted small" style="margin-top:-4px">Più lunghe, con premi più ricchi. ${left > 1 ? `Restano ${left} giorni` : 'Ultimo giorno'}.</p>${wk}
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
          const m = [...s.missions, ...(s.weekly ?? [])].find((x) => x.id === id);
          if (!m || m.claimed || m.progress < m.target) return;
          m.claimed = true;
          addMoney(s, m.reward, 'missione', true);
          playStats(s).missions++;
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

  openMap(focusId?: string) {
    this.mapScreen.open(focusId);
  }

  /** "Dettagli" dalla mappa: apre la scheda giusta senza poter comprare a distanza. */
  private openFromMap(m: MapMarker) {
    if (m.kind === 'lot' || m.kind === 'biz') {
      const lotId = m.id.slice(4);
      const biz = bizAtLot(this.s, lotId);
      if (biz) this.openBusiness(biz.id);
      else this.openLotInfo(lotId);
    } else if (m.kind === 'dealer') this.openDealer(false);
    else if (m.kind === 'agency') this.openAgency('compra', false);
    else if (m.kind === 'board') this.openMissions();
  }

  openLotInfo(lotId: string) {
    this.open({
      title: `🏷️ ${lotDef(lotId).name}`,
      color: 'var(--red)',
      render: () => this.lotCard(lotId, false),
      actions: {},
    });
  }

  // ---------------- profilo ----------------

  openProfile() {
    const s = this.s;
    void this.game.refreshFriendRequests();
    this.open({
      title: '👤 Profilo',
      live: true,
      color: 'var(--blue)',
      render: () => {
        const st = playStats(s);
        const req = this.game.friendRequests.length;
        const btn = (a: string, icon: string, name: string, badge = 0) =>
          `<button class="prof-btn" data-a="${a}"><span class="i">${icon}</span><span class="l">${name}</span>${badge ? `<span class="dot">${badge}</span>` : ''}</button>`;
        return `<div class="card hero tint prof-hero"><div class="emoji">${logoImg(s.logo, 72)}</div>
            <div class="prof-name"><b>${esc(lbNickname() || 'Senza nome')}</b><button class="btn sm sec" data-a="name" aria-label="Cambia nome">✏️</button></div>
            <div class="big">${rank(s)}</div><div class="muted small">⭐ Fama ${totalFame(s).toFixed(1)} · Livello totale ${totalLevel(s)}</div></div>
          <div class="prof-bar">${btn('stats', '📊', 'Statistiche')}${btn('friends', '👥', 'Amici', req)}${btn('skills', '⭐', 'Esperienza')}${btn('boards', '🏆', 'Classifiche')}${btn('logo', '🎨', 'Logo')}</div>
          <div class="grid2"><div class="stat s-green"><b class="money-t">${euro(s.totalEarned)}</b><span>💰 guadagnato in totale</span></div>
          <div class="stat s-yellow"><b class="money-t">${perSec(moneyPerSecond(s))}</b><span>⏱️ dalle attività autonome</span></div>
          <div class="stat s-orange"><b>${s.businesses.length}</b><span>🏢 attività</span></div>
          <div class="stat s-purple"><b>${st.jobs}</b><span>🧰 lavoretti fatti</span></div></div>`;
      },
      actions: {
        stats: () => this.openStats(),
        friends: () => this.openFriends(),
        skills: () => this.openSkills(),
        boards: () => this.openLeaderboard(),
        logo: () => this.openLogoEditor(),
        name: () => this.openNameEditor(),
      },
    });
  }

  /** Nome con cui compari in classifica e sulla mappa degli amici. */
  openNameEditor() {
    this.open({
      title: '✏️ Il tuo nome',
      small: true,
      color: 'var(--blue)',
      render: () => `<p class="muted small">Il nome con cui compari nelle classifiche e sulla mappa dei tuoi amici.</p>
        <input class="lb-input" maxlength="${MAX_NICK}" placeholder="Il tuo nome" value="${esc(lbNickname())}">
        <button class="btn good full" data-a="save" style="margin-top:10px">✅ Salva il nome</button>`,
      actions: {
        save: () => {
          const v = (this.modal?.querySelector('.lb-input') as HTMLInputElement | null)?.value ?? '';
          if (!setLbNickname(v)) {
            this.toast('✏️ Scrivi un nome');
            return;
          }
          void submitScore(this.s, true);
          this.toast('✅ Nome salvato', 'good');
          if (this.panel?.back) this.goBack();
          else this.close();
        },
      },
    });
  }

  /** Statistiche della partita: soldi, lavoretti, attività (una per una). */
  openStats() {
    const s = this.s;
    this.open({
      title: '📊 Statistiche',
      live: true,
      color: 'var(--blue)',
      render: () => {
        const st = playStats(s);
        const h = Math.floor(st.playSec / 3600);
        const m = Math.floor((st.playSec % 3600) / 60);
        const row = (k: string, v: string) => `<div class="row between small st-row"><span>${k}</span><b>${v}</b></div>`;
        const monthly = s.businesses.filter(isAutonomous).reduce((a, b) => a + estimateMonthlyProfit(s, b), 0);
        const byType = JOB_TYPES.map((t) => `<span class="st-chip">${JOBS[t].icon} ${st.jobsByType[t] ?? 0}</span>`).join('');
        const bizs = s.businesses.map((b) => {
          const def = bizType(b.type);
          return `<div class="card"><div class="row between"><b>${def.icon} ${def.name}</b>${this.autoTag(b)}</div>
            <div class="muted small" style="margin-bottom:4px">${lotDef(b.lotId).name} · ${b.staff.length} dipendenti</div>
            ${row('Incasso totale', euro(b.totalRevenue))}${row('Incasso del mese', euro(b.month.revenue))}${row('Oggi', `${euro(b.today.revenue)} · ${b.today.served} serviti · ${b.today.lost} persi`)}
            ${isAutonomous(b) ? row('Utile stimato al mese', euro(estimateMonthlyProfit(s, b))) : ''}</div>`;
        }).join('');
        return `<div class="card"><h3>🎮 Partita</h3>
            ${row('Giorni di gioco', String(day(s) - st.startDay + 1))}${row('Tempo giocato', `${h} h ${m} min`)}
            ${row('Rango', rank(s))}${row('Fama totale', `⭐ ${totalFame(s).toFixed(1)}`)}${row('Livello totale', String(totalLevel(s)))}${row('Missioni completate', String(st.missions))}</div>
          <div class="card"><h3>💰 Soldi</h3>
            ${row('Soldi adesso', euro(s.money))}${row('Guadagnato in totale', euro(s.totalEarned))}${row('Guadagnato oggi', euro(s.todayEarned))}
            ${row('Miglior giornata', euro(st.bestDay))}${row('Al secondo (attività autonome)', perSec(moneyPerSecond(s)))}${row('Utile stimato al mese', euro(monthly))}</div>
          <div class="card"><h3>🧰 Lavoretti</h3>
            ${row('Completati', String(st.jobs))}${row('Con 3 stelle', String(st.jobs3))}${row('Falliti', String(st.jobsFailed))}
            <div class="st-chips">${byType}</div></div>
          <div class="card"><h3>🏢 Attività</h3>
            ${row('Aperte in tutto', String(st.bizOpened))}${row('Attive adesso', String(s.businesses.length))}${row('Autonome', String(s.businesses.filter(isAutonomous).length))}
            ${row('Fallite', String(st.bizFailed))}${row('Clienti serviti di persona', String(st.served))}${row('Ordini a domicilio eseguiti', String(st.orders))}</div>
          ${bizs ? `<h3 class="sec-title">🏪 Le tue attività</h3>${bizs}` : ''}`;
      },
      actions: {},
    });
  }

  /** Esperienza e fama di ogni campo. */
  openSkills() {
    const s = this.s;
    this.open({
      title: '⭐ Esperienza e fama',
      live: true,
      color: 'var(--purple)',
      render: () => {
        const skills = SKILL_IDS.map((k) => {
          const lvl = skillLevel(s, k);
          const x = sectorXp(s, k);
          const a = LEVEL.xpForLevel(lvl);
          const b = LEVEL.xpForLevel(lvl + 1);
          const f = s.fame[k];
          const bonus = Math.round((f / (f + 150)) * 100);
          // le linee di lavoro del settore: livello, lavoro di adesso e prossima evoluzione
          const lines = linesOf(k).map((l) => {
            const ll = lineLevel(s, l.id);
            const step = Math.floor(ll / EVOLVE_EVERY);
            const now = l.ladder[Math.min(step, l.ladder.length - 1)];
            const next = l.ladder[step + 1];
            return `<div class="career-line"><span class="cl-ico">${l.icon}</span><span class="cl-txt"><b>${l.name}</b> · Liv. ${ll}<small>Ora: ${now}${next ? ` · dal Liv. ${(step + 1) * EVOLVE_EVERY}: ${next}` : ''}</small></span></div>`;
          }).join('');
          const biz = s.xp[k] > 0 ? `<div class="career-line"><span class="cl-ico">🏪</span><span class="cl-txt"><b>Lavoro nelle attività</b><small>${Math.floor(s.xp[k])} XP</small></span></div>` : '';
          return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble">${SKILLS[k].icon}</div><h3 style="margin:0">${SKILLS[k].name}</h3></div><span class="tag y">Liv. ${lvl}</span></div>
            <div class="bar purple"><i style="width:${((x - a) / (b - a)) * 100}%"></i></div>
            <div class="row between small muted" style="margin-top:4px"><span>${Math.floor(x - a)}/${b - a} XP</span><span>Fama ${f.toFixed(1)} · +${bonus}% domanda</span></div>
            ${lines || biz ? `<div class="career-lines">${lines}${biz}</div>` : ''}</div>`;
        }).join('');
        return `<p class="muted small">Ogni settore raccoglie i suoi lavori: il livello del settore è la somma dell'esperienza di tutti i suoi lavori (e del lavoro nelle tue attività). Ogni lavoro ha il suo livello e ogni ${EVOLVE_EVERY} livelli si evolve in un lavoro più complesso. La fama sale anche quando lavorano i tuoi dipendenti, ma molto più piano: più fama = più clienti e offerte più ricche.</p>${skills}`;
      },
      actions: {},
    });
  }

  /** Amici in ordine di fama, richieste di amicizia ricevute e tendina per invitarne di nuovi. */
  openFriends() {
    const s = this.s;
    let friends: { entries: FriendEntry[]; missing: string[] } | null = null;
    let state: 'loading' | 'ok' | 'error' = 'loading';
    let invite = false;
    let panel: Panel;
    const load = async () => {
      state = 'loading';
      if (this.panel === panel) this.renderPanel();
      await submitScore(s, true);
      const [f] = await Promise.all([fetchFriends(), this.game.refreshFriendRequests()]);
      friends = f;
      state = f ? 'ok' : 'error';
      void this.game.refreshFriends();
      if (this.panel === panel) this.renderPanel();
    };
    panel = {
      title: '👥 Amici',
      color: '#5b4bb7',
      render: () => {
        const code = friendCode();
        const inv = `<button class="btn ${invite ? 'sec' : 'purple'} full" data-a="invite">${invite ? '▲ Chiudi' : '➕ Invita nuovi amici'}</button>
          ${invite ? `<div class="card fr-drop"><div class="row between"><span><small class="muted">Il tuo codice amico</small><br><b class="fr-code">${code}</b></span>
              <span class="row"><button class="btn sm sec" data-a="copy">📋 Copia</button><button class="btn sm blue" data-a="share">📤 Invia</button></span></div>
            <div class="row" style="margin-top:8px;gap:6px"><input class="lb-input fr-input" maxlength="7" placeholder="Codice di un amico" style="flex:1;font-size:16px;padding:9px 12px"><button class="btn sm good" data-a="addf">➕ Aggiungi</button></div>
            <small class="muted">Quando aggiungi qualcuno, gli arriva una richiesta: può ricambiare con un tocco, senza mandarti il suo codice.</small></div>` : ''}`;
        const reqs = this.game.friendRequests;
        const reqHtml = reqs.length ? `<h3 class="sec-title">📨 Richieste di amicizia (${reqs.length})</h3>` + reqs.map((r) =>
          `<div class="lb-row">${logoImg(r.logo, 34) || '<span class="logo-img empty"></span>'}<span class="lb-name"><b>${esc(r.nickname)}</b><small>${esc(r.title)} · ⭐ ${r.fame.toFixed(1)}</small></span>
            <button class="btn sm good" data-a="acc:${r.code}">✅ Accetta</button><button class="lb-x" data-a="rej:${r.code}" aria-label="Rifiuta">✕</button></div>`).join('') : '';
        let list: string;
        if (state === 'loading') list = `<p class="center muted">⏳ Caricamento…<br><small>Il server a volte impiega fino a un minuto a svegliarsi.</small></p>`;
        else if (state === 'error' || !friends) list = `<p class="center muted">📡 Amici non raggiungibili. Controlla la connessione.</p><button class="btn full" data-a="reload">🔄 Riprova</button>`;
        else {
          const f = friends as { entries: FriendEntry[]; missing: string[] };
          const others = f.entries.filter((e) => !e.me);
          list = (others.length ? '' : `<p class="center muted">Non hai ancora amici: tocca <b>➕ Invita nuovi amici</b> e manda il tuo codice!</p>`) +
            f.entries.map((e, i) => {
              const medal = ['🥇', '🥈', '🥉'][i] ?? `<b>${i + 1}</b>`;
              return `<button class="lb-row lb-btn ${e.me ? 'me' : ''}" ${e.me ? '' : `data-a="fp:${e.code}"`}><span class="lb-pos">${medal}</span>${logoImg(e.logo, 34) || '<span class="logo-img empty"></span>'}
                <span class="lb-name"><b>${esc(e.nickname)}${e.me ? ' (tu)' : ''}</b><small>${e.online ? '🟢 sta giocando · ' : ''}${esc(e.title)}</small></span>
                <span class="lb-fame">⭐ ${e.fame.toFixed(1)}</span>${e.me ? '' : '<span class="lb-go">›</span>'}</button>`;
            }).join('') +
            f.missing.map((c) => `<div class="lb-row"><span class="lb-pos">⏳</span><span class="lb-name"><b>${c}</b><small>Nessun giocatore con questo codice (ancora)</small></span><button class="lb-x" data-a="rmf:${c}">✕</button></div>`).join('');
        }
        return `${inv}${reqHtml}<h3 class="sec-title">⭐ I tuoi amici per fama</h3>${list}${state === 'loading' ? '' : '<button class="btn sec full" data-a="reload" style="margin-top:10px">🔄 Aggiorna</button>'}`;
      },
      actions: {
        invite: () => (invite = !invite),
        reload: () => void load(),
        copy: () => {
          void navigator.clipboard?.writeText(friendCode()).then(() => this.toast('📋 Codice copiato', 'good'), () => this.toast(`Il tuo codice: ${friendCode()}`));
        },
        share: () => {
          const text = `Giochiamo a Hustle Idle! Aggiungimi con il mio codice amico: ${friendCode()} 👉 https://alfa40.github.io/hustle-idle/`;
          if (navigator.share) void navigator.share({ text }).catch(() => {});
          else void navigator.clipboard?.writeText(text).then(() => this.toast('📋 Messaggio copiato', 'good'));
        },
        addf: () => {
          const raw = (this.modal?.querySelector('.fr-input') as HTMLInputElement | null)?.value ?? '';
          const err = addFriend(raw);
          if (err) {
            this.toast(err, 'bad');
            return;
          }
          const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
          void sendFriendRequest(code).then((r) => {
            if (r === 'missing') this.toast('❔ Nessun giocatore con questo codice (ancora)', 'bad');
          });
          this.toast('👥 Amico aggiunto: gli è arrivata la tua richiesta', 'good');
          invite = false;
          void load();
        },
        acc: (c) => {
          void answerFriendRequest(c, true).then(() => load());
          this.game.friendRequests = this.game.friendRequests.filter((r) => r.code !== c);
          this.toast('🤝 Ora siete amici', 'good');
        },
        rej: (c) => {
          void answerFriendRequest(c, false);
          this.game.friendRequests = this.game.friendRequests.filter((r) => r.code !== c);
        },
        rmf: (c) => {
          removeFriend(c);
          void load();
        },
        fp: (c) => {
          const e = friends?.entries.find((x) => x.code === c);
          if (e) this.openFriendProfile(e, () => void load());
        },
      },
    };
    this.open(panel);
    void load();
  }

  /** Anteprima del profilo di un amico: le sue statistiche principali e le sue attività. */
  openFriendProfile(f: FriendEntry, onRemoved?: () => void) {
    const st = f.stats ?? {};
    const n = (v?: number) => (v ?? 0).toLocaleString('it-IT');
    this.open({
      title: `👤 ${f.nickname}`,
      small: true,
      color: '#5b4bb7',
      render: () => `<div class="lg-preview">${logoImg(f.logo, 90) || ''}<div><b>${esc(f.nickname)}</b><small>${esc(f.title)} · ⭐ ${f.fame.toFixed(1)}</small><br><small>${f.online ? '🟢 Sta giocando adesso' : '💤 Non sta giocando'}</small></div></div>
        <div class="grid2">
          <div class="stat s-green"><b class="money-t">${euro(f.money)}</b><span>💰 guadagnato</span></div>
          <div class="stat s-yellow"><b class="money-t">${perSec(st.perSec ?? 0)}</b><span>⏱️ dalle attività</span></div>
          <div class="stat s-purple"><b>${n(st.jobs)}</b><span>🧰 lavoretti (${n(st.jobs3)} con ⭐⭐⭐)</span></div>
          <div class="stat s-orange"><b>${f.bizs.length}</b><span>🏢 attività</span></div>
          <div class="stat"><b>${n(st.served)}</b><span>🍔 clienti serviti</span></div>
          <div class="stat"><b>${st.level ?? '—'}</b><span>📈 livello totale</span></div>
        </div>
        ${f.bizs.length ? `<p class="small" style="margin:10px 0 0">${f.bizs.map((b) => `<span class="st-chip">${BUSINESS_TYPES[b.type as BusinessType]?.icon ?? '🏢'} ${BUSINESS_TYPES[b.type as BusinessType]?.name ?? b.type}</span>`).join(' ')}</p>` : ''}
        ${st.days ? `<p class="muted small center" style="margin:10px 0 0">In gioco da ${st.days} giorni · ${Math.round((st.playSec ?? 0) / 3600)} ore giocate</p>` : ''}
        <div style="margin-top:12px"><button class="btn danger full" data-a="rm">🗑️ Togli dagli amici</button></div>`,
      actions: {
        rm: () => {
          removeFriend(f.code);
          this.toast(`${f.nickname} tolto dagli amici`);
          onRemoved?.();
          if (this.panel?.back) this.goBack();
          else this.close();
        },
      },
    });
  }

  // ---------------- logo ----------------

  /**
   * Schermata per creare il logo delle attività di questa partita (e il nome del giocatore).
   * Il logo può essere disegnato (forma, colori, simbolo, iniziali) oppure una foto
   * caricata dal telefono, ritagliata e ritoccata dentro la forma scelta.
   */
  /** ritocchi di ogni foto usata come logo (per ritoccarla di nuovo dall'originale) */
  private photoEdits = new Map<string, PhotoEdit>();

  /** Nome e logo non ancora scelti: si chiedono (a ogni avvio finché non si sceglie). */
  needsIdentity() {
    return !lbNickname() || !this.s.logoChosen;
  }

  openLogoEditor(required = false) {
    const s = this.s;
    let draft: Logo = { ...s.logo };
    let mode: 'logo' | 'photo' = 'logo';
    let edit: PhotoEdit | null = null;
    // schermata scelta nella barra in alto: crea il logo da zero, oppure foto
    let tab: 'crea' | 'foto' = s.logo.photo ? 'foto' : 'crea';
    const read = (cls: string) => (this.modal?.querySelector(cls) as HTMLInputElement | null)?.value ?? '';
    const swatches = (key: string, cur: string) =>
      `<div class="lg-row">${LOGO_COLORS.map((c) => `<button class="lg-sw ${c === cur ? 'on' : ''}" style="background:${c}" data-a="${key}:${c}"></button>`).join('')}</div>`;
    const slider = (k: keyof PhotoEdit, name: string, min: number, max: number, v: number) =>
      `<label class="ph-sl"><span>${name}</span><input type="range" min="${min}" max="${max}" value="${v}" data-k="${k}"></label>`;
    const startEdit = (src: string, revoke = false) => {
      const img = new Image();
      img.onload = () => {
        if (revoke) URL.revokeObjectURL(src);
        // le foto del telefono sono enormi: si rimpiccioliscono una volta sola (il trascinamento resta fluido)
        edit = newPhotoEdit(shrinkImage(img, 1024));
        mode = 'photo';
        tab = 'foto';
        if (this.panel === panel) this.renderPanel();
      };
      img.onerror = () => this.toast('Non riesco ad aprire questa foto', 'bad');
      img.src = src;
    };
    // campo "scegli foto" fisso nella pagina: se stesse nel pannello verrebbe tolto quando
    // il pannello si ridisegna e su iPhone la foto scelta andrebbe persa
    const picker = photoPicker();
    picker.onchange = () => {
      const f = picker.files?.[0];
      picker.value = ''; // così si può scegliere di nuovo la stessa foto
      if (f && this.panel === panel) startEdit(URL.createObjectURL(f), true);
    };
    const drawPreview = (body: HTMLElement) => {
      if (!edit) return;
      const ph = renderPhoto(edit, 320);
      // editor grande e anteprima piccola accanto al nome
      for (const cv of body.querySelectorAll<HTMLCanvasElement>('.ph-canvas, .ph-mini')) drawLogo(cv.getContext('2d')!, draft, cv.width, ph);
    };
    const panel: Panel = {
      title: required ? '👋 Scegli nome e logo' : '🎨 Il tuo logo',
      color: 'var(--purple)',
      locked: required,
      after: (body) => {
        if (tab !== 'foto' || mode !== 'photo' || !edit) return;
        drawPreview(body);
        // cursori: anteprima dal vivo, senza ridisegnare il pannello
        body.querySelectorAll<HTMLInputElement>('.ph-sl input').forEach((inp) =>
          inp.addEventListener('input', () => {
            const e = edit!;
            const k = inp.dataset.k as 'zoom' | 'bright' | 'contrast' | 'sat';
            e[k] = k === 'zoom' ? +inp.value / 100 : +inp.value;
            drawPreview(body);
          }),
        );
        // trascinare col dito sposta la foto dentro la forma
        const cv = body.querySelector('.ph-canvas') as HTMLCanvasElement;
        let last: { x: number; y: number } | null = null;
        cv.addEventListener('pointerdown', (ev) => {
          last = { x: ev.clientX, y: ev.clientY };
          cv.setPointerCapture(ev.pointerId);
        });
        cv.addEventListener('pointermove', (ev) => {
          if (!last || !edit) return;
          const size = cv.getBoundingClientRect().width;
          edit.ox += (ev.clientX - last.x) / size;
          edit.oy += (ev.clientY - last.y) / size;
          last = { x: ev.clientX, y: ev.clientY };
          drawPreview(body);
        });
        const up = () => (last = null);
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);
      },
      render: () => {
        // barra in alto con le due schermate
        const tabs = `<div class="tabs">${([['crea', '🎨 Crea logo'], ['foto', '📷 Foto']] as const)
          .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        const shapes = `<div class="lg-row">${LOGO_SHAPES.map((k) => `<button class="lg-opt ${draft.shape === k ? 'on' : ''}" data-a="shape:${k}">${SHAPE_ICON[k]}<small>${k}</small></button>`).join('')}</div>`;
        const editing = tab === 'foto' && mode === 'photo' && !!edit;
        // anteprima e nome: in verticale sopra, in orizzontale in una colonna a sinistra
        const side = `<div class="lg-side">
          ${required ? '<div class="card tint small">Prima di iniziare scegli il <b>tuo nome</b> e il <b>logo</b> delle tue attività: comparirà sulle insegne, in classifica e nella città dei tuoi amici. Potrai cambiarli dal 👤 Profilo.</div>' : ''}
          <div class="lg-preview ${editing ? 'is-editing' : ''}">${editing ? '<canvas class="ph-mini" width="200" height="200"></canvas>' : `<img src="${logoUrl(draft, 200)}" width="120" height="120" alt="">`}<div><b>${esc(lbNickname() || 'Senza nome')}</b><small>${editing ? '✏️ Anteprima della foto' : draft.photo ? '📷 Logo con la tua foto' : '🎨 Logo disegnato'}</small></div></div>
          <h4 class="lg-h">Il tuo nome</h4>
          <input class="lb-input lg-nick" maxlength="${MAX_NICK}" placeholder="Il tuo nome" value="${esc(lbNickname())}" data-c="nick"></div>`;
        let main: string;
        let foot: string;
        if (tab === 'foto' && mode === 'photo' && edit) {
          // ritocco della foto
          const e = edit;
          main = `<div class="ph-stage"><canvas class="ph-canvas" width="480" height="480"></canvas><small>👆 Trascina la foto per spostarla dentro la forma</small></div>
            ${slider('zoom', '🔍 Zoom', 100, 400, Math.round(e.zoom * 100))}
            ${slider('bright', '☀️ Luminosità', 40, 160, e.bright)}
            ${slider('contrast', '◐ Contrasto', 40, 160, e.contrast)}
            ${slider('sat', '🎨 Colori', 0, 200, e.sat)}
            <div class="lg-row" style="margin-top:8px"><button class="btn sm sec" data-a="rot">↻ Ruota</button><button class="btn sm ${e.bw ? 'purple' : 'sec'}" data-a="bw">⚫ Bianco e nero</button><button class="btn sm sec" data-a="reset">↺ Ripristina</button><button class="btn sm sec" data-a="upload">📷 Un'altra foto</button></div>
            <h4 class="lg-h">Forma</h4>${shapes}`;
          foot = `<button class="btn sec" data-a="back">✕ Annulla</button><button class="btn good" data-a="usephoto">✅ Usa questa foto</button>`;
        } else if (tab === 'foto') {
          // scegliere una foto (o gestire quella già scelta)
          main = draft.photo
            ? `<div class="card center"><img class="lg-photo-big" src="${logoUrl(draft, 320)}" alt=""><p class="muted small">Il tuo logo ora usa questa foto. La vedono solo i tuoi amici: nella classifica mondiale compare il logo disegnato.</p>
                <div class="lg-row" style="justify-content:center"><button class="btn sm purple" data-a="retouch">✏️ Ritocca</button><button class="btn sm sec" data-a="upload">📷 Cambia foto</button><button class="btn sm danger" data-a="nophoto">🗑️ Togli la foto</button></div></div>`
            : `<div class="card center lg-pick"><div class="emoji">📷</div><b>Usa una tua foto come logo</b><p class="muted small">Scegli una foto dal telefono: potrai spostarla, ingrandirla, ruotarla e ritoccare luce e colori dentro la forma che preferisci.</p>
                <button class="btn purple full" data-a="upload">📷 Scegli una foto</button><p class="muted small" style="margin:8px 0 0">La foto la vedono solo i tuoi amici; nella classifica mondiale compare il logo disegnato (scheda 🎨 Crea logo).</p></div>`;
          foot = `<button class="btn good" data-a="save">✅ Salva il logo</button>`;
        } else {
          // creare il logo da zero
          main = `${draft.photo ? '<div class="card tint small row between"><span>📷 Il logo ora usa la tua foto: questo disegno si vede nella classifica mondiale.</span><button class="btn sm sec" data-a="nophoto">Usa il disegno</button></div>' : ''}
            <h4 class="lg-h">Forma</h4>${shapes}
            <h4 class="lg-h">Colore di sfondo</h4>${swatches('bg', draft.bg)}
            <h4 class="lg-h">Simbolo</h4>
            <div class="lg-row lg-syms">${LOGO_SYMBOLS.map((e) => `<button class="lg-sym ${draft.symbol === e ? 'on' : ''}" data-a="sym:${e}">${e}</button>`).join('')}</div>
            <h4 class="lg-h">Iniziali (facoltative, max 3)</h4>
            <input class="lb-input lg-text" maxlength="3" placeholder="es. LB" value="${esc(draft.text)}" data-c="text">
            <h4 class="lg-h">Colore delle iniziali</h4>${swatches('fg', draft.fg)}`;
          foot = `<button class="btn sec" data-a="rnd">🎲 A caso</button><button class="btn good" data-a="save">✅ Salva il logo</button>`;
        }
        return `${tabs}<div class="lg-layout">${side}<div class="lg-main">${main}</div></div><div class="btnrow">${foot}</div>`;
      },
      actions: {
        tab: (k) => (tab = k as 'crea' | 'foto'),
        shape: (k) => (draft.shape = k as Logo['shape']),
        bg: (c) => (draft.bg = c),
        fg: (c) => (draft.fg = c),
        sym: (e) => (draft.symbol = e),
        text: () => (draft.text = read('.lg-text').slice(0, 3)),
        nick: () => {
          if (!setLbNickname(read('.lg-nick'))) this.toast('✏️ Scrivi un nome');
        },
        rnd: () => (draft = { ...randomLogo(), text: draft.text }),
        upload: () => picker.click(),
        retouch: () => {
          // si riparte dalla foto originale con i ritocchi di prima (non dal ritaglio già salvato)
          const prev = this.photoEdits.get(draft.photo ?? '');
          if (prev) {
            edit = { ...prev };
            mode = 'photo';
          } else if (draft.photo) startEdit(draft.photo);
        },
        nophoto: () => delete draft.photo,
        rot: () => edit && (edit.rot = (edit.rot + 1) % 4),
        bw: () => edit && (edit.bw = !edit.bw),
        reset: () => edit && (edit = newPhotoEdit(edit.img)),
        back: () => {
          mode = 'logo';
          edit = null;
        },
        usephoto: () => {
          if (edit) {
            draft.photo = photoData(edit);
            this.photoEdits.set(draft.photo, { ...edit });
          }
          mode = 'logo';
          edit = null;
          // l'anteprima si aggiorna appena la foto nuova è pronta
          void preloadLogo(draft).then(() => this.panel === panel && this.renderPanel());
        },
        save: () => {
          draft.text = read('.lg-text').slice(0, 3);
          const nick = read('.lg-nick');
          if (nick && nick !== lbNickname()) setLbNickname(nick);
          if (!lbNickname()) {
            this.toast('✏️ Scrivi il tuo nome', 'bad');
            (this.modal?.querySelector('.lg-nick') as HTMLInputElement | null)?.focus();
            return;
          }
          s.logo = { ...draft };
          s.logoChosen = true;
          void preloadLogo(s.logo).then(() => {
            for (const b of s.businesses) this.game.setupLot(b.lotId);
          });
          this.game.save();
          void submitScore(s, true);
          this.toast('🎨 Logo salvato: ora è sulle insegne delle tue attività', 'good');
          this.close();
        },
      },
    };
    this.open(panel);
  }

  // ---------------- classifica mondiale e tra amici ----------------

  /** Classifiche: mondiale o tra amici, per fama, soldi, lavoretti, attività o clienti serviti. */
  openLeaderboard(startTab: 'mondo' | 'amici' = 'mondo') {
    const s = this.s;
    let tab = startTab;
    let kind: BoardKind = 'fame';
    let data: LbData | null = null;
    let friends: { entries: FriendEntry[]; missing: string[] } | null = null;
    let state: 'loading' | 'ok' | 'error' = 'loading';
    let panel: Panel;
    const KINDS: [BoardKind, string, string][] = [
      ['fame', '⭐', 'Fama'], ['money', '💰', 'Soldi'], ['jobs', '🧰', 'Lavoretti'], ['biz', '🏢', 'Attività'], ['served', '🍔', 'Clienti'],
    ];
    const fmt = (k: BoardKind, v: number) =>
      k === 'fame' ? `⭐ ${v.toFixed(1)}` : k === 'money' ? `💰 ${euro(v)}` : `${KINDS.find((x) => x[0] === k)![1]} ${Math.round(v).toLocaleString('it-IT')}`;
    const friendValue = (e: FriendEntry, k: BoardKind) =>
      k === 'fame' ? e.fame : k === 'money' ? e.money : k === 'biz' ? e.bizs.length : k === 'jobs' ? e.stats?.jobs ?? 0 : e.stats?.served ?? 0;
    const load = async () => {
      state = 'loading';
      if (this.panel === panel) this.renderPanel();
      await submitScore(s, true);
      if (tab === 'mondo') {
        data = await fetchBoard(50, kind);
        state = data ? 'ok' : 'error';
      } else {
        friends = await fetchFriends();
        state = friends ? 'ok' : 'error';
      }
      if (this.panel === panel) this.renderPanel();
    };
    const row = (e: LbEntry, v: number, pos: number) => {
      const medal = ['🥇', '🥈', '🥉'][pos - 1] ?? `<b>${pos}</b>`;
      return `<div class="lb-row ${e.me ? 'me' : ''}"><span class="lb-pos">${medal}</span>${logoImg(e.logo, 34) || '<span class="logo-img empty"></span>'}
        <span class="lb-name"><b>${esc(e.nickname)}</b><small>${esc(e.title)}</small></span>
        <span class="lb-fame">${fmt(kind, v)}</span></div>`;
    };
    panel = {
      title: '🏆 Classifiche',
      color: 'var(--orange)',
      render: () => {
        const tabs = `<div class="tabs">${[['mondo', '🌍 Mondo'], ['amici', '👥 Amici']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        const kinds = `<div class="lb-kinds">${KINDS.map(([k, i, n]) => `<button class="lb-kind ${kind === k ? 'on' : ''}" data-a="kind:${k}">${i} ${n}</button>`).join('')}</div>`;
        let list = '';
        if (state === 'loading') list = `<p class="center muted">⏳ Caricamento…<br><small>Il server a volte impiega fino a un minuto a svegliarsi.</small></p>`;
        else if (tab === 'mondo') {
          if (state === 'error' || !data) list = `<p class="center muted">📡 Classifica non raggiungibile. Controlla la connessione.</p>`;
          else {
            const d = data as LbData;
            const val = (e: LbEntry) => e.value ?? (kind === 'money' ? e.money : e.fame);
            list = d.entries.length ? d.entries.map((e) => row(e, val(e), e.rank)).join('') : `<p class="center muted">Nessuno in questa classifica: sii il primo!</p>`;
            if (d.me && !d.entries.some((e) => e.me)) list += `<div class="lb-gap">…</div>` + row({ ...d.me, me: true }, val(d.me), d.me.rank);
            list = `<div class="muted small" style="margin-bottom:6px">${d.total} giocatori in classifica</div>${list}`;
          }
        } else if (state === 'error' || !friends) list = `<p class="center muted">📡 Classifica non raggiungibile. Controlla la connessione.</p>`;
        else {
          const f = friends as { entries: FriendEntry[]; missing: string[] };
          const sorted = [...f.entries].sort((a, b) => friendValue(b, kind) - friendValue(a, kind));
          list = (sorted.length > 1 ? '' : `<p class="center muted">Non hai ancora amici: aggiungili da Profilo → 👥 Amici.</p>`) +
            sorted.map((e, i) => row(e, friendValue(e, kind), i + 1)).join('');
        }
        return `${tabs}${kinds}${list}${state === 'loading' ? '' : '<button class="btn sec full" data-a="reload" style="margin-top:10px">🔄 Aggiorna</button>'}`;
      },
      actions: {
        tab: (k) => {
          tab = k as 'mondo' | 'amici';
          void load();
        },
        kind: (k) => {
          kind = k as BoardKind;
          void load();
        },
        reload: () => void load(),
      },
    };
    this.open(panel);
    void load();
  }

  /** Attività di un amico sulla tua mappa: chi è, che attività ha, e il lotto (che puoi comunque comprare). */
  openFriendBiz(lotId: string, code: string) {
    const fb = this.game.friendBiz.get(lotId)?.find((x) => x.friend.code === code);
    if (!fb) return;
    const def = bizType(fb.type);
    const f = fb.friend;
    const mine = !!bizAtLot(this.s, lotId);
    this.open({
      title: `🤝 ${def.name} di ${f.nickname}`,
      small: true,
      color: '#5b4bb7',
      render: () => `<div class="lg-preview">${logoImg(f.logo, 90) || ''}<div><b>${esc(f.nickname)}</b><small>${esc(f.title)} · ⭐ ${f.fame.toFixed(1)}</small></div></div>
        <div class="grid2"><div class="stat ${f.online ? 's-green' : ''}"><b>${f.online ? '🟢 Aperto' : '💤 Chiuso'}</b><span>${f.online ? 'sta giocando adesso' : 'non sta giocando'}</span></div><div class="stat s-purple"><b>${['Base', 'Ampliata', 'Grande'][fb.lvl] ?? 'Grande'}</b><span>📐 ${def.icon} ${def.name}</span></div></div>
        <p class="muted small">Tra poco potrai entrare nelle attività dei tuoi amici e girare la città insieme. Per ora le vedi nella tua città: ${mine ? 'qui c\'è anche la tua attività.' : 'questo posto da te è libero e puoi comprarlo lo stesso: le attività degli amici restano accanto alla tua.'}</p>
        <div class="btnrow">${mine ? '' : '<button class="btn sec" data-a="lot">🏷️ Vedi il posto</button>'}<button class="btn" data-a="board">👥 I tuoi amici</button></div>`,
      actions: {
        lot: () => {
          this.close();
          this.openLot(lotId);
        },
        board: () => this.openFriends(),
      },
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
    let tab = 'impostazioni';
    this.open({
      title: '⚙️ Opzioni',
      color: 'var(--gray)',
      render: () => {
        const tabs = `<div class="tabs">${[['impostazioni', '⚙️ Impostazioni'], ['partita', '💾 Partita'], ['aiuto', '❓ Come si gioca']]
          .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        if (tab === 'impostazioni') return tabs + settingsHtml();
        if (tab === 'partita') {
          return tabs + `
            <div class="card"><h3>💾 ${esc(this.s.saveName)}</h3><p class="muted small" style="margin:0">Slot ${currentSlot} · la partita si salva da sola ogni pochi secondi.</p></div>
            <button class="btn blue full" data-a="menu">🏠 Salva e torna al menu principale</button>
            <p class="muted small center">Dal menu puoi cambiare partita o iniziarne una nuova.</p>
            <hr>
            <button class="btn danger full" data-a="reset">${confirm ? '⚠️ Sicuro? Tocca di nuovo per cancellare questa partita' : '🗑️ Ricomincia questa partita da capo'}</button>`;
        }
        return tabs + `
          <div class="card"><h3>🕹️ Comandi</h3><p class="muted small" style="margin:0">
            Per muoverti trascina il dito nella metà ${moveSide()} dello schermo: compare un joystick.
            Quando sei sul cerchio a terra davanti a una persona o a un oggetto (l'oggetto pulsa), tocca la <b>metà ${actSide()}</b> dello schermo; se c'è scritto "Tieni premuto" tieni il dito lì finché il cerchio si riempie.
            In ⚙️ Opzioni puoi invertire i lati.
            Nei lavoretti (in prima persona): riquadro 🕹️ in basso a ${moveSide()} per camminare, trascina il dito sul resto dello schermo per guardarti attorno, e tocca o tieni premuto l'oggetto che pulsa per le azioni.
            Su PC: WASD o frecce, E o spazio per l'azione.</p></div>
          <div class="card"><h3>⏰ Tempo</h3><p class="muted small" style="margin:0">1 mese di gioco = 2 ore reali (una giornata dura 4 minuti). Con il gioco chiuso il tempo scorre ${TIME.OFFLINE_SLOWDOWN} volte più piano e le attività autonome guadagnano l'80% nelle prime 24 ore, il 50% nelle 48 ore dopo e poi il 20%.</p></div>`;
      },
      actions: {
        tab: (k) => (tab = k),
        set: (v) => settingsAction('set:' + v),
        tog: (v) => settingsAction('tog:' + v),
        hud: (v) => settingsAction('hud:' + v),
        menu: () => {
          this.game.save();
          this.game.resetting = true;
          location.reload();
        },
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
        ${r.rent ? `<div class="stat s-yellow" style="margin-top:8px"><b class="money-t">+${euro(r.rent)}</b><span>🔑 affitti delle tue case</span></div>` : ''}
        ${r.revenue === 0 ? '<p class="muted small">Solo le attività con almeno un dipendente per reparto e un manager lavorano mentre sei via (con una persona per reparto, solo per un turno di 8 ore).</p>' : ''}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

  /**
   * Prima volta in gioco: le due zone dei comandi si illuminano per qualche secondo
   * (dove trascinare per muoversi, dove toccare per le azioni). Sparisce al primo tocco.
   */
  showControlsHint() {
    const el = document.createElement('div');
    el.className = 'ctl-hint';
    el.innerHTML = `<div class="ctl-move"><b>🕹️ Trascina qui</b><span>per muoverti</span></div>
      <div class="ctl-act"><b>👆 Tocca qui</b><span>per parlare, entrare e lavorare</span></div>`;
    document.body.appendChild(el);
    const done = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
      window.removeEventListener('pointerdown', done);
    };
    setTimeout(() => window.addEventListener('pointerdown', done), 400);
    setTimeout(done, 7000);
  }

  openWelcome() {
    this.open({
      title: '👋 Benvenuto!',
      small: true,
      color: 'var(--orange)',
      render: () => `
        <div class="hero"><div class="emoji">💼</div><p style="margin:4px 0 12px">Hai <b class="money-t">${euro(this.s.money)}</b> in tasca e tanta voglia di fare!</p></div>
        <ul class="steps">
          <li><div class="icon-bubble">🕹️</div><span>Per <b>muoverti</b> trascina il dito nella metà <b>${moveSide()}</b> dello schermo. Per <b>parlare, entrare o lavorare</b> mettiti sul cerchio a terra e tocca la metà <b>${actSide()}</b> (o tieni il dito lì se c'è scritto "Tieni premuto"). In ⚙️ Opzioni puoi invertire i lati.</span></li>
          <li><div class="icon-bubble">❗</div><span>Cerca le persone con il <b>!</b> giallo: offrono <b>lavoretti</b>. Le freccette ai bordi ti portano da loro.</span></li>
          <li><div class="icon-bubble">🎮</div><span>I <b>lavoretti</b> si giocano in prima persona: riquadro in basso a <b>${moveSide()}</b> per camminare, trascina il dito sul resto dello schermo per guardarti attorno e <b>tocca l'oggetto che pulsa</b> per lavorare (tieni il dito sopra se c'è scritto "Tieni premuto").</span></li>
          <li><div class="icon-bubble">📋</div><span>Nella <b>bacheca</b> in piazza trovi le <b>missioni</b> del giorno.</span></li>
          <li><div class="icon-bubble">🚚</div><span>Con i risparmi compra un lotto <b>IN VENDITA</b> e apri il tuo <b>food truck</b>.</span></li>
          <li><div class="icon-bubble">👥</div><span>Assumi <b>dipendenti</b> e un <b>manager</b> per farlo lavorare da solo.</span></li>
          <li><div class="icon-bubble">🗺️</div><span>Tocca la <b>mappa</b> in alto per vedere tutta la città.</span></li>
        </ul>
        <button class="btn full" data-a="ok">Iniziamo! 🚀</button>`,
      actions: {
        ok: () => {
          this.s.tutorialDone = true;
          this.close();
          this.showControlsHint();
        },
      },
    });
  }
}
