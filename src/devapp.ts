/**
 * App developer (developer.html, da aggiungere alla schermata Home come seconda app, separata dal gioco):
 * - Partita developer (apre il gioco con `./?app=dev`: un miliardo, comandi rapidi, mai in classifica);
 * - Anteprime: le proposte aperte su GitHub con il ramo di Claude, con chi le ha scritte, da aprire sul telefono;
 * - Tester: per ogni persona quante proposte ha inviato, quante sono state rifiutate e accettate, e tra le
 *   accettate quali sono finite davvero nel gioco (pull request del ramo di Claude unita). Le anteprime provate e
 *   non piaciute si rifiutano da qui ("Rifiuta"): il robot di GitHub chiude la proposta e conta come rifiutata.
 *   Quelle piaciute si accettano da qui ("Accetta e pubblica"): il robot unisce la modifica al gioco e la pubblica.
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
import { API } from './sim/leaderboard';

const REPO = 'Alfa40/hustle-idle';
const GH = `https://api.github.com/repos/${REPO}`;
const preview = (n: number) => `https://proposta-${n}.hustle-anteprime.pages.dev/`;
const issueUrl = (n: number) => `https://github.com/${REPO}/issues/${n}`;

/** proposta come la vede il server */
interface Prop {
  id: number;
  status: 'nuova' | 'approvata' | 'scartata' | 'importata' | 'rifiutata' | 'accettata' | 'pubblicata';
  text: string;
  nickname: string;
  player: string;
  created: number;
  issue: number;
  /** perché l'ultima unione al gioco non è riuscita (torna da provare) */
  mergeError?: string;
}
interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason?: string | null;
  updated_at: string;
  pull_request?: unknown;
}
/** a che punto è una proposta, mettendo insieme server e GitHub */
type Stage = 'attesa' | 'scartata' | 'bocciata' | 'lavoro' | 'prova' | 'unione' | 'gioco';
const STAGE: Record<Stage, { label: string; ico: string }> = {
  attesa: { label: 'In attesa di lettura', ico: '⏳' },
  scartata: { label: 'Rifiutata subito', ico: '❌' },
  bocciata: { label: "Rifiutata dopo l'anteprima", ico: '❌' },
  lavoro: { label: 'Accettata · Claude ci sta lavorando', ico: '🛠️' },
  prova: { label: 'Accettata · anteprima da provare', ico: '📱' },
  unione: { label: 'Accettata · si sta pubblicando', ico: '⏳' },
  gioco: { label: 'Accettata · nel gioco', ico: '✅' },
};
const REJECTED: Stage[] = ['scartata', 'bocciata'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function ago(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'giorno' : 'giorni'} fa`;
}

async function gh<T>(path: string): Promise<T> {
  const r = await fetch(GH + path, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 403 || r.status === 429) throw new Error("GitHub ha detto di aspettare un po' (troppe richieste): riprova tra qualche minuto");
  if (!r.ok) throw new Error(`GitHub: errore ${r.status}`);
  return r.json();
}

async function serverProps(): Promise<Prop[]> {
  const r = await fetch(API + '/hustle/proposals/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: devKey() }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `server: errore ${r.status}`);
  return j.proposals ?? [];
}

// ---------------- dati ----------------

interface Data {
  props: Prop[];
  issues: Map<number, Issue>;
  branches: Set<number>;
  merged: Set<number>;
}

async function load(): Promise<Data> {
  const [props, branches, issues, pulls] = await Promise.all([
    serverProps(),
    gh<{ name: string }[]>('/branches?per_page=100'),
    gh<Issue[]>('/issues?state=all&labels=proposta&per_page=100'),
    gh<{ head: { ref: string }; merged_at: string | null }[]>('/pulls?state=all&per_page=100'),
  ]);
  const issueOf = (ref: string) => Number(/^claude\/issue-(\d+)-/.exec(ref)?.[1] ?? 0);
  return {
    props,
    issues: new Map(issues.filter((i) => !i.pull_request).map((i) => [i.number, i])),
    branches: new Set(branches.map((b) => issueOf(b.name)).filter(Boolean)),
    merged: new Set(pulls.filter((p) => p.merged_at).map((p) => issueOf(p.head.ref)).filter(Boolean)),
  };
}

function stageOf(p: Prop, d: Data): Stage {
  if (p.status === 'nuova') return 'attesa';
  if (p.status === 'scartata') return 'scartata';
  if (p.status === 'rifiutata') return 'bocciata';
  if (p.status === 'approvata' || !p.issue) return 'lavoro';
  if (p.status === 'pubblicata' || d.merged.has(p.issue)) return 'gioco';
  if (p.status === 'accettata') return 'unione';
  // chiusa su GitHub come completata (unita a mano senza pull request)
  if (d.issues.get(p.issue)?.state_reason === 'completed') return 'gioco';
  // chiusa su GitHub senza unire la modifica: rifiutata anche questa
  if (d.issues.get(p.issue)?.state === 'closed') return 'bocciata';
  return d.branches.has(p.issue) ? 'prova' : 'lavoro';
}

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

function keyHtml() {
  return `<div class="card"><h3>🔑 Chiave developer</h3><p class="small" style="margin:0 0 8px">Scrivila una volta: questo telefono se la ricorda.</p>
    <input class="lb-input dv-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chiave developer">
    <button class="btn good full" data-a="key" style="margin-top:8px">Entra</button>${keyMsg ? `<p class="small center bad" style="margin:6px 0 0">${esc(keyMsg)}</p>` : ''}</div>`;
}

function previewsHtml(d: Data) {
  // nome di chi ha scritto ogni proposta su GitHub (dal server; per le proposte aperte a mano, dal testo)
  const propOf = new Map(d.props.filter((p) => p.issue).map((p) => [p.issue, p]));
  // aperte su GitHub, non ancora unite e non rifiutate (la chiusura su GitHub arriva qualche minuto dopo)
  const open = [...d.issues.values()].filter((i) => i.state === 'open' && !d.merged.has(i.number) && !['rifiutata', 'pubblicata'].includes(propOf.get(i.number)?.status ?? ''));
  const ready = open.filter((i) => d.branches.has(i.number)).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const busy = open.filter((i) => !d.branches.has(i.number));
  const row = (i: Issue, ok: boolean) => {
    const prop = propOf.get(i.number);
    const name = prop?.nickname ?? /da \*\*(.+?)\*\*/.exec(i.body ?? '')?.[1] ?? '';
    const accepted = prop?.status === 'accettata';
    // accettata: il robot la unisce e la pubblica entro una decina di minuti; intanto niente tasti
    const acc = prop && ok && !accepted
      ? `<button class="btn sm good dv-acc" data-a="accept:${prop.id}" ${accepting === prop.id ? 'disabled' : ''}>${accepting === prop.id ? 'Accetto…' : confirmAccept === prop.id ? 'Sicuro? Tocca ancora per pubblicarla' : '✅ Accetta e pubblica'}</button>`
      : '';
    const rej = prop && !accepted
      ? `<button class="btn sm danger dv-rej" data-a="reject:${prop.id}" ${rejecting === prop.id ? 'disabled' : ''}>${rejecting === prop.id ? 'Rifiuto…' : confirmReject === prop.id ? 'Sicuro? Tocca ancora per rifiutarla' : '❌ Rifiuta'}</button>`
      : '';
    const note = accepted
      ? '<div class="dv-note ok">⏳ Accettata: entro una decina di minuti il robot la mette nel gioco e la pubblica.</div>'
      : prop?.mergeError ? `<div class="dv-note bad">⚠️ Non pubblicata: ${esc(prop.mergeError)}. Nella proposta su GitHub trovi cosa fare.</div>` : '';
    return `<div class="dv-prev"><a class="t-btn ${ok ? '' : 'wait'}" href="${ok ? preview(i.number) : issueUrl(i.number)}" target="_blank" rel="noopener">
      <span class="t-ico">${ok ? '📱' : '🛠️'}</span><span class="l-txt"><b>#${i.number} · ${esc(i.title.replace(/^Proposta:\s*/i, ''))}</b>
      <small>${name ? `di <span class="dv-who">${esc(name)}</span> · ` : ''}${ok ? `aggiornata ${ago(Date.parse(i.updated_at))}` : 'Claude ci sta lavorando'}</small></span></a>${note}${acc || rej ? `<div class="dv-acts">${rej}${acc}</div>` : ''}</div>`;
  };
  if (!open.length) return '<div class="card"><p class="small center" style="margin:0">Nessuna anteprima da provare in questo momento.</p></div>';
  return ready.map((i) => row(i, true)).join('') + busy.map((i) => row(i, false)).join('');
}

function testersHtml(d: Data) {
  const groups = new Map<string, Prop[]>();
  for (const p of d.props) {
    const k = p.player || p.nickname;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  if (!groups.size) return '<div class="card"><p class="small center" style="margin:0">Nessun tester ha ancora inviato proposte.</p></div>';
  const list = [...groups.entries()]
    .map(([k, ps]) => {
      ps.sort((a, b) => b.created - a.created);
      const st = ps.map((p) => stageOf(p, d));
      const n = (f: (s: Stage) => boolean) => st.filter(f).length;
      return { k, ps, st, name: ps[0].nickname || 'Senza nome', last: ps[0].created,
        rej: n((s) => REJECTED.includes(s)), acc: n((s) => s !== 'attesa' && !REJECTED.includes(s)), game: n((s) => s === 'gioco'), wait: n((s) => s === 'attesa') };
    })
    .sort((a, b) => b.last - a.last);
  return list.map((t) => {
    const open = openTesters.has(t.k);
    const nums = `<div class="dv-nums">
        <span><b>${t.ps.length}</b>inviate</span><span class="s-red"><b>${t.rej}</b>rifiutate</span>
        <span class="s-blue"><b>${t.acc}</b>accettate</span><span class="s-green"><b>${t.game}</b>nel gioco</span></div>`;
    const rows = open
      ? `<div class="dv-props">${t.ps.map((p, i) => `<div class="dv-prop st-${t.st[i]}"><div class="dv-st">${STAGE[t.st[i]].ico} ${STAGE[t.st[i]].label}${p.issue ? ` · <a href="${issueUrl(p.issue)}" target="_blank" rel="noopener">#${p.issue}</a>` : ''}</div>
          <div class="dv-text">${esc(p.text)}</div><div class="muted small">${ago(p.created)}</div></div>`).join('')}</div>`
      : '';
    return `<div class="card dv-tester"><button class="dv-head" data-a="tester:${esc(t.k)}"><span><b>${esc(t.name)}</b><small>${t.wait ? `${t.wait} in attesa · ` : ''}ultima ${ago(t.last)}</small></span><span class="dv-chev">${open ? '▲' : '▼'}</span></button>${nums}${rows}</div>`;
  }).join('');
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
        : tab === 'anteprime' ? previewsHtml(data) : testersHtml(data);
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

async function refresh(force = false) {
  if (!devKey() || loading || (!force && Date.now() - lastLoad < 60000)) return;
  loading = true;
  error = '';
  render();
  try {
    data = await load();
    lastLoad = Date.now();
  } catch (e) {
    error = `Non riesco a leggere le proposte: ${(e as Error).message}`;
  }
  loading = false;
  render();
}

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
