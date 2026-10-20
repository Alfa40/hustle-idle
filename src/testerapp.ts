/**
 * App dei tester (tester.html, da aggiungere alla schermata Home, separata dal gioco):
 * - Anteprime: in cima gli avvisi delle proposte in preparazione, poi le anteprime da provare sul telefono. Per
 *   ognuna il tester approva o boccia, con un commento facoltativo (si può cambiare finché è da provare), e vede i
 *   voti degli altri. È un parere: accettare o rifiutare resta allo sviluppatore (app developer, src/devapp.ts).
 * - Tester: per ogni tester le sue proposte finite, cioè rifiutate o entrate nel gioco (src/board.ts).
 * Serve la chiave tester (una volta per telefono, o il link `tester.html?tester=<chiave>`) e un nome. Le proposte
 * si scrivono sempre nel gioco (Opzioni → "Proponi"), dove c'è la foto dello schermo.
 */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import './ui/layout';
import { watchIcons } from './ui/icons';
import { checkTesterLink, testerKey, tryTesterKey } from './tester';
import { API, nickname as lbNickname, playerId } from './sim/leaderboard';
import { askHtml, detailHtml, esc, explainOf, forgetExplains, load, noteBoxHtml, post, prepHtml, previewHead, previewLists, testersHtml, votesBlock, votesHtml, type Data, type PrevItem, type Prop } from './board';

const NAME_KEY = 'hustle.testerName';
const MAX_COMMENT = 500;

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) || lbNickname() || '';
  } catch {
    return '';
  }
}

const serverProps = () => post<{ proposals?: Prop[] }>(API, '/hustle/proposals/board', { key: testerKey(), player_id: playerId() }).then((j) => j.proposals ?? []);

// ---------------- schermata ----------------

const ui = document.getElementById('ui')!;
let data: Data | null = null;
let error = '';
let keyMsg = '';
let loading = false;
let lastLoad = 0;
let tab: 'anteprime' | 'tester' = 'anteprime';
/** si sta cambiando il nome (scheda della chiave) */
let editName = false;
/** commenti che si stanno scrivendo, per anteprima (restano anche ridisegnando) */
const drafts = new Map<number, string>();
/** anteprime di cui si sta cambiando il voto già dato */
const editing = new Set<number>();
let voting = 0;
let voteMsg: { id: number; text: string } | null = null;
/** risposte alle domande di chiarimento di Claude: bozze, invio in corso, errore, risposte che si stanno cambiando */
const noteDrafts = new Map<number, string>();
let noting = 0;
let noteMsg: { id: number; text: string } | null = null;
const noteEditing = new Set<number>();
/** scheda dell'anteprima aperta (numero della proposta su GitHub, 0 = elenco) e dove era scorso l'elenco */
let openIssue = 0;
let listY = 0;
const openTesters = new Set<string>();

function keyHtml() {
  const first = !testerKey();
  return `<div class="card"><h3>${first ? '🔑 Entra come tester' : '✏️ Il tuo nome'}</h3><p class="small" style="margin:0 0 8px">${first ? 'Scrivi la chiave tester e il tuo nome una volta: questo telefono se li ricorda.' : 'Il nome che vedono gli altri accanto ai tuoi voti.'}</p>
    ${first ? '<input class="lb-input tp-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chiave tester">' : ''}
    <input class="lb-input tp-name" maxlength="24" autocomplete="off" placeholder="Il tuo nome" value="${esc(savedName())}" style="margin-top:8px">
    <button class="btn good full" data-a="key" style="margin-top:8px">${first ? 'Entra' : 'Salva'}</button>${keyMsg ? `<p class="small center bad" style="margin:6px 0 0">${esc(keyMsg)}</p>` : ''}</div>`;
}

