/**
 * Pezzi in comune tra l'app developer (src/devapp.ts) e l'app dei tester (src/testerapp.ts): le proposte dal server
 * messe insieme a GitHub (issue, ramo di Claude, pull request), a che punto è ognuna, le anteprime in preparazione e
 * i resoconti dei tester (solo rifiutate e nel gioco).
 */
const REPO = 'Alfa40/hustle-idle';
const GH = `https://api.github.com/repos/${REPO}`;
export const preview = (n: number) => `https://proposta-${n}.hustle-anteprime.pages.dev/`;
export const issueUrl = (n: number) => `https://github.com/${REPO}/issues/${n}`;

/** voto di un tester su un'anteprima (un parere: decide lo sviluppatore) */
export interface Vote {
  name: string;
  vote: 'si' | 'no';
  comment: string;
  at: number;
  /** il voto è di questo telefono (solo nell'app dei tester) */
  mine?: boolean;
}

/** risposta a una domanda di chiarimento di Claude (una per telefono, si può cambiare) */
export interface Note {
  name: string;
  comment: string;
  at: number;
  mine?: boolean;
}

/** proposta come la vede il server */
export interface Prop {
  id: number;
  status: 'nuova' | 'approvata' | 'scartata' | 'importata' | 'rifiutata' | 'accettata' | 'pubblicata';
  text: string;
  nickname: string;
  player: string;
  created: number;
  issue: number;
  /** perché l'ultima unione al gioco non è riuscita (torna da provare) */
  mergeError?: string;
  votes?: Vote[];
  notes?: Note[];
}
export interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason?: string | null;
  updated_at: string;
  labels?: { name: string }[];
  pull_request?: unknown;
}
/** a che punto è una proposta, mettendo insieme server e GitHub */
export type Stage = 'attesa' | 'scartata' | 'bocciata' | 'lavoro' | 'prova' | 'unione' | 'gioco';
export const STAGE: Record<Stage, { label: string; ico: string }> = {
  attesa: { label: 'In attesa di lettura', ico: '⏳' },
  scartata: { label: 'Rifiutata subito', ico: '❌' },
  bocciata: { label: "Rifiutata dopo l'anteprima", ico: '❌' },
  lavoro: { label: 'Accettata · Claude ci sta lavorando', ico: '🛠️' },
  prova: { label: 'Accettata · anteprima da provare', ico: '📱' },
  unione: { label: 'Accettata · si sta pubblicando', ico: '⏳' },
  gioco: { label: 'Nel gioco', ico: '✅' },
};
export const REJECTED: Stage[] = ['scartata', 'bocciata'];

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function ago(ms: number) {
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

/** chiamata al server delle proposte; l'errore porta il messaggio del server */
export async function post<T = Record<string, unknown>>(api: string, path: string, body: object): Promise<T> {
  const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `server: errore ${r.status}`);
  return j;
}

// ---------------- dati ----------------

export interface Data {
  props: Prop[];
  issues: Map<number, Issue>;
  branches: Set<number>;
  merged: Set<number>;
}

