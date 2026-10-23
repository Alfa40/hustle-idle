/**
 * Proposte dei tester, nella finestra del tasto 📝 sempre sullo schermo (senza uscire dal gioco e senza account).
 *
 * - Scheda "Proponi" (telefoni tester, src/tester.ts, e telefono dello sviluppatore): cosa cambiare, perché,
 *   foto dello schermo presa all'apertura della finestra (o scelta dalla galleria) e il posto nel gioco, che si
 *   compila da solo, più un video facoltativo dalla galleria (rifatto piccolo sul telefono, src/ui/propvideo.ts).
 *   L'invio va al server delle classifiche e resta privato.
 * - Scheda "📮 Da approvare" nella stessa finestra (solo telefono dello sviluppatore): le legge e le approva o le scarta. Solo le approvate
 *   diventano una proposta su GitHub (workflow `.github/workflows/proposte.yml`) e solo lì Claude ci lavora.
 *
 * Non tocca la partita: niente salvataggi, classifiche o progressi.
 */
import type { Game } from '../game';
import { bizType } from '../config/business';
import { devApp, devKey, isDevDevice } from '../dev';
import { testerKey } from '../tester';
import { previewPr, sandbox } from '../preview';
import { previewStart } from '../previewStart';
import { API, nickname as lbNickname, playerId } from '../sim/leaderboard';
import { currentSlot, day } from '../sim/state';
import { photoPicker, shrinkImage } from '../logo';
import { layout } from './layout';
import { prepareVideo, VIDEO_MAX_SEC, videoPicker, type PropVideo } from './propvideo';

const REPO = 'https://github.com/Alfa40/hustle-idle';
const MAX_TEXT = 2000;
const PHOTO_SIDE = 720;
const MAX_PHOTO = 380000;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Proposal {
  id: number;
  status: 'nuova' | 'approvata' | 'scartata' | 'importata' | 'rifiutata';
  text: string;
  why: string;
  where: string;
  ctx: Record<string, string | number>;
  nickname: string;
  created: number;
  issue: number;
  photo: boolean;
  /** 'mp4' | 'webm', 'scaduto' (cancellato per fare spazio) o '' */
  video: string;
}

/** si vede la scheda "Proponi" su questo telefono */
export const canPropose = () => (!sandbox && !devApp && (testerKey() !== '' || isDevDevice())) || !!previewStart?.tester;
/** si vede la scheda "Proposte" (lettura e approvazione); nelle anteprime no */
export const canReview = () => previewPr === null && !devApp && isDevDevice();

/** Immagine (canvas o foto) in JPEG, rimpicciolita finché non sta nel limite del server. */
function toJpeg(src: HTMLCanvasElement | HTMLImageElement, w: number, h: number) {
  for (const side of [PHOTO_SIDE, 560, 420]) {
    const k = Math.min(1, side / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    for (const q of [0.72, 0.55]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length <= MAX_PHOTO) return d;
    }
  }
  return null;
}

const when = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function post(path: string, body: object) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `errore ${r.status}`);
  return j;
}

export class Proposals {
  // bozza: resta finché non si invia (anche chiudendo la finestra)
  private text = '';
  private why = '';
  private photo: string | null = null;
  private video: PropVideo | null = null;
  /** video in preparazione: da 0 a 1, -1 se non c'è */
  private videoProg = -1;
  private videoError = '';
  private where = '';
  private ctx: Record<string, string | number> = {};
  private sending = false;
  private sent = 0;
  private error = '';
  // revisione (sviluppatore)
  private list: Proposal[] | null = null;
  private loading = false;
  private listError = '';
  private showOld = false;
  private open = new Set<number>();
  private openVideo = new Set<number>();
  private busy = new Set<number>();

  constructor(private game: Game, private rerender: () => void) {}

