import { rank } from '../sim/progress';
import { euro, lastSlot, listSlots, SLOT_COUNT, wipeSave, type GameState } from '../sim/state';
import { settingsAction, settingsHtml } from './settingsview';
import { formatDate } from './ui';
import { DEV_SLOT, tryDevKey } from '../dev';
import { tryTesterKey } from '../tester';
import { previewPr } from '../preview';
import { loadState } from '../sim/state';
import { loggedIn, login } from '../sim/account';
import { nickname } from '../sim/leaderboard';

type View = 'main' | 'slots' | 'new' | 'settings' | 'credits' | 'login';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'giorno' : 'giorni'} fa`;
}

/**
 * Schermata iniziale: continua, nuova partita, carica (3 slot), impostazioni.
 * La città 3D gira sullo sfondo.
 */
export class TitleScreen {
  private el: HTMLDivElement;
  private view: View = 'main';
  private confirm = '';
  private newSlot = 1;
  private newName = 'La mia partita';
  private verTaps = 0;
  private devMsg = '';
  /** entra con l'account: nome e password scritti, messaggio, attesa */
  private accName = '';
  private accPw = '';
  private accMsg = '';
  private accBusy = false;

  constructor(private onStart: (slot: number, newName?: string, quick?: boolean) => void) {
    this.el = document.createElement('div');
    this.el.className = 'title';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'savename') this.newName = t.value;
      if (t.name === 'accname') this.accName = t.value;
      if (t.name === 'accpw') this.accPw = t.value;
    });
    this.render();
  }

  hide() {
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 350);
  }

  private slotInfo(s: GameState) {
    const d = formatDate(s.minutes).split(' · ')[0];
    return `<span>💰 ${euro(s.money)}</span><span>🏢 ${s.businesses.length}</span><span>📅 ${d}</span>`;
  }

  private render() {
    const slots = listSlots();
    const last = lastSlot();
    let html = '';
    if (this.view === 'main') {
      const ls = last ? slots[last - 1] : null;
      html = `
        <div class="t-logo"><div class="t-name">HUSTLE IDLE</div><div class="t-sub">Da squattrinato a magnate 💼</div></div>
        <div class="t-menu">
          ${ls ? `<button class="t-btn ${previewPr !== null ? '' : 't-main'}" data-t="play:${last}"><span class="t-ico">▶</span><span><b>Continua</b><small>${esc(ls.saveName)} · ${euro(ls.money)} · ${rank(ls)}</small></span></button>` : ''}
          ${previewPr !== null ? `<button class="t-btn t-main" data-t="quick"><span class="t-ico">▶</span><span><b>Gioca subito</b><small>Anteprima della proposta #${previewPr}</small></span></button>` : ''}
          <button class="t-btn ${ls || previewPr !== null ? '' : 't-main'}" data-t="view:new"><span class="t-ico">🆕</span><span><b>Nuova partita</b></span></button>
          <button class="t-btn" data-t="view:slots" ${slots.some(Boolean) ? '' : 'disabled'}><span class="t-ico">📂</span><span><b>Carica partita</b></span></button>
          ${previewPr !== null ? `<button class="t-btn" data-t="dev"><span class="t-ico">🛠️</span><span><b>Partita developer</b><small>${loadState(DEV_SLOT) ? `${euro(loadState(DEV_SLOT)!.money)} · non va in classifica` : 'Un miliardo, comandi rapidi, niente classifica'}</small></span></button>` : ''}
          ${previewPr !== null ? '' : loggedIn() ? `<div class="t-acc">💾 Account: <b>${esc(nickname())}</b> · partite salvate</div>` : '<button class="t-btn" data-t="view:login"><span class="t-ico">🔑</span><span><b>Entra con il tuo account</b><small>Ritrova le tue partite con nome e password</small></span></button>'}
          <div class="t-row">
            <button class="t-btn t-small" data-t="view:settings"><span class="t-ico">⚙️</span><b>Impostazioni</b></button>
            <button class="t-btn t-small" data-t="view:credits"><span class="t-ico">ℹ️</span><b>Crediti</b></button>
          </div>
        </div>`;
    } else if (this.view === 'slots') {
      html = this.panel('📂 Carica partita', slots.map((s, i) => {
        const n = i + 1;
        if (!s) {
          return `<div class="t-slot empty"><div class="t-slot-n">${n}</div><div class="t-slot-body"><b>Slot libero</b><small>Nessuna partita salvata</small></div>
            <button class="btn sm" data-t="newin:${n}">🆕 Nuova</button></div>`;
        }
        const del = this.confirm === `del:${n}`;
        return `<div class="t-slot ${last === n ? 'last' : ''}"><div class="t-slot-n">${n}</div>
          <div class="t-slot-body"><b>${esc(s.saveName)}</b><small>${rank(s)} · giocata ${ago(s.lastSeen)}</small><div class="t-slot-info">${this.slotInfo(s)}</div></div>
          <div class="t-slot-btns"><button class="btn sm good" data-t="play:${n}">▶ Gioca</button>
          <button class="btn sm ${del ? 'danger' : 'sec'}" data-t="del:${n}">${del ? 'Sicuro?' : '🗑️'}</button></div></div>`;
      }).join(''));
    } else if (this.view === 'new') {
      const cards = slots.map((s, i) => {
        const n = i + 1;
        const on = this.newSlot === n;
        return `<button class="t-slot pick ${on ? 'on' : ''}" data-t="pick:${n}"><div class="t-slot-n">${n}</div>
          <div class="t-slot-body"><b>${s ? esc(s.saveName) : 'Slot libero'}</b><small>${s ? `⚠️ verrà sovrascritta · ${euro(s.money)}` : 'Pronto per una nuova avventura'}</small></div></button>`;
      }).join('');
      const over = !!slots[this.newSlot - 1];
      const sure = this.confirm === 'overwrite';
      html = this.panel('🆕 Nuova partita', `
        <label class="t-label">Nome della partita</label>
        <input class="t-input" name="savename" maxlength="24" value="${esc(this.newName)}" />
        <label class="t-label">Scegli lo slot</label>${cards}
        <button class="btn good full" data-t="start" style="margin-top:12px">${over ? (sure ? '⚠️ Tocca ancora per sovrascrivere' : '🚀 Inizia (sovrascrive lo slot)') : '🚀 Inizia!'}</button>`);
    } else if (this.view === 'login') {
      const has = slots.some(Boolean);
      const sure = this.confirm === 'login';
      html = this.panel('🔑 Entra con il tuo account', `
        <label class="t-label">Il tuo nome</label>
        <input class="t-input" name="accname" autocomplete="username" maxlength="20" value="${esc(this.accName)}" />
        <label class="t-label">Password</label>
        <input class="t-input" name="accpw" type="password" autocomplete="current-password" value="${esc(this.accPw)}" />
        ${has ? '<p class="small bad" style="margin:8px 0 0">⚠️ Le partite di questo telefono verranno sostituite da quelle dell\'account</p>' : ''}
        <button class="btn ${sure ? 'danger' : 'good'} full" data-t="login" style="margin-top:12px" ${this.accBusy ? 'disabled' : ''}>${this.accBusy ? '⏳ Entro…' : sure ? 'Sicuro? Tocca ancora' : '🔑 Entra'}</button>
        ${this.accMsg ? `<p class="small bad center" style="margin:8px 0 0">${esc(this.accMsg)}</p>` : ''}
        <p class="muted small center" style="margin:10px 0 0">L'account si crea in partita: 👤 Profilo → 🔑 Account</p>`);
    } else if (this.view === 'settings') {
      html = this.panel('⚙️ Impostazioni', settingsHtml());
    } else {
      html = this.panel('ℹ️ Crediti', `
        <div class="card"><h3>Hustle Idle</h3><p class="muted small" style="margin:0">Un gioco gestionale in cui parti dai lavoretti e costruisci il tuo impero di attività.</p></div>
        <div class="card"><h3>Grafica</h3><p class="muted small" style="margin:0">Modelli 3D di <b>Kenney.nl</b> (licenza CC0): Mini Characters, City Kit, Car Kit, Food Kit, Furniture Kit.<br>Font: Fredoka (SIL Open Font License 1.1).<br>Grafica 3D: three.js (licenza MIT, © three.js authors).<br><a href="./LICENSES.txt" target="_blank" rel="noopener">Testo completo delle licenze</a></p></div>
        <div class="card" data-t="ver"><h3>Versione</h3><p class="muted small" style="margin:0">Prototipo 0.5</p></div>
        ${this.verTaps >= 7 ? `<div class="card"><h3>🔑 Codice</h3><input class="t-input" name="devkey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Codice" />
          <button class="btn good full" data-t="devkey" style="margin-top:8px">Attiva</button>${this.devMsg ? `<p class="small center" style="margin:6px 0 0">${this.devMsg}</p>` : ''}</div>` : ''}`);
    }
    this.el.innerHTML = html;
  }

  private panel(title: string, body: string) {
    return `<div class="t-panel"><div class="t-head"><button class="t-back" data-t="view:main">◀</button><h2>${title}</h2></div><div class="t-body">${body}</div></div>`;
  }

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t],[data-a]');
    if (!t) return;
    if (t.dataset.a) {
      // controlli delle impostazioni (stessi del pannello in partita)
      settingsAction(t.dataset.a);
      this.render();
      return;
    }
    const [cmd, arg = ''] = t.dataset.t!.split(':');
    const prevConfirm = this.confirm;
    this.confirm = '';
    switch (cmd) {
      case 'view':
        this.view = arg as View;
        if (arg === 'new') {
          const free = listSlots().findIndex((s) => !s);
          this.newSlot = free >= 0 ? free + 1 : 1;
        }
        break;
      case 'play':
        this.onStart(+arg);
        return;
      case 'quick':
        // anteprima: ogni volta una partita nuova nello slot 1, che parte dalla parte cambiata (src/previewStart.ts)
        this.onStart(1, `Anteprima #${previewPr}`, true);
        return;
      case 'ver':
        // 7 tocchi su "Versione": compare il campo per il codice developer
        this.verTaps++;
        if (this.verTaps < 7) return;
        break;
      case 'devkey': {
        const v = (this.el.querySelector('input[name="devkey"]') as HTMLInputElement | null)?.value ?? '';
        // stesso campo per il codice developer e per quello dei tester
        void tryDevKey(v).then(async (ok) => {
          const tester = !ok && (await tryTesterKey(v));
          this.devMsg = ok ? '✅ Telefono dello sviluppatore: in partita trovi 📮 Proposte nelle ⚙️ Opzioni' : tester ? '✅ Modalità tester attiva: in partita trovi 📝 Proponi nelle ⚙️ Opzioni' : '❌ Codice sbagliato';
          this.render();
        });
        return;
      }
      case 'dev':
        // partita developer: slot a parte, si crea la prima volta
        if (loadState(DEV_SLOT)) this.onStart(DEV_SLOT);
        else this.onStart(DEV_SLOT, '🛠️ Developer');
        return;
      case 'del':
        if (prevConfirm === `del:${arg}`) wipeSave(+arg);
        else this.confirm = `del:${arg}`;
        if (!listSlots().some(Boolean)) this.view = 'main';
        break;
      case 'login': {
        if (!this.accName.trim() || !this.accPw) {
          this.accMsg = 'Scrivi nome e password';
          break;
        }
        // le partite di questo telefono si perdono: secondo tocco per confermare
        if (listSlots().some(Boolean) && prevConfirm !== 'login') {
          this.confirm = 'login';
          break;
        }
        this.accBusy = true;
        this.accMsg = '';
        void login(this.accName, this.accPw).then((err) => {
          this.accBusy = false;
          if (err) {
            this.accMsg = err;
            this.render();
            return;
          }
          // si riparte con le partite dell'account
          location.reload();
        });
        break;
      }
      case 'newin':
        this.view = 'new';
        this.newSlot = +arg;
        break;
      case 'pick':
        this.newSlot = Math.min(SLOT_COUNT, Math.max(1, +arg));
        break;
      case 'start': {
        const over = !!listSlots()[this.newSlot - 1];
        if (over && prevConfirm !== 'overwrite') {
          this.confirm = 'overwrite';
          break;
        }
        this.onStart(this.newSlot, this.newName);
        return;
      }
    }
    this.render();
  }
}
