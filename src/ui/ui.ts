import * as THREE from 'three';
import { BUSINESS, LEVEL, TIME } from '../config/balance';
import { BIZ_GROUPS, BUSINESS_TYPE_IDS, BUSINESS_TYPES, bizGroup, bizType, evolvesOf, hourFactor, EXTRA_ROLES, roleName, ROLES, upgOf, upgradeIdsFor, type BusinessType, type Role, type UpgradeId } from '../config/business';
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
import { Guide } from './guide';
import { changePassword, chooseName, cloudSave, lastCloudSave, loggedIn, login as accountLogin, logout as accountLogout, MIN_PASSWORD, nameTaken, register as accountRegister } from '../sim/account';
import { makeGuides } from './guides';
import { actSide, moveSide, onSettings, settings, type HudKey } from '../settings';
import { layout } from './layout';
import { PulseGlow } from '../world/pulse';
import { MapScreen } from './mapscreen';
import { ACCESSORIES, accById, ACC_SLOT_NAME, STYLES, type AccSlot } from '../world/style';
import { EdgePointers } from './pointers';
import { bus, toast } from '../sim/bus';
import { bizReport, ensurePartials } from '../sim/report';
import { inShift, shiftText, shortRanges } from '../sim/shifts';
import { demandFactors, demandForecast, perDay } from '../sim/market';
import { chainGroups, groupUpgradeTargets, chainOf, chainTypes, deleteGroup, groupFill, groupProduct, groupUpgrade, groupUpgradeCost, hasMenu, saveGroup } from '../sim/chains';
import { CRAFT_JOBS, SPECIALS_PER_DAY, specialOrders, specialTime } from '../sim/specials';
import { GLAZES, VASES, vaseSvg } from '../world/ceramics';
import { advance, canRent, RENT_MAX_HOURS, weeklyDaysLeft, type OfflineReport } from '../sim/calendar';
import {
  bizAtLot, capacityAt, makeCandidate, shiftOf, buyLot, sellBusiness, sellValue, evolveBusiness, evolveLots, evolveMissing, evolvePrice, buyStock, buyUpgrade, estimateLot, estimateMonthlyProfit, canMove, canTrain, hasCashUpgrade, empStat, moveEmployee, moveTargets, fmtRate, MAX_LEVEL, MAX_STARS, PARTIAL_DAYS, partialIn, REPORT_DAYS, startTraining, trainingCost, trainingDays, xpForEmpLevel, resetBizStats, weekDays, fameMultiplier, fire, hasManager,
  hire, isAutonomous, isOpenHour, shiftsFor, employeeRate, lotDef, lotPrice, lotZone, marketDemand, MAX_ORDERS, menuSlots, monthlyCosts, productDemand,
  refreshCandidates, stockCap, totalDemand, typesForLot, upg, upgradeMultiplier, vehiclesMonthly,
  isAutoBiz,
} from '../sim/economy';
import { addFame, addMoney, lineLevel, rank, sectorXp, skillLevel, totalFame, totalLevel } from '../sim/progress';
import { careerLine, EVOLVE_EVERY, linesOf, readyJobTypes } from '../config/careers';
import { devApp, devGame } from '../dev';
import { canPropose, canReview, Proposals } from './proposals';
import { addFriend, answerFriendRequest, fetchBoard, fetchFriends, friendCode, MAX_NICK, moneyPerSecond, nickname as lbNickname, removeFriend, sendFriendRequest, submit as submitScore, type BoardKind, type FriendEntry, type LbData, type LbEntry } from '../sim/leaderboard';
import { drawLogo, photoPicker, shrinkImage, LOGO_COLORS, LOGO_SHAPES, LOGO_SYMBOLS, logoImg, logoUrl, newPhotoEdit, photoData, preloadLogo, randomLogo, renderPhoto, SHAPE_ICON, type Logo, type PhotoEdit } from '../logo';
import {
  currentSlot, day, dayOfMonth, euro, hourOf, monthIndex, playStats, wipeSave, yearOf,
  type Business, type Employee, type JobOffer, type Mission, type ServiceOrder, type SpecialOrder,
} from '../sim/state';
import { stripLeadIcon } from './icons';
import { buyBox, casino, MAX_BUY_BB, MIN_BUY_BB, pokerBlocked, pokerName, PokerTable, STAKE_FAME, STAKES, wireBuyBox, type CasinoGame, type PkInfo, type PkState } from './poker';
import { BJ_MAX_BET_X, BJ_MAX_BUY_X, BJ_MIN_BUY_X, BlackjackTable, type BjInfo, type BjState } from './blackjack';
import { previewPr } from '../preview';


type Actions = Record<string, (arg: string) => void>;

/** Migliorie che cambiano la cucina e si possono provare prima di comprarle. */
const PREVIEW_UPGRADES: UpgradeId[] = ['ampliamento', 'fuochi', 'banco', 'ripiano', 'attrezzatura', 'cassa'];

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
  /** dove era scorsa quando si è andati avanti in un'altra finestra: tornando con "Indietro" si rimette lì */
  scroll?: ScrollSave;
  /** mostra i tuoi soldi nell'intestazione (negozio, migliorie, acquisti); con una funzione, solo quando serve */
  money?: boolean | (() => boolean);
  /** spiegazioni aperte col tasto "?" (restano aperte finché la finestra resta aperta) */
  help?: boolean;
  /** sopra a tutto, anche ai tavoli delle sfide (finestra "Proponi") */
  top?: boolean;
  /** nome per la guida obbligatoria (guides.ts): `panel:<nome>` all'apertura, `<nome>/tab:…` e `<nome>/<azione>` ai tocchi */
  guide?: string;
}

/**
 * Spiegazioni nascoste: ogni testo che spiega come funziona qualcosa ha la classe `explain` e resta nascosto
 * finché non si tocca il tasto "?" nell'intestazione della finestra (il tasto c'è solo se ci sono spiegazioni).
 * `explain(testo)` è la forma breve per un paragrafo di spiegazione.
 */
const explain = (html: string, cls = '') => `<p class="muted small explain ${cls}">${html}</p>`;
/** Spiegazione a punti brevi (una frase corta per punto): da preferire ai paragrafi lunghi. */
const points = (...items: (string | false | 0 | null | undefined)[]) => bullets(...items).replace('class="', 'class="explain ');
/** Elenco a punti brevi sempre visibile (non dietro il "?"). */
const bullets = (...items: (string | false | 0 | null | undefined)[]) =>
  `<ul class="muted small points">${items.filter(Boolean).map((t) => `<li>${t}</li>`).join('')}</ul>`;

/**
 * Salva lo scorrimento (orizzontale e verticale) di ogni elemento che scorre dentro `root` e restituisce
 * la funzione che lo rimette dopo aver ridisegnato il contenuto. Gli elementi si ritrovano per classi e
 * posizione (la n-esima riga di schede resta la n-esima).
 */
type ScrollSave = { sel: string; i: number; left: number; top: number }[];

/** Scorrimento di `root` e di tutto ciò che scorre dentro (per rimetterlo con `keepScroll`/`putScroll`). */
function saveScroll(root: HTMLElement, self = false): ScrollSave {
  const saved: ScrollSave = [];
  if (self && (root.scrollLeft || root.scrollTop)) saved.push({ sel: ':scope', i: -1, left: root.scrollLeft, top: root.scrollTop });
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (!el.scrollLeft && !el.scrollTop) continue;
    const sel = el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + CSS.escape(c)).join('');
    const i = [...root.querySelectorAll(sel)].indexOf(el);
    saved.push({ sel, i, left: el.scrollLeft, top: el.scrollTop });
  }
  return saved;
}

/** Rimette lo scorrimento salvato (anche in una finestra ridisegnata da capo, tornando con "Indietro"). */
function putScroll(root: HTMLElement, saved: ScrollSave) {
  for (const k of saved) {
    const el = k.i < 0 ? root : root.querySelectorAll<HTMLElement>(k.sel)[k.i];
    if (!el) continue;
    el.scrollLeft = k.left;
    el.scrollTop = k.top;
  }
}