  /** All'apertura della finestra: foto dello schermo e posto nel gioco di quel momento. */
  capture() {
    if (!canPropose() || this.sending) return;
    this.where = this.whereNow();
    this.ctx = {
      scena: this.where,
      slot: currentSlot,
      giorno: day(this.game.state),
      schermo: `${innerWidth}x${innerHeight}`,
      verso: layout.portrait ? 'verticale' : 'orizzontale',
      telefono: /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'altro',
    };
    if (document.body.classList.contains('in-poker')) {
      // al tavolo delle sfide la foto della città non serve: meglio uno screenshot scelto dalla galleria
      if (this.photo?.startsWith('auto:')) this.photo = null;
    } else if (!this.photo || this.photo.startsWith('auto:')) {
      const shot = this.game.snapshot();
      this.photo = shot ? 'auto:' + toJpeg(shot, shot.width, shot.height) : null;
      if (this.photo === 'auto:null') this.photo = null;
    }
  }

  private whereNow() {
    const g = this.game;
    const table = document.querySelector('.pk');
    if (table) return `Sfide: ${table.classList.contains('bj') ? 'blackjack' : 'poker'}`;
    if (g.run) return `Lavoretto: ${g.run.title}`;
    if (g.interior) return `Dentro l'attività: ${bizType(g.interior.biz.type).name}`;
    if (g.house) return 'Dentro una casa';
    if (g.jobRide) return 'In viaggio verso un lavoretto';
    return 'In città';
  }

  // ---------------- Proponi ----------------

  formHtml() {
    if (this.sent && !this.text) {
      return `<div class="card hl"><h3>✅ Proposta inviata</h3><p class="small" style="margin:0">Grazie! Lo sviluppatore la leggerà.</p></div>
        <button class="btn blue full" data-a="propNew">📝 Scrivi un'altra proposta</button>`;
    }
    const photo = this.photo ? this.photo.replace(/^auto:/, '') : '';
    return `<ul class="muted small explain points"><li>Scrivi come lo diresti a voce</li><li>Foto e posto si aggiungono da soli: puoi toglierli</li><li>Puoi aggiungere un video (primi ${VIDEO_MAX_SEC} s, senza audio)</li><li>La tua partita non cambia</li><li>Il tasto 📝 ti copre? Tienilo premuto e spostalo</li></ul>
      <div class="card"><h3>📝 Cosa vorresti cambiare?</h3>
        <textarea class="lb-input prop-in" data-p="text" maxlength="${MAX_TEXT}" rows="4" placeholder="Es. Nel lavoretto del barista i clienti arrivano troppo in fretta">${esc(this.text)}</textarea></div>
      <div class="card"><h3>💡 Perché? <span class="muted small">(facoltativo)</span></h3>
        <textarea class="lb-input prop-in" data-p="why" maxlength="${MAX_TEXT}" rows="2" placeholder="Cosa non ti è piaciuto o cosa lo renderebbe più bello">${esc(this.why)}</textarea></div>
      <div class="card"><h3>📷 Foto dello schermo</h3>
        ${photo ? `<img class="prop-photo" src="${photo}" alt="">` : '<p class="muted small" style="margin:0 0 8px">Nessuna foto.</p>'}
        <div class="row" style="gap:6px;flex-wrap:wrap">${photo ? '<button class="btn sm sec" data-a="propPhotoDel">❌ Togli la foto</button>' : ''}<button class="btn sm" data-a="propPhotoPick">🖼️ ${photo ? 'Scegli un\'altra foto' : 'Scegli una foto'}</button></div></div>
      ${this.videoHtml()}
      <div class="card"><h3>📍 Dove eri</h3><p class="small" style="margin:0">${esc(this.where || 'In città')}</p></div>
      ${this.error ? `<p class="small center bad">${esc(this.error)}</p>` : ''}
      <div class="btnrow"><button class="btn good full" data-a="propSend" ${this.sending || this.videoProg >= 0 ? 'disabled' : ''}>${this.sending ? 'Invio…' : '📨 Invia la proposta'}</button></div>`;
  }

