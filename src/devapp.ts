/**
 * App developer (developer.html, da aggiungere alla schermata Home come seconda app, separata dal gioco):
 * - Partita developer (apre il gioco con `./?app=dev`: un miliardo, comandi rapidi, mai in classifica);
 * - Anteprime: in cima gli avvisi delle proposte in preparazione (approvate, o con Claude al lavoro), poi le anteprime
 *   da provare, con chi le ha scritte e i voti/commenti dei tester (app tester, src/testerapp.ts). Le anteprime non
 *   piaciute si rifiutano da qui ("Rifiuta": il robot di GitHub chiude la proposta), quelle piaciute si accettano
 *   ("Accetta e pubblica": il robot unisce la modifica al gioco e la pubblica);
 * - Tester: per ogni persona le proposte finite, cioè rifiutate o entrate nel gioco (src/board.ts).
 * Serve la chiave developer (una volta per telefono): le proposte sul server sono private.
 */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import './ui/layout';
import { watchIcons } from './ui/icons';
import { DEV_SLOT, devKey, tryDevKey } from './dev';
import { euro, loadState } from './sim/state';
import { API, playerId } from './sim/leaderboard';
import { askHtml, esc, load, noteBoxHtml, post, prepHtml, previewHead, previewLists, testersHtml, votesHtml, type Data, type PrevItem, type Prop } from './board';

const serverProps = () => post<{ proposals?: Prop[] }>(API, '/hustle/proposals/list', { key: devKey() }).then((j) => j.proposals ?? []);

// ---------------- schermata ----------------

const ui = document.getElementById('ui')!;
let data: Data | null = null;
let error = '';
let keyMsg = '';
let loading = false;
let lastLoad = 0;
let tab: 'anteprime' | 'tester' = 'anteprime';
/** "Rifiuta" / "Accetta e pubblica" toccati una volta: si chiede conferma con un secondo tocco */
let confirmReject = 0;
let rejecting = 0;
let confirmAccept = 0;
let accepting = 0;
const openTesters = new Set<string>();
/** risposte alle domande di chiarimento di Claude: bozze, invio in corso, errore, risposte che si stanno cambiando */
const noteDrafts = new Map<number, string>();
let noting = 0;
let noteMsg: { id: number; text: string } | null = null;
const noteEditing = new Set<number>();

function keyHtml() {
  return `<div class="card"><h3>🔑 Chiave developer</h3><p class="small" style="margin:0 0 8px">Scrivila una volta: questo telefono se la ricorda.</p>
    <input class="lb-input dv-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chiave developer">
    <button class="btn good full" data-a="key" style="margin-top:8px">Entra</button>${keyMsg ? `<p class="small center bad" style="margin:6px 0 0">${esc(keyMsg)}</p>` : ''}</div>`;
}

function previewsHtml(d: Data) {
  const { ready } = previewLists(d);
  const row = (x: PrevItem) => {
    const prop = x.prop;
    const accepted = prop?.status === 'accettata';
    // accettata: il robot la unisce e la pubblica entro una decina di minuti; intanto niente tasti
    const acc = prop && !accepted
      ? `<button class="btn sm good dv-acc" data-a="accept:${prop.id}" ${accepting === prop.id ? 'disabled' : ''}>${accepting === prop.id ? 'Accetto…' : confirmAccept === prop.id ? 'Sicuro? Tocca ancora per pubblicarla' : '✅ Accetta e pubblica'}</button>`
      : '';
    const rej = prop && !accepted
      ? `<button class="btn sm danger dv-rej" data-a="reject:${prop.id}" ${rejecting === prop.id ? 'disabled' : ''}>${rejecting === prop.id ? 'Rifiuto…' : confirmReject === prop.id ? 'Sicuro? Tocca ancora per rifiutarla' : '❌ Rifiuta'}</button>`
      : '';
    const note = accepted
      ? '<div class="dv-note ok">⏳ Accettata: entro una decina di minuti il robot la mette nel gioco e la pubblica.</div>'
      : prop?.mergeError ? `<div class="dv-note bad">⚠️ Non pubblicata: ${esc(prop.mergeError)}. Nella proposta su GitHub trovi cosa fare.</div>` : '';
    return `<div class="dv-prev">${previewHead(x)}${note}${votesHtml(prop)}${acc || rej ? `<div class="dv-acts">${rej}${acc}</div>` : ''}</div>`;
  };
  // prima gli avvisi delle proposte in preparazione e le domande di Claude, poi le anteprime da provare
  const asks = previewLists(d).asks.map((x) => askHtml(x, noteBoxHtml(x.prop, x.prop && noteDrafts.get(x.prop.id), noting === x.prop?.id, noteMsg && noteMsg.id === x.prop?.id ? noteMsg.text : '', !!x.prop && noteEditing.has(x.prop.id)))).join('');
  const prep = prepHtml(d) + asks;
  if (!ready.length) return prep || '<div class="card"><p class="small center" style="margin:0">Nessuna anteprima da provare in questo momento.</p></div>';
  return prep + ready.map(row).join('');
}

