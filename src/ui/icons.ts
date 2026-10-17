// Icone disegnate del gioco al posto delle emoji (regola: niente emoji, solo disegni nello stile del gioco).
//
// Nel codice le icone si scrivono ancora con il loro carattere (es. '📦'), che fa da nome: sullo schermo però
// non si vede mai l'emoji del telefono ma il disegno di src/ui/iconart.ts.
// - HTML: `watchIcons()` guarda tutta la pagina e mette il disegno al posto di ogni carattere. Il carattere resta
//   nel testo (nascosto), così `textContent` non cambia e i controlli "è cambiato?" continuano a funzionare.
// - Canvas (minigiochi, scritte 3D, mappa): `fillTextIco()` e `measureIco()` al posto di fillText/measureText.
import { ART, type Shape } from './iconart';

const INK = '#3a2f55';
/** emoji singola, con variante (FE0F), tono, sequenze unite (ZWJ) e bandiere */
const EMO_RE =
  /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}️?(?:[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}️?)*)/gu;

const norm = (e: string) => e.replace(/️/g, '');
const keyOf = new Map<string, string>();
for (const k of Object.keys(ART)) keyOf.set(norm(k), k);

/** il disegno di un'emoji (o null se non ce n'è uno: allora resta il carattere, es. frecce di testo) */
export function iconArt(e: string): Shape[] | null {
  const k = keyOf.get(norm(e));
  return k ? ART[k] : null;
}

export function hasEmoji(s: string) {
  EMO_RE.lastIndex = 0;
  return EMO_RE.test(s);
}

/** Toglie l'icona all'inizio di un nome (es. "📦 Consegna pacchi" → "Consegna pacchi"). */
export function stripLeadIcon(s: string) {
  EMO_RE.lastIndex = 0;
  const m = EMO_RE.exec(s);
  return m && m.index === 0 ? s.slice(m[0].length).trimStart() : s;
}

/** Toglie le emoji da un testo che esce dal gioco (condivisioni, titolo della pagina). */
export function stripEmoji(s: string) {
  return s.replace(EMO_RE, (m) => (iconArt(m) ? '' : m)).replace(/ {2,}/g, ' ').trim();
}