export async function load(serverProps: () => Promise<Prop[]>): Promise<Data> {
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

export function stageOf(p: Prop, d: Data): Stage {
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

/** una proposta nella lista delle anteprime: la issue su GitHub e (se arriva dal gioco) la proposta sul server */
export interface PrevItem {
  issue: Issue;
  prop?: Prop;
  /** il ramo di Claude c'è: l'anteprima si può provare */
  ready: boolean;
}

/**
 * Claude non ha capito bene cosa fare e chiede un chiarimento: la proposta ha l'etichetta "chiarimento" e nel testo
 * la domanda tra `<!-- domanda -->` e `<!-- /domanda -->`. Tester e sviluppatore rispondono dalle app.
 */
export const asksOf = (i: Issue) => !!i.labels?.some((l) => l.name === 'chiarimento');
export function questionOf(i: Issue) {
  const m = /<!-- domanda -->([\s\S]*?)<!-- \/domanda -->/.exec(i.body ?? '');
  return (m?.[1] ?? '').replace(/^\s*#+ .*$/m, '').trim();
}

/** anteprime da provare (le più nuove prima) e proposte in preparazione (approvate o con Claude al lavoro) */
export function previewLists(d: Data) {
  const propOf = new Map(d.props.filter((p) => p.issue).map((p) => [p.issue, p]));
  // aperte su GitHub, non ancora unite e non rifiutate (la chiusura su GitHub arriva qualche minuto dopo)
  const open = [...d.issues.values()].filter((i) => i.state === 'open' && !d.merged.has(i.number) && !['rifiutata', 'pubblicata'].includes(propOf.get(i.number)?.status ?? ''));
  const items = open.map((i): PrevItem => ({ issue: i, prop: propOf.get(i.number), ready: d.branches.has(i.number) }));
  // Claude aspetta una risposta (a volte con un'anteprima di prova, già pronta)
  const asks = items.filter((x) => asksOf(x.issue));
  const ready = items.filter((x) => x.ready && !asksOf(x.issue)).sort((a, b) => Date.parse(b.issue.updated_at) - Date.parse(a.issue.updated_at));
  const busy = items.filter((x) => !x.ready && !asksOf(x.issue));
  // approvate dallo sviluppatore ma non ancora su GitHub: il robot le passa a Claude al suo prossimo giro
  // (quelle già su GitHub, se il server non lo sa ancora, stanno solo sopra)
  const onGh = new Set([...d.issues.values()].map((i) => /<!-- proposta-gioco-(\d+) -->/.exec(i.body ?? '')?.[1]).filter(Boolean).map(Number));
  const queued = d.props.filter((p) => p.status === 'approvata' && !onGh.has(p.id)).sort((a, b) => a.created - b.created);
  return { ready, busy, queued, asks };
}

const shortTitle = (i: Issue) => i.title.replace(/^Proposta:\s*/i, '');
const nameOf = (x: PrevItem) => x.prop?.nickname ?? /da \*\*(.+?)\*\*/.exec(x.issue.body ?? '')?.[1] ?? '';

/** avvisi "in preparazione": proposte approvate in coda per Claude e quelle su cui Claude sta lavorando */
export function prepHtml(d: Data) {
  const { busy, queued } = previewLists(d);
  if (!busy.length && !queued.length) return '';
  const cut = (s: string) => (s.length > 90 ? s.slice(0, 88).trimEnd() + '…' : s);
  const rows = [
    ...busy.map((x) => `<a class="dv-prep" href="${issueUrl(x.issue.number)}" target="_blank" rel="noopener"><span class="t-ico">🛠️</span><span class="l-txt"><b>#${x.issue.number} in preparazione</b>
      <small>${esc(cut(shortTitle(x.issue)))}${nameOf(x) ? ` · di ${esc(nameOf(x))}` : ''}</small><small>Claude sta scrivendo la modifica: l'anteprima arriva tra pochi minuti.</small></span></a>`),
    ...queued.map((p) => `<div class="dv-prep"><span class="t-ico">⏳</span><span class="l-txt"><b>Proposta in preparazione</b>
      <small>${esc(cut(p.text))}${p.nickname ? ` · di ${esc(p.nickname)}` : ''}</small><small>Approvata: tra poco Claude inizia a prepararla.</small></span></div>`),
  ];
  return `<div class="card dv-preps"><h3>🛠️ In preparazione</h3>${rows.join('')}</div>`;
}

/** la scheda di un'anteprima da provare (sotto: avvisi, voti e tasti, diversi tra le due app) */
export function previewHead(x: PrevItem) {
  const i = x.issue;
  const name = nameOf(x);
  return `<a class="t-btn" href="${preview(i.number)}" target="_blank" rel="noopener">
      <span class="t-ico">📱</span><span class="l-txt"><b>#${i.number} · ${esc(shortTitle(i))}</b>
      <small>${name ? `di <span class="dv-who">${esc(name)}</span> · ` : ''}aggiornata ${ago(Date.parse(i.updated_at))}</small></span></a>`;
}

/** la scheda di una proposta per cui Claude chiede un chiarimento; sotto, il riquadro per rispondere (`box`) */
export function askHtml(x: PrevItem, box: string) {
  const name = nameOf(x);
  const q = questionOf(x.issue);
  const notes = (x.prop?.notes ?? []).filter((n) => !n.mine);
  return `<div class="dv-prev dv-ask"><div class="t-btn dv-ask-head"><span class="t-ico">❓</span><span class="l-txt"><b>#${x.issue.number} · Serve un chiarimento</b>
      <small>${name ? `di <span class="dv-who">${esc(name)}</span> · ` : ''}${ago(Date.parse(x.issue.updated_at))}</small></span></div>
    <div class="dv-note"><b>La proposta</b><div class="dv-text">${esc(x.prop?.text ?? shortTitle(x.issue))}</div></div>
    <div class="dv-note ask"><b>Claude chiede</b><div class="dv-text">${esc(q || 'Cosa intendi, di preciso?')}</div></div>
    ${x.ready ? previewHead(x).replace('</b>', ' · prova</b>') : ''}
    ${notes.map((n) => `<div class="dv-vote"><b>💬 ${esc(n.name)}</b> <span class="muted">${ago(n.at)}</span><div class="dv-text">${esc(n.comment)}</div></div>`).join('')}${box}</div>`;
}

/** il riquadro per rispondere alla domanda di Claude (`data-a="note:<id>"`, testo in `data-n`) */
export function noteBoxHtml(p: Prop | undefined, draft: string | undefined, busy: boolean, msg: string, editing: boolean) {
  if (!p) return '';
  if (p.status !== 'importata') return '<div class="dv-note">⏳ Tra pochi minuti si può rispondere.</div>';
  const mine = p.notes?.find((n) => n.mine);
  const err = msg ? `<p class="small center bad" style="margin:4px 0 0">${esc(msg)}</p>` : '';
  if (mine && !editing) {
    return `<div class="dv-vote mine"><b>La tua risposta</b> <span class="muted">${ago(mine.at)}</span><div class="dv-text">${esc(mine.comment)}</div>
      <div class="dv-acts"><button class="btn sm sec" data-a="noteedit:${p.id}">✏️ Cambia risposta</button></div></div>${err}`;
  }
  return `<div class="card tp-vote"><b>💬 Rispondi a Claude</b>
      <textarea class="lb-input tp-com" data-n="${p.id}" maxlength="500" rows="3" placeholder="Spiega cosa intendevi: più è preciso, meglio è">${esc(draft ?? mine?.comment ?? '')}</textarea>
      <div class="dv-acts"><button class="btn sm good" data-a="note:${p.id}" ${busy ? 'disabled' : ''}>${busy ? 'Invio…' : 'Invia risposta'}</button></div>${err}</div>`;
}

/** i voti dei tester su un'anteprima: quanti approvano e quanti bocciano, e i commenti */
export function votesHtml(p: Prop | undefined, skipMine = false) {
  const vs = (p?.votes ?? []).filter((v) => !(skipMine && v.mine));
  const all = p?.votes ?? [];
  if (!all.length) return '';
  const yes = all.filter((v) => v.vote === 'si').length;
  const list = vs.map((v) => `<div class="dv-vote ${v.vote === 'si' ? 'yes' : 'no'}"><b>${v.vote === 'si' ? '👍' : '👎'} ${esc(v.name)}</b> <span class="muted">${ago(v.at)}</span>${v.comment ? `<div class="dv-text">${esc(v.comment)}</div>` : ''}</div>`).join('');
  return `<div class="dv-votes"><div class="dv-vsum"><span class="s-green">👍 ${yes} approvano</span><span class="s-red">👎 ${all.length - yes} bocciano</span></div>${list}</div>`;
}

/** resoconti dei tester: per ognuno le proposte rifiutate e quelle entrate nel gioco */
export function testersHtml(d: Data, openTesters: Set<string>) {
  const groups = new Map<string, Prop[]>();
  for (const p of d.props) {
    const k = p.player || p.nickname;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const list = [...groups.entries()]
    .map(([k, all]) => {
      all.sort((a, b) => b.created - a.created);
      // solo le proposte finite: rifiutate o nel gioco (quelle in corso stanno nelle anteprime)
      const done = all.map((p) => ({ p, st: stageOf(p, d) })).filter((x) => x.st === 'gioco' || REJECTED.includes(x.st));
      return { k, done, name: all[0].nickname || 'Senza nome', last: all[0].created,
        rej: done.filter((x) => x.st !== 'gioco').length, game: done.filter((x) => x.st === 'gioco').length };
    })
    .filter((t) => t.done.length)
    .sort((a, b) => b.last - a.last);
  if (!list.length) return '<div class="card"><p class="small center" style="margin:0">Nessuna proposta è ancora stata rifiutata o messa nel gioco.</p></div>';
  return list.map((t) => {
    const open = openTesters.has(t.k);
    const nums = `<div class="dv-nums n2"><span class="s-red"><b>${t.rej}</b>rifiutate</span><span class="s-green"><b>${t.game}</b>nel gioco</span></div>`;
    const rows = open
      ? `<div class="dv-props">${t.done.map(({ p, st }) => `<div class="dv-prop st-${st}"><div class="dv-st">${STAGE[st].ico} ${STAGE[st].label}${p.issue ? ` · <a href="${issueUrl(p.issue)}" target="_blank" rel="noopener">#${p.issue}</a>` : ''}</div>
          <div class="dv-text">${esc(p.text)}</div><div class="muted small">${ago(p.created)}</div></div>`).join('')}</div>`
      : '';
    return `<div class="card dv-tester"><button class="dv-head" data-a="tester:${esc(t.k)}"><span><b>${esc(t.name)}</b><small>ultima proposta ${ago(t.last)}</small></span><span class="dv-chev">${open ? '▲' : '▼'}</span></button>${nums}${rows}</div>`;
  }).join('');
}
