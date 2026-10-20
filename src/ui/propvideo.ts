/**
 * Video delle proposte: il tester ne sceglie uno dalla galleria (es. una registrazione dello schermo) e qui lo
 * si rifà piccolo sul telefono prima di inviarlo (il server tiene pochi MB e il database è condiviso):
 * - si riproduce senza audio in un <video> nascosto, si ridisegna su un canvas più piccolo e lo si registra con
 *   MediaRecorder a bassa qualità, solo i primi VIDEO_MAX_SEC secondi;
 * - intanto si prendono 4 fotogrammi e si mettono in una sola foto 2×2: Claude i video non li vede, la foto sì.
 * Se il telefono non sa registrare ma il video è già leggero si manda così com'è.
 */

export const VIDEO_MAX_SEC = 30;
/** limite del file (prima del base64), sotto quello del server */
const MAX_BYTES = 2_500_000;
const SIDE = 640;
const BITRATE = 450_000;
const FRAME_CELL = 360;
const MAX_FRAMES = 240_000;

export interface PropVideo {
  /** data URL video/mp4 o video/webm */
  data: string;
  /** foto 2×2 con 4 fotogrammi (data URL JPEG), '' se non è riuscita */
  frames: string;
  seconds: number;
  /** per guardarlo nel modulo */
  url: string;
}

const readAsDataUrl = (b: Blob) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(b);
  });

/** data URL con il tipo che accetta il server (video/mp4 o video/webm, senza codec) */
async function toData(b: Blob) {
  const kind = /mp4|quicktime/.test(b.type) ? 'mp4' : /webm/.test(b.type) ? 'webm' : '';
  if (!kind) throw new Error('formato video non supportato');
  const d = await readAsDataUrl(b);
  return `data:video/${kind};base64,` + d.slice(d.indexOf(',') + 1);
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function sheet(cells: HTMLCanvasElement[]) {
  if (!cells.length) return '';
  const w = cells[0].width;
  const h = cells[0].height;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * Math.ceil(cells.length / 2);
  const g = c.getContext('2d')!;
  g.fillStyle = '#111';
  g.fillRect(0, 0, c.width, c.height);
  cells.forEach((x, i) => g.drawImage(x, (i % 2) * w, Math.floor(i / 2) * h));
  for (const q of [0.7, 0.5, 0.35]) {
    const d = c.toDataURL('image/jpeg', q);
    if (d.length <= MAX_FRAMES) return d;
  }
  return '';
}

/** Rifà piccolo il video scelto; `progress` va da 0 a 1. */
export async function prepareVideo(file: File, progress: (p: number) => void): Promise<PropVideo> {
  const src = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src;
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0';
  document.body.appendChild(v);
  try {
    await new Promise<void>((ok, ko) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => ko(new Error('non riesco ad aprire il video'));
    });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : VIDEO_MAX_SEC;
    const len = Math.min(dur, VIDEO_MAX_SEC);
    const mime = pickMime();
    const canRecord = !!mime && typeof HTMLCanvasElement.prototype.captureStream === 'function' && v.videoWidth > 0;
    if (!canRecord) {
      // niente registrazione: va bene solo se è già corto e leggero
      if (file.size <= MAX_BYTES && dur <= VIDEO_MAX_SEC + 1) return { data: await toData(file), frames: '', seconds: Math.round(dur), url: src };
      throw new Error(`video troppo pesante: scegline uno più corto (massimo ${VIDEO_MAX_SEC} secondi)`);
    }

    const k = Math.min(1, SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round((v.videoWidth * k) / 2) * 2);
    c.height = Math.max(2, Math.round((v.videoHeight * k) / 2) * 2);
    const g = c.getContext('2d')!;
    const fk = Math.min(1, FRAME_CELL / Math.max(c.width, c.height));
    const marks = [0.1, 0.37, 0.63, 0.9].map((x) => x * len);
    const cells: HTMLCanvasElement[] = [];

    const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: BITRATE });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((ok) => (rec.onstop = () => ok()));

    g.drawImage(v, 0, 0, c.width, c.height);
    rec.start(500);
    await v.play();
    await new Promise<void>((ok) => {
      let done = false;
      const step = () => {
        if (done) return;
        g.drawImage(v, 0, 0, c.width, c.height);
        if (cells.length < marks.length && v.currentTime >= marks[cells.length]) {
          const f = document.createElement('canvas');
          f.width = Math.round(c.width * fk);
          f.height = Math.round(c.height * fk);
          f.getContext('2d')!.drawImage(c, 0, 0, f.width, f.height);
          cells.push(f);
        }
        progress(Math.min(1, v.currentTime / len));
        if (v.ended || v.currentTime >= len) {
          done = true;
          v.pause();
          ok();
          return;
        }
        if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(step);
        else requestAnimationFrame(step);
      };
      v.onended = step;
      step();
    });
    rec.stop();
    await stopped;
    const out = new Blob(chunks, { type: mime.split(';')[0] });
    if (out.size > MAX_BYTES) throw new Error(`video troppo pesante: scegline uno più corto (massimo ${VIDEO_MAX_SEC} secondi)`);
    URL.revokeObjectURL(src);
    return { data: await toData(out), frames: sheet(cells), seconds: Math.round(len), url: URL.createObjectURL(out) };
  } catch (e) {
    URL.revokeObjectURL(src);
    throw e;
  } finally {
    v.remove();
  }
}

let pickerEl: HTMLInputElement | null = null;
/** campo nascosto per scegliere un video dalla galleria */
export function videoPicker() {
  if (!pickerEl) {
    pickerEl = document.createElement('input');
    pickerEl.type = 'file';
    pickerEl.accept = 'video/*';
    pickerEl.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(pickerEl);
  }
  return pickerEl;
}
