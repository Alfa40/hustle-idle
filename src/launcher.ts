/**
 * Lanciatore delle anteprime (anteprime.html, da aggiungere alla schermata Home come seconda app): elenca le
 * proposte aperte su GitHub che hanno un ramo di Claude e apre l'anteprima di ognuna
 * (https://proposta-N.hustle-anteprime.pages.dev). Legge solo dati pubblici di GitHub, senza chiavi.
 */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import './ui/layout';
import { watchIcons } from './ui/icons';

const REPO = 'Alfa40/hustle-idle';
const GH = `https://api.github.com/repos/${REPO}`;
const preview = (n: number) => `https://proposta-${n}.hustle-anteprime.pages.dev/`;

interface Item {
  n: number;
  title: string;
  who: string;
  updated: number;
  ready: boolean;
}

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
  if (r.status === 403 || r.status === 429) throw new Error('GitHub ha detto di aspettare un po\' (troppe richieste): riprova tra qualche minuto');
  if (!r.ok) throw new Error(`errore ${r.status}`);
  return r.json();
}

async function load(): Promise<Item[]> {
  const [branches, issues] = await Promise.all([
    gh<{ name: string }[]>('/branches?per_page=100'),
    gh<{ number: number; title: string; body: string | null; updated_at: string; pull_request?: unknown }[]>('/issues?state=open&labels=proposta&per_page=100'),
  ]);
  const withBranch = new Set(branches.map((b) => /^claude\/issue-(\d+)-/.exec(b.name)?.[1]).filter(Boolean).map(Number));
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => ({
      n: i.number,
      title: i.title.replace(/^Proposta:\s*/i, ''),
      who: /da \*\*(.+?)\*\*/.exec(i.body ?? '')?.[1] ?? '',
      updated: Date.parse(i.updated_at),
      ready: withBranch.has(i.number),
    }))
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.updated - a.updated);
}

const ui = document.getElementById('ui')!;
let items: Item[] | null = null;
let error = '';
let loading = false;

function render() {
  const list = items ?? [];
  const ready = list.filter((i) => i.ready);
  const waiting = list.filter((i) => !i.ready);
  const row = (i: Item) => `<a class="t-btn ${i.ready ? '' : 'wait'}" ${i.ready ? `href="${preview(i.n)}" target="_blank" rel="noopener"` : `href="https://github.com/${REPO}/issues/${i.n}" target="_blank" rel="noopener"`}>
      <span class="t-ico">${i.ready ? '📱' : '⏳'}</span><span class="l-txt"><b>#${i.n} · ${esc(i.title)}</b><small>${i.who ? `di ${esc(i.who)} · ` : ''}${i.ready ? `aggiornata ${ago(i.updated)}` : 'Claude ci sta lavorando'}</small></span></a>`;
  ui.innerHTML = `<div class="title launcher-screen">
    <div class="t-logo"><div class="t-name">ANTEPRIME</div><div class="t-sub">Le proposte dei tester da provare</div></div>
    <div class="t-menu">
      ${error ? `<div class="card"><p class="small bad" style="margin:0">${esc(error)}</p></div>` : ''}
      ${items === null && !error ? '<div class="card"><p class="small muted center" style="margin:0">Carico le proposte…</p></div>' : ''}
      ${items !== null && !list.length ? '<div class="card"><p class="small center" style="margin:0">Nessuna proposta aperta in questo momento.</p></div>' : ''}
      ${ready.map(row).join('')}
      ${waiting.map(row).join('')}
      <div class="t-row">
        <button class="t-btn t-small" data-a="reload" ${loading ? 'disabled' : ''}><span class="t-ico">🔄</span><b>${loading ? 'Carico…' : 'Aggiorna'}</b></button>
        <a class="t-btn t-small" href="./"><span class="t-ico">🎮</span><b>Gioco vero</b></a>
      </div>
      <p class="l-note small">Ogni anteprima parte con nome e logo già pronti e ha anche la Partita developer. Non tocca il gioco vero né la classifica.</p>
    </div></div>`;
}

async function refresh() {
  loading = true;
  error = '';
  render();
  try {
    items = await load();
  } catch (e) {
    error = `Non riesco a leggere le proposte: ${(e as Error).message}`;
  }
  loading = false;
  render();
}

ui.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-a="reload"]')) void refresh();
});
// tornando sull'app (dopo aver provato un'anteprima) la lista si aggiorna da sola
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !loading) void refresh();
});
watchIcons();
void refresh();