function voteBox(x: PrevItem, withOthers = true) {
  const p = x.prop;
  // aperta a mano su GitHub (non dal gioco): niente voti
  if (!p) return '';
  if (p.status === 'accettata') return `<div class="dv-note ok">⏳ Lo sviluppatore l'ha accettata: tra poco entra nel gioco.</div>${withOthers ? votesHtml(p) : ''}`;
  const mine = p.votes?.find((v) => v.mine);
  const msg = voteMsg?.id === p.id ? `<p class="small center bad" style="margin:4px 0 0">${esc(voteMsg.text)}</p>` : '';
  if (mine && !editing.has(p.id)) {
    return `<div class="dv-vote mine ${mine.vote === 'si' ? 'yes' : 'no'}"><b>Il tuo voto: ${mine.vote === 'si' ? '👍 Approvata' : '👎 Bocciata'}</b>${mine.comment ? `<div class="dv-text">${esc(mine.comment)}</div>` : ''}
      <div class="dv-acts"><button class="btn sm sec" data-a="edit:${p.id}">✏️ Cambia voto</button></div></div>${withOthers ? votesHtml(p, true) : ''}${msg}`;
  }
  const busy = voting === p.id;
  const draft = drafts.get(p.id) ?? mine?.comment ?? '';
  return `<div class="card tp-vote"><b>💬 Ti piace? Dillo dopo averla provata</b>
      <textarea class="lb-input tp-com" data-c="${p.id}" maxlength="${MAX_COMMENT}" rows="2" placeholder="Commento (facoltativo): cosa va bene, cosa cambieresti">${esc(draft)}</textarea>
      <div class="dv-acts"><button class="btn sm danger dv-rej" data-a="vote:${p.id}|no" ${busy ? 'disabled' : ''}>👎 Boccio</button><button class="btn sm good dv-acc" data-a="vote:${p.id}|si" ${busy ? 'disabled' : ''}>${busy ? 'Invio…' : '👍 Approvo'}</button></div>${msg}</div>${withOthers ? votesHtml(p, true) : ''}`;
}

function asksHtml(d: Data) {
  const { asks } = previewLists(d);
  if (!asks.length) return '';
  const hint = '<p class="small tp-hint">Claude non ha capito bene cosa fare: se sai cosa intendeva chi l\'ha scritta, rispondi tu.</p>';
  return hint + asks.map((x) => askHtml(x, noteBoxHtml(x.prop, x.prop && noteDrafts.get(x.prop.id), noting === x.prop?.id, noteMsg && noteMsg.id === x.prop?.id ? noteMsg.text : '', !!x.prop && noteEditing.has(x.prop.id)))).join('');
}

/** scheda di un'anteprima: la proposta, cosa cambia, il tuo voto con commento e quelli degli altri */
function detailView(x: PrevItem) {
  const others = x.prop?.votes?.some((v) => !v.mine) ? votesHtml(x.prop, true) : votesBlock(undefined);
  return detailHtml(x, explainOf(x.issue.number, render), false) + voteBox(x, false) + `<h3 class="dv-sec">👥 Voti degli altri tester</h3>${others}`;
}

function previewsHtml(d: Data) {
  const { ready } = previewLists(d);
  const open = openIssue ? ready.find((x) => x.issue.number === openIssue) : undefined;
  if (open) return detailView(open);
  const prep = prepHtml(d) + asksHtml(d);
  const hint = '<p class="small tp-hint">Tocca un\'anteprima: la provi, la voti e leggi cosa ne pensano gli altri. Lo sviluppatore legge voti e commenti prima di decidere.</p>';
  if (!ready.length) return prep || '<div class="card"><p class="small center" style="margin:0">Nessuna anteprima da provare in questo momento.</p></div>';
  // nell'elenco: l'anteprima e il tuo voto (se c'è); si vota e si leggono i commenti nella scheda
  const mineTag = (x: PrevItem) => {
    const v = x.prop?.votes?.find((y) => y.mine);
    return v ? `<div class="dv-note">${v.vote === 'si' ? '👍 Hai approvato' : '👎 Hai bocciato'}</div>` : '<div class="dv-note">Da votare: aprila, provala e dì cosa ne pensi</div>';
  };
  return prep + hint + ready.map((x) => `<div class="dv-prev">${previewHead(x)}${mineTag(x)}</div>`).join('');
}

