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
import { askHtml, detailHtml, esc, explainOf, forgetExplains, load, noteBoxHtml, post, prepHtml, previewHead, previewLists, testersHtml, votesBlock, type Data, type PrevItem, type Prop } from './board';

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
/** scheda dell'anteprima aperta (numero della proposta su GitHub, 0 = elenco) e dove era scorso l'elenco */
let openIssue = 0;
let listY = 0;
/** modifiche da chiedere a Claude, per anteprima (restano anche ridisegnando) */
const changeDrafts = new Map<number, string>();
let changing = 0;
let changeMsg: { id: number; text: string; ok?: boolean } | null = null;

function keyHtml() {
  return `<div class="card"><h3>🔑 Chiave developer</h3><p class="small" style="margin:0 0 8px">Scrivila una volta: questo telefono se la ricorda.</p>
    <input class="lb-input dv-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chiave developer">
    <button class="btn good full" data-a="key" style="margin-top:8px">Entra</button>${keyMsg ? `<p class="small center bad" style="margin:6px 0 0">${esc(keyMsg)}</p>` : ''}</div>`;
}

/** scheda di un'anteprima: la proposta, cosa cambia, voti e commenti dei tester, modifiche da chiedere, pubblica o rifiuta */
function detailView(x: PrevItem) {
  const prop = x.prop;
  const accepted = prop?.status === 'accettata';
  const head = detailHtml(x, explainOf(x.issue.number, render));
  const note = accepted
    ? '<div class="dv-note ok">⏳ Accettata: tra pochi minuti il robot la mette nel gioco e la pubblica.</div>'
    : prop?.mergeError ? `<div class="dv-note bad">⚠️ Non pubblicata: ${esc(prop.mergeError)}. Chiedi a Claude di aggiornarla qui sotto ("aggiorna il ramo con il gioco e risolvi i conflitti").</div>` : '';
  const votes = `<h3 class="dv-sec">👥 Consigli dei tester</h3>${votesBlock(prop)}`;
  if (!prop || accepted) return head + note + votes;
  const msg = changeMsg?.id === prop.id ? `<p class="small center ${changeMsg.ok ? 'good' : 'bad'}" style="margin:4px 0 0">${esc(changeMsg.text)}</p>` : '';
  const busy = changing === prop.id;
  const change = `<div class="card tp-vote"><b>✏️ Modifiche da fare</b>
      <p class="small muted" style="margin:0">Scrivi cosa cambiare, come lo diresti a voce: Claude aggiorna questa anteprima (ci mette qualche minuto) e poi la riprovi.</p>
      <textarea class="lb-input tp-com" data-ch="${prop.id}" maxlength="2000" rows="4" placeholder="Es. La linguetta è troppo grande: falla più piccola e mettila più in basso">${esc(changeDrafts.get(prop.id) ?? '')}</textarea>
      <div class="dv-acts"><button class="btn sm blue" data-a="change:${prop.id}" ${busy ? 'disabled' : ''}>${busy ? 'Invio…' : '✏️ Chiedi le modifiche a Claude'}</button></div>${msg}</div>`;
  const acts = `<div class="dv-acts dv-decide"><button class="btn danger dv-rej" data-a="reject:${prop.id}" ${rejecting === prop.id ? 'disabled' : ''}>${rejecting === prop.id ? 'Rifiuto…' : confirmReject === prop.id ? 'Sicuro? Tocca ancora' : '❌ Rifiuta'}</button>
      <button class="btn good dv-acc" data-a="accept:${prop.id}" ${accepting === prop.id ? 'disabled' : ''}>${accepting === prop.id ? 'Accetto…' : confirmAccept === prop.id ? 'Sicuro? Tocca ancora per pubblicarla' : '✅ Accetta e pubblica'}</button></div>`;
  return head + note + votes + change + acts;
}

function previewsHtml(d: Data) {
  const { ready } = previewLists(d);
  const open = openIssue ? ready.find((x) => x.issue.number === openIssue) : undefined;
  if (open) return detailView(open);
  // nell'elenco solo il riassunto: voti, modifiche e tasti stanno nella scheda (si apre toccandola)
  const row = (x: PrevItem) => {
    const prop = x.prop;
    const note = prop?.status === 'accettata'
      ? '<div class="dv-note ok">⏳ Accettata: tra pochi minuti il robot la mette nel gioco e la pubblica.</div>'
      : prop?.mergeError ? '<div class="dv-note bad">⚠️ Non pubblicata: apri la scheda per sistemarla.</div>' : '';
    const ch = prop?.change ? '<div class="dv-note">✏️ Modifiche chieste a Claude</div>' : '';
    return `<div class="dv-prev">${previewHead(x)}${note}${ch}</div>`;
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

/** Modifiche da fare dopo aver provato l'anteprima: il robot di GitHub le passa a Claude, che aggiorna lo stesso ramo. */
async function requestChanges(id: number) {
  const text = (changeDrafts.get(id) ?? '').trim();
  changeMsg = null;
  if (text.length < 3) {
    changeMsg = { id, text: 'Scrivi cosa cambiare' };
    render();
    return;
  }
  changing = id;
  render();
  try {
    await post(API, '/hustle/proposals/decide', { key: devKey(), id, action: 'request_changes', text });
    const p = data?.props.find((x) => x.id === id);
    if (p) Object.assign(p, { change: text, changeAt: Date.now(), changeState: 'attesa', mergeError: '' });
    changeDrafts.delete(id);
    changeMsg = { id, text: 'Inviate: Claude ci lavora appena è libero (una cosa alla volta).', ok: true };
  } catch (e) {
    changeMsg = { id, text: `Non inviate: ${(e as Error).message}` };
  }
  changing = 0;
  render();
}

async function refresh(force = false) {
  if (!devKey() || loading || (!force && Date.now() - lastLoad < 60000)) return;
  loading = true;
  error = '';
  render();
  try {
    forgetExplains();
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
  if (t.dataset.ch) changeDrafts.set(Number(t.dataset.ch), t.value);
});
ui.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!el) return;
  const [a, arg = ''] = el.dataset.a!.split(/:(.*)/s);
  if (a === 'reload') void refresh(true);
  if (a === 'tab') {
    tab = arg as typeof tab;
    openIssue = 0;
    render();
  }
  if (a === 'tester') {
    if (openTesters.has(arg)) openTesters.delete(arg);
    else openTesters.add(arg);
    render();
  }
  if (a === 'open') {
    listY = scrollY;
    openIssue = Number(arg);
    confirmAccept = confirmReject = 0;
    changeMsg = null;
    render();
    scrollTo(0, 0);
  }
  if (a === 'back') {
    openIssue = 0;
    render();
    scrollTo(0, listY);
  }
  if (a === 'change') void requestChanges(Number(arg));
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