// ---------- SVG ----------
function shapeSvg(s: Shape) {
  const f = s.f ?? 'none';
  const st = s.s === 0 ? 'none' : s.s ?? INK;
  return `<path d="${s.d}" fill="${f}" stroke="${st}"${s.w ? ` stroke-width="${s.w}"` : ''}${
    s.o !== undefined ? ` opacity="${s.o}"` : ''
  }/>`;
}
export function iconSvg(e: string) {
  const a = iconArt(e);
  if (!a) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${a
    .map(shapeSvg)
    .join('')}</svg>`;
}

// ---------- HTML ----------
const cls = new Map<string, string>();
let sheet: HTMLStyleElement | null = null;
function classFor(e: string) {
  const k = keyOf.get(norm(e))!;
  let c = cls.get(k);
  if (c) return c;
  c = `ic${cls.size}`;
  cls.set(k, c);
  if (!sheet) {
    sheet = document.createElement('style');
    document.head.appendChild(sheet);
  }
  sheet.appendChild(
    document.createTextNode(`.ic.${c}{background-image:url("data:image/svg+xml;utf8,${encodeURIComponent(iconSvg(e))}")}\n`),
  );
  return c;
}

/** HTML di un'icona (per chi costruisce l'HTML a mano; di solito basta scrivere il carattere). */
export function iconHtml(e: string) {
  return iconArt(e) ? `<i class="ic ${classFor(e)}">${e}</i>` : e;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CANVAS']);
const missing = new Set<string>();

function iconizeText(t: Text) {
  const p = t.parentElement;
  if (!p || SKIP.has(p.tagName) || p.classList.contains('ic') || p.isContentEditable) return;
  const v = t.nodeValue;
  if (!v) return;
  EMO_RE.lastIndex = 0;
  if (!EMO_RE.test(v)) return;
  EMO_RE.lastIndex = 0;
  let last = 0;
  let frag: DocumentFragment | null = null;
  for (const m of v.matchAll(EMO_RE)) {
    const e = m[0];
    if (!iconArt(e)) {
      if (import.meta.env.DEV && /\p{Emoji_Presentation}|️/u.test(e) && !missing.has(e)) {
        missing.add(e);
        console.warn(`[icone] manca il disegno per ${e}`);
      }
      continue;
    }
    frag ??= document.createDocumentFragment();
    if (m.index! > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
    const i = document.createElement('i');
    i.className = `ic ${classFor(e)}`;
    i.textContent = e;
    frag.appendChild(i);
    last = m.index! + e.length;
  }
  if (!frag) return;
  if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
  // in un contenitore flex/grid il testo era un solo elemento: resta uno solo (stessa impaginazione di prima)
  const d = getComputedStyle(p).display;
  if (/flex|grid/.test(d) && (frag.childNodes.length > 1 || p.childNodes.length > 1)) {
    const span = document.createElement('span');
    span.className = 'ic-t';
    span.appendChild(frag);
    t.replaceWith(span);
  } else t.replaceWith(frag);
}

function iconizeTree(n: Node) {
  if (n.nodeType === 3) return iconizeText(n as Text);
  if (n.nodeType !== 1 && n.nodeType !== 11) return;
  if (n.nodeType === 1) {
    const el = n as Element;
    if (SKIP.has(el.tagName) || el.classList.contains('ic')) {
      if (el.tagName === 'INPUT') fixAttr(el, 'placeholder');
      return;
    }
  }
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const texts: Text[] = [];
  for (let c = w.nextNode(); c; c = w.nextNode()) {
    if (c.nodeType === 3) texts.push(c as Text);
    else if ((c as Element).tagName === 'INPUT') fixAttr(c as Element, 'placeholder');
  }
  texts.forEach(iconizeText);
}

/** i segnaposto dei campi di testo non possono avere disegni: l'emoji si toglie */
function fixAttr(el: Element, a: string) {
  const v = el.getAttribute(a);
  if (v && hasEmoji(v)) el.setAttribute(a, stripEmoji(v));
}

/** Da chiamare una volta all'avvio: da lì in poi ogni emoji che compare nella pagina diventa un disegno. */
export function watchIcons(root: Node = document.body) {
  iconizeTree(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') iconizeText(m.target as Text);
      else m.addedNodes.forEach(iconizeTree);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

// ---------- canvas ----------
const pathCache = new Map<string, Path2D>();
function p2d(d: string) {
  let p = pathCache.get(d);
  if (!p) pathCache.set(d, (p = new Path2D(d)));
  return p;
}

/** Disegna un'icona in un quadrato di lato `size` con l'angolo in alto a sinistra in (x, y). */
export function drawIcon(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  const a = iconArt(e);
  if (!a) return false;
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.globalAlpha = 1;
  g.shadowColor = 'transparent';
  for (const s of a) {
    const p = p2d(s.d);
    g.globalAlpha = s.o ?? 1;
    if (s.f && s.f !== 'none') {
      g.fillStyle = s.f;
      g.fill(p);
    }
    if (s.s !== 0) {
      g.strokeStyle = s.s ?? INK;
      g.lineWidth = s.w ?? 1.5;
      g.stroke(p);
    }
  }
  g.restore();
  return true;
}

type Seg = { t: string; icon: boolean };
function segments(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  EMO_RE.lastIndex = 0;
  for (const m of text.matchAll(EMO_RE)) {
    if (!iconArt(m[0])) continue;
    if (m.index! > last) out.push({ t: text.slice(last, m.index), icon: false });
    out.push({ t: m[0], icon: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), icon: false });
  return out;
}
const fontPx = (g: CanvasRenderingContext2D) => Number(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] ?? 16);
const ICON_EM = 1.18;

/** Larghezza di un testo con le icone (come measureText().width). */
export function measureIco(g: CanvasRenderingContext2D, text: string) {
  if (!hasEmoji(text)) return g.measureText(text).width;
  const fs = fontPx(g);
  return segments(text).reduce((w, s) => w + (s.icon ? fs * ICON_EM : g.measureText(s.t).width), 0);
}

/** Come fillText, ma le emoji diventano i disegni del gioco (rispetta textAlign, textBaseline e maxWidth). */
export function fillTextIco(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW?: number) {
  if (!hasEmoji(text)) {
    if (maxW === undefined) g.fillText(text, x, y);
    else g.fillText(text, x, y, maxW);
    return;
  }
  const fs = fontPx(g);
  const segs = segments(text);
  const W = segs.reduce((w, s) => w + (s.icon ? fs * ICON_EM : g.measureText(s.t).width), 0);
  const k = maxW !== undefined && W > maxW ? maxW / W : 1;
  const al = g.textAlign;
  const x0 = al === 'center' ? x - (W * k) / 2 : al === 'right' || al === 'end' ? x - W * k : x;
  const sz = fs * ICON_EM * 0.92;
  const bl = g.textBaseline;
  // alto dell'icona rispetto alla linea del testo
  const top =
    bl === 'middle' ? y - sz / 2 : bl === 'top' || bl === 'hanging' ? y : bl === 'bottom' || bl === 'ideographic' ? y - sz : y - fs * 0.86;
  g.save();
  g.textAlign = 'left';
  g.translate(x0, 0);
  g.scale(k, 1);
  let cx = 0;
  for (const s of segs) {
    if (s.icon) {
      const w = fs * ICON_EM;
      g.save();
      // l'icona non si schiaccia: si riduce in tutte e due le direzioni
      g.scale(1 / k, 1);
      drawIcon(g, s.t, cx * k + (w * k - sz * k) / 2, top + (sz - sz * k) / 2, sz * k);
      g.restore();
      cx += w;
    } else {
      g.fillText(s.t, cx, y);
      cx += g.measureText(s.t).width;
    }
  }
  g.restore();
}