function render() {
  let body: string;
  if (!testerKey() || editName) body = keyHtml();
  else {
    const tabs = `<div class="dv-tabs"><button class="dv-tab ${tab === 'anteprime' ? 'on' : ''}" data-a="tab:anteprime">📱 Anteprime</button><button class="dv-tab ${tab === 'tester' ? 'on' : ''}" data-a="tab:tester">👥 Tester</button></div>`;
    const content = error
      ? `<div class="card"><p class="small bad" style="margin:0">${esc(error)}</p></div>`
      : !data
        ? '<div class="card"><p class="small muted center" style="margin:0">Carico…</p></div>'
        : tab === 'anteprime' ? previewsHtml(data) : testersHtml(data, openTesters);
    body = `${tabs}${content}
      <div class="t-row"><button class="t-btn t-small" data-a="reload" ${loading ? 'disabled' : ''}><span class="t-ico">🔄</span><b>${loading ? 'Carico…' : 'Aggiorna'}</b></button>
      <button class="t-btn t-small" data-a="name"><span class="t-ico">👤</span><b>${esc(savedName() || 'Il tuo nome')}</b></button></div>`;
  }
  const y = scrollY;
  ui.innerHTML = `<div class="title launcher-screen">
    <div class="t-logo"><div class="t-name">HUSTLE TESTER</div><div class="t-sub">Anteprime da provare e proposte dei tester</div></div>
    <div class="t-menu">${body}</div></div>`;
  // ridisegnare non deve far perdere dove si era scorsi
  scrollTo(0, y);
}

async function vote(id: number, v: 'si' | 'no') {
  const comment = (drafts.get(id) ?? '').trim();
  voting = id;
  voteMsg = null;
  render();
  try {
    await post(API, '/hustle/proposals/vote', { key: testerKey(), player_id: playerId(), nickname: savedName(), id, vote: v, comment });
    const p = data?.props.find((x) => x.id === id);
    if (p) p.votes = [{ name: savedName() || 'Tester', vote: v, comment, at: Date.now(), mine: true }, ...(p.votes ?? []).filter((x) => !x.mine)];
    drafts.delete(id);
    editing.delete(id);
  } catch (e) {
    voteMsg = { id, text: `Voto non inviato: ${(e as Error).message}` };
  }
  voting = 0;
  render();
}

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
    await post(API, '/hustle/proposals/vote', { key: testerKey(), player_id: playerId(), nickname: savedName(), id, vote: 'nota', comment });
    const p = data?.props.find((x) => x.id === id);
    if (p) p.notes = [{ name: savedName() || 'Tester', comment, at: Date.now(), mine: true }, ...(p.notes ?? []).filter((x) => !x.mine)];
    noteDrafts.delete(id);
    noteEditing.delete(id);
  } catch (e) {
    noteMsg = { id, text: `Risposta non inviata: ${(e as Error).message}` };
  }
  noting = 0;
  render();
}

async function refresh(force = false) {
  if (!testerKey() || loading || (!force && Date.now() - lastLoad < 60000)) return;
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
  if (t.dataset.c) drafts.set(Number(t.dataset.c), t.value);
  if (t.dataset.n) noteDrafts.set(Number(t.dataset.n), t.value);
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
    render();
    scrollTo(0, 0);
  }
  if (a === 'back') {
    openIssue = 0;
    render();
    scrollTo(0, listY);
  }
  if (a === 'note') void sendNote(Number(arg));
  if (a === 'noteedit') {
    noteEditing.add(Number(arg));
    render();
  }
  if (a === 'edit') {
    editing.add(Number(arg));
    render();
  }
  if (a === 'vote') {
    const [id, v] = arg.split('|');
    void vote(Number(id), v === 'si' ? 'si' : 'no');
  }
  if (a === 'name') {
    editName = true;
    keyMsg = '';
    render();
  }
  if (a === 'key') {
    const key = ui.querySelector<HTMLInputElement>('.tp-key')?.value;
    const name = (ui.querySelector<HTMLInputElement>('.tp-name')?.value ?? '').trim();
    if (!name) {
      keyMsg = 'Scrivi il tuo nome';
      render();
      return;
    }
    void (key === undefined ? Promise.resolve(true) : tryTesterKey(key)).then((ok) => {
      keyMsg = ok ? '' : 'Chiave sbagliata';
      if (ok) {
        try {
          localStorage.setItem(NAME_KEY, name);
        } catch {
          /* modalità privata */
        }
        editName = false;
      }
      render();
      if (ok && !data) void refresh(true);
    });
  }
});
// tornando sull'app (dopo aver provato un'anteprima) si aggiorna da sola, al massimo una volta al minuto
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
watchIcons();
void checkTesterLink().then(() => {
  render();
  if (testerKey() && savedName()) void refresh(true);
  else if (testerKey()) {
    editName = true;
    render();
  }
});
