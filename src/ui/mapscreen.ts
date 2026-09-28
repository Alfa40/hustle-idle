import { CITY_MAP, TILE } from '../config/map';
import type { Game, MapMarker, MarkerCat } from '../game';
import { drawMap, type MapView, type PinHit } from './map';

const CATS: { id: Exclude<MarkerCat, 'target'>; icon: string; name: string }[] = [
  { id: 'jobs', icon: '🟡', name: 'Lavoretti' },
  { id: 'mine', icon: '🏪', name: 'Le mie' },
  { id: 'forsale', icon: '🏷️', name: 'In vendita' },
  { id: 'places', icon: '📍', name: 'Luoghi' },
];

const FILTER_KEY = 'hustleidle.mapfilters';
const WORLD = Math.max(CITY_MAP.length, CITY_MAP[0].length) * TILE;
const MIN_SPAN = 22;
const MAX_SPAN = WORLD * 1.12;

/** Toglie accenti e maiuscole per una ricerca più tollerante. */
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DIRS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
const dirIcon = (dx: number, dz: number) => DIRS[Math.round(((((Math.atan2(dx, -dz) * 180) / Math.PI) + 360) % 360) / 45) % 8];

export interface MapScreenHooks {
  /** apre la scheda di un lotto o di un'attività */
  openDetails(m: MapMarker): void;
}

/**
 * Mappa a tutto schermo: si trascina, si ingrandisce (due dita, rotellina o
 * pulsanti), si filtrano le icone per categoria e si cerca per nome.
 */
export class MapScreen {
  private el: HTMLDivElement | null = null;
  private cv!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private view: MapView = { cx: 0, cz: 0, span: 110, full: true };
  private filters = new Set<string>(CATS.map((c) => c.id));
  private query = '';
  private selected: string | null = null;
  private hits: PinHit[] = [];
  private markers: MapMarker[] = [];
  private raf = 0;
  private w = 0;
  private h = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private fly: { cx: number; cz: number; span: number } | null = null;