  private videoHtml() {
    const v = this.video;
    let inner: string;
    if (this.videoProg >= 0) {
      inner = `<p class="small" style="margin:0 0 6px">Preparo il video… ${Math.round(this.videoProg * 100)}%</p><div class="prop-prog"><i style="width:${Math.round(this.videoProg * 100)}%"></i></div>`;
    } else if (v) {
      inner = `<video class="prop-photo" src="${v.url}" controls playsinline muted></video>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm sec" data-a="propVideoDel">❌ Togli il video</button><button class="btn sm" data-a="propVideoPick">🎥 Scegli un altro video</button></div>`;
    } else {
      inner = `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-a="propVideoPick">🎥 Aggiungi un video</button></div>`;
    }
    return `<div class="card"><h3>🎥 Video <span class="muted small">(facoltativo)</span></h3>${inner}${this.videoError ? `<p class="small bad" style="margin:6px 0 0">${esc(this.videoError)}</p>` : ''}</div>`;
  }

  private pickVideo() {
    this.readFields();
    const picker = videoPicker();
    picker.onchange = () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      this.videoError = '';
      this.videoProg = 0;
      this.rerender();
      let shown = 0;
      void prepareVideo(f, (p) => {
        this.videoProg = p;
        // ridisegna ogni 5% (non a ogni fotogramma)
        if (p - shown >= 0.05) {
          shown = p;
          this.updateProgress();
        }
      })
        .then((v) => {
          if (this.video) URL.revokeObjectURL(this.video.url);
          this.video = v;
        })
        .catch((e) => (this.videoError = `Video non aggiunto: ${(e as Error).message}`))
        .finally(() => {
          this.videoProg = -1;
          this.rerender();
        });
    };
    picker.click();
  }

  /** solo la barra (ridisegnare tutto toglierebbe il testo che si sta scrivendo) */
  private updateProgress() {
    const pct = Math.round(this.videoProg * 100);
    const body = document.querySelector('.modal .sheet-body');
    const bar = body?.querySelector<HTMLElement>('.prop-prog i');
    if (bar) bar.style.width = `${pct}%`;
    const t = bar?.closest('.card')?.querySelector('p');
    if (t) t.textContent = `Preparo il video… ${pct}%`;
  }

  /** dopo ogni disegno: i campi di testo salvano la bozza mentre si scrive (senza ridisegnare) */
  after(body: HTMLElement) {
    body.querySelectorAll<HTMLTextAreaElement>('textarea[data-p]').forEach((t) =>
      t.addEventListener('input', () => {
        if (t.dataset.p === 'text') this.text = t.value;
        else this.why = t.value;
      }),
    );
  }

  private readFields() {
    const body = document.querySelector('.modal .sheet-body');
    const t = body?.querySelector<HTMLTextAreaElement>('textarea[data-p="text"]');
    const w = body?.querySelector<HTMLTextAreaElement>('textarea[data-p="why"]');
    if (t) this.text = t.value;
    if (w) this.why = w.value;
  }

  private async send() {
    this.readFields();
    if (this.sending) return;
    if (this.text.trim().length < 3) {
      this.error = 'Scrivi cosa vorresti cambiare.';
      return;
    }
    if (previewPr !== null) {
      this.error = 'Questa è un\'anteprima: qui le proposte non si inviano. Scrivile nel gioco vero.';
      return;
    }
    this.sending = true;
    this.error = '';
    try {
      await post('/hustle/proposal', {
        key: testerKey() || devKey(),
        player_id: playerId(),
        nickname: lbNickname() || this.game.state.saveName,
        text: this.text.trim(),
        why: this.why.trim(),
        where: this.where,
        ctx: this.ctx,
        photo: this.photo ? this.photo.replace(/^auto:/, '') : '',
        video: this.video?.data ?? '',
        frames: this.video?.frames ?? '',
      });
      this.text = '';
      this.why = '';
      this.photo = null;
      if (this.video) URL.revokeObjectURL(this.video.url);
      this.video = null;
      this.sent++;
    } catch (e) {
      this.error = `Non inviata: ${(e as Error).message}. Riprova tra poco.`;
    }
    this.sending = false;
    this.rerender();
  }

  private pickPhoto() {
    this.readFields();
    const picker = photoPicker();
    picker.onchange = () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const s = shrinkImage(img, 1600);
        const w = s instanceof HTMLCanvasElement ? s.width : img.naturalWidth;
        const h = s instanceof HTMLCanvasElement ? s.height : img.naturalHeight;
        this.photo = toJpeg(s, w, h);
        URL.revokeObjectURL(img.src);
        this.rerender();
      };
      img.src = URL.createObjectURL(f);
    };
    picker.click();
  }

  // ---------------- Proposte (sviluppatore) ----------------

  reviewHtml() {
    if (!devKey()) {
      return `<div class="card hl"><h3>🔑 Chiave developer</h3><p class="small" style="margin:0">Serve la chiave: riapri il link developer o scrivila qui.</p>
        <input class="lb-input prop-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chiave developer" style="width:100%;box-sizing:border-box;margin-top:8px">
        <button class="btn good full" data-a="revKey" style="margin-top:8px">Salva</button>${this.listError ? `<p class="small center bad">${esc(this.listError)}</p>` : ''}</div>`;
    }
    if (!this.list && !this.loading && !this.listError) void this.load();
    const head = `<ul class="muted small explain points"><li>Restano private finché non le approvi</li><li>Approvata: Claude prepara la modifica con l'anteprima</li><li>Le scartate restano qui e si possono riprendere</li></ul>
      <div class="row" style="gap:6px;margin-bottom:8px"><button class="btn sm sec" data-a="revLoad" ${this.loading ? 'disabled' : ''}>${this.loading ? 'Carico…' : '🔄 Aggiorna'}</button></div>`;
    if (this.listError) return head + `<p class="small center bad">${esc(this.listError)}</p>`;
    if (!this.list) return head + '<p class="muted small center">Carico le proposte…</p>';
    const fresh = this.list.filter((p) => p.status === 'nuova');
    const old = this.list.filter((p) => p.status !== 'nuova');
    return head +
      `<h3 class="sec-title">📮 Da leggere (${fresh.length})</h3>` +
      (fresh.length ? fresh.map((p) => this.card(p)).join('') : '<p class="muted small center">Nessuna proposta nuova.</p>') +
      (old.length
        ? `<div class="row" style="margin-top:8px"><button class="btn sm sec" style="flex:1" data-a="revOld">${this.showOld ? 'Nascondi' : 'Mostra'} le già decise (${old.length})</button></div>` + (this.showOld ? old.map((p) => this.card(p)).join('') : '')
        : '');
  }

  private card(p: Proposal) {
    const tag = { nuova: '', approvata: '<span class="tag">⏳ approvata, sta per andare su GitHub</span>', scartata: '<span class="tag">❌ scartata</span>', importata: `<span class="tag">✅ su GitHub #${p.issue}</span>`, rifiutata: '<span class="tag">❌ rifiutata dopo l\'anteprima</span>' }[p.status];
    const busy = this.busy.has(p.id);
    const photo = p.photo && this.open.has(p.id) ? `<img class="prop-photo" src="${API}/hustle/proposal-photo/${p.id}.jpg?k=${encodeURIComponent(devKey())}" alt="">` : '';
    const hasVideo = p.video === 'mp4' || p.video === 'webm';
    const video = hasVideo && this.openVideo.has(p.id) ? `<video class="prop-photo" src="${API}/hustle/proposal-video/${p.id}.${p.video}?k=${encodeURIComponent(devKey())}" controls playsinline muted></video>` : '';
    const btns =
      p.status === 'nuova'
        ? `<button class="btn sm good" data-a="revDo:${p.id}|approve" ${busy ? 'disabled' : ''}>✅ Approva</button><button class="btn sm danger" data-a="revDo:${p.id}|reject" ${busy ? 'disabled' : ''}>❌ Scarta</button>`
        : p.status === 'importata' || p.status === 'rifiutata'
          ? `<a class="btn sm blue" href="${REPO}/issues/${p.issue}" target="_blank" rel="noopener">Apri su GitHub</a>`
          : `<button class="btn sm sec" data-a="revDo:${p.id}|reopen" ${busy ? 'disabled' : ''}>↩️ Rimetti in attesa</button>`;
    return `<div class="card prop-card"><h3>#${p.id} · ${esc(p.nickname)} <span class="muted small">${when(p.created)}</span></h3>${tag}
      <p class="prop-text">${esc(p.text)}</p>${p.why ? `<p class="small prop-text"><b>Perché:</b> ${esc(p.why)}</p>` : ''}
      <p class="muted small" style="margin:4px 0">📍 ${esc(p.where || '—')}${p.ctx.verso ? ` · ${esc(String(p.ctx.verso))}` : ''}${p.ctx.telefono ? ` · ${esc(String(p.ctx.telefono))}` : ''}</p>
      ${p.photo ? `<button class="btn sm sec" data-a="revPhoto:${p.id}">📷 ${this.open.has(p.id) ? 'Nascondi la foto' : 'Guarda la foto'}</button>` : ''}${photo}
      ${hasVideo ? `<button class="btn sm sec" data-a="revVideo:${p.id}">🎥 ${this.openVideo.has(p.id) ? 'Nascondi il video' : 'Guarda il video'}</button>` : p.video === 'scaduto' ? '<p class="muted small" style="margin:4px 0">🎥 Il video è stato cancellato per fare spazio.</p>' : ''}${video}
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${btns}</div></div>`;
  }

  private async load() {
    this.loading = true;
    this.listError = '';
    try {
      const j = await post('/hustle/proposals/list', { key: devKey() });
      this.list = j.proposals ?? [];
    } catch (e) {
      this.listError = `Non riesco a leggere le proposte: ${(e as Error).message}`;
    }
    this.loading = false;
    this.rerender();
  }

  private async decide(id: number, action: string) {
    this.busy.add(id);
    try {
      const j = await post('/hustle/proposals/decide', { key: devKey(), id, action });
      const p = this.list?.find((x) => x.id === id);
      if (p) p.status = j.status;
    } catch (e) {
      this.listError = `Non riuscito: ${(e as Error).message}`;
    }
    this.busy.delete(id);
    this.rerender();
  }

  actions(): Record<string, (arg: string) => void> {
    return {
      propSend: () => void this.send(),
      propNew: () => (this.sent = 0),
      propPhotoDel: () => {
        this.readFields();
        this.photo = null;
      },
      propPhotoPick: () => this.pickPhoto(),
      propVideoPick: () => this.pickVideo(),
      propVideoDel: () => {
        this.readFields();
        if (this.video) URL.revokeObjectURL(this.video.url);
        this.video = null;
        this.videoError = '';
      },
      revVideo: (id) => (this.openVideo.has(+id) ? this.openVideo.delete(+id) : this.openVideo.add(+id)),
      revLoad: () => void this.load(),
      revOld: () => (this.showOld = !this.showOld),
      revPhoto: (id) => (this.open.has(+id) ? this.open.delete(+id) : this.open.add(+id)),
      revDo: (arg) => {
        const [id, action] = arg.split('|');
        void this.decide(+id, action);
      },
      revKey: () => {
        const v = document.querySelector<HTMLInputElement>('.modal .prop-key')?.value ?? '';
        void import('../dev').then(({ tryDevKey }) =>
          tryDevKey(v).then((ok) => {
            this.listError = ok ? '' : 'Chiave sbagliata';
            this.rerender();
          }),
        );
      },
    };
  }
}