function keepScroll(root: HTMLElement) {
  const saved = saveScroll(root);
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

/** scrive il testo solo se è cambiato (ogni riscrittura rifà anche le icone disegnate) */
function setText(el: HTMLElement, v: string) {
  if (el.textContent !== v) el.textContent = v;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** plurale del nome di un ruolo, per i titoli dei reparti ("Cuoco" → "Cuochi", "Addetto pulizie" → "Addetti pulizie") */
function rolePlural(name: string) {
  const ODD: Record<string, string> = { Cuoco: 'Cuochi', Tecnico: 'Tecnici', Caposquadra: 'Capisquadra', Rider: 'Rider', specializzato: 'specializzati' };
  return name.split(' ').map((w, i) => ODD[w] ?? (i === 0 ? w.replace(/[oea]$/, 'i') : w)).join(' ');
}

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

/** "azione:argomento" → [azione, argomento]; l'argomento può contenere altri ':' */
const splitAction = (v: string) => {
  const i = v.indexOf(':');
  return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
};

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

  /** guida obbligatoria a passi (la prima volta di ogni tasto e di ogni sblocco) */
  guide: Guide;
  private unlockT = 0;

  constructor(private game: Game) {
    this.guide = new Guide(game, makeGuides(game));
    this.guide.skipReachedUnlocks();
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
        <button class="hbtn c-teal" data-h="multi"><span class="i">🎮</span><span class="l">Sfide</span></button>
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
        if (k === 'biz') this.openAgency();
        if (k === 'missions') this.openMissions();
        if (k === 'profile') this.openProfile();
        if (k === 'home') {
          this.game.goHome();
          this.guideLater('hud:home');
        }
        if (k === 'shop') this.openShop();
        if (k === 'multi') this.openMulti();
        if (k === 'settings') this.openSettings();
        this.hudMenuEl.classList.remove('open');
      }),
    );
    this.hudMenuEl = right.querySelector('.hud-menu')!;
    this.hudMenuEl.querySelector('.hud-menu-btn')!.addEventListener('click', () => {
      this.hudMenuEl.classList.toggle('open');
      if (this.hudMenuEl.classList.contains('open')) this.guideLater('hud:menu');
    });

    // telefoni tester: tasto "Proponi" sempre sullo schermo (anche nei lavoretti, nei minigiochi e alle sfide)
    if (canPropose()) {
      const fab = document.createElement('button');
      fab.className = 'prop-fab';
      fab.setAttribute('aria-label', 'Proponi una modifica');
      fab.innerHTML = '<span class="i">📝</span>';
      fab.addEventListener('click', () => this.openPropose());
      movableFab(fab);
      document.body.appendChild(fab);
    }

    const job = document.createElement('div');
    job.className = 'jobbar';
    job.innerHTML = `<div class="row"><span id="j-title"></span><span class="j-tp"><span id="j-time"></span><button class="quit" id="j-pause" aria-label="Pausa">⏸️</button></span></div>
      <div class="j-chips" id="j-chips" hidden></div><div class="row muted small" id="j-status"></div><div class="track"><div class="fill" id="j-fill"></div></div>
      <div class="j-gauge" id="j-gauge" hidden><span class="jg-l"></span><div class="jg-bar"><i class="jg-fill"></i><b class="jg-mark"></b></div></div>`;
    this.root.appendChild(job);
    // "Rinuncia" sta nella finestra della pausa (così nella barra resta spazio per il nome del lavoretto)
    job.querySelector('#j-pause')!.addEventListener('click', () => this.openJobPause());
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
    cam.querySelector('.cam-toggle')!.addEventListener('click', () => {
      cam.classList.toggle('open');
      if (cam.classList.contains('open')) this.guideLater('hud:camera');
    });
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
    // sblocchi: la guida parte quando il gioco è libero (niente finestre, lavori, cucina o mappa)
    this.unlockT += dt;
    if (this.unlockT > 0.8) {
      this.unlockT = 0;
      const g = this.game;
      const free = !this.panel && !this.queue.length && !g.run && !g.interior && !g.house && !this.mapScreen.isOpen && !document.body.classList.contains('pedal-drive');
      // il nome è già di un altro giocatore: se ne sceglie un altro (una volta per avvio, poi al prossimo)
      if (free && nameTaken() && !this.takenAsked && !this.guide.active) {
        this.takenAsked = true;
        this.openNameEditor(true);
      } else if (free) this.guide.checkUnlocks();
    }
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
      // nel riquadro il nome senza l'icona davanti: c'è poco spazio e il nome intero serve di più
      setText(this.jobEl.querySelector('#j-title') as HTMLElement, stripLeadIcon(run.title));
      setText(this.jobEl.querySelector('#j-time') as HTMLElement, run.frozen ? '⏸️ senza tempo' : `⏱ ${Math.ceil(run.timeLeft)}s`);
      setText(this.jobEl.querySelector('#j-status') as HTMLElement, run.status);
      // caselle grandi (es. i civici delle consegne): si ridisegnano solo se cambiano
      const chips = run.chips?.() ?? [];
      const cEl = this.jobEl.querySelector('#j-chips') as HTMLElement;
      const key = chips.map((c) => c.s + c.t).join('|');
      if (cEl.dataset.k !== key) {
        cEl.dataset.k = key;
        cEl.hidden = !chips.length;
        cEl.innerHTML = chips.map((c) => `<b class="jc ${c.s}">${c.s === 'done' ? '✅ ' : ''}${c.t}</b>`).join('');
      }
      // tachimetro (o altra barra del lavoretto): verde, arancione oltre la tacca della guida dolce
      const gEl = this.jobEl.querySelector('#j-gauge') as HTMLElement;
      const gv = run.gauge?.() ?? null;
      gEl.hidden = !gv;
      if (gv) {
        const k = Math.max(0, Math.min(1, gv.value / gv.max));
        setText(gEl.querySelector('.jg-l') as HTMLElement, `${gv.icon} ${gv.text}`);
        const f = gEl.querySelector('.jg-fill') as HTMLElement;
        f.style.width = `${k * 100}%`;
        f.classList.toggle('over', gv.mark !== undefined && k > gv.mark);
        const m = gEl.querySelector('.jg-mark') as HTMLElement;
        m.hidden = gv.mark === undefined;
        if (gv.mark !== undefined) m.style.left = `${gv.mark * 100}%`;
      }
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
      // anche subito dopo aver alzato il dito: il "click" arriva dopo il touchend, e se intanto la finestra si
      // ridisegna il pulsante toccato non c'è più (tocco perso, es. "Cerca altri candidati")
      const busy = this.touching || performance.now() - this.lastScroll < 900 || performance.now() - this.lastTouchEnd < 600;
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
        this.labelEl.innerHTML = `${p.at ? `<span class="act-how">${p.how ?? (hold ? '✊ Tieni premuto' : '👆 Tocca')}</span> ` : ''}${esc(p.icon)} ${esc(p.label.replace(/^Tieni premuto:\s*/, ''))}`;
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

  /** Pausa del lavoretto: con la finestra aperta il lavoretto è fermo (tempo, clienti, sporco…). */
  openJobPause() {
    const run = this.game.run;
    if (!run || this.isOpen) return;
    this.open({
      title: '⏸️ Pausa',
      small: true,
      render: () => `<p class="center"><b>${esc(run.title)}</b></p>
        <p class="center muted small">Il lavoretto è fermo${run.frozen ? '' : `: restano <b>${Math.ceil(run.timeLeft)} secondi</b>, il timer riparte quando riprendi`}.</p>
        <button class="btn good full" data-a="resume">▶️ Riprendi</button>
        <button class="btn sec full" data-a="quit" style="margin-top:8px">Rinuncia al lavoretto</button>`,
      actions: {
        resume: () => this.close(),
        quit: () => {
          this.close();
          this.game.cancelJob();
        },
      },
    });
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
    // versione nuova (src/update.ts): in verticale nella colonna dei riquadri in alto a sinistra, subito sotto
    const upd = document.querySelector<HTMLElement>('.upd-pill');
    if (upd && !document.body.classList.contains('is-landscape')) {
      upd.classList.add('in-stack');
      upd.style.left = `${left}px`;
      upd.style.top = `${top + 6}px`;
      top = upd.getBoundingClientRect().bottom;
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
    modal.className = p.top ? 'modal top' : 'modal';
    modal.innerHTML = `<div class="sheet ${p.small ? 'small' : ''} ${p.wide ? 'wide' : ''}" style="--hc:${p.color ?? 'var(--blue)'}"><div class="sheet-head">${p.back ? '<button class="back" aria-label="Indietro">‹</button>' : ''}<h2></h2><span class="head-money" hidden></span><button class="help-q" hidden aria-label="Spiegazioni">?</button><button class="x">✕</button></div><div class="tabs-slot"></div><div class="sheet-body"></div></div>`;
    modal.querySelector('h2')!.textContent = p.title;
    modal.querySelector('.x')!.addEventListener('click', () => this.close());
    modal.querySelector('.back')?.addEventListener('click', () => this.goBack());
    modal.querySelector('.help-q')!.addEventListener('click', () => {
      if (!this.panel) return;
      this.panel.help = !this.panel.help;
      this.updateHelp();
    });
    if (p.locked) (modal.querySelector('.x') as HTMLElement).style.display = 'none';
    modal.addEventListener('pointerdown', (e) => {
      if (e.target === modal && !this.panel?.locked) this.close();
    });
    modal.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || !this.panel) return;
      // solo il primo ':' separa l'azione dall'argomento (es. "group:zone:centro", "group:g:abc")
      const [name, arg = ''] = splitAction(el.dataset.a!);
      const gname = this.panel.guide;
      this.navFrom = this.panel;
      try {
        this.panel.actions[name]?.(arg);
      } finally {
        this.navFrom = null;
        this.backCandidate = null;
      }
      if (this.panel && this.modal === modal) this.renderPanel();
      // guida obbligatoria: la prima volta di questa scheda o di questo pulsante
      if (gname) {
        if (name === 'tab' && this.panel?.guide === gname) this.guidePanel(false);
        else this.guideLater(`${gname}/${name}`);
      }
      // il pulsante ha chiuso la finestra senza aprirne un'altra: ora tocca a quelle in attesa
      if (!this.panel && this.queue.length) this.open(this.queue.shift()!);
      this.updateDot();
    });
    modal.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (!el.dataset.c || !this.panel) return;
      const [name, arg = ''] = splitAction(el.dataset.c);
      this.panel.actions[name]?.(arg);
      this.renderPanel();
    });
    const sb = modal.querySelector('.sheet-body') as HTMLElement;
    sb.addEventListener('touchstart', () => (this.touching = true), { passive: true });
    sb.addEventListener('touchend', () => this.touchEnd(), { passive: true });
    sb.addEventListener('touchcancel', () => this.touchEnd(), { passive: true });
    // anche le righe interne che scorrono di lato (l'evento non sale: si ascolta in cattura)
    modal.addEventListener('scroll', () => (this.lastScroll = performance.now()), { passive: true, capture: true });
    modal.addEventListener('touchstart', () => (this.touching = true), { passive: true });
    modal.addEventListener('touchend', () => this.touchEnd(), { passive: true });
    this.touching = false;
    this.lastHtml = '';
    document.body.appendChild(modal);
    this.modal = modal;
    this.renderPanel();
    this.guidePanel(true);
    // tornando con "Indietro": la finestra è di nuovo dove l'avevi lasciata (i contenuti sono aggiornati)
    if (p.scroll) {
      putScroll(modal.querySelector('.sheet') as HTMLElement, p.scroll);
      p.scroll = undefined;
    }
  }

  private touching = false;
  private lastTouchEnd = 0;
  private touchEnd() {
    this.touching = false;
    this.lastTouchEnd = performance.now();
  }
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
    if (tabsEl.dataset.k !== tabs) {
      tabsEl.dataset.k = tabs;
      tabsEl.innerHTML = tabs;
    }
    body.innerHTML = content;
    // prima si ridisegna (il canvas cambia l'altezza), poi si ripristina lo scorrimento
    this.panel.after?.(body);
    body.scrollTop = scroll;
    keepTabs();
    keepBody();
    (this.modal.querySelector('h2') as HTMLElement).textContent = this.panel.title;
    this.updateHeadMoney();
    this.updateHelp();
  }

  /** Tasto "?": c'è solo se la finestra ha spiegazioni; le mostra o le nasconde tutte insieme. */
  private updateHelp() {
    if (!this.modal || !this.panel) return;
    const sheet = this.modal.querySelector('.sheet') as HTMLElement;
    const btn = this.modal.querySelector('.help-q') as HTMLElement;
    btn.hidden = !sheet.querySelector('.explain');
    sheet.classList.toggle('show-help', !!this.panel.help);
    btn.classList.toggle('on', !!this.panel.help);
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
    // si va avanti in un'altra finestra: si ricorda dove era scorsa, per quando si torna indietro
    if (p && p === this.navFrom && this.modal) p.scroll = saveScroll(this.modal.querySelector('.sheet') as HTMLElement);
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
    // la prima volta il tutorial è obbligatorio (vale per ogni livello, ma ogni versione nuova del lavoretto,
    // ogni 10 livelli, ha il suo); dopo resta spento, ma lo puoi riaccendere
    const first = !this.game.tutorial.isDone(def.key);
    let tut = first;
    this.open({
      guide: 'job',
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
        ${first ? '<div class="card tint small tut-note" style="margin-top:10px">🎓 <b>La prima volta c\'è il tutorial</b>: il tempo è fermo</div>' : `<button class="card set-toggle tut-toggle" data-a="tut" style="margin-top:10px"><div style="flex:1;text-align:left"><b>🎓 Con il tutorial</b><div class="muted small explain">${tut ? 'Ti guida passo passo sul posto, e il tempo è fermo.' : 'Il tutorial di questo lavoretto l\'hai già fatto: puoi rifarlo.'}</div></div>
          <span class="switch ${tut ? 'on' : ''}"><i></i></span></button>`}
        <p class="muted small center explain" style="margin:10px 0 0">${tut ? '🎓 È una prova: niente soldi né esperienza. Il lavoretto resta da fare' : 'Più sei veloce, più stelle prendi ⭐'}</p>
        <div class="btnrow"><button class="btn sec" data-a="no">No grazie</button><button class="btn good" data-a="yes">Accetta</button></div>`,
      actions: {
        tut: () => (tut = first || !tut),
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
        ${points('Era una prova: niente soldi né esperienza', `<b>${def.name}</b> è ancora disponibile: fallo per essere pagato`, 'Più sei veloce, più stelle ⭐')}
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
              <div style="flex:1"><h3 style="margin:0">${def.name}</h3><div class="muted small explain">${def.desc}</div></div></div>
            <div class="grid2" style="margin-top:8px">
              <div class="stat s-purple"><b>${SPECIALS_PER_DAY} al giorno</b><span>🛠️ lavori su richiesta</span></div>
              <div class="stat s-green"><b class="money-t">${euro(150)}–${euro(400)}+</b><span>a lavoro, fatto da te</span></div>
            </div>
            <button class="btn good full" style="margin-top:10px" data-a="buy:${lotId}|${t}" ${!canBuy || s.money < price ? 'disabled' : ''}>🛒 Apri per ${euro(price)}</button>
            ${def.setupCost ? `<div class="muted small center" style="margin-top:4px">Lotto ${euro(lot.price)} + attrezzatura ${euro(def.setupCost)}</div>` : ''}
          </div>`;
        }
        return `<div class="card"><div class="row"><div class="icon-bubble" style="background:${def.color};color:#fff">${def.icon}</div>
            <div style="flex:1"><h3 style="margin:0">${def.name}</h3><div class="muted small explain">${def.desc}</div></div></div>
          ${this.estStats(lotId, t)}
          <button class="btn good full" style="margin-top:10px" data-a="buy:${lotId}|${t}" ${!canBuy || s.money < price ? 'disabled' : ''}>🛒 Apri per ${euro(price)}</button>
          ${def.setupCost ? `<div class="muted small center" style="margin-top:4px">Lotto ${euro(lot.price)} + attrezzatura ${euro(def.setupCost)}</div>` : ''}
        </div>`;
      })
      .join('');
    return `<div class="grid2">
        <div class="stat s-purple"><b>📍 ${ZONES[zone].name}</b><span>zona · clienti ×${ZONES[zone].demand}</span></div>
        <div class="stat s-orange"><b>${euro(lot.rent)}</b><span>${lot.kind === 'truck' ? '🅿️ posteggio' : '🏠 affitto'} al mese</span></div>
      </div>
      ${canBuy ? '' : `<div class="card tint small" style="margin-top:10px">🏢 Si compra all'<b>agenzia affari</b> o davanti al cartello rosso</div>
        <button class="btn blue full" data-a="target:${lotId}" style="margin-top:8px">📍 Imposta come obiettivo sulla mappa</button>`}
      <h3 class="sec-title">Cosa puoi aprire qui</h3>${opts}
      ${this.estNote()}`;
  }

  /** Anteprima di un'attività in un lotto: clienti all'ora, incasso e utile al mese (stimati). */
  private estStats(lotId: string, t: BusinessType) {
    const est = estimateLot(this.s, lotId, t);
    const unit = bizType(t).kind === 'service' ? 'ordini' : 'clienti';
    const auto = isAutoBiz(t) ? `<div class="small" style="margin-top:6px">🤖 <b>Automatica</b>: apre con ${bizType(t).roles.map((r) => roleName(t, r).toLowerCase()).join(', ')} e manager già assunti</div>` : '';
    return `${auto}<div class="grid3" style="margin-top:8px">
        <div class="stat s-purple"><b>${est.demand.toFixed(1)}/h</b><span>${unit} (${PRODUCTS[est.best].icon})</span></div>
        <div class="stat s-green"><b class="money-t">${euro(est.revenue)}</b><span>incasso/mese*</span></div>
        <div class="stat ${est.profit >= 0 ? 's-yellow' : 's-red'}"><b class="${est.profit >= 0 ? 'good' : 'bad'}">${euro(est.profit)}</b><span>utile/mese*</span></div>
      </div>`;
  }

  private estNote() {
    return points('* Stima con la domanda di oggi', '2 dipendenti per reparto + manager', `Bollette ${euro(BUSINESS.UTILITIES_MONTH)}/mese`);
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
      guide: 'lot',
      money: true,
      title: `🏷️ ${lot.name}`,
      color: 'var(--red)',
      render: () => this.lotCard(lotId, true),
      actions: this.buyActions(),
    });
  }

  /** gruppi aperti nella lista "Le mie" (restano aperti finché non si chiude il gioco) */
  private bizGroupsOpen = new Set<string>();
  /** resoconto: reparto scelto nei turni di oggi, per attività (niente = tutta l'attività) */
  private shiftView = new Map<string, string>();
  /** resoconto: dipendente toccato nei turni, per attività (si vede cosa succederebbe senza di lui) */
  private shiftOff = new Map<string, number>();
  /** resoconto: "Licenzia" toccato una volta sul dipendente oscurato (al secondo tocco si licenzia) */
  private fireAsk: number | null = null;

  /** Agenzia affari: quelle in vendita, le tue attività, i resoconti e il mercato. Senza tab: chi non ha
   *  ancora attività vede quelle in vendita, gli altri le proprie. */
  openAgency(tab?: string, atAgency = false) {
    let cur = tab ?? (this.s.businesses.length ? 'mie' : 'compra');
    let sel: string | null = null;
    const tabs = [['compra', '🛒 In vendita'], ['mie', '🏢 Le mie'], ['resoconti', '📊 Resoconto'], ['mercato', '📈 Mercato']];
    this.open({
      guide: 'agency',
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
        grp: (id) => {
          if (!this.bizGroupsOpen.delete(id)) this.bizGroupsOpen.add(id);
        },
        back: () => (sel = null),
        open: (id) => {
          this.close();
          this.openBusiness(id);
        },
        // la catena si apre in avanti: con "‹ Indietro" si torna qui (allo stesso punto)
        chain: (t) => this.openChain(t as BusinessType),
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
        // in avanti: con "‹ Indietro" si torna alla lista
        report: (id) => this.openReport(id),
        ...this.buyActions(),
      },
    });
  }

  private agencyTab(tab: string, sel: string | null, atAgency: boolean): string {
    const s = this.s;
    if (tab === 'mie') {
      if (!s.businesses.length) {
        return `<div class="card center"><div class="hero"><div class="emoji">🏪</div></div><p>Non hai ancora nessuna attività.</p>
          <p class="muted">Fai soldi con i lavoretti, poi guarda <b>🛒 In vendita</b>.<br>Il posteggio più economico: ${euro(Math.min(...LOTS.map((l) => l.price)))}</p></div>`;
      }
      // catene: 2 o più attività dello stesso tipo si gestiscono insieme
      const chains = chainTypes(s).map((t) => {
        const d = bizType(t);
        const n = chainOf(s, t).length;
        return `<button class="card chain-card" data-a="chain:${t}" style="--sc:${d.color}"><div class="icon-bubble" style="background:${d.color};color:#fff">🔗</div>
          <div style="flex:1;text-align:left"><b>Catena ${d.icon} ${d.name}</b><div class="muted small">${n} attività · resoconto e gestione insieme o a gruppi</div></div><span class="shop-go">›</span></button>`;
      }).join('');
      const card = (b: Business) => {
        const def = bizType(b.type);
        const lot = lotDef(b.lotId);
        const extra = def.kind === 'service' && b.orders.length ? ` · <b>${b.orders.length} ordini in attesa</b>` : '';
        // avvisi dal resoconto del manager (personale o magazzino): si vedono già qui, i dettagli nel resoconto
        const rep = (b.report ?? b.partial)?.data;
        const warn = (rep?.advice ?? []).some((a) => a.kind === 'short' || a.kind === 'stock' || a.kind === 'excess');
        return `<div class="card report-card ${warn ? 'has-alert' : ''}" data-a="report:${b.id}"><div class="row between"><div class="row"><div class="icon-bubble" style="background:${def.color}">${def.icon}</div>
            <div><h3 style="margin:0">${def.name}</h3><div class="muted small">${lot.name}</div></div></div>${this.autoTag(b)}</div>
          <div class="row between small" style="margin-top:8px"><span>Oggi: <b class="money-t">${euro(b.today.revenue)}</b> · ${b.today.served} ${def.kind === 'service' ? 'ordini' : def.kind === 'craft' ? 'lavori' : 'clienti'}${extra}</span>
          <button class="btn sm" data-a="open:${b.id}">Gestisci</button></div>
          ${warn ? '<div class="small bad" style="margin-top:4px">⚠️ Qualcosa da sistemare: guarda il resoconto</div>' : ''}<div class="report-more">Tocca per il resoconto: conti, turni e dipendenti ›</div></div>`;
      };
      // un menu a tendina per gruppo (ristorazione, consegne, traslochi…), nell'ordine di BIZ_GROUPS
      const groups = new Map<string, { g: ReturnType<typeof bizGroup>; list: Business[] }>();
      for (const b of s.businesses) {
        const g = bizGroup(b.type);
        if (!groups.has(g.id)) groups.set(g.id, { g, list: [] });
        groups.get(g.id)!.list.push(b);
      }
      const order = (id: string) => (BIZ_GROUPS.findIndex((x) => x.id === id) + 1 || 99);
      const sorted = [...groups.values()].sort((a, b) => order(a.g.id) - order(b.g.id));
      const lists = sorted.map(({ g, list }) => {
        const open = this.bizGroupsOpen.has(g.id) || sorted.length === 1;
        const today = list.reduce((a, b) => a + b.today.revenue, 0);
        const waiting = list.reduce((a, b) => a + (bizType(b.type).kind === 'service' ? b.orders.length : 0), 0);
        const color = bizType(list[0].type).color;
        return `<button class="card biz-group ${open ? 'open' : ''}" data-a="grp:${g.id}" style="--sc:${color}"><div class="icon-bubble" style="background:${color}">${g.icon}</div>
          <div style="flex:1;text-align:left"><b>${g.name}</b><div class="muted small">${list.length} attività · oggi <b class="money-t">${euro(today)}</b>${waiting ? ` · <b>${waiting} ordini in attesa</b>` : ''}</div></div><span class="grp-arrow">›</span></button>
          ${open ? `<div class="biz-group-list">${list.map(card).join('')}</div>` : ''}`;
      }).join('');
      return (chains ? `<h3 class="sec-title">🔗 Le tue catene</h3>${chains}<h3 class="sec-title">🏪 Tutte le attività</h3>` : '') + lists;
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
      // solo i conti di tutte le attività insieme: il resoconto di ognuna si apre toccandola in "Le mie"
      if (!s.businesses.length) return '<div class="card center muted">Qui vedrai quanto guadagnano e quanto spendono tutte le tue attività insieme.</div>';
      const D = TIME.DAYS_PER_MONTH;
      const dom = dayOfMonth(day(s));
      let tRev = 0, mRev = 0, tGoods = 0, mGoods = 0, tServed = 0, mServed = 0, tLost = 0, mLost = 0, sal = 0, rent = 0, bills = 0, nStaff = 0;
      for (const b of s.businesses) {
        const c = monthlyCosts(s, b);
        tRev += b.today.revenue;
        mRev += b.month.revenue;
        tGoods += b.today.costs;
        mGoods += b.month.costs;
        tServed += b.today.served;
        mServed += b.month.served;
        tLost += b.today.lost;
        mLost += b.month.lost;
        sal += b.staff.reduce((a, e) => a + e.salary, 0);
        nStaff += b.staff.length;
        rent += c.rent;
        bills += c.utilities;
      }
      const veh = vehiclesMonthly(s);
      const fixed = sal + rent + bills + veh;
      const pToday = tRev - tGoods - fixed / D;
      const pMonth = mRev - mGoods - (fixed * dom) / D;
      const neg = (x: number) => (x ? `−${euro(x)}` : euro(0));
      const row = (name: string, a: string, b: string, cls = '') => `<div class="lv-row ${cls}"><span>${name}</span><b>${a}</b><b>${b}</b></div>`;
      const pct = (l: number, sv: number) => (l + sv ? ` <small>(${Math.round((l / (l + sv)) * 100)}%)</small>` : '');
      const money = `<div class="card"><h3>💶 I conti di tutte le attività <span class="muted small">(${s.businesses.length})</span></h3>
        <div class="lv-row lv-head"><span></span><b>Oggi</b><b>Mese (${dom}/${D})</b></div>
        ${row('👥 Clienti serviti', String(tServed), String(mServed))}
        ${row('❌ Persi', `${tLost}${tLost ? pct(tLost, tServed) : ''}`, `${mLost}${mLost ? pct(mLost, mServed) : ''}`, tLost || mLost ? 'lv-bad' : '')}
        ${row('💰 Incassi', `<span class="money-t">${euro(tRev)}</span>`, `<span class="money-t">${euro(mRev)}</span>`)}
        ${row('📦 Merce comprata', neg(tGoods), neg(mGoods))}
        ${row(`👔 Stipendi (${nStaff})`, neg(sal / D), neg((sal * dom) / D))}
        ${row('🏠 Affitto e bollette', neg((rent + bills) / D), neg(((rent + bills) * dom) / D))}
        ${veh ? row('🚗 Veicoli', neg(veh / D), neg((veh * dom) / D)) : ''}
        ${row('📊 Utile', `<span class="${pToday >= 0 ? 'good' : 'bad'}">${euro(pToday)}</span>`, `<span class="${pMonth >= 0 ? 'good' : 'bad'}">${euro(pMonth)}</span>`, 'lv-tot')}
        ${points('Stipendi, affitto, bollette e veicoli si pagano a fine mese', 'Qui sono divisi per giorno: vedi se guadagni davvero', 'Merce = scorte comprate per i magazzini', "Resoconto di un'attività: toccala in 🏢 Le mie")}</div>`;
      // dove vanno i soldi nel mese: le spese una per una rispetto agli incassi
      const spend: [string, number][] = [['📦 Merce', mGoods], ['👔 Stipendi', (sal * dom) / D], ['🏠 Affitto', (rent * dom) / D], ['💡 Bollette', (bills * dom) / D], ...(veh ? [['🚗 Veicoli', (veh * dom) / D] as [string, number]] : [])];
      const top = Math.max(1, mRev, ...spend.map((x) => x[1]));
      const bar = (name: string, v: number, color: string) => `<div style="margin-bottom:6px"><div class="row between small"><span>${name}</span><b>${euro(v)}</b></div><div class="bar" style="height:12px"><i style="width:${(v / top) * 100}%;background:${color}"></i></div></div>`;
      const where = `<div class="card"><h3>📊 Entrate e spese del mese</h3>${bar('💰 Incassi', mRev, 'var(--green)')}${spend.map(([n, v]) => bar(n, v, '#eb5757')).join('')}
        <div class="row between" style="margin-top:6px"><b>Spese fisse al mese</b><b>${euro(fixed)}</b></div>
        <div class="small muted">stipendi ${euro(sal)} + affitto ${euro(rent)} + bollette ${euro(bills)}${veh ? ` + veicoli ${euro(veh)}` : ''}</div></div>`;
      // in alto, grande: quanto incassano e quanto spendono tutte le attività insieme, e cosa resta
      const sOut = mGoods + (fixed * dom) / D;
      const tOut = tGoods + fixed / D;
      const totals = `<div class="card tint" data-g="totals"><div class="row between"><h3 style="margin:0">💶 Tutte le attività</h3><span class="muted small">mese ${dom}/${D}</span></div>
        <div class="grid3" style="margin-top:8px">
          <div class="stat s-green"><b class="money-t">${euro(mRev)}</b><span>💰 guadagni</span></div>
          <div class="stat s-red"><b class="bad">−${euro(sOut)}</b><span>💸 spese</span></div>
          <div class="stat ${pMonth >= 0 ? 's-yellow' : 's-red'}"><b class="${pMonth >= 0 ? 'good' : 'bad'}">${euro(pMonth)}</b><span>📊 utile</span></div>
        </div>
        <div class="small muted center" style="margin-top:6px">Oggi: <b class="money-t">${euro(tRev)}</b> guadagni · <b class="bad">−${euro(tOut)}</b> spese · <b class="${pToday >= 0 ? 'good' : 'bad'}">${euro(pToday)}</b> utile</div></div>`;
      return totals + money + where;
    }
    // mercato
    const zones: ZoneId[] = ['periferia', 'residenziale', 'centro'];
    return points("Numero = <b>clienti all'ora</b> (servizi: <b>ordini all'ora</b>) di oggi", 'Cambia con stagioni, meteo, eventi e fama', 'Apri dove i numeri sono più alti', 'Metti in vendita i più richiesti, togli quelli a zero', 'Se ne perdi troppi: assumi o migliora (vedi Resoconti)') +
      BUSINESS_TYPE_IDS.filter((t) => bizType(t).products.length).map((t) => {
        const def = bizType(t);
        const fm = fameMultiplier(s, t);
        const rows = def.products.map((p) => `<div class="row between small" style="margin-top:4px"><span style="flex:1">${PRODUCTS[p].icon} ${PRODUCTS[p].name}</span>
          ${zones.map((z) => `<span style="width:58px;text-align:right">${fmtRate(marketDemand(s, p, z) * fm)}</span>`).join('')}</div>`).join('');
        return `<div class="card"><div class="row between" style="gap:8px;flex-wrap:wrap"><h3 style="margin:0">${def.icon} ${def.name}</h3><span class="tag">${def.kind === 'service' ? "📋 ordini all'ora" : "👥 clienti all'ora"}</span></div>
          <div class="row between small muted"><span style="flex:1"></span>${zones.map((z) => `<span style="width:58px;text-align:right">${ZONES[z].name.slice(0, 6)}</span>`).join('')}</div>${rows}</div>`;
      }).join('');
  }

  // ---------------- attività ----------------

  openBusinessList() {
    this.openAgency();
  }

  private autoTag(b: Business) {
    if (bizType(b.type).kind === 'craft') return '<span class="tag y">Lavori su richiesta</span>';
    if (isAutonomous(b)) return '<span class="tag g">Autonoma</span>';
    return isAutoBiz(b.type) ? '<span class="tag y">Manca personale</span>' : '<span class="tag y">Serve il titolare</span>';
  }

  openBusiness(bizId: string, tab?: string) {
    const s = this.s;
    const b = () => s.businesses.find((x) => x.id === bizId)!;
    const craft = bizType(b().type).kind === 'craft';
    // attività automatiche (per ora tutte): niente ordini da fare di persona
    const auto = isAutoBiz(b().type);
    const service = bizType(b().type).kind === 'service';
    const orders = service && !auto;
    if (auto && tab === 'ordini') tab = undefined;
    let cur = tab ?? (orders ? 'ordini' : craft ? 'lavori' : 'panoramica');
    // laboratorio dell'artigiano: solo lavori su richiesta (niente prodotti, magazzino né personale)
    const tabs = craft ? [['lavori', '🛠️ Lavori su richiesta'], ['panoramica', '📊 Panoramica'], ['migliorie', '⬆️ Migliorie']] : [
      ...(orders ? [['ordini', '📋 Ordini']] : []),
      ['panoramica', '📊 Panoramica'],
      ['prodotti', service ? '🧰 Servizi' : '🍔 Prodotti'],
      // il personale si apre dal resoconto (tasto 👥 Personale accanto ai turni) o dalla catena: la scheda c'è solo arrivando da lì
      ['magazzino', service ? '🧴 Materiali' : '🧊 Magazzino'], ...(tab === 'personale' ? [['personale', '👥 Personale']] : []), ['migliorie', '⬆️ Migliorie'],
      // si può evolvere in un'attività più grande (albero delle evoluzioni)
      ...(evolvesOf(b().type).length ? [['evoluzione', '🌱 Evoluzione']] : []),
    ];
    // "Vendi l'attività" toccato una volta: si chiede conferma con un secondo tocco
    let confirmSell = false;
    this.open({
      guide: 'biz',
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
        return head + chain + this.bizTab(b(), cur) + (cur === 'panoramica' ? this.sellHtml(b(), confirmSell) : '');
      },
      actions: {
        // in avanti: con "‹ Indietro" si torna ai prodotti
        prodInfo: (p) => this.openProduct(p as ProductId, [bizId]),
        sell: () => {
          const biz = b();
          const why = this.sellBlock(biz);
          if (why) {
            toast(why, 'bad');
            return;
          }
          if (!confirmSell) {
            confirmSell = true;
            return;
          }
          this.close();
          sellBusiness(s, biz);
          this.game.setupLot(biz.lotId);
          this.game.save();
        },
        tab: (k) => {
          cur = k;
          confirmSell = false;
        },
        chain: () => {
          const t = b().type;
          this.close();
          this.openChain(t);
        },
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
        evolve: (t) => this.openEvolveLots(bizId, t as BusinessType),
      },
      onClose: () => this.game.save(),
    });
  }

  /** perché adesso non si può vendere l'attività ('' = si può) */
  private sellBlock(b: Business) {
    const g = this.game;
    if (g.interior?.biz.id === b.id) return "🚪 Esci dall'attività prima di venderla";
    if (g.runOrder?.bizId === b.id || g.runSpecial?.bizId === b.id) return '⏳ Finisci prima il lavoro per questa attività';
    return '';
  }

  /** In fondo alla panoramica: vendere l'attività per cambiarla con un'altra (due tocchi). */
  private sellHtml(b: Business, confirm: boolean) {
    const v = sellValue(b);
    const staff = b.staff.length;
    return `<div class="card sell-card"><h3>💰 Vendi l'attività</h3>
      <p class="small" style="margin:0 0 4px">Ricevi <b>${euro(v.total)}</b>: metà di quanto hai speso (${euro(v.spent)})${v.stock ? `, più la merce in magazzino (${euro(v.stock)})` : ''}.</p>
      ${points('Il posto torna libero', staff && `${staff === 1 ? 'Il dipendente torna' : `I ${staff} dipendenti tornano`} tra i candidati: puoi riassumerli`, 'Migliorie, prodotti e statistiche si perdono')}
      <button class="btn ${confirm ? 'danger' : 'sec'} full" data-a="sell">${confirm ? `⚠️ Sicuro? Tocca ancora per vendere a ${euro(v.total)}` : "💰 Vendi l'attività"}</button></div>`;
  }

  /** Scheda dell'evoluzione: cosa manca (migliorie al massimo) e i rami in cui può diventare. */
  private evolveTab(b: Business) {
    const s = this.s;
    const def = bizType(b.type);
    const miss = evolveMissing(b);
    const all = upgradeIdsFor(b.type, hasInterior(b.type), hasCashUpgrade(b.type));
    const ready = !miss.length;
    const reqs = all.map((id) => {
      const u = upgOf(b.type, id);
      const lv = upg(b, id);
      return `<div class="row between small evo-req"><span>${u.icon} ${u.name}</span><span>${lv >= u.max ? '✅' : `${lv}/${u.max}`}</span></div>`;
    }).join('');
    const targets = evolvesOf(b.type);
    const cards = targets.map((t) => {
      const d = bizType(t);
      const lots = evolveLots(s, t, b.lotId);
      const from = lots.length ? Math.min(...lots.map((l) => evolvePrice(l, t, b.lotId))) : 0;
      // anteprima nel locale libero che rende di più (come all'acquisto)
      const bestLot = lots.map((l) => ({ l, p: estimateLot(s, l, t).profit })).sort((x, y) => y.p - x.p)[0]?.l;
      const next = evolvesOf(t).map((x) => `${bizType(x).icon} ${bizType(x).name}`).join(' o ');
      return `<div class="card evo-card" style="--sc:${d.color}"><div class="row"><div class="icon-bubble" style="background:${d.color};color:#fff">${d.icon}</div>
          <div style="flex:1"><h3 style="margin:0">${d.name}</h3><div class="small">${d.products.map((p) => PRODUCTS[p].icon).join(' ')} · ${(d.tier ?? 1)}ª evoluzione</div></div></div>
        <p class="muted small explain" style="margin:6px 0">${d.desc}${next ? ` Poi potrà diventare: ${next}.` : ' È l\'ultima del suo ramo.'}</p>
        ${bestLot ? `${this.estStats(bestLot, t)}<div class="muted small center" style="margin:4px 0 8px">nel locale libero migliore: ${esc(lotDef(bestLot).name)}</div>` : ''}
        <button class="btn full ${ready ? 'good' : 'sec'}" data-a="evolve:${t}" ${ready && lots.length ? '' : 'disabled'}>${!lots.length ? 'Nessun locale libero' : ready ? `🏗️ Scegli il locale · da ${euro(from)}` : `🔒 Da ${euro(from)}: prima tutte le migliorie al massimo`}</button>
        ${!ready ? `<div class="small center" style="margin-top:6px;color:#e0a030">${miss.length === 1 ? 'Manca 1 miglioria' : `Mancano ${miss.length} migliorie`} (elenco qui sopra)</div>`
          : !lots.length ? `<div class="small center" style="margin-top:6px;color:#e0a030">${d.name} vuole un altro tipo di locale e sono tutti tuoi.<br>Vendine uno per liberarlo.</div>`
          : s.money < from ? `<div class="small center" style="margin-top:6px;color:#e0a030">Ti mancano ${euro(from - s.money)} per il locale più economico.</div>` : ''}</div>`;
    }).join('');
    return `<div class="card ${ready ? 'hl' : ''}"><div class="row between"><h3>🌱 Evolvi ${def.icon} ${def.name}</h3><span class="tag ${ready ? 'g' : 'y'}">${all.length - miss.length}/${all.length}</span></div>
        ${points('Servono <b>tutte le migliorie al massimo</b>', 'Paghi locale + ristrutturazione in un solo prezzo', 'Restando dove sei paghi solo la ristrutturazione', 'Se cambi locale, il vecchio torna libero', 'I dipendenti restano, migliorie e scorte ripartono da zero')}
        ${reqs}</div>
      <h3 class="sec-title">${targets.length > 1 ? '🔀 Bivio: scegli un ramo' : '➡️ Diventa'}</h3>${cards}${this.estNote()}`;
  }

  /** Locali liberi dove aprire l'attività evoluta, con il prezzo unico (locale + ristrutturazione). */
  openEvolveLots(bizId: string, target: BusinessType) {
    const s = this.s;
    const d = bizType(target);
    this.open({
      money: true,
      title: `🏗️ Scegli il locale`,
      color: d.color,
      render: () => {
        const b = s.businesses.find((x) => x.id === bizId);
        if (!b) return '<p>Attività non trovata.</p>';
        const own = b.lotId;
        const lots = evolveLots(s, target, own).sort((x, y) => evolvePrice(x, target, own) - evolvePrice(y, target, own));
        return `<div class="card row"><div class="icon-bubble" style="background:${d.color};color:#fff">${d.icon}</div><div style="flex:1"><b>${d.name}</b><div class="small">🏗️ ristrutturazione ${euro(d.evolveCost ?? 0)} + locale</div></div></div>` + points(`Prezzo = locale + ristrutturazione (${euro(d.evolveCost ?? 0)})`, 'In centro più clienti, ma costa di più') +
          lots.map((l) => {
            const lot = lotDef(l);
            const price = evolvePrice(l, target, own);
            return `<div class="card"><b>${esc(lot.name)}</b>${l === own ? ' <span class="tag g">Sul posto</span>' : ''}<div class="muted small">📍 ${ZONES[lotZone[l]].name} · clienti ×${ZONES[lotZone[l]].demand} · affitto ${euro(lot.rent)}/mese</div>
              ${this.estStats(l, target)}
              <button class="btn good full" style="margin-top:10px" data-a="go:${l}" ${s.money < price ? 'disabled' : ''}>🏗️ Evolvi qui per ${euro(price)}</button>
              ${s.money < price ? `<div class="small center" style="margin-top:4px;color:#e0a030">Ti mancano ${euro(price - s.money)}</div>` : ''}
              <div class="muted small center" style="margin-top:4px">${l === own ? `Il locale è già tuo: solo la ristrutturazione ${euro(d.evolveCost ?? 0)}` : `Locale ${euro(price - (d.evolveCost ?? 0))} + ristrutturazione ${euro(d.evolveCost ?? 0)}`}</div></div>`;
          }).join('') + this.estNote();
      },
      actions: {
        go: (lotId) => {
          const b = s.businesses.find((x) => x.id === bizId);
          if (!b) return;
          const old = b.lotId;
          const nb = evolveBusiness(s, b, target, lotId);
          if (!nb) return;
          this.game.setupLot(old);
          this.game.setupLot(lotId);
          this.game.save();
          this.close();
          this.openBusiness(nb.id, 'ordini');
        },
      },
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
      guide: 'report',
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
        // turni e conti si vedono sempre, anche prima del resoconto del manager
        const liveCards = this.reportLive(biz);
        if (!snap) return liveCards + this.reportWaiting(biz);
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
          ${r.avg.lost ? `<div class="small muted" style="margin-top:6px">Persi: ${r.lostWhy.staff} poco personale · ${r.lostWhy.stock} prodotti finiti · ${r.lostWhy.queue} in fila mentre lavoravi tu${r.lostWhy.unknown ? ` · ${r.lostWhy.unknown} senza motivo` : ''}</div>` : ''}</div>`;
        // orario di punta: barre ora per ora (verde serviti, rosso persi)
        const max = Math.max(0.1, ...r.hours.map((x) => x.arrived));
        const bars = r.hours.map((x) => {
          const hh = (x.arrived / max) * 100;
          const lh = x.arrived ? (x.lost / x.arrived) * hh : 0;
          return `<div class="hb ${x.h === r.peak.h ? 'peak' : ''}"><div class="hb-col"><i class="hb-ok" style="height:${hh - lh}%"></i><i class="hb-lost" style="height:${lh}%"></i></div><span>${x.h}</span></div>`;
        }).join('');
        const peakCard = `<div class="card"><h3>⏰ Orario di punta: ${r.peak.h}–${r.peak.h + 1}</h3>
          <div class="small">Circa <b>${n1(r.peakRate)} ${unit}</b> in quell'ora${r.hasData ? ' (media settimana)' : ' (stima: pochi dati)'}.</div>${explain("Il personale va calcolato su quest'ora, non sulla media")}
          <div class="hours">${bars}</div><div class="small muted"><i class="lg ok"></i> serviti <i class="lg lost"></i> persi</div></div>`;
        // personale per reparto
        const staffRows = r.staff.map((x) => `<div class="staff-row"><div><b>${x.name}</b> · ${x.n} ${x.n === 1 ? 'persona' : 'persone'}
            <div class="shifts">${x.shifts.map((sh) => `<span class="shift">${esc(sh.name)} ${sh.text ?? `${sh.start}–${sh.end}`}</span>`).join('') || '<span class="muted small">nessuno</span>'}</div>
            <div class="small muted">${x.status === 'short' ? `scoperto nelle ore ${x.short.join(', ')} · ne servono ~${x.need}` : x.status === 'excess' ? `ne basterebbero ~${x.need}` : 'tutta la giornata coperta'}</div></div>
          <span class="tag ${x.status === 'ok' ? 'g' : x.status === 'short' ? 'r' : 'y'}">${x.status === 'ok' ? '✅ giusto' : x.status === 'short' ? '⚠️ pochi' : '💸 troppi'}</span></div>`).join('');
        const staffCard = r.staff.length ? `<div class="card"><h3>👥 Personale e turni</h3><div class="small muted">Aperti ${BUSINESS.OPEN_HOUR}–${BUSINESS.CLOSE_HOUR}</div>${points('Massimo 8 ore a testa, anche divise in due', `Il manager mette più persone nelle ore di punta (~${n1(r.peakRate)} ${unit}/h)`)}${staffRows}</div>` : '';
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
            : `<div class="report-date partial">📋 <b>Resoconto provvisorio</b> · ${n1(Math.floor(biz.partial!.days * 10) / 10)} giornate su ${REPORT_DAYS} (dal ${esc(dayName(Math.floor(snap.from / 1440)))} al ${esc(dayName(snap.day))})<br><span class="small">Pochi giorni: i numeri possono cambiare. Si aggiorna ogni sera; completo a ${REPORT_DAYS} giornate.</span>${this.reportProgress(biz, false)}</div>`}` + liveCards + advice + day + peakCard + staffCard + prod + costs;
      },
      actions: {
        // in avanti: con "‹ Indietro" si torna al resoconto
        go: (tab) => this.openBusiness(bizId, tab),
        shv: (v) => this.shiftView.set(bizId, v),
        shx: (id) => {
          this.fireAsk = null;
          if (this.shiftOff.get(bizId) === +id) this.shiftOff.delete(bizId);
          else this.shiftOff.set(bizId, +id);
        },
        // licenzia il dipendente oscurato: al primo tocco si chiede conferma
        shf: (id) => {
          if (this.fireAsk !== +id) {
            this.fireAsk = +id;
            return;
          }
          const e = b().staff.find((x) => x.id === +id);
          this.fireAsk = null;
          this.shiftOff.delete(bizId);
          if (!e) return;
          fire(s, b(), +id);
          toast(`${e.name} non lavora più qui`, 'info');
          this.game.save();
        },
      },
    });
  }

  /**
   * Mercato di un prodotto (toccandolo nella scheda Prodotti di un'attività o di una catena): la domanda di adesso
   * e perché (un fattore per riga), zona per zona, e la previsione dei prossimi 7 giorni, meno sicura più è lontana.
   * `bizIds`: le attività da cui si arriva (fama e migliorie valgono per quelle).
   */
  openProduct(pid: ProductId, bizIds: string[]) {
    const s = this.s;
    const pr = PRODUCTS[pid];
    const bizs = () => bizIds.map((id) => s.businesses.find((b) => b.id === id)).filter((b): b is Business => !!b);
    const first = bizs()[0];
    const type = first.type;
    const unit = bizType(type).kind === 'service' ? 'ordini' : 'clienti';
    const mine = new Set(bizs().map((b) => lotZone[b.lotId]));
    let zone: ZoneId = lotZone[first.lotId];
    this.open({
      guide: 'product',
      title: `${pr.icon} ${pr.name} · mercato`,
      live: true,
      color: bizType(type).color,
      render: () => {
        // fama e migliorie: dell'attività in quella zona (o della prima), così i numeri sono quelli dei tuoi clienti
        const b = bizs().find((x) => lotZone[x.lotId] === zone) ?? bizs()[0];
        const fame = fameMultiplier(s, type);
        const up = upgradeMultiplier(b);
        const mult = fame * up;
        const today = marketDemand(s, pid, zone) * mult;
        const h = hourOf(s);
        const open = isOpenHour(s);
        const nowH = today * hourFactor(type, h);
        const n1 = fmtRate;
        const f2 = (x: number) => '×' + x.toFixed(2).replace('.', ',');
        const zones: ZoneId[] = ['periferia', 'residenziale', 'centro'];
        const chips = `<div class="chips">${zones.map((z) => `<button class="chip ${z === zone ? 'on' : ''}" data-a="zone:${z}">📍 ${ZONES[z].name}${mine.has(z) ? ' 🏪' : ''}</button>`).join('')}</div><!--tabs-->`;
        const selling = bizs().filter((x) => x.products.includes(pid)).length;
        const now = `<div class="card" data-g="now"><h3>📊 Adesso <span class="muted small">${ZONES[zone].name}</span></h3>
          <div class="grid3"><div class="stat s-blue"><b>${n1(today)}/h</b><span>${unit} all'ora oggi (media)</span></div>
          <div class="stat s-green"><b>${open ? `${n1(nowH)}/h` : 'chiuso'}</b><span>${open ? `adesso (ore ${Math.floor(h)})` : `apre alle ${BUSINESS.OPEN_HOUR}`}</span></div>
          <div class="stat s-yellow"><b>~${n1(perDay(type, today))}</b><span>${unit} in tutta la giornata</span></div></div>
          <div class="row between small" style="margin-top:8px"><span>Prezzo ${euro(pr.price)} · costo ${euro(pr.cost)}</span><span>margine <b class="good">${euro(pr.price - pr.cost)}</b> a ${unit === 'ordini' ? 'ordine' : 'cliente'}</span></div>
          <div class="row between small"><span>Se li servi tutti, oggi</span><b class="good">~${euro(perDay(type, today) * (pr.price - pr.cost))} di guadagno</b></div>
          <div class="small muted" style="margin-top:4px">${bizIds.length > 1 ? `In vendita in ${selling} su ${bizIds.length} negozi` : selling ? '✅ In vendita in questa attività' : 'Non è nel menù di questa attività'}</div></div>`;
        // perché: un fattore per riga
        const extra = [{ icon: '⭐', name: 'Fama', mult: fame }, ...(up !== 1 ? [{ icon: '⬆️', name: 'Migliorie (look, marketing)', mult: up }] : [])];
        const facs = demandFactors(s, pid, zone, extra);
        const why = `<div class="card" data-g="why"><h3>🔎 Perché la domanda è questa</h3>
          <div class="lv-row"><span>🧺 Domanda base del prodotto</span><b></b><b>${n1(pr.baseDemand)}/h</b></div>
          ${facs.map((f) => `<div class="lv-row"><span>${f.icon} ${esc(f.name)}</span><b></b><b class="${f.mult > 1.02 ? 'good' : f.mult < 0.98 ? 'bad' : ''}">${f2(f.mult)}</b></div>`).join('')}
          <div class="lv-row lv-tot"><span>= ${unit} all'ora oggi</span><b></b><b>${n1(today)}/h</b></div>
          ${points('La domanda base si moltiplica per ogni riga', 'Sopra ×1 aiuta (verde), sotto ×1 frena (rosso)', 'Il mercato cambia un po\' ogni giorno, poi torna a ×1', `Nelle ore di punta arrivano più ${unit}`)}</div>`;
        // zona per zona oggi
        const zmax = Math.max(0.1, ...zones.map((z) => marketDemand(s, pid, z) * mult));
        const byZone = `<div class="card" data-g="zones"><h3>📍 Oggi zona per zona</h3>${zones.map((z) => {
          const v = marketDemand(s, pid, z) * mult;
          return `<div style="margin-bottom:6px"><div class="row between small"><span>${ZONES[z].name}${mine.has(z) ? ' 🏪' : ''}</span><b>${n1(v)}/h</b></div><div class="bar green"><i style="width:${(v / zmax) * 100}%"></i></div></div>`;
        }).join('')}</div>`;
        // prossimi giorni: forchetta (minimo–massimo), il più probabile e quanto è sicura
        const fc = demandForecast(s, pid, zone, mult);
        const fmax = Math.max(0.1, ...fc.map((x) => x.hi));
        const label = (k: number, d: number) => (k === 0 ? 'Oggi' : k === 1 ? 'Domani' : `${WEEKDAYS[d % 7]} ${dayOfMonth(d)}`);
        const rows = fc.map((x, k) => `<div class="fc-row" style="--sure:${0.45 + 0.55 * x.sure}">
            <span class="fc-day">${label(k, x.day)}</span>
            <span class="fc-w">${WEATHER[x.weather.w].icon}${k ? `<small>${Math.round(x.weather.p * 100)}%</small>` : ''}${x.events.filter((e) => e.kind !== 'weekly').map((e) => e.h.icon).join('')}</span>
            <span class="fc-bar"><i style="left:${(x.lo / fmax) * 100}%;width:${Math.max(1.5, ((x.hi - x.lo) / fmax) * 100)}%"></i><b style="left:${(x.mid / fmax) * 100}%"></b></span>
            <span class="fc-val"><b>${n1(x.mid)}</b>${k ? `<small>${n1(x.lo)}–${n1(x.hi)}</small>` : ''}</span>
            <span class="fc-sure">${Math.round(x.sure * 100)}%</span></div>`).join('');
        const mi = monthIndex(day(s));
        const seas = [0, 1, 2].map((k) => `${MONTH_NAMES[(mi + k) % 12]} ${f2(pr.season[(mi + k) % 12])}`).join(' → ');
        const next = `<div class="card" data-g="fc"><h3>⛅ Prossimi 7 giorni</h3>
          <div class="fc-row fc-head"><span class="fc-day"></span><span class="fc-w">meteo</span><span class="fc-bar">${unit} all'ora</span><span class="fc-val">probabile</span><span class="fc-sure">sicura</span></div>${rows}
          <div class="small muted" style="margin-top:6px">📅 Stagione: ${seas}</div>
          ${points('Barra = da minimo a massimo, tacca = più probabile', 'Più il giorno è lontano, meno è sicuro (% a destra)', 'Stagione ed eventi annunciati sono sicuri', '% sotto il meteo = probabilità di quel tempo')}</div>`;
        return chips + now + why + byZone + next;
      },
      actions: {
        zone: (z) => (zone = z as ZoneId),
      },
    });
  }

  /**
   * Catena: le attività dello stesso tipo (2 o più). Si sceglie a chi applicare le modifiche (tutta la
   * catena, una zona o un gruppo tuo) e si cambiano insieme prodotti, migliorie e magazzino.
   */
  /**
   * Resoconto della catena (o del gruppo): somma dei resoconti dei negozi (completi o provvisori), orario di
   * punta di tutta la catena, cosa sistemare negozio per negozio e un riepilogo per negozio con il suo resoconto.
   */
  /** Tasto della catena per la prossima miglioria del gruppo (prima i negozi più indietro, poi tutti). */
  private chainUpgBtn(bizs: Business[], id: UpgradeId) {
    const t = groupUpgradeTargets(bizs, id);
    if (!t.length) return '';
    const cost = groupUpgradeCost(bizs, id);
    const to = upg(t[0], id) + 1;
    return `<button class="btn sm blue" data-a="upg:${id}" ${this.s.money < cost ? 'disabled' : ''}>${upgOf(t[0].type, id).icon} ${upgOf(t[0].type, id).name} → Liv. ${to} (${t.length === bizs.length ? 'tutti' : t.length}) · ${euro(cost)}</button>`;
  }

  private chainReport(bizs: Business[]) {
    const s = this.s;
    ensurePartials(s);
    const reps = bizs.map((b) => ({ b, snap: b.report ?? b.partial, full: !!b.report }));
    const got = reps.filter((r) => r.snap);
    const nFull = reps.filter((r) => r.full).length;
    const nPart = got.length - nFull;
    const nWait = reps.length - got.length;
    const name = (b: Business) => esc(lotDef(b.lotId).name);
    const status = `<div class="report-date">📅 ${nFull} ${nFull === 1 ? 'resoconto completo' : 'resoconti completi'}${nPart ? ` · ${nPart} ${nPart === 1 ? 'provvisorio' : 'provvisori'}` : ''}${nWait ? ` · ${nWait} ${nWait === 1 ? 'negozio' : 'negozi'} ancora senza dati` : ''}<br><span class="small">Somma dei resoconti dei negozi</span></div>`;
    // un riepilogo per negozio: serviti, persi, reparti, utile; tocca per il suo resoconto
    const rows = () => reps.map(({ b, snap, full }) => {
      const d = snap?.data;
      const lp = d && d.avg.arrived ? Math.round((d.avg.lost / d.avg.arrived) * 100) : 0;
      const staff = d ? d.staff.map((x) => `<span class="tag ${x.status === 'ok' ? 'g' : x.status === 'short' ? 'r' : 'y'}">${x.status === 'ok' ? '✅' : x.status === 'short' ? '⚠️' : '💸'} ${esc(x.name)}</span>`).join(' ') : '';
      return `<div class="card report-card" data-a="rep:${b.id}"><div class="row between"><b>${name(b)}</b>${this.autoTag(b)}</div>
        <div class="muted small">📍 ${ZONES[lotZone[b.lotId]].name}${d ? ` · ${full ? 'settimana' : '📋 provvisorio'} · ${fmtRate(d.avg.served)} serviti al giorno · ${fmtRate(d.avg.lost)} persi (${lp}%) · ${euro(d.avg.revenue)} al giorno` : ' · 🧑‍💼 il manager sta raccogliendo i dati'}</div>
        ${staff ? `<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:4px">${staff}</div>` : ''}
        <div class="row between" style="margin-top:6px"><span class="report-more" style="margin:0">Tocca per il resoconto del negozio ›</span><button class="btn sm" data-a="bizTab:${b.id}|personale">👥 Personale</button></div></div>`;
    }).join('');
    // anche senza dati dei manager i negozi si vedono (resoconto con conti e turni, tasto Personale)
    if (!got.length) return status + `<div class="card center muted">🧑‍💼 I manager raccolgono i dati: primo resoconto dal 3° giorno</div><h3 class="sec-title" data-g="shops">🏪 Negozio per negozio</h3>` + rows();
    const sum = (f: (r: (typeof got)[number]) => number) => got.reduce((a, r) => a + f(r), 0);
    const arrived = sum((r) => r.snap!.data.avg.arrived);
    const served = sum((r) => r.snap!.data.avg.served);
    const lost = sum((r) => r.snap!.data.avg.lost);
    const revenue = sum((r) => r.snap!.data.avg.revenue);
    const lostPct = arrived ? Math.round((lost / arrived) * 100) : 0;
    const costs = bizs.reduce((a, b) => {
      const c = monthlyCosts(s, b);
      return a + c.rent + c.utilities + b.staff.reduce((x, e) => x + e.salary, 0);
    }, 0);
    // utile al mese con la media della settimana (incassi meno costo dei prodotti venduti, meno i costi fissi)
    // dei negozi con un resoconto: si confronta con gli stessi numeri della giornata media
    const auto = bizs.filter((b) => isAutonomous(b));
    const profit = got.reduce((a, r) => {
      const b = r.b;
      const d = r.snap!.data.avg;
      const avgCost = b.products.length ? b.products.reduce((x, p) => x + PRODUCTS[p].cost, 0) / b.products.length : 0;
      const c = monthlyCosts(s, b);
      return a + (d.revenue - d.served * avgCost) * TIME.DAYS_PER_MONTH - c.rent - c.utilities - b.staff.reduce((x, e) => x + e.salary, 0);
    }, 0);
    const n1 = fmtRate;
    const day = `<div class="card"><h3>📅 Una giornata media della catena</h3>
      <div class="grid2"><div class="stat s-blue"><b>${n1(arrived)}</b><span>clienti arrivati al giorno</span></div>
      <div class="stat s-green"><b>${n1(served)}</b><span>serviti al giorno</span></div>
      <div class="stat ${lostPct >= 10 ? 's-red' : ''}"><b>${n1(lost)} <small>(${lostPct}%)</small></b><span>persi al giorno</span></div>
      <div class="stat s-yellow"><b class="money-t">${euro(revenue)}</b><span>incasso al giorno</span></div>
      <div class="stat s-purple"><b>${euro(costs)}</b><span>costi fissi al mese</span></div>
      <div class="stat"><b class="${profit >= 0 ? 'good' : 'bad'}">${euro(profit)}</b><span>utile al mese con questa media${auto.length < bizs.length ? ` (${auto.length} autonome su ${bizs.length})` : ''}</span></div></div></div>`;
    // orario di punta di tutta la catena: i clienti di ogni ora sommati
    const hours = got[0].snap!.data.hours.map((x) => {
      const arr = sum((r) => r.snap!.data.hours.find((y) => y.h === x.h)?.arrived ?? 0);
      const ls = sum((r) => r.snap!.data.hours.find((y) => y.h === x.h)?.lost ?? 0);
      return { h: x.h, arrived: arr, lost: ls };
    });
    const peak = hours.reduce((a, x) => (x.arrived > a.arrived ? x : a), hours[0]);
    const max = Math.max(0.1, ...hours.map((x) => x.arrived));
    const bars = hours.map((x) => {
      const hh = (x.arrived / max) * 100;
      const lh = x.arrived ? (x.lost / x.arrived) * hh : 0;
      return `<div class="hb ${x.h === peak.h ? 'peak' : ''}"><div class="hb-col"><i class="hb-ok" style="height:${hh - lh}%"></i><i class="hb-lost" style="height:${lh}%"></i></div><span>${x.h}</span></div>`;
    }).join('');
    const peakCard = `<div class="card"><h3>⏰ Orario di punta della catena: ${peak.h}–${peak.h + 1}</h3><div class="small">Circa <b>${n1(peak.arrived)} clienti</b> in tutti i negozi insieme</div>
      <div class="hours">${bars}</div><div class="small muted"><i class="lg ok"></i> serviti <i class="lg lost"></i> persi</div></div>`;
    // COSA FARE NELLA CATENA: i problemi raggruppati per tipo (non negozio per negozio), con il modo più veloce
    // per sistemarli: un tasto che lo fa in tutto il gruppo (migliorie, magazzini, riordino, menù) oppure,
    // per il personale (che si assume negozio per negozio), un tasto per ogni negozio con quanti ne servono.
    const type = bizs[0].type;
    const shopBtn = (b: Business, tab: string, txt: string) => `<button class="btn sm" data-a="bizTab:${b.id}|${tab}">${txt}</button>`;
    const block = (kind: string, icon: string, title: string, lines: string[], btns: string) =>
      `<div class="chain-fix ${kind}"><div class="cf-title">${icon} ${title}</div>${lines.length ? `<ul class="cf-list">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}${btns ? `<div class="cf-btns">${btns}</div>` : ''}</div>`;
    const blocks: string[] = [];
    // 1) personale che non basta: per reparto quanti assumere in ogni negozio
    const short = got.map((r) => ({ r, roles: r.snap!.data.staff.filter((x) => x.status === 'short') })).filter((x) => x.roles.length);
    if (short.length) {
      const tot = new Map<string, number>();
      for (const x of short) for (const ro of x.roles) tot.set(ro.name, (tot.get(ro.name) ?? 0) + Math.max(1, ro.need - ro.n));
      blocks.push(block('short', '⚠️', `Personale che non basta in ${short.length} ${short.length === 1 ? 'negozio' : 'negozi'}: servono ${[...tot].map(([n, k]) => `${k} ${n.toLowerCase()}`).join(' e ')} in tutto`,
        short.map((x) => `<b>${name(x.r.b)}</b>: ${x.roles.map((ro) => `+${Math.max(1, ro.need - ro.n)} ${ro.name.toLowerCase()} (ore ${ro.short.join(', ')})`).join(', ')}`),
        short.map((x) => shopBtn(x.r.b, 'personale', `👥 ${name(x.r.b)}`)).join('')));
    }
    // 2) altri problemi del personale (reparto o manager mancante, fila mentre lavori tu)
    const other = got.flatMap((r) => r.snap!.data.advice.filter((a) => a.kind === 'short' && !a.text.includes('Assumi circa')).map((a) => ({ r, a })));
    if (other.length) blocks.push(block('short', '👔', `Da sistemare nel personale in ${new Set(other.map((o) => o.r)).size} ${other.length === 1 ? 'negozio' : 'negozi'}`,
      other.map((o) => `<b>${name(o.r.b)}</b>: ${o.a.text}`), [...new Set(other.map((o) => o.r.b))].map((b) => shopBtn(b, 'personale', `👥 ${name(b)}`)).join('')));
    // 3) prodotti finiti: si sistema per tutto il gruppo in un tocco
    const stock = got.filter((r) => r.snap!.data.advice.some((a) => a.kind === 'stock'));
    if (stock.length) {
      const noAuto = bizs.filter((b) => !b.autoRestock).length;
      blocks.push(block('stock', '📦', `Prodotti finiti in ${stock.length} ${stock.length === 1 ? 'negozio' : 'negozi'} (${stock.map((r) => name(r.b)).join(', ')})`, [],
        `${noAuto ? `<button class="btn sm" data-a="autoOn">🔁 Riordino automatico in tutti (spento in ${noAuto})</button>` : ''}<button class="btn sm" data-a="fill">🧊 Riempi tutti i magazzini</button>${this.chainUpgBtn(bizs, 'frigo')}`));
    }
    // 4) dipendenti di troppo (solo dai resoconti completi): per reparto e negozio, con i nomi
    const excess = got.filter((r) => r.full).map((r) => ({ r, a: r.snap!.data.advice.find((a) => a.kind === 'excess') })).filter((x) => x.a);
    if (excess.length) blocks.push(block('excess', '💸', `Dipendenti di troppo in ${excess.length} ${excess.length === 1 ? 'negozio' : 'negozi'}`,
      excess.map((x) => `<b>${name(x.r.b)}</b>: ${x.a!.text.replace(/^Costi alti: /, '')}`), excess.map((x) => shopBtn(x.r.b, 'personale', `👥 ${name(x.r.b)}`)).join('')));
    // 5) personale a vuoto (in tutto o in parte del turno): più clienti per tutto il gruppo
    const idle = got.filter((r) => r.snap!.data.advice.some((a) => a.kind === 'grow' && a.icon === '📣'));
    if (idle.length) blocks.push(block('grow', '📣', `In ${idle.length} ${idle.length === 1 ? 'negozio' : 'negozi'} il personale ha ore a vuoto (${idle.map((r) => name(r.b)).join(', ')}): aumenta la clientela`, [],
      this.chainUpgBtn(bizs, 'marketing') + this.chainUpgBtn(bizs, 'look')));
    // 6) menù: cosa si vende di più oggi (dati di oggi, come nel resoconto del negozio)
    const market = bizs.map((b) => ({ b, a: bizReport(s, b).advice.filter((a) => a.icon === '📈' || a.icon === '🍔' || a.icon === '🎉') })).filter((x) => x.a.length);
    if (market.length) {
      // lo stesso consiglio in più negozi una volta sola, con i negozi (senza i numeri, che cambiano da negozio a negozio)
      const same = new Map<string, Business[]>();
      for (const x of market) for (const a of x.a) {
        const k = a.text.replace(/ \([^)]*\d[^)]*\)/g, '');
        same.set(k, [...(same.get(k) ?? []), x.b]);
      }
      blocks.push(block('grow', '📈', `Menù da sistemare oggi in ${market.length} ${market.length === 1 ? 'negozio' : 'negozi'}`,
        [...same].map(([k, bs]) => `${k} <span class="muted">— ${bs.length === bizs.length ? 'in tutti' : bs.map(name).join(', ')}</span>`), '<button class="btn sm" data-a="tab:prodotti">🍔 Prodotti della catena</button>'));
    }
    // 7) migliorie a livelli diversi tra i negozi: si pareggiano dal gruppo
    const uneven = upgradeIdsFor(type, hasInterior(type), hasCashUpgrade(type))
      .filter((id) => groupUpgradeTargets(bizs, id).length && groupUpgradeTargets(bizs, id).length < bizs.length);
    if (uneven.length) blocks.push(block('info', '⚖️', 'Migliorie a livelli diversi tra i negozi: pareggiale', uneven.map((id) => {
      const lv = bizs.map((b) => upg(b, id));
      return `${upgOf(type, id).icon} ${upgOf(type, id).name}: Liv. ${Math.min(...lv)}–${Math.max(...lv)}`;
    }), uneven.map((id) => this.chainUpgBtn(bizs, id)).join('')));
    const advice = `<div class="card"><h3>💡 Cosa fare nella catena</h3>${explain('Problemi di tutti i negozi insieme: un tasto li sistema in tutto il gruppo')}${blocks.length ? blocks.join('') : '<div class="report-alert ok"><span>✅ Tutto in ordine: personale, magazzini e migliorie</span></div>'}</div>`;
    return status + advice + day + peakCard + `<h3 class="sec-title" data-g="shops">🏪 Negozio per negozio</h3>` + rows();
  }

  openChain(type: BusinessType, startGroup = 'all') {
    const s = this.s;
    const def = bizType(type);
    let gid = startGroup;
    let tab = 'resoconto';
    const report = (msg: string, ok: boolean) => toast(msg, ok ? 'good' : 'bad');
    const sel = () => chainGroups(s, type).find((g) => g.id === gid) ?? chainGroups(s, type)[0];
    this.open({
      guide: 'chain',
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
        const tabs = [['resoconto', '📊 Resoconto'], ...(hasMenu(type) ? [['prodotti', '🍔 Prodotti']] : []), ['migliorie', '⬆️ Migliorie'], ...(hasMenu(type) ? [['magazzino', '🧊 Magazzino']] : []), ['negozi', `🏪 Negozi (${g.bizs.length})`]];
        let body = '';
        if (tab === 'resoconto') {
          body = this.chainReport(g.bizs);
        } else if (tab === 'prodotti') {
          body = `${explain('Metti o togli un prodotto in tutti i negozi insieme (dove c\'è posto)')}` +
            def.products.map((p) => {
              const n = g.bizs.filter((b) => b.products.includes(p)).length;
              return `<div class="card row between report-card" data-a="prodInfo:${p}"><div><b>${PRODUCTS[p].icon} ${PRODUCTS[p].name}</b><div class="muted small">In vendita in ${n} su ${g.bizs.length}</div><div class="report-more" style="margin:2px 0 0">Mercato e previsioni ›</div></div>
                <div class="row" style="gap:6px"><button class="btn sm sec" data-a="prod:${p}|0" ${n ? '' : 'disabled'}>Togli</button><button class="btn sm good" data-a="prod:${p}|1" ${n === g.bizs.length ? 'disabled' : ''}>Metti</button></div></div>`;
            }).join('');
        } else if (tab === 'migliorie') {
          body = `${explain('+1 livello a tutti i negozi in un tocco (salta quelli al massimo)')}` +
            upgradeIdsFor(type, hasInterior(type), hasCashUpgrade(type)).map((id) => {
              const u = upgOf(type, id);
              const lv = g.bizs.map((b) => upg(b, id));
              const lo = Math.min(...lv);
              const hi = Math.max(...lv);
              // prima si pareggiano i negozi più indietro, poi si migliorano tutti insieme
              const targets = groupUpgradeTargets(g.bizs, id);
              const can = targets.length;
              const cost = groupUpgradeCost(g.bizs, id);
              const to = can ? upg(targets[0], id) + 1 : 0;
              const even = can === g.bizs.length;
              const label = !can ? 'Tutti al massimo' : even ? `Migliora tutti (${can}) al Liv. ${to} · ${euro(cost)}` : `Porta ${can} ${can === 1 ? 'negozio' : 'negozi'} al Liv. ${to} · ${euro(cost)}`;
              return `<div class="card"><div class="row between"><div><b>${u.icon} ${u.name}</b><div class="muted small">Liv. ${lo === hi ? lo : `${lo}–${hi}`} / ${u.max}${can && !even ? ` · prima si pareggiano i negozi più indietro` : ''}</div></div></div>
                <button class="btn sm full ${can ? 'blue' : 'sec'}" style="margin-top:6px" data-a="upg:${id}" ${!can || s.money < cost ? 'disabled' : ''}>${label}</button></div>`;
            }).join('');
        } else if (tab === 'magazzino') {
          const allAuto = g.bizs.every((b) => b.autoRestock);
          body = `<div class="card"><b>🧊 Riempi i magazzini</b><div class="muted small explain">Ogni prodotto al massimo, in tutti i negozi</div>
              <button class="btn full" style="margin-top:8px" data-a="fill">Riempi tutto</button></div>
            <button class="card set-toggle" data-a="auto"><div style="flex:1;text-align:left"><b>🔁 Riordino automatico</b><div class="muted small explain">Il manager riordina da solo in tutti i negozi</div></div>
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
        // dal resoconto della catena: resoconto di un negozio ("‹ Indietro" torna qui) o una sua scheda
        rep: (id) => this.openReport(id),
        prodInfo: (p) => this.openProduct(p as ProductId, sel().bizs.map((b) => b.id)),
        // in avanti: con "‹ Indietro" si torna al resoconto della catena (allo stesso punto)
        bizTab: (arg) => {
          const [id, t] = arg.split('|');
          this.openBusiness(id, t);
        },
        autoOn: () => {
          for (const b of sel().bizs) b.autoRestock = true;
          report('🔁 Riordino automatico acceso in tutti i negozi del gruppo', true);
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
          report(`${upgOf(type, id as UpgradeId).icon} ${r.done === 1 ? 'Migliorato 1 negozio' : `Migliorati ${r.done} negozi`} · ${euro(r.spent)}${r.skipped ? ` (${r.skipped} senza soldi abbastanza)` : ''}`, r.done > 0);
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
  /**
   * Parte del resoconto sempre aggiornata (non aspetta il manager): i conti di oggi e del mese e il grafico dei
   * turni di oggi, una colonna per ora con un colore per dipendente, i clienti previsti e le fasce orarie.
   */
  private reportLive(biz: Business) {
    const s = this.s;
    const def = bizType(biz.type);
    const unit = def.kind === 'service' ? 'ordini' : def.kind === 'craft' ? 'lavori' : 'clienti';
    const D = TIME.DAYS_PER_MONTH;
    const c = monthlyCosts(s, biz);
    const salaries = biz.staff.reduce((a, e) => a + e.salary, 0);
    const fixedMonth = c.rent + c.utilities + salaries;
    const dom = dayOfMonth(day(s));
    const t = biz.today;
    const m = biz.month;
    const profitToday = t.revenue - t.costs - fixedMonth / D;
    const profitMonth = m.revenue - m.costs - (fixedMonth * dom) / D;
    const pct = (l: { served: number; lost: number }) => (l.served + l.lost ? Math.round((l.lost / (l.served + l.lost)) * 100) : 0);
    const row = (name: string, a: string, b: string, cls = '') => `<div class="lv-row ${cls}"><span>${name}</span><b>${a}</b><b>${b}</b></div>`;
    const neg = (x: number) => (x ? `−${euro(x)}` : euro(0));
    const why = t.lost ? `<div class="small muted" style="margin-top:6px">Persi oggi: ${t.lostStaff ?? 0} poco personale · ${t.lostStock ?? 0} prodotti finiti · ${t.lostQueue ?? 0} in fila mentre lavoravi tu</div>` : '';
    const money = `<div class="card" data-g="money"><h3>💶 I conti</h3>
      <div class="lv-row lv-head"><span></span><b>Oggi</b><b>Mese (${dom}/${D})</b></div>
      ${row(`👥 ${unit[0].toUpperCase() + unit.slice(1)} serviti`, String(t.served), String(m.served))}
      ${row('❌ Persi', `${t.lost}${t.lost ? ` <small>(${pct(t)}%)</small>` : ''}`, `${m.lost}${m.lost ? ` <small>(${pct(m)}%)</small>` : ''}`, t.lost || m.lost ? 'lv-bad' : '')}
      ${row('💰 Incassi', `<span class="money-t">${euro(t.revenue)}</span>`, `<span class="money-t">${euro(m.revenue)}</span>`)}
      ${row('📦 Merce comprata', neg(t.costs), neg(m.costs))}
      ${row(`👔 Stipendi (${biz.staff.length})`, neg(salaries / D), neg((salaries * dom) / D))}
      ${row('🏠 Affitto e bollette', neg((c.rent + c.utilities) / D), neg(((c.rent + c.utilities) * dom) / D))}
      ${row('📊 Utile', `<span class="${profitToday >= 0 ? 'good' : 'bad'}">${euro(profitToday)}</span>`, `<span class="${profitMonth >= 0 ? 'good' : 'bad'}">${euro(profitMonth)}</span>`, 'lv-tot')}
      ${why}
      <div class="row between small" style="margin-top:8px"><span>Spese fisse al mese: stipendi ${euro(salaries)} + affitto ${euro(c.rent)} + bollette ${euro(c.utilities)}</span><b>${euro(fixedMonth)}</b></div>
      ${points('Stipendi, affitto e bollette si pagano a fine mese', 'Qui sono divisi per giorno: vedi se guadagni davvero', 'Merce = scorte comprate per il magazzino')}</div>`;
    if (def.kind === 'craft') return money;
    // turni di oggi
    const { plan, curve } = shiftsFor(s, biz);
    const O = BUSINESS.OPEN_HOUR;
    const C = BUSINESS.CLOSE_HOUR;
    const hours = Array.from({ length: C - O }, (_, i) => O + i);
    const PAL = ['#e8590c', '#2d9cdb', '#27ae60', '#9b51e0', '#f2b705', '#eb5757', '#00a8a8', '#d35fb7', '#6d8f1f', '#2f5fd0', '#b5793d', '#7a7a7a'];
    // in ordine di reparto (es. cuochi, cassieri, poi il manager), così le colonne dello stesso reparto stanno vicine
    const roleOrder = [...(bizType(biz.type).roles as Role[]), 'manager'];
    const team = biz.staff.filter((e) => !e.trainingEnd).sort((a, b) => (roleOrder.indexOf(a.role) + 99) % 99 - (roleOrder.indexOf(b.role) + 99) % 99);
    const color = new Map(team.map((e, i) => [e.id, PAL[i % PAL.length]]));
    // trama per reparto sopra il colore del dipendente: stessa trama = stesso lavoro (il manager ha sempre la sua)
    const roles = [...new Set(team.map((e) => e.role))];
    const pat = (r: Role) => (r === 'manager' ? 'pat-m' : `pat-${roles.filter((x) => x !== 'manager').indexOf(r) % 4}`);
    const shiftFor = (e: Employee) => plan.byRole.get(e.role)?.shifts.find((x) => x.emp.id === e.id);
    const now = Math.floor(hourOf(s));
    const tol = 0.97;
    const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    const need = def.roles as Role[];
    // quanti ne regge un reparto in un'ora (senza reparto: tutta l'attività, cioè il reparto più lento)
    const capOf = (r: Role | null) => (h: number) => (r ? plan.byRole.get(r)?.cap[h] ?? 0 : plan.capAt(h));
    const shortWith = (cap: (h: number) => number) => (h: number) => team.length > 0 && curve[h] > 0.05 && cap(h) < curve[h] * tol;
    // dipendente toccato: i turni di oggi senza di lui (gli altri restano dove sono; senza manager tutti un po'
    // più lenti), così si vede cosa succederebbe licenziandolo
    const off = team.find((e) => e.id === this.shiftOff.get(biz.id)) ?? null;
    const b2: Business = off ? { ...biz, staff: biz.staff.filter((e) => e.id !== off.id) } : biz;
    const capRole2 = (r: Role, h: number) => (plan.byRole.get(r)?.shifts ?? []).reduce((a, sh) => a + (sh.emp.id !== off?.id && inShift(sh, h) ? employeeRate(sh.emp, b2) : 0), 0);
    const capOf2 = (r: Role | null) => (h: number) => (r ? capRole2(r, h) : need.length ? Math.min(...need.map((x) => capRole2(x, h))) : 0);
    // griglia: ore in verticale (8 in alto), poi clienti previsti e quanti ne reggono quelli di turno,
    // poi una colonna per dipendente piena nelle ore in cui lavora (un buco se il turno è in due pezzi)
    const gridOf = (members: Employee[], cap: (h: number) => number, cap2?: (h: number) => number) => {
      const short = shortWith(cap2 ?? cap);
      const R0 = 2;
      const cells: string[] = [`<b class="shg-h" style="grid-column:1">ora</b><b class="shg-h" style="grid-column:2">previsti</b><b class="shg-h" style="grid-column:3">reggono</b>`];
      // col manager tolto anche gli altri lavorano meno (oscurati un po')
      const dim = (e: Employee) => (!off ? '' : e.id === off.id ? 'off' : off.role === 'manager' ? 'dim' : '');
      members.forEach((e, k) => cells.push(`<b class="shg-h shg-who ${dim(e)}" data-a="shx:${e.id}" style="grid-column:${4 + k};background-color:${color.get(e.id)}">${esc(initials(e.name))}</b>`));
      hours.forEach((h, i) => {
        const r = R0 + i;
        const cls = `${short(h) ? 'short' : ''} ${h === now ? 'now' : ''}`;
        cells.push(`<i class="shg-row ${cls}" style="grid-row:${r}"></i>`,
          `<span class="shg-hour ${cls}" style="grid-row:${r};grid-column:1">${h}</span>`,
          `<span class="shg-n" style="grid-row:${r};grid-column:2">${fmtRate(curve[h])}</span>`,
          cap2 && cap2(h) < cap(h) - 0.05
            ? `<span class="shg-n shg-cap drop ${cls}" style="grid-row:${r};grid-column:3">▼${fmtRate(cap2(h))}</span>`
            : `<span class="shg-n shg-cap ${cls}" style="grid-row:${r};grid-column:3">${fmtRate((cap2 ?? cap)(h))}</span>`);
      });
      members.forEach((e, k) => {
        const sh = shiftFor(e);
        for (const bl of sh?.blocks ?? []) cells.push(`<i class="shg-bar ${pat(e.role)} ${dim(e)}" data-a="shx:${e.id}" style="grid-column:${4 + k};grid-row:${R0 + bl.start - O} / ${R0 + bl.end - O};background-color:${color.get(e.id)}"></i>`);
      });
      return `<div class="shg-wrap"><div class="shg" style="grid-template-columns:22px 42px 48px repeat(${Math.max(1, members.length)}, minmax(16px, 1fr));grid-template-rows:auto repeat(${hours.length}, 19px)">${cells.join('')}</div></div>`;
    };
    const legendOf = (members: Employee[]) => members.map((e) => {
      const sh = shiftFor(e);
      const serves = need.includes(e.role);
      return `<div class="sh-leg ${off?.id === e.id ? 'off' : ''}" data-a="shx:${e.id}"><i style="background-color:${color.get(e.id)}">${esc(initials(e.name))}</i><span><b>${esc(e.name)}</b> <span class="muted">${roleName(biz.type, e.role)}</span></span><span class="sh-time">${sh ? shiftText(sh) : 'riposo'}</span><span class="sh-rate">${serves ? `${fmtRate(employeeRate(e, biz))} ${unit}/ora` : '+10% a tutti'}</span></div>`;
    }).join('');
    const bands: [string, number, number][] = [['🌅 Mattina', O, 12], ['🍝 Pranzo', 12, 15], ['☀️ Pomeriggio', 15, 18], ['🌙 Sera', 18, C]];
    // fasce orarie: previsti, quanti ne reggono (il reparto o tutta l'attività), quanti di turno, quanti persi
    const bandsOf = (members: Employee[], cap: (h: number) => number) => `<div class="lv-row lv-head lv-5"><span></span><b>previsti</b><b>reggono</b><b>di turno</b><b>persi</b></div>` + bands.map(([name, a, b]) => {
      let want = 0;
      let got = 0;
      let lost = 0;
      let maxOn = 0;
      for (let h = a; h < b; h++) {
        want += curve[h];
        got += cap(h);
        lost += Math.max(0, curve[h] - cap(h));
        maxOn = Math.max(maxOn, members.filter((e) => {
          const sh = shiftFor(e);
          return sh && inShift(sh, h);
        }).length);
      }
      // senza dipendenti i clienti li servi tu: niente "persi" per i turni
      const bad = team.length > 0 && want > 0.05 && lost > want * (1 - tol);
      return `<div class="lv-row lv-5 ${bad ? 'lv-bad' : ''}"><span>${name}<small class="muted">${a}–${b}</small></span><b>${fmtRate(want)}</b><b>${team.length ? fmtRate(got) : '—'}</b><b>${maxOn}</b><b>${!team.length ? 'tu' : bad ? `⚠️ ${fmtRate(lost)}` : '✅ 0'}</b></div>`;
    }).join('');
    const inTraining = biz.staff.length - team.length;
    const training = inTraining ? `<div class="small muted">🎓 ${inTraining} al corso di formazione (non sono nei turni)</div>` : '';
    const note = (key: string, cap = capOf(null)) => `<div class="small muted sh-note"><b>previsti</b>: ${unit} in arrivo · <b>reggono</b>: quanti ne serve il turno · <b>colonne</b>: ore di ogni dipendente${key}${hours.some(shortWith(cap)) ? ' · <b class="bad">rosso</b>: non bastano' : ''}</div>`;
    const explainTxt = points("I turni li fa il manager: max 8 ore a testa", `"Reggono" = ${unit} che il turno riesce a servire`, need.length > 1 && 'Conta il reparto più lento (2 cuochi e 1 cassiere: decide il cassiere)', `Previsti più di "reggono": quei ${unit} si perdono`, 'Rimedi: assumi, migliora l\'attrezzatura, fai crescere lo staff', 'I previsti cambiano con meteo, eventi e fama');
    const staffBtn = '<button class="btn sm" data-a="go:personale">👥 Personale</button>';
    let shifts: string;
    if (!team.length) {
      shifts = `<div class="card"><h3 class="row between">🗓️ Turni di oggi ${staffBtn}</h3>
        <div class="small muted">Nessun dipendente: ${isAutoBiz(biz.type) ? 'senza personale resta ferma' : def.kind === 'service' ? 'gli ordini li fai tu' : 'al bancone ci sei solo tu'}. Assumi dalla scheda 👥 Personale.</div>${training}
        <h3 style="margin:12px 0 4px">⏰ Fasce orarie</h3>${bandsOf([], capOf(null))}${explainTxt}</div>`;
    } else {
      // più reparti (es. cuochi e cassieri): stessa griglia e stesse fasce, con i dati del reparto scelto sopra
      // ("Tutti": tutta l'attività, dove conta il reparto più lento)
      const multi = need.length > 1;
      const saved = this.shiftView.get(biz.id);
      const view: Role | null = multi && saved && need.includes(saved as Role) ? (saved as Role) : null;
      const members = view ? team.filter((e) => e.role === view) : team;
      const cap = capOf(view);
      const segs = multi
        ? `<div class="segs sh-segs">${[null, ...need].map((r) => {
            const slow = r !== null && hours.some(shortWith(capOf(r)));
            return `<button class="seg ${r === view ? 'on' : ''} ${slow ? 'slow' : ''}" data-a="shv:${r ?? 'all'}">${r ? esc(rolePlural(roleName(biz.type, r))) : 'Tutti'}${r ? ` <small>${team.filter((e) => e.role === r).length}</small>` : ''}${slow ? ' ⚠️' : ''}</button>`;
          }).join('')}</div>`
        : '';
      const label = view ? rolePlural(roleName(biz.type, view)) : multi ? "tutta l'attività" : '';
      const empty = view && !members.length ? `<div class="small bad">Nessun ${esc(roleName(biz.type, view).toLowerCase())}: l'attività non serve nessuno. Assumi dalla scheda 👥 Personale.</div>` : '';
      const cap2 = off ? capOf2(view) : undefined;
      // riquadro "se lo licenzi": clienti persi in più (tutta l'attività), incassi e stipendio risparmiato
      let what = '';
      if (off) {
        const all1 = capOf(null);
        const all2 = capOf2(null);
        let extra = 0;
        for (const h of hours) extra += Math.max(0, curve[h] - all2(h)) - Math.max(0, curve[h] - all1(h));
        const sold = biz.products.map((p) => [productDemand(s, biz, p), PRODUCTS[p]] as const);
        const dem = sold.reduce((a, [d]) => a + d, 0);
        const margin = dem ? sold.reduce((a, [d, pr]) => a + d * (pr.price - pr.cost), 0) / dem : 0;
        const net = off.salary - extra * margin * D;
        const holes = shortRanges(Array.from({ length: 24 }, (_, h) => all2(h)), curve).ranges.filter((r) => !shortRanges(Array.from({ length: 24 }, (_, h) => all1(h)), curve).ranges.includes(r));
        what = `<div class="sh-what"><b>👁️ Senza ${esc(off.name)}</b> <span class="muted">(${esc(roleName(biz.type, off.role).toLowerCase())}, turno ${shiftFor(off) ? shiftText(shiftFor(off)!) : 'riposo'})</span><br>
          ${extra > 0.05 ? `Oggi si perderebbero circa <b class="bad">${fmtRate(extra)} ${unit} in più</b>${holes.length ? ` (ore scoperte: ${holes.join(', ')})` : ''}, cioè circa ${euro(extra * margin)} di guadagno al giorno.` : `Oggi non si perderebbe nessun ${unit === 'ordini' ? 'ordine' : 'cliente'} in più: gli altri bastano.`}
          Lo stipendio risparmiato è ${euro(off.salary)} al mese.<br><b class="${net >= 0 ? 'good' : 'bad'}">In un mese: ${net >= 0 ? '+' : '−'}${euro(Math.abs(net))}</b> <span class="muted small">${off.role === 'manager' ? 'ma senza manager l\'attività non lavora da sola' : net >= 0 ? 'licenziare conviene' : 'licenziare non conviene'}</span>
          <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm sec" data-a="shx:${off.id}">↩️ Rimetti</button><button class="btn sm danger" data-a="shf:${off.id}">${this.fireAsk === off.id ? 'Sicuro? Tocca ancora' : 'Licenzia'}</button>${staffBtn}</div></div>`;
      }
      shifts = `<div class="card"><h3 class="row between">🗓️ Turni di oggi ${staffBtn}</h3>${segs}<div class="small muted sh-tap explain">👆 Tocca un turno: vedi cosa succede senza quella persona</div>${what}${gridOf(members, cap, cap2)}${empty}
        ${view ? '' : `<div class="sh-key">${roles.map((r) => `<span><i class="${pat(r)}"></i>${roleName(biz.type, r)}</span>`).join('')}</div>`}${note(view ? '' : ' e la trama il lavoro', cap)}
        <div class="sh-legend">${legendOf(members)}</div>${training}
        <h3 style="margin:12px 0 4px">⏰ Fasce orarie${label ? ` <span class="muted small">${esc(label)}</span>` : ''}${off ? ` <span class="small bad">senza ${esc(off.name.split(' ')[0])}</span>` : ''}</h3>${bandsOf(members.filter((e) => need.includes(e.role) && e.id !== off?.id), cap2 ?? cap)}${explainTxt}</div>`;
    }
    return shifts + money;
  }

  private reportWaiting(biz: Business) {
    const why = biz.statsWhy && (biz.week?.from ?? 0) === biz.statsFrom ? `<p class="muted small">🔄 La raccolta è ripartita dopo l'ultimo cambio (<b>${esc(biz.statsWhy)}</b>): i dati di prima non valgono più.</p>` : '';
    return `<div class="card center"><div class="hero"><div class="emoji">🧑‍💼</div></div>
      <p><b>Il manager sta ancora raccogliendo i dati.</b></p>
      ${this.reportProgress(biz, false)}${why}
      <p><b>📋 ${this.partialWhen(biz)}</b></p>
      ${points(`Provvisorio dal ${PARTIAL_DAYS}° giorno`, `Si aggiorna ogni sera alle ${BUSINESS.CLOSE_HOUR}:00`, `Completo dopo ${REPORT_DAYS} giornate: media, ore di punta, personale e consigli`)}</div>`;
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
        ${bullets('🛠️ Qui lavori solo tu, a mano', 'Ogni giorno nuovi <b>lavori su richiesta</b>, pagati più dei lavoretti', 'Niente clienti al bancone, niente dipendenti', 'Più esperienza = lavori più difficili e pagati meglio')}`;
    }
    if (type.kind === 'craft' && tab === 'migliorie') {
      const jobs = CRAFT_JOBS.map((j) => `<div class="card row between"><span>${j.icon} <b>${j.name}</b><div class="muted small explain">${j.desc}</div></span>${j.ready ? '<span class="tag g">Sbloccato</span>' : '<span class="tag">🔜 In arrivo</span>'}</div>`).join('');
      return `${explain('Migliora il laboratorio per sbloccare nuovi lavori')}${jobs}`;
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
      return `<div class="card tint small">🛠️ <b>Lavori su richiesta</b>: li fai tu, pagano più dei lavoretti</div>${points('🏺 Modella il vaso sul tornio come nella foto', 'Dito al centro stringe, ai lati allarga', 'Poi essicca, dipingi, incarta e consegna', 'Nuovi lavori ogni giorno, sempre più pagati')}${cards}`;
    }
    if (tab === 'evoluzione') return this.evolveTab(b);
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
          // i servizi dei trasporti si fanno giocando il lavoretto della linea
          const game = pr.job ? jobInfo(pr.job.line, pr.job.rung ? pr.job.rung * EVOLVE_EVERY : 1) : null;
          return `<div class="card row"><div class="icon-bubble">${pr.icon}</div>
            <div style="flex:1"><b>${pr.name}</b><div class="muted small">💰 ~${euro(pr.price)} · ⏳ scade tra ${left.toFixed(0)} h${noStock ? ' · <span class="bad">materiali finiti</span>' : ''}</div>${game ? `<div class="small">🎮 ${game.icon} ${game.name}</div>` : ''}</div>
            <button class="btn sm good" data-a="exec:${o.id}" ${noStock || this.game.run ? 'disabled' : ''}>Esegui</button></div>`;
        })
        .join('');
      return `${points(`Gli ordini arrivano dalle ${BUSINESS.OPEN_HOUR} alle ${BUSINESS.CLOSE_HOUR}`, 'Falli tu (più stelle = più paga) o assumi staff')}
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
      const alone = isAutoBiz(b.type) ? 'Fino ad allora resta ferma.' : service ? 'Fino ad allora gli ordini li esegui tu.' : 'Fino ad allora vende solo quando ci sei tu dentro.';
      return `
        <div class="card ${isAutonomous(b) ? '' : 'hl'}" data-g="state"><div class="row between"><h3>${isAutonomous(b) ? '✅' : '⚠️'} Stato</h3>${this.autoTag(b)}</div>
          ${missing.length ? `<p class="muted small" style="margin:0">Per farla lavorare da sola serve: <b>${missing.join(', ')}</b>. ${alone}</p>`
            : '<p class="muted small explain" style="margin:0">Lavora da sola anche quando sei altrove o offline.</p>'}
        </div>
        <div class="grid2">
          <div class="stat s-purple"><b>${dem.toFixed(2)}/h</b><span>🙋 ${unit} richiesti ora</span></div>
          <div class="stat"><b>${isAutonomous(b) ? cap.toFixed(2) + '/h' : '—'}</b><span>👥 capacità ora (chi è di turno)</span></div>
          <div class="stat s-green"><b class="money-t">${euro(b.today.revenue)}</b><span>💰 oggi · ${b.today.served} ${unit}</span></div>
          <div class="stat s-red"><b>${b.today.lost}</b><span>😠 ${unit} persi oggi</span></div>
          <div class="stat s-yellow"><b>${euro(b.yesterday.revenue)}</b><span>📅 incasso ieri</span></div>
          <div class="stat s-orange"><b>${euro(b.month.revenue)}</b><span>🗓️ incasso del mese</span></div>
        </div>
        <div class="card" data-g="costs" style="margin-top:10px"><h3>🧾 Costi mensili</h3>
          <div class="row between small"><span>${lot.kind === 'truck' ? 'Posteggio' : 'Affitto'}</span><span>${euro(c.rent)}</span></div>
          <div class="row between small"><span>Bollette</span><span>${euro(c.utilities)}</span></div>
          <div class="row between small"><span>Stipendi (${b.staff.length})</span><span>${euro(fullSal)}</span></div>
          <hr><div class="row between"><b>Utile stimato al mese</b><b class="${estimateMonthlyProfit(s, b) >= 0 ? 'good' : 'bad'}">${isAutonomous(b) ? euro(estimateMonthlyProfit(s, b)) : '—'}</b></div>
          <p class="muted small explain" style="margin-bottom:0">Aperto ${BUSINESS.OPEN_HOUR}:00–${BUSINESS.CLOSE_HOUR}:00 · i costi si pagano il 1° del mese</p>
        </div>`;
    }
    if (tab === 'prodotti') {
      const slots = menuSlots(b);
      return `<p class="muted small" style="margin:0 0 6px">${b.products.length}/${slots} posti in vendita</p>${points('Scegli guardando la domanda di oggi', 'Cambia con stagioni, meteo ed eventi')}` +
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
            // tutta la scheda apre il mercato del prodotto, tranne la spunta "in vendita" (lì il tocco deve arrivare alla casella)
            return `<div class="card report-card" ${locked ? 'style="opacity:.6"' : ''}><div class="row between"><h3 data-a="prodInfo:${p}" style="flex:1">${pr.icon} ${pr.name}</h3>
              ${locked ? `<span class="tag">🔒 Ampliamento ${need}</span>` : `<label class="toggle"><input type="checkbox" ${on ? 'checked' : ''} data-c="toggleProduct:${p}"> in vendita</label>`}</div><div data-a="prodInfo:${p}">
              ${path ? `<div class="small muted">Lavorazione: ${path} → ${LAYOUTS[b.type as keyof typeof LAYOUTS].stations.find((x) => x.kind === 'counter')?.icon}</div>` : ''}
              <div class="row between small"><span>Domanda oggi ${demandBars(d, service ? 1 : 4)} ${f2(d)}/h</span><span class="muted">stagione ${trend}</span></div>
              <div class="row between small muted"><span>Prezzo ${euro(pr.price)} · costo ${f2(pr.cost)}€</span><span>margine <b class="good">${f2(pr.price - pr.cost)}€</b></span></div>
              <div class="report-more">Tocca per domanda, mercato e previsioni ›</div></div></div>`;
          })
          .join('');
    }
    if (tab === 'magazzino') {
      const cap = stockCap(b);
      return `<div class="card"><label class="toggle"><input type="checkbox" ${b.autoRestock ? 'checked' : ''} data-c="autoRestock"> Riordino automatico</label>
        <p class="muted small explain" style="margin-bottom:0">${hasManager(b) ? 'Il manager riordina da solo quando le scorte scendono.' : 'Il riordino automatico funziona solo con un manager.'}
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
          return this.empCard(e, b.type, btns, (e.trainingEnd ? ' · 🎓 in formazione' : sh ? ` · 🕐 turno ${shiftText(sh)}` : ''), b.id, move);
        },
        (r) => (needed.has(r) ? `<p class="muted small role-empty">Nessuno${r === 'manager' ? ': senza manager l\'attività non lavora da sola' : ': serve almeno un dipendente qui'}</p>` : ''),
      );
      const cands = group(
        s.candidates.filter((e) => order.includes(e.role)),
        (e) => this.empCard(e, b.type, `<div class="row emp-btns">${hasInterior(b.type) && !isAutoBiz(b.type) && e.role !== 'manager' ? `<button class="btn sm purple" data-a="previewHire:${e.id}">👁️ Prova</button>` : ''}<button class="btn sm good" data-a="hire:${e.id}" ${e.role === 'manager' && hasManager(b) ? 'disabled' : ''}>Assumi</button></div>`),
        () => '',
      ) || '<p class="muted small">Nessun candidato per questa attività oggi.</p>';
      return `${points(`Per lavorare da sola: ${type.roles.map((r) => roleName(b.type, r).toLowerCase()).join(', ')} + manager`, `Più persone nello stesso reparto = più ${unit} serviti`)}
        <h3 class="sec-title" data-g="staff">👥 Il tuo staff</h3>${staff}${hasInterior(b.type) ? `<div class="card tint small"><b>Aree del locale</b><br>🍳 <b>Cucina</b>: i cuochi preparano<br>💰 <b>Cassa</b>: i cassieri servono e incassano<br>${extras.map((x) => `${ROLES[x.role].icon} <b>${ROLES[x.role].name}</b>: ${x.desc}`).join('<br>')}</div>` : ''}
        <h3 class="sec-title" data-g="cands">📝 Candidati di oggi</h3>${points('Assumi quanti vuoi', 'Nuovi candidati ogni giorno')}${cands}
        <button class="btn sec full" data-a="reroll" ${s.money < 40 ? 'disabled' : ''}>🔄 Cerca altri candidati · €40${s.money < 40 ? ' (non hai abbastanza soldi)' : ''}</button>`;
    }
    // migliorie (l'ampliamento c'è solo per le attività con un interno)
    return upgradeIdsFor(b.type, hasInterior(b.type), hasCashUpgrade(b.type)).map((id) => {
      const u = upgOf(b.type, id);
      const lvl = upg(b, id);
      const cost = u.cost(lvl);
      // fuochi e banchi extra hanno bisogno di spazio libero nel locale
      const noRoom = (id === 'fuochi' || id === 'banco') && hasInterior(b.type) &&
        extraRoom(b.type, Math.min(2, upg(b, 'ampliamento')), upg(b, 'fuochi'), upg(b, 'banco')) <= 0;
      const maxed = lvl >= u.max;
      const buyBtn = `<button class="btn sm full ${maxed ? 'sec' : 'blue'}" data-a="upgrade:${id}" ${maxed || (!noRoom && s.money < cost) ? 'disabled' : ''}>${maxed ? 'Massimo' : noRoom ? `📏 Niente spazio sul muro: amplia prima ${b.type === 'foodtruck' ? 'il furgone' : 'il locale'}` : 'Migliora · ' + euro(cost)}</button>`;
      // prova gratis prima di comprare (solo le migliorie che cambiano la cucina)
      const canTry = hasInterior(b.type) && !isAutoBiz(b.type) && PREVIEW_UPGRADES.includes(id) && !maxed && !noRoom;
      return `<div class="card"><div class="row between"><div class="row"><div class="icon-bubble">${u.icon}</div><h3 style="margin:0">${u.name}</h3></div><span class="tag">Liv. ${lvl}/${u.max}</span></div>
        <p class="muted small explain" style="margin:0 0 8px">${u.desc}</p>${id === 'ampliamento' && !maxed ? `<p class="small" style="margin:0 0 8px"><b>Sblocca: ${this.expansionUnlocks(b, lvl + 1)}</b></p>` : ''}
        ${canTry ? `<div class="btnrow upg-btns"><button class="btn sm purple" data-a="previewUpg:${id}">👁️ Prova</button>${buyBtn}</div>` : buyBtn}</div>`;
    }).join('');
  }

  /** Prova gratis di una miglioria: una copia del locale con un livello in più. */
  private previewUpgrade(b: Business, id: UpgradeId) {
    const s = this.s;
    const u = upgOf(b.type, id);
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
      train = `<div class="emp-train">🎓 Pronto per la ${stars + 1}ª stella: torna a Liv. 0 ma è più bravo
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

  /** Multigiocatore: minigiochi da fare contro gli amici (per ora il poker). */
  openMulti() {
    const card = (a: string, icon: string, title: string, sub: string, color: string) =>
      `<button class="shop-card" data-a="${a}" style="--sc:${color}"><span class="shop-ico">${icon}</span><span><b>${title}</b><small>${sub}</small></span><span class="shop-go">›</span></button>`;
    this.open({
      guide: 'multi',
      money: true,
      title: '🎮 Multigiocatore',
      small: true,
      color: '#14a3a3',
      render: () => `${points('Sfida gli amici con i soldi della partita', 'Mentre giochi qui la partita è ferma, come ad app chiusa', 'Uscendo ricevi i guadagni offline')}
        <h3 class="sec-title">🎰 Casinò</h3>
        ${card('poker', '🃏', 'Poker', "Texas Hold'em da 2 a 8 giocatori: crea una stanza o entra con il codice di un amico", '#1f7a4c')}
        ${card('bj', '🂡', 'Blackjack', 'Contro il banco, da solo o con gli amici (fino a 7): arriva a 21 senza sballare', '#7a1f3d')}
        <p class="muted small center" style="margin:10px 0 0">Altri giochi in arrivo</p>`,
      actions: {
        poker: () => {
          this.close();
          this.openCasino('poker');
        },
        bj: () => {
          this.close();
          this.openCasino('bj');
        },
      },
    });
  }

  /**
   * Casinò (poker o blackjack): crea un tavolo (puntate e fiches) o entra con il codice; poi si apre il tavolo
   * (src/ui/poker.ts, src/ui/blackjack.ts). Stessi livelli di tavolo e stessa fama richiesta per i due giochi.
   */
  openCasino(kind: CasinoGame) {
    const s = this.s;
    const blocked = pokerBlocked();
    const isBj = kind === 'bj';
    const call = <T,>(path: string, body: object, t?: number) => casino<T>(kind, path, body, t);
    // fiches da portare: poker da 20 a 100 grandi bui, blackjack da 10 a 200 puntate minime (come sul server)
    const minBuyOf = (i: number) => STAKES[i][1] * (isBj ? BJ_MIN_BUY_X : MIN_BUY_BB);
    const maxBuyOf = (i: number) => STAKES[i][1] * (isBj ? BJ_MAX_BUY_X : MAX_BUY_BB);
    // i tavoli dal terzo in su chiedono fama (STAKE_FAME), oltre ai soldi per le fiches
    const fame = () => totalFame(s);
    const fameOk = (need: number) => fame() >= need;
    let stake = 0;
    // fiches da portare (scritte a mano, col cursore o con le scorciatoie)
    let buyAmt = 0;
    let joinAmt = 0;
    let code = '';
    let info: (PkInfo & Partial<BjInfo>) | (BjInfo & Partial<PkInfo>) | null = null;
    // tavolo dove sei ancora seduto (poker o blackjack: uno alla volta)
    let where: { game: CasinoGame; code: string } | null = null;
    let busy = '';
    let err = '';
    const maxFor = (maxBuy: number) => Math.min(maxBuy, Math.floor(s.money));
    const okAmt = (v: number, min: number, max: number) => v >= min && v <= maxFor(max);
    const gameName = (g: CasinoGame) => (g === 'bj' ? 'blackjack' : 'poker');
    let panel: Panel;
    const rerender = () => {
      if (this.panel === panel) this.renderPanel();
    };
    const sit = (game: CasinoGame, st: PkState | BjState, bought: number) => {
      if (bought > 0) {
        s.money -= bought;
        this.game.save();
      }
      const key = 'hustle.poker.bought';
      let spent = 0;
      try {
        const m = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>;
        spent = (m[st.code] || 0) + bought;
        localStorage.setItem(key, JSON.stringify({ [st.code]: spent }));
      } catch {
        spent = bought;
      }
      this.close();
      const done = () => {
        try {
          localStorage.removeItem(key);
        } catch {
          /* niente */
        }
      };
      if (game === 'bj') new BlackjackTable(this.game, st.code, st as BjState, spent, done).open();
      else new PokerTable(this.game, st.code, st as PkState, spent, done).open();
    };
    const fail = (e: unknown) => {
      const d = (e as { data?: { code?: string; game?: CasinoGame } }).data;
      if (d?.code) where = { game: d.game ?? kind, code: d.code };
      err = (e as Error).message;
      busy = '';
      rerender();
    };
    for (const g of ['poker', 'bj'] as const) {
      void casino<{ code: string | null }>(g, 'where', {}, 60000).then((j) => {
        if (j.code) {
          where = { game: g, code: j.code };
          rerender();
        }
      }).catch(() => {});
    }
    panel = {
      guide: 'casino',
      money: true,
      title: isBj ? '🂡 Blackjack' : '🃏 Poker',
      // cifra delle fiches: si aggiorna mentre scrivi, senza ridisegnare la finestra
      after: (body) => wireBuyBox(body, (k, v) => {
        if (k === 'c') buyAmt = v;
        else joinAmt = v;
        const el = body.querySelector(`.pk-go-${k}`);
        if (el) el.textContent = euro(v);
      }),
      color: isBj ? '#7a1f3d' : '#1f7a4c',
      render: () => {
        if (blocked) return `<div class="card"><p class="small" style="margin:0">${esc(blocked)}</p></div>`;
        const [sb, bb] = STAKES[stake];
        const minBuy = minBuyOf(stake);
        const maxBuy = maxBuyOf(stake);
        const canCreate = maxFor(maxBuy) >= minBuy;
        if (canCreate && !okAmt(buyAmt, minBuy, maxBuy)) buyAmt = Math.min(maxFor(maxBuy), Math.round((minBuy + maxBuy) / 2 / bb) * bb);
        const stakes = STAKES.map(([a, b], i) => {
          const locked = !fameOk(STAKE_FAME[i]);
          return `<button class="seg ${i === stake ? 'on' : ''}" data-a="stake:${i}" ${locked || s.money < minBuyOf(i) ? 'disabled' : ''}>${isBj ? euro(b) : `${euro(a)}/${euro(b)}`}${locked ? `<small>🔒 ⭐ ${STAKE_FAME[i]}</small>` : ''}</button>`;
        }).join('');
        const label = isBj ? 'Puntata minima del tavolo' : 'Puntate del tavolo (piccolo e grande buio)';
        const limits = isBj ? `<div class="small muted" style="margin-top:6px">A ogni mano punti da ${euro(bb)} a ${euro(bb * BJ_MAX_BET_X)}</div>` : '';
        const rules = isBj
          ? points(`Porti da ${BJ_MIN_BUY_X} a ${BJ_MAX_BUY_X} puntate minime`, 'Diventano fiches, il resto del conto è al sicuro')
          : points(`Bui obbligatori: piccolo ${euro(sb)}, grande ${euro(bb)}`, `Porti da ${MIN_BUY_BB} a ${MAX_BUY_BB} grandi bui`, 'Diventano fiches, il resto del conto è al sicuro');
        const create = `<div class="card"><h3>➕ ${isBj ? 'Apri un tavolo' : 'Crea una stanza'}</h3>
            <div class="small muted">${label}</div><div class="segs pk-stakes">${stakes}</div>${limits}
            ${canCreate ? `<div class="small muted" style="margin-top:8px">Fiches da portare al tavolo</div>${buyBox('c', minBuy, maxFor(maxBuy), buyAmt, bb)}
              <button class="btn good full" data-a="create" style="margin-top:10px" ${busy ? 'disabled' : ''}>${busy === 'create' ? 'Apro il tavolo…' : `${isBj ? 'Apri il tavolo' : 'Crea la stanza'} (<span class="pk-go-c">${euro(buyAmt)}</span>)`}</button>`
            : `<p class="small bad" style="margin:8px 0 0">Per questo tavolo servono almeno ${euro(minBuy)}.</p>`}
            ${points('I primi 2 tavoli sono per tutti', `Dal 3° serve fama (⭐ ${STAKE_FAME.slice(2).join(', ')}): hai ⭐ ${fame().toFixed(1)}`)}
            ${rules}</div>`;
        let joinBox = '';
        if (info) {
          const unit = isBj ? info.min! : info.bb!;
          const jmax = maxFor(info.maxBuy);
          if (jmax >= info.minBuy && !okAmt(joinAmt, info.minBuy, info.maxBuy)) joinAmt = Math.min(jmax, Math.round((info.minBuy + info.maxBuy) / 2 / unit) * unit);
          const n = info.players.length;
          const what = isBj ? `puntate ${euro(info.min!)}–${euro(info.max!)}` : `bui ${euro(info.sb!)}/${euro(info.bb!)}`;
          joinBox = `<div class="pk-info"><b>${isBj ? 'Tavolo' : 'Stanza'} ${info.code}</b> · ${what} · ${n} ${n === 1 ? 'giocatore' : 'giocatori'}${info.started ? ' · partita in corso' : ''}
              <div class="small muted">${info.players.map(esc).join(', ')}</div></div>
            ${info.seated ? `<button class="btn good full" data-a="join" ${busy ? 'disabled' : ''}>Torna al tuo posto</button>`
              : !info.free ? `<p class="small bad">Il tavolo è pieno (${isBj ? 7 : 8} giocatori).</p>`
              : !fameOk(info.fame) ? `<p class="small bad">🔒 Per questo tavolo serve fama ⭐ ${info.fame} (la tua: ⭐ ${fame().toFixed(1)}).</p>`
              : jmax >= info.minBuy ? `<div class="small muted">Fiches da portare</div>${buyBox('j', info.minBuy, jmax, joinAmt, unit)}<button class="btn good full" data-a="join" style="margin-top:8px" ${busy ? 'disabled' : ''}>${busy === 'join' ? 'Entro…' : `Entra (<span class="pk-go-j">${euro(joinAmt)}</span>)`}</button>`
              : `<p class="small bad">Per questo tavolo servono almeno ${euro(info.minBuy)}.</p>`}`;
        }
        const join = `<div class="card"><h3>🔑 Entra con un codice</h3>
            <div class="row" style="gap:6px"><input class="lb-input pk-code-in" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Codice del tavolo" value="${esc(code)}" style="flex:1;font-size:16px;padding:9px 12px;text-transform:uppercase">
            <button class="btn sm blue" data-a="find" ${busy ? 'disabled' : ''}>${busy === 'find' ? 'Cerco…' : '🔍 Cerca'}</button></div>${joinBox}</div>`;
        const back = where ? `<div class="card hl"><h3>${where.game === 'bj' ? '🂡' : '🃏'} Sei ancora seduto al tavolo di ${gameName(where.game)} ${esc(where.code)}</h3><button class="btn good full" data-a="rejoin" ${busy ? 'disabled' : ''}>Torna al tavolo</button></div>` : '';
        const intro = isBj
          ? points('Arriva più vicino a 21 del banco, senza superarlo', 'Da solo o con amici (fino a 7): ognuno contro il banco', 'Blackjack (asso + figura) paga 3 a 2', 'Il banco sta su 17', 'Raddoppi sulle prime 2 carte, dividi le coppie', 'Uscendo le fiches tornano sul conto', 'Mentre giochi qui la partita è ferma', 'Il primo collegamento può durare un minuto')
          : points("Texas Hold'em senza limite, da 2 a 8", 'Chi crea la stanza sceglie le puntate e manda il codice', 'Entri ed esci quando vuoi', 'Uscendo le fiches tornano sul conto', 'Con meno di 2 giocatori la stanza si chiude', 'Mentre giochi qui la partita è ferma', 'Il primo collegamento può durare un minuto');
        // anteprime: tavoli di prova del server (fiches finte, nel poker si gioca contro un bot)
        const practice = previewPr !== null ? `<div class="card hl"><p class="small" style="margin:0">🎯 Anteprima: tavolo di prova con fiches finte${isBj ? '' : ', contro un bot'}. I soldi che porti tornano uscendo.</p></div>` : '';
        return `${intro}
          ${practice}${back}${err ? `<p class="small center bad">${esc(err)}</p>` : ''}${create}${join}`;
      },
      actions: {
        stake: (i) => {
          stake = +i;
          buyAmt = 0;
        },
        create: () => {
          const buy = buyAmt;
          if (!fameOk(STAKE_FAME[stake])) {
            err = `Per questo tavolo serve fama ⭐ ${STAKE_FAME[stake]}`;
            return;
          }
          if (!okAmt(buy, minBuyOf(stake), maxBuyOf(stake))) {
            err = `Scegli quante fiches portare: da ${euro(minBuyOf(stake))} a ${euro(maxFor(maxBuyOf(stake)))}`;
            return;
          }
          busy = 'create';
          err = '';
          void call<{ code: string; bought: number; state: PkState | BjState }>('create', { nickname: pokerName(this.game), slot: currentSlot, stake, buy, fame: fame() })
            .then((j) => sit(kind, j.state, j.bought))
            .catch(fail);
        },
        find: () => {
          code = ((this.modal?.querySelector('.pk-code-in') as HTMLInputElement | null)?.value ?? '').trim().toUpperCase();
          if (code.length !== 5) {
            err = 'Il codice del tavolo ha 5 caratteri';
            return;
          }
          busy = 'find';
          err = '';
          info = null;
          void call<PkInfo | BjInfo>('info', { code }).then((j) => {
            info = j;
            joinAmt = 0;
            busy = '';
            rerender();
          }).catch(fail);
        },
        join: () => {
          if (!info) return;
          if (!info.seated && !fameOk(info.fame)) {
            err = `Per questo tavolo serve fama ⭐ ${info.fame}`;
            return;
          }
          const buy = info.seated ? 0 : joinAmt;
          if (!info.seated && !okAmt(buy, info.minBuy, info.maxBuy)) {
            err = `Scegli quante fiches portare: da ${euro(info.minBuy)} a ${euro(maxFor(info.maxBuy))}`;
            return;
          }
          busy = 'join';
          err = '';
          void call<{ bought: number; state: PkState | BjState }>('join', { code: info.code, nickname: pokerName(this.game), slot: currentSlot, buy, fame: fame() })
            .then((j) => sit(kind, j.state, j.bought))
            .catch(fail);
        },
        rejoin: () => {
          if (!where) return;
          const w = where;
          busy = 'join';
          void casino<{ bought: number; state: PkState | BjState }>(w.game, 'join', { code: w.code, nickname: pokerName(this.game), slot: currentSlot, buy: 0 })
            .then((j) => sit(w.game, j.state, j.bought))
            .catch((e) => {
              where = null;
              fail(e);
            });
        },
      },
    };
    this.open(panel);
  }

  /** Negozio: accesso veloce a concessionaria, agenzia immobiliare e stile del personaggio. */
  openShop() {
    const card = (a: string, icon: string, title: string, sub: string, color: string) =>
      `<button class="shop-card" data-a="${a}" style="--sc:${color}"><span class="shop-ico">${icon}</span><span><b>${title}</b><small>${sub}</small></span><span class="shop-go">›</span></button>`;
    this.open({
      guide: 'shop',
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
      guide: 'houses',
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
        return `${bullets('🏠 Compra una casa per <b>viverci</b>: lì dormi', 'Con <b>2+ case</b> affitti quelle dove non vivi', `🔑 L'affitto si guadagna <b>a gioco chiuso</b> (max ${RENT_MAX_HOURS} ore)`, 'Rivendendo recuperi l\'85%')}
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
      guide: 'style',
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
      guide: 'dealer',
      money: true,
      title: '🛵 Concessionaria',
      color: 'var(--blue)',
      render: () => `${canBuy ? '' : '<div class="card tint small">🛵 Per comprare vai alla <b>concessionaria</b> in centro.</div>'}${points('Con un veicolo giri la città più in fretta', 'Le auto pagano assicurazione e bollo ogni mese', 'Il tasto <b>🛵</b> ti fa salire e scendere')}` +
        VEHICLE_IDS.map((id) => {
          const v = VEHICLES[id];
          const owned = s.vehicles.includes(id);
          const using = s.riding === id;
          const pct = Math.round((v.speed / WALK_SPEED) * 100 - 100);
          const btn = owned
            ? `<button class="btn sm ${using ? 'sec' : 'blue'}" data-a="use:${id}" ${using ? 'disabled' : ''}>${using ? 'In uso' : 'Usa'}</button>`
            : `<button class="btn sm good" data-a="buyv:${id}" ${s.money < v.price || !canBuy ? 'disabled' : ''}>Compra ${euro(v.price)}</button>`;
          return `<div class="card ${owned ? 'hl' : ''}"><div class="row"><div class="icon-bubble" style="font-size:30px;width:54px;height:54px">${v.icon}</div>
            <div style="flex:1"><h3 style="margin:0">${v.name} ${owned ? '<span class="tag g">tuo</span>' : ''}</h3><div class="muted small explain">${v.desc}</div></div></div>
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
      guide: 'missions',
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
            ${m.kind === 'variety' ? `<div class="small muted" style="margin-top:4px">Fatti: ${readyJobTypes().map((t) => { const n = m.types?.filter((x) => x === t).length ?? 0; return `<span style="opacity:${n ? 1 : 0.35}">${JOBS[t].icon} ${n}/3</span>`; }).join(' · ')}</div>` : ''}
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
        return `<h3 class="sec-title">🎯 Missioni di oggi</h3>${points('Cambiano ogni giorno', 'Più fama = premi più ricchi', 'I premi non contano per "Guadagna"')}${ms}
          <h3 class="sec-title">🗓️ Missioni della settimana</h3><p class="muted small explain" style="margin-top:-4px">Più lunghe, con premi più ricchi.</p><p class="small" style="margin:-4px 0 6px">⏳ ${left > 1 ? `Restano ${left} giorni` : 'Ultimo giorno'}</p>${wk}
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
      guide: 'calendar',
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
            ${points('Sabato: 🛒 mercato', 'Domenica: 🌳 tutti al parco', `Meteo previsto fino a ${FORECAST_DAYS} giorni prima`)}</div>`;
      },
    });
  }

  // ---------------- mappa ----------------

  openMap(focusId?: string) {
    this.mapScreen.open(focusId);
    this.guideLater('hud:map');
  }

  /** Guida di una cosa appena toccata: parte appena il gioco ha disegnato la finestra o la scheda nuova. */
  private guideLater(key: string) {
    setTimeout(() => this.guide.triggerAll(key), 60);
  }

  /** Finestra aperta o scheda cambiata: guida della finestra e della scheda accesa. */
  private guidePanel(open: boolean) {
    const name = this.panel?.guide;
    if (!name) return;
    setTimeout(() => {
      if (this.panel?.guide !== name) return;
      if (open) this.guide.triggerAll(`panel:${name}`);
      const on = this.modal?.querySelector<HTMLElement>('.tab.on')?.dataset.a;
      if (on) this.guide.triggerAll(`${name}/${on}`);
    }, 60);
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
      guide: 'profile',
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
          <div class="prof-bar">${btn('stats', '📊', 'Statistiche')}${btn('friends', '👥', 'Amici', req)}${btn('skills', '⭐', 'Esperienza')}${btn('boards', '🏆', 'Classifiche')}${btn('logo', '🎨', 'Logo')}${btn('account', '🔑', loggedIn() ? 'Account ✅' : 'Account')}</div>
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
        account: () => this.openAccount(),
      },
    });
  }

  /** Nome con cui compari in classifica e sulla mappa degli amici. */
  /** `required`: il nome di prima è di un altro giocatore, se ne deve scegliere un altro (non si chiude). */
  openNameEditor(required = false) {
    let draft = lbNickname();
    let msg = required ? `Il nome <b>${esc(lbNickname())}</b> è già di un altro giocatore: scegline un altro` : '';
    let busy = false;
    const panel: Panel = {
      title: '✏️ Il tuo nome',
      small: true,
      locked: required,
      color: 'var(--blue)',
      render: () => `${points('Compare in classifica e nella città degli amici', 'È unico: nessun altro può averlo', "Serve anche per entrare nell'account")}
        <input class="lb-input" maxlength="${MAX_NICK}" placeholder="Il tuo nome" value="${esc(draft)}">
        ${msg ? `<p class="small bad" style="margin:6px 0 0">${msg}</p>` : ''}
        <button class="btn good full" data-a="save" style="margin-top:10px" ${busy ? 'disabled' : ''}>${busy ? '⏳ Controllo il nome…' : '✅ Salva il nome'}</button>`,
      actions: {
        save: () => {
          draft = (this.modal?.querySelector('.lb-input') as HTMLInputElement | null)?.value ?? '';
          if (!draft.trim()) {
            msg = '✏️ Scrivi un nome';
            return;
          }
          busy = true;
          msg = '';
          void chooseName(draft).then((r) => {
            busy = false;
            if (r === 'taken') msg = `<b>${esc(draft.trim())}</b> è già di un altro giocatore: scegline un altro`;
            else if (r === 'bad') msg = 'Questo nome non va bene: provane un altro';
            if (r === 'taken' || r === 'bad') {
              if (this.panel === panel) this.renderPanel();
              return;
            }
            void submitScore(this.s, true);
            this.toast(r === 'offline' ? '✅ Nome salvato (lo controllo appena c\'è internet)' : '✅ Nome salvato', 'good');
            if (this.panel !== panel) return;
            if (this.panel.back) this.goBack();
            else this.close();
          });
        },
      },
    };
    this.open(panel);
  }

  /**
   * Account: il nome (unico) + una password. Le partite si salvano sul server da sole; su un altro telefono
   * si entra con nome e password e tornano partite, amici e classifica.
   */
  openAccount() {
    let tab: 'salva' | 'entra' = 'salva';
    let msg = '';
    let busy = false;
    let sure = false;
    let pwOpen = false;
    // nome e password scritti per entrare (restano scritti tra un tocco e l'altro)
    let inName = '';
    let inPw = '';
    const read = (sel: string) => (this.modal?.querySelector(sel) as HTMLInputElement | null)?.value ?? '';
    const when = (t: number) => (t ? new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'mai');
    const panel: Panel = {
      guide: 'account',
      title: '🔑 Account',
      small: true,
      color: 'var(--blue)',
      render: () => {
        const note = msg ? `<p class="small ${msg.startsWith('✅') ? 'good' : 'bad'}" style="margin:8px 0 0">${msg}</p>` : '';
        const wait = busy ? 'disabled' : '';
        if (loggedIn()) {
          return `<div class="card hero tint"><div class="emoji">✅</div><div class="big">${esc(lbNickname())}</div><div class="muted small">Le tue partite sono salvate sul server</div></div>
            <div class="row between small" style="margin:8px 2px"><span>💾 Ultimo salvataggio</span><b data-g="saved">${when(lastCloudSave())}</b></div>
            ${points("Si salva da solo mentre giochi e quando chiudi", 'Su un altro telefono: 🔑 Entra con nome e password')}
            <button class="btn good full" data-a="now" ${wait}>${busy ? '⏳ Salvo…' : '💾 Salva adesso'}</button>
            ${pwOpen ? `<div class="card" style="margin-top:10px"><h3>🔑 Cambia password</h3>
              <input class="lb-input acc-old" type="password" autocomplete="current-password" placeholder="Password di adesso">
              <input class="lb-input acc-new" type="password" autocomplete="new-password" placeholder="Password nuova (almeno ${MIN_PASSWORD} caratteri)" style="margin-top:6px">
              <button class="btn full" data-a="pwSave" style="margin-top:8px" ${wait}>✅ Salva la password</button></div>` : '<button class="btn sec full" data-a="pw" style="margin-top:8px">🔑 Cambia password</button>'}
            <button class="btn ${sure ? 'danger' : 'sec'} full" data-a="out" style="margin-top:8px" ${wait}>${sure ? 'Sicuro? Tocca ancora' : '🚪 Esci dall\'account'}</button>
            ${note}`;
        }
        const tabs = `<div class="tabs">${([['salva', '💾 Salva'], ['entra', '🔑 Entra']] as const).map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        if (tab === 'salva') {
          return `${tabs}${points('Le partite si salvano sul server', 'Le ritrovi su un altro telefono con nome e password')}
            <div class="card" data-g="name"><div class="row between"><div><div class="muted small">Il tuo nome (per entrare)</div><b>${esc(lbNickname() || '—')}</b></div><button class="btn sm sec" data-a="name">✏️ Cambia</button></div></div>
            <input class="lb-input acc-pw" type="password" autocomplete="new-password" placeholder="Password (almeno ${MIN_PASSWORD} caratteri)">
            <input class="lb-input acc-pw2" type="password" autocomplete="new-password" placeholder="Ripeti la password" style="margin-top:6px">
            <button class="btn good full" data-a="reg" style="margin-top:10px" ${wait}>${busy ? '⏳ Salvo…' : '💾 Crea l\'account e salva'}</button>${note}`;
        }
        return `${tabs}${points('Hai già un account? Entra con nome e password', "Le partite dell'account sostituiscono quelle di qui")}
          <input class="lb-input acc-name" autocomplete="username" maxlength="${MAX_NICK}" placeholder="Il tuo nome" value="${esc(inName)}">
          <input class="lb-input acc-pw" type="password" autocomplete="current-password" placeholder="Password" style="margin-top:6px" value="${esc(inPw)}">
          <div class="small bad" style="margin-top:6px">⚠️ Le partite di questo telefono verranno sostituite</div>
          <button class="btn ${sure ? 'danger' : 'good'} full" data-a="in" style="margin-top:10px" ${wait}>${busy ? '⏳ Entro…' : sure ? 'Sicuro? Tocca ancora' : '🔑 Entra'}</button>${note}`;
      },
      actions: {
        tab: (k) => {
          tab = k as 'salva' | 'entra';
          msg = '';
          sure = false;
        },
        name: () => this.openNameEditor(),
        reg: () => {
          const a = read('.acc-pw');
          if (a !== read('.acc-pw2')) {
            msg = 'Le due password non sono uguali';
            return;
          }
          busy = true;
          msg = '';
          void accountRegister(a).then((err) => {
            busy = false;
            msg = err ?? '✅ Account creato: le tue partite sono salvate';
            if (!err) this.toast('🔑 Account creato', 'good');
            if (this.panel === panel) this.renderPanel();
          });
        },
        in: () => {
          inName = read('.acc-name');
          inPw = read('.acc-pw');
          const name = inName;
          const pw = inPw;
          if (!name.trim() || !pw) {
            msg = 'Scrivi nome e password';
            return;
          }
          // le partite di questo telefono si perdono: secondo tocco per confermare
          if (!sure) {
            sure = true;
            return;
          }
          busy = true;
          msg = '';
          void accountLogin(name, pw).then((err) => {
            busy = false;
            sure = false;
            if (err) {
              msg = err;
              if (this.panel === panel) this.renderPanel();
              return;
            }
            // il gioco riparte con le partite dell'account
            this.game.resetting = true;
            location.reload();
          });
        },
        now: () => {
          busy = true;
          void cloudSave(true).then((ok) => {
            busy = false;
            msg = ok ? '✅ Salvato' : loggedIn() ? 'Non riesco a salvare: controlla internet' : 'Accesso scaduto: entra di nuovo con nome e password';
            if (this.panel === panel) this.renderPanel();
          });
        },
        pw: () => (pwOpen = true),
        pwSave: () => {
          const old = read('.acc-old');
          const nw = read('.acc-new');
          busy = true;
          void changePassword(old, nw).then((err) => {
            busy = false;
            msg = err ?? '✅ Password cambiata';
            if (!err) pwOpen = false;
            if (this.panel === panel) this.renderPanel();
          });
        },
        out: () => {
          if (!sure) {
            sure = true;
            return;
          }
          sure = false;
          busy = true;
          void accountLogout().then(() => {
            busy = false;
            msg = '';
            this.toast('🚪 Sei uscito dall\'account: le partite restano su questo telefono', 'info');
            if (this.panel === panel) this.renderPanel();
          });
        },
      },
    };
    this.open(panel);
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
        return `${points('Livello del settore = somma dei suoi lavori e attività', `Ogni ${EVOLVE_EVERY} livelli un lavoro si evolve`, 'La fama sale anche coi dipendenti, ma più piano', 'Più fama = più clienti e offerte migliori')}${skills}`;
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
            <small class="muted explain">All'amico arriva una richiesta: ricambia con un tocco</small></div>` : ''}`;
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
          const text = `Giochiamo a Hustle Idle! Aggiungimi con il mio codice amico: ${friendCode()} → https://alfa40.github.io/hustle-idle/`;
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

  /** il server ha detto che il nome è di un altro: si chiede subito di sceglierne un altro (una volta per avvio) */
  private takenAsked = false;
  /** il nome di adesso è stato confermato dal server in questo avvio */
  private nameOk = false;

  openLogoEditor(required = false) {
    const s = this.s;
    let draft: Logo = { ...s.logo };
    // il nome scritto (si salva, controllando che sia libero, con "Salva il logo")
    let nickDraft = lbNickname();
    /** avviso sotto il nome (già usato, non va bene) */
    let nickMsg = '';
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
          ${required ? '<div class="card tint small">Scegli il <b>tuo nome</b> e il <b>logo</b>: vanno su insegne e classifiche.<br>Si cambiano dal 👤 Profilo.</div>' : ''}
          <div class="lg-preview ${editing ? 'is-editing' : ''}">${editing ? '<canvas class="ph-mini" width="200" height="200"></canvas>' : `<img src="${logoUrl(draft, 200)}" width="120" height="120" alt="">`}<div><b>${esc(lbNickname() || 'Senza nome')}</b><small>${editing ? '✏️ Anteprima della foto' : draft.photo ? '📷 Logo con la tua foto' : '🎨 Logo disegnato'}</small></div></div>
          <h4 class="lg-h">Il tuo nome</h4>
          <input class="lb-input lg-nick" maxlength="${MAX_NICK}" placeholder="Il tuo nome" value="${esc(nickDraft)}" data-c="nick">${nickMsg ? `<p class="small bad" style="margin:4px 0 0">${nickMsg}</p>` : ''}</div>`;
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
            ? `<div class="card center"><img class="lg-photo-big" src="${logoUrl(draft, 320)}" alt="">${points('La foto la vedono solo gli amici', 'In classifica mondiale va il logo disegnato')}
                <div class="lg-row" style="justify-content:center"><button class="btn sm purple" data-a="retouch">✏️ Ritocca</button><button class="btn sm sec" data-a="upload">📷 Cambia foto</button><button class="btn sm danger" data-a="nophoto">🗑️ Togli la foto</button></div></div>`
            : `<div class="card center lg-pick"><div class="emoji">📷</div><b>Usa una tua foto come logo</b>${explain('Puoi spostarla, ingrandirla, ruotarla e ritoccarla')}
                <button class="btn purple full" data-a="upload">📷 Scegli una foto</button>${points('La foto la vedono solo gli amici', 'In classifica mondiale va il logo disegnato')}</div>`;
          foot = `<button class="btn good" data-a="save">✅ Salva il logo</button>`;
        } else {
          // creare il logo da zero
          main = `${draft.photo ? '<div class="card tint small row between"><span>📷 Usi la foto: questo disegno va in classifica mondiale</span><button class="btn sm sec" data-a="nophoto">Usa il disegno</button></div>' : ''}
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
        // il nome si salva (e si controlla che sia libero) con "Salva il logo"
        nick: () => (nickDraft = read('.lg-nick')),
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
          if (this.modal?.querySelector('.lg-nick')) nickDraft = read('.lg-nick');
          const nick = nickDraft;
          if (!nick.trim()) {
            this.toast('✏️ Scrivi il tuo nome', 'bad');
            (this.modal?.querySelector('.lg-nick') as HTMLInputElement | null)?.focus();
            return;
          }
          // il nome è unico: prima si chiede al server se è libero (senza rete si tiene e si controlla dopo)
          if (nick !== lbNickname() || nameTaken() || !this.nameOk) {
            void chooseName(nick).then((r) => {
              if (r === 'taken' || r === 'bad') {
                nickMsg = r === 'taken' ? `<b>${esc(nick.trim())}</b> è già di un altro giocatore: scegli un altro nome` : 'Questo nome non va bene: provane un altro';
                if (this.panel !== panel) return;
                this.renderPanel();
                const inp = this.modal?.querySelector<HTMLInputElement>('.lg-nick');
                inp?.scrollIntoView({ block: 'center' });
                inp?.focus();
                return;
              }
              nickMsg = '';
              this.nameOk = true;
              if (this.panel === panel) panel.actions.save('');
            });
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
        ${points('Presto potrai entrare nelle attività degli amici', mine ? "Qui c'è anche la tua attività" : 'Questo posto da te è libero: puoi comprarlo lo stesso')}
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
      guide: 'home',
      title: '🏠 Casa tua',
      small: true,
      color: 'var(--green)',
      live: true,
      render: () => {
        const h = hourOf(s);
        const canSleep = h >= 19 || h < 6;
        return `<div class="hero"><div class="emoji">🏡</div></div>
          ${explain('Col tasto verde <b>🏠 Casa</b> torni qui all\'istante', 'center')}
          <button class="btn blue full" data-a="sleep" ${canSleep ? '' : 'disabled'}>😴 Dormi fino alle 7:00</button>
          <p class="center muted small">${canSleep ? 'Dormire fa passare la notte' : 'Puoi dormire dalle 19:00'}</p>`;
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

  /** proposte dei tester (src/ui/proposals.ts): la bozza resta anche chiudendo la finestra */
  private proposalsView?: Proposals;
  private get proposals() {
    return (this.proposalsView ??= new Proposals(this.game, () => this.renderPanel()));
  }

  /**
   * Tasto "Proponi" (telefoni tester): la scheda per proporre una modifica, da qualsiasi punto del gioco. Se c'è
   * già una finestra aperta la si mette da parte e alla chiusura si torna lì, com'era.
   */
  openPropose() {
    if (this.panel?.top) return;
    this.proposals.capture();
    const prev = this.panel;
    if (prev) {
      this.modal?.remove();
      this.modal = null;
      this.panel = null;
    }
    // telefono dello sviluppatore: anche la scheda per leggere e approvare le proposte
    let tab = 'proponi';
    this.open({
      guide: 'propose',
      title: '📝 Proposte',
      color: 'var(--gray)',
      top: true,
      render: () => {
        const tabs = canReview()
          ? `<div class="tabs">${[['proponi', '📝 Proponi'], ['proposte', '📮 Da approvare']]
              .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`
          : '';
        return tabs + (tab === 'proposte' ? this.proposals.reviewHtml() : this.proposals.formHtml());
      },
      after: (body) => {
        if (tab === 'proponi') this.proposals.after(body);
      },
      actions: { ...this.proposals.actions(), tab: (k) => (tab = k) },
      onClose: () => {
        if (prev) queueMicrotask(() => this.open(prev));
      },
    });
  }

  openSettings() {
    let confirm = false;
    // nella partita developer si apre subito sui comandi rapidi
    let tab = devGame ? 'dev' : 'impostazioni';
    this.open({
      guide: 'settings',
      title: '⚙️ Opzioni',
      color: 'var(--gray)',
      render: () => {
        const tabs = `<div class="tabs">${[
          ...(devGame ? [['dev', '🛠️ Developer']] : []),
          ['impostazioni', '⚙️ Impostazioni'], ['partita', '💾 Partita'], ['aiuto', '❓ Come si gioca']]
          .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab:${k}">${n}</button>`).join('')}</div><!--tabs-->`;
        if (tab === 'dev') return tabs + this.devHtml();
        if (tab === 'impostazioni') return tabs + settingsHtml();
        if (tab === 'partita') {
          return tabs + `
            <div class="card"><h3>💾 ${esc(this.s.saveName)}</h3><p class="muted small" style="margin:0">Slot ${currentSlot}</p>${explain('Si salva da sola ogni pochi secondi')}</div>
            <button class="btn blue full" data-a="menu">🏠 Salva e torna al menu principale</button>
            ${explain('Dal menu cambi partita o ne inizi una nuova', 'center')}
            <hr>
            <button class="btn danger full" data-a="reset">${confirm ? '⚠️ Sicuro? Tocca di nuovo per cancellare questa partita' : '🗑️ Ricomincia questa partita da capo'}</button>`;
        }
        return tabs + `
          <div class="card"><h3>🕹️ Comandi</h3>${bullets(`Muoviti: trascina nella metà ${moveSide()}`, `Azione: sul cerchio a terra tocca la <b>metà ${actSide()}</b>`, '"Tieni premuto": dito giù finché il cerchio è pieno', 'I lati si invertono in ⚙️ Opzioni')}
            <h4 style="margin:8px 0 2px">Nei lavoretti</h4>${bullets(`🕹️ in basso a ${moveSide()} per camminare`, 'Trascina altrove per guardarti attorno', "Tocca l'oggetto che pulsa")}
            <h4 style="margin:8px 0 2px">Su PC</h4>${bullets('WASD o frecce', 'E o spazio per l\'azione')}</div>
          <div class="card"><h3>⏰ Tempo</h3>${bullets('1 mese di gioco = 2 ore reali', '1 giornata = 4 minuti', `A gioco chiuso il tempo va ${TIME.OFFLINE_SLOWDOWN} volte più piano`, 'Offline le attività guadagnano: 80% (primo giorno), 50% (2 giorni dopo), poi 20%')}</div>`;
      },
      actions: {
        ...this.devActions(),
        tab: (k) => (tab = k),
        set: (v) => settingsAction('set:' + v),
        tog: (v) => settingsAction('tog:' + v),
        hud: (v) => settingsAction('hud:' + v),
        menu: () => {
          this.game.save();
          this.game.resetting = true;
          // app developer: si torna alla sua schermata (anteprime, tester)
          if (devApp) location.href = './developer.html';
          // anteprima aperta con ?subito: al menu dell'anteprima, senza ripartire subito
          else if (previewPr !== null && location.search) location.href = location.pathname;
          else location.reload();
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

  // ---------------- partita developer (src/dev.ts) ----------------

  /** Comandi rapidi della partita developer: soldi, lavoretti a ogni gradino, attività, tempo. */
  private devHtml() {
    const s = this.s;
    const lines = [...linesOf('logistica'), ...linesOf('cucina')].map((l) => `<div class="card"><h3>${l.icon} ${l.name} <span class="tag">Liv. ${lineLevel(s, l.id)}</span></h3>
        <div class="dev-grid">${l.ladder.map((name, r) => `<button class="btn sm" data-a="devJob:${l.id}|${r}">▶ ${r + 1}. ${name}</button>`).join('')}</div>
        <div class="row small" style="gap:6px;margin-top:6px;flex-wrap:wrap">Livello della linea: ${[1, 10, 20, 30, 40].map((v) => `<button class="btn sm sec" data-a="devLvl:${l.id}|${v}">${v}</button>`).join('')}</div></div>`).join('');
    return `<div class="card hl"><h3>🛠️ Partita developer</h3><p class="small" style="margin:0">Non va in classifica e non risulta "sta giocando" agli amici. 💰 ${euro(s.money)}</p>
        <div class="dev-grid" style="margin-top:8px"><button class="btn sm good" data-a="devMoney">+ €1 miliardo</button><button class="btn sm" data-a="devHour">⏩ +1 ora</button><button class="btn sm" data-a="devMorning">🌅 Domani alle 8</button><button class="btn sm sec" data-a="devTut">🎓 Rifai i tutorial</button></div></div>
      <h3 class="sec-title">🎮 Gioca subito un lavoretto</h3>${lines}
      <h3 class="sec-title">🏢 Attività</h3>
      <div class="card"><div class="dev-grid"><button class="btn sm blue" data-a="devUpg">⬆️ Tutte le migliorie al massimo</button><button class="btn sm blue" data-a="devOrders">📋 Un ordine subito in ogni attività</button><button class="btn sm blue" data-a="devStaff">👥 Personale completo + manager</button></div>
      <p class="muted small explain" style="margin:6px 0 0">Con le migliorie al massimo si apre subito l'evoluzione (scheda 🌱 dell'attività). Il personale completo la fa lavorare da sola.</p></div>`;
  }

  /** Fa partire subito un lavoretto (linea e gradino, da 0): partita developer e anteprime delle proposte. */
  playJobNow(line: string, rung: number) {
    const s = this.s;
    const level = rung === 0 ? 1 : rung * EVOLVE_EVERY;
    s.jobXp ??= {};
    if (lineLevel(s, line) < level || lineLevel(s, line) >= level + EVOLVE_EVERY) s.jobXp[line] = LEVEL.xpForLevel(Math.max(1, level)) + 1;
    const type = line as JobOffer['type'];
    const offer: JobOffer = { id: s.jobSeq++, type, slot: 0, level, pay: this.game.offerPay(type, level) };
    s.jobs.push(offer);
    while (this.isOpen) this.close();
    this.game.startJob(offer, !this.game.tutorial.isDone(jobInfo(type, level).key));
  }

  private devActions(): Actions {
    const s = this.s;
    const xpFor = (l: number) => LEVEL.xpForLevel(Math.max(1, l)) + 1;
    return {
      devMoney: () => addMoney(s, 1_000_000_000),
      devHour: () => advance(s, 60),
      devMorning: () => this.game.sleep(),
      devTut: () => {
        s.jobTutorials = [];
        s.bizTutorials = [];
        this.guide.reset();
        toast('🎓 I tutorial ripartono', 'info');
      },
      devLvl: (arg) => {
        const [line, v] = arg.split('|');
        s.jobXp ??= {};
        s.jobXp[line] = xpFor(+v);
      },
      devJob: (arg) => {
        const [line, r] = arg.split('|');
        this.playJobNow(line, +r);
      },
      devUpg: () => {
        for (const b of s.businesses) {
          for (const id of upgradeIdsFor(b.type, hasInterior(b.type), hasCashUpgrade(b.type))) b.upgrades[id] = upgOf(b.type, id).max;
          this.game.setupLot(b.lotId);
        }
        toast('⬆️ Migliorie al massimo in tutte le attività', 'good');
      },
      devOrders: () => {
        for (const b of s.businesses) {
          if (bizType(b.type).kind !== 'service') continue;
          for (const p of b.products) {
            b.orders.push({ id: s.orderSeq++, pid: p, expires: s.minutes + 24 * 60, house: Math.floor(Math.random() * 999) });
            b.stock[p] = Math.max(b.stock[p] ?? 0, 10);
          }
        }
        toast('📋 Ordini arrivati in tutte le attività di servizio', 'good');
      },
      devStaff: () => {
        for (const b of s.businesses) {
          for (const r of [...(bizType(b.type).roles as Role[]), 'manager' as Role]) {
            if (b.staff.some((e) => e.role === r)) continue;
            const e = makeCandidate(s, r);
            e.hiredDay = Math.floor(s.minutes / 1440);
            b.staff.push(e);
          }
        }
        toast('👥 Personale completo in tutte le attività', 'good');
      },
    };
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
        ${r.revenue === 0 ? points('Mentre sei via lavorano solo le attività con staff completo e manager', 'Con una persona per reparto: solo 8 ore al giorno') : ''}
        <button class="btn full" data-a="ok" style="margin-top:12px">Continua</button>`,
      actions: { ok: () => this.close() },
    });
  }

}


/** Tasto "Proponi": tenendolo premuto si sposta dove si vuole; lasciandolo si attacca al bordo più vicino
 *  (sinistra o destra) all'altezza scelta, e resta lì anche le volte dopo. */
function movableFab(fab: HTMLElement) {
  const KEY = 'hustle.propFab';
  const place = (side: string, y: number) => {
    fab.classList.toggle('right', side === 'r');
    fab.style.top = `${Math.min(92, Math.max(8, y * 100))}%`;
  };
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { side: string; y: number } | null;
    if (p) place(p.side, p.y);
  } catch { /* posizione di partenza */ }
  let timer = 0;
  let moving = false;
  let skipClick = false;
  let x0 = 0;
  let y0 = 0;
  const follow = (x: number, y: number) => {
    fab.style.left = `${x}px`;
    fab.style.top = `${y}px`;
  };
  fab.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    y0 = e.clientY;
    skipClick = false;
    fab.setPointerCapture(e.pointerId);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      moving = true;
      fab.classList.add('moving');
      navigator.vibrate?.(15);
      follow(x0, y0);
    }, 350);
  });
  fab.addEventListener('pointermove', (e) => {
    if (moving) follow(e.clientX, e.clientY);
    else if (Math.hypot(e.clientX - x0, e.clientY - y0) > 12) clearTimeout(timer);
  });
  const end = (e: PointerEvent) => {
    clearTimeout(timer);
    if (!moving) return;
    moving = false;
    // il "click" che arriva subito dopo il trascinamento non apre la finestra
    skipClick = true;
    setTimeout(() => (skipClick = false), 400);
    fab.classList.remove('moving');
    fab.style.left = '';
    const side = e.clientX > innerWidth / 2 ? 'r' : 'l';
    const y = e.clientY / innerHeight;
    place(side, y);
    try { localStorage.setItem(KEY, JSON.stringify({ side, y })); } catch { /* resta solo per ora */ }
  };
  fab.addEventListener('pointerup', end);
  fab.addEventListener('pointercancel', end);
  // dopo averlo spostato non si apre la finestra
  fab.addEventListener('click', (e) => {
    if (!skipClick) return;
    skipClick = false;
    e.stopImmediatePropagation();
  }, true);
  fab.addEventListener('contextmenu', (e) => e.preventDefault());
}