function render() {
  const dev = loadState(DEV_SLOT);
  let body: string;
  if (!devKey()) body = keyHtml();
  else {
    const tabs = `<div class="dv-tabs"><button class="dv-tab ${tab === 'anteprime' ? 'on' : ''}" data-a="tab:anteprime">📱 Anteprime</button><button class="dv-tab ${tab === 'tester' ? 'on' : ''}" data-a="tab:tester">👥 Tester</button></div>`;
    const content = error
      ? `<div class="card"><p class="small bad" style="margin:0">${esc(error)}</p></div>`
      : !data
        ? '<div class="card"><p class="small muted center" style="margin:0">Carico…</p></div>'
        : tab === 'anteprime' ? previewsHtml(data) : testersHtml(data, openTesters);
    body = `<a class="t-btn t-main" href="./?app=dev"><span class="t-ico">🛠️</span><span><b>Partita developer</b><small>${dev ? euro(dev.money) + ' · ' : ''}comandi rapidi, mai in classifica</small></span></a>
      ${tabs}${content}
      <div class="t-row"><button class="t-btn t-small" data-a="reload" ${loading ? 'disabled' : ''}><span class="t-ico">🔄</span><b>${loading ? 'Carico…' : 'Aggiorna'}</b></button></div>`;
  }
  const y = scrollY;
  ui.innerHTML = `<div class="title launcher-screen">
    <div class="t-logo"><div class="t-name">HUSTLE DEV</div><div class="t-sub">Partita developer, anteprime e tester</div></div>
    <div class="t-menu">${body}</div></div>`;
  // ridisegnare non deve far perdere dove si era scorsi
  scrollTo(0, y);
}

/** Anteprima piaciuta: accettata sul server; il robot di GitHub la unisce al gioco e la pubblica entro una decina di minuti. */
async function accept(id: number) {
  accepting = id;
  render();
  try {
    const r = await fetch(API + '/hustle/proposals/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: devKey(), id, action: 'accept_preview' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `errore ${r.status}`);
    const p = data?.props.find((x) => x.id === id);
    if (p) {
      p.status = 'accettata';
      p.mergeError = '';
    }
  } catch (e) {
    error = `Non riuscito: ${(e as Error).message}`;
  }
  accepting = 0;
  render();
}

/** Anteprima non piaciuta: rifiutata sul server; il robot di GitHub chiude la proposta entro una decina di minuti. */
async function reject(id: number) {
  rejecting = id;
  render();
  try {
    const r = await fetch(API + '/hustle/proposals/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: devKey(), id, action: 'reject_preview' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `errore ${r.status}`);
    const p = data?.props.find((x) => x.id === id);
    if (p) p.status = 'rifiutata';
  } catch (e) {
    error = `Non riuscito: ${(e as Error).message}`;
  }
  rejecting = 0;
  render();
}

/** Risposta alla domanda di chiarimento di Claude (come i commenti dei tester, firmata "Sviluppatore"). */
async function sendNote(id: number) {
  const comment = (noteDrafts.get(id) ?? '').trim();
  noteMsg = null;
  if (!comment) {
    noteMsg = { id, text: 'Scrivi la risposta' };
    render();
    return;
  }
  noting = id;
  render();
  try {
    await post(API, '/hustle/proposals/vote', { key: devKey(), player_id: playerId(), nickname: 'Sviluppatore', id, vote: 'nota', comment });
    await refresh(true);
    noteDrafts.delete(id);
    noteEditing.delete(id);
  } catch (e) {
    noteMsg = { id, text: `Risposta non inviata: ${(e as Error).message}` };
  }
  noting = 0;
  render();
}

async function refresh(force = false) {
  if (!devKey() || loading || (!force && Date.now() - lastLoad < 60000)) return;
  loading = true;
  error = '';
  render();
  try {
    data = await load(serverProps);
    lastLoad = Date.now();
  } catch (e) {
    error = `Non riesco a leggere le proposte: ${(e as Error).message}`;
  }
  loading = false;
  render();
}

ui.addEventListener('input', (e) => {
  const t = e.target as HTMLTextAreaElement;
  if (t.dataset.n) noteDrafts.set(Number(t.dataset.n), t.value);
});
ui.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!el) return;
  const [a, arg = ''] = el.dataset.a!.split(/:(.*)/s);
  if (a === 'reload') void refresh(true);
  if (a === 'tab') {
    tab = arg as typeof tab;
    render();
  }
  if (a === 'tester') {
    if (openTesters.has(arg)) openTesters.delete(arg);
    else openTesters.add(arg);
    render();
  }
  if (a === 'note') void sendNote(Number(arg));
  if (a === 'noteedit') {
    noteEditing.add(Number(arg));
    render();
  }
  if (a === 'reject') {
    const id = Number(arg);
    confirmAccept = 0;
    if (confirmReject !== id) {
      confirmReject = id;
      render();
      return;
    }
    confirmReject = 0;
    void reject(id);
  }
  if (a === 'accept') {
    const id = Number(arg);
    confirmReject = 0;
    if (confirmAccept !== id) {
      confirmAccept = id;
      render();
      return;
    }
    confirmAccept = 0;
    void accept(id);
  }
  if (a === 'key') {
    const v = ui.querySelector<HTMLInputElement>('.dv-key')?.value ?? '';
    void tryDevKey(v).then((ok) => {
      keyMsg = ok ? '' : 'Chiave sbagliata';
      render();
      if (ok) void refresh(true);
    });
  }
});
// tornando sull'app (dopo aver provato un'anteprima o la partita) si aggiorna da sola, al massimo una volta al minuto
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
watchIcons();
render();
void refresh(true);