  constructor(private game: Game, private hooks: MapScreenHooks) {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) this.filters = new Set(JSON.parse(saved));
    } catch {
      /* preferenza non disponibile: tutti i filtri attivi */
    }
  }

  get isOpen() {
    return !!this.el;
  }

  open(focusId?: string) {
    if (this.el) return;
    const p = this.game.player.root.position;
    this.view = { cx: p.x, cz: p.z, span: 110, full: true };
    this.selected = focusId ?? null;
    this.query = '';
    this.game.paused = true;
    this.game.renderPaused = true;
    this.game.input.cancel();

    const el = document.createElement('div');
    el.className = 'mapscreen';
    el.innerHTML = `
      <div class="ms-head">
        <div class="ms-search"><span>🔍</span><input type="search" enterkeyhint="search" placeholder="Cerca: panificio, giardino, corso Roma…" /><button class="ms-clear" aria-label="Cancella">✕</button></div>
        <button class="ms-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="ms-chips"></div>
      <div class="ms-stage">
        <canvas></canvas>
        <div class="ms-results"></div>
        <div class="ms-zoom">
          <button data-z="in" aria-label="Ingrandisci">＋</button>
          <button data-z="out" aria-label="Rimpicciolisci">－</button>
          <button data-z="me" aria-label="Centra su di me">◎</button>
          <button data-z="all" aria-label="Tutta la città">⤢</button>
        </div>
        <div class="ms-card"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    this.g = this.cv.getContext('2d')!;

    const input = el.querySelector('input')!;
    input.addEventListener('input', () => {
      this.query = input.value.trim();
      this.renderResults();
    });
    input.addEventListener('focus', () => this.renderResults());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.searchResults()[0];
        if (first) this.focus(first);
        input.blur();
      }
    });
    el.querySelector('.ms-clear')!.addEventListener('click', () => {
      input.value = '';
      this.query = '';
      this.renderResults();
    });
    el.querySelector('.ms-close')!.addEventListener('click', () => this.close());
    el.querySelectorAll<HTMLButtonElement>('[data-z]').forEach((b) =>
      b.addEventListener('click', () => {
        const z = b.dataset.z;
        if (z === 'in') this.zoomAt(this.w / 2, this.h / 2, 1.6);
        if (z === 'out') this.zoomAt(this.w / 2, this.h / 2, 1 / 1.6);
        if (z === 'me') {
          const pp = this.game.player.root.position;
          this.fly = { cx: pp.x, cz: pp.z, span: 70 };
        }
        if (z === 'all') this.fly = { cx: 0, cz: 0, span: MAX_SPAN * 0.95 };
      }),
    );
    el.querySelector('.ms-results')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!b) return;
      const m = this.markers.find((x) => x.id === b.dataset.id);
      if (m) this.focus(m);
      input.blur();
      this.query = input.value.trim();
      (el.querySelector('.ms-results') as HTMLElement).classList.remove('on');
    });
    el.querySelector('.ms-chips')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
      if (!b) return;
      const f = b.dataset.f!;
      if (this.filters.has(f)) this.filters.delete(f);
      else this.filters.add(f);
      try {
        localStorage.setItem(FILTER_KEY, JSON.stringify([...this.filters]));
      } catch {
        /* niente */
      }
      this.renderChips();
    });
    el.querySelector('.ms-card')!.addEventListener('click', (e) => this.onCard(e));
    this.bindGestures();
    window.addEventListener('resize', this.resize);
    this.resize();
    this.markers = this.game.mapMarkers();
    if (focusId) {
      const m = this.markers.find((x) => x.id === focusId);
      if (m) this.focus(m);
    }
    this.renderChips();
    this.renderCard();
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  close() {
    if (!this.el) return;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.el.remove();
    this.el = null;
    this.game.paused = false;
    this.game.renderPaused = false;
  }

  // ---------------- vista ----------------

  private resize = () => {
    const stage = this.el?.querySelector('.ms-stage') as HTMLElement | null;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.cv.style.width = r.width + 'px';
    this.cv.style.height = r.height + 'px';
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private get scale() {
    return Math.min(this.w, this.h) / this.view.span;
  }

  private clampView() {
    const v = this.view;
    v.span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, v.span));
    const lim = WORLD / 2 + 10;
    v.cx = Math.max(-lim, Math.min(lim, v.cx));
    v.cz = Math.max(-lim, Math.min(lim, v.cz));
  }

  /** Zoom mantenendo fermo il punto sotto il dito (o al centro). */
  private zoomAt(px: number, py: number, f: number) {
    this.fly = null;
    const s0 = this.scale;
    const wx = this.view.cx + (px - this.w / 2) / s0;
    const wz = this.view.cz + (py - this.h / 2) / s0;
    this.view.span /= f;
    this.clampView();
    const s1 = this.scale;
    this.view.cx = wx - (px - this.w / 2) / s1;
    this.view.cz = wz - (py - this.h / 2) / s1;
    this.clampView();
  }

  private focus(m: MapMarker) {
    this.selected = m.id;
    this.fly = { cx: m.x, cz: m.z, span: Math.min(this.view.span, 70) };
    this.renderCard();
  }

  private bindGestures() {
    const cv = this.cv;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* puntatore già rilasciato */
      }
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 1) this.moved = 0;
      this.fly = null;
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.el?.querySelector('.ms-results')?.classList.remove('on');
    });
    cv.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const cur = local(e);
      if (this.pointers.size === 1) {
        const s = this.scale;
        this.view.cx -= (cur.x - prev.x) / s;
        this.view.cz -= (cur.y - prev.y) / s;
        this.moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
        this.clampView();
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
        if (d0 > 0) this.zoomAt((cur.x + other.x) / 2, (cur.y + other.y) / 2, d1 / d0);
        // anche lo spostamento del punto medio muove la mappa
        const s = this.scale;
        this.view.cx -= (cur.x - prev.x) / 2 / s;
        this.view.cz -= (cur.y - prev.y) / 2 / s;
        this.moved += 99;
        this.clampView();
      }
      this.pointers.set(e.pointerId, cur);
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p || this.pointers.size > 0 || this.moved > 8) return;
      // tocco: seleziona l'icona più vicina
      let best: PinHit | null = null;
      let bd = Infinity;
      for (const h of this.hits) {
        const d = Math.hypot(h.x - p.x, h.y - p.y);
        if (d < Math.max(h.r, 22) && d < bd) {
          best = h;
          bd = d;
        }
      }
      this.selected = best ? best.m.id : null;
      this.renderCard();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  // ---------------- ricerca e filtri ----------------

  private matches(m: MapMarker) {
    if (!this.query) return true;
    const hay = norm(`${m.label} ${m.sub ?? ''} ${m.keywords ?? ''}`);
    return norm(this.query).split(/\s+/).every((t) => hay.includes(t));
  }

  private visible(m: MapMarker) {
    if (m.cat === 'target') return true;
    if (this.query) return this.matches(m);
    return this.filters.has(m.cat);
  }

  private searchResults() {
    if (!this.query) return [];
    return this.markers.filter((m) => m.cat !== 'target' && this.matches(m)).sort((a, b) => a.dist - b.dist);
  }

  private renderChips() {
    if (!this.el) return;
    const counts = (c: string) => this.markers.filter((m) => m.cat === c).length;
    (this.el.querySelector('.ms-chips') as HTMLElement).innerHTML = CATS.map(
      (c) => `<button class="ms-chip ${this.filters.has(c.id) ? 'on' : ''}" data-f="${c.id}">${c.icon} ${c.name} <b>${counts(c.id)}</b></button>`,
    ).join('');
  }

  private renderResults() {
    if (!this.el) return;
    const box = this.el.querySelector('.ms-results') as HTMLElement;
    const res = this.searchResults();
    box.classList.toggle('on', !!this.query);
    const p = this.game.player.root.position;
    box.innerHTML = res.length
      ? res.slice(0, 8).map((m) => `<button data-id="${m.id}"><span class="ms-ico" style="background:${m.color}">${m.icon}</span>
          <span class="ms-rt"><b>${m.label}</b><small>${m.sub ?? ''} · ${dirIcon(m.x - p.x, m.z - p.z)} ${Math.round(m.dist)} m</small></span></button>`).join('')
      : `<div class="ms-none">Nessun risultato per “${this.query.replace(/[<>&"]/g, '')}”</div>`;
  }

  private renderCard() {
    if (!this.el) return;
    const card = this.el.querySelector('.ms-card') as HTMLElement;
    const m = this.markers.find((x) => x.id === this.selected);
    if (!m) {
      card.classList.remove('on');
      return;
    }
    const p = this.game.player.root.position;
    const isWay = this.game.waypoint?.id === m.id;
    const details = m.kind === 'lot' || m.kind === 'biz' || m.kind === 'dealer' || m.kind === 'agency' || m.kind === 'board';
    card.classList.add('on');
    card.innerHTML = `
      <div class="row"><div class="icon-bubble" style="background:${m.color}">${m.icon}</div>
        <div style="flex:1;min-width:0"><b>${m.label}</b><div class="muted small">${m.sub ? m.sub + ' · ' : ''}${dirIcon(m.x - p.x, m.z - p.z)} ${Math.round(m.dist)} m da te</div></div>
        <button class="ms-x" data-c="close" aria-label="Chiudi">✕</button></div>
      <div class="btnrow" style="margin-top:10px">
        ${m.cat === 'target' ? '' : isWay ? '<button class="btn sm sec" data-c="unway">✖ Togli segnaposto</button>' : '<button class="btn sm" data-c="way">📍 Segna percorso</button>'}
        ${details ? '<button class="btn sm blue" data-c="details">📄 Dettagli</button>' : ''}
      </div>`;
  }

  private onCard(e: Event) {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    const m = this.markers.find((x) => x.id === this.selected);
    if (!c) return;
    if (c === 'close') {
      this.selected = null;
      this.renderCard();
      return;
    }
    if (!m) return;
    if (c === 'way') {
      this.game.setWaypoint(m);
      this.close();
    } else if (c === 'unway') {
      this.game.setWaypoint(null);
      this.renderCard();
    } else if (c === 'details') {
      this.close();
      this.hooks.openDetails(m);
    }
  }

  // ---------------- disegno ----------------

  private tick = 0;
  private draw() {
    if (!this.el || !this.w) return;
    if (this.fly) {
      const v = this.view;
      const f = this.fly;
      v.cx += (f.cx - v.cx) * 0.18;
      v.cz += (f.cz - v.cz) * 0.18;
      v.span += (f.span - v.span) * 0.18;
      if (Math.abs(f.cx - v.cx) + Math.abs(f.cz - v.cz) + Math.abs(f.span - v.span) < 0.5) this.fly = null;
      this.clampView();
    }
    // le posizioni (lavori, giocatore) cambiano: aggiorna ogni mezzo secondo
    if (++this.tick % 30 === 0) {
      this.markers = this.game.mapMarkers();
      this.renderChips();
    }
    this.hits = drawMap(this.g, this.w, this.h, this.game, this.view, {
      markers: this.markers,
      show: (m) => this.visible(m) || m.id === this.selected,
      dim: (m) => !!this.query && !this.matches(m),
      selected: this.selected,
      labels: this.view.span < 95,
    });
  }
}
