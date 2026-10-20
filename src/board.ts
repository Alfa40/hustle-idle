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
  /** perché (solo nell'app developer) e posto nel gioco */
  why?: string;
  where?: string;
  /** modifiche chieste dallo sviluppatore dopo aver provato l'anteprima, quando, e se il robot le ha passate a Claude */
  change?: string;
  changeAt?: number;
  changeState?: '' | 'attesa' | 'inviata';
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
/** aspetta il suo turno: Claude prepara una proposta alla volta (etichetta messa dal robot proposte.yml) */
export const waitsOf = (i: Issue) => !!i.labels?.some((l) => l.name === 'in-coda');
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
  // prima quella su cui Claude lavora, poi quelle in coda nell'ordine in cui le prenderà
  const busy = items.filter((x) => !x.ready && !asksOf(x.issue)).sort((a, b) => +waitsOf(a.issue) - +waitsOf(b.issue) || a.issue.number - b.issue.number);
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
  let place = 0;
  const rows = [
    ...busy.map((x) => {
      const wait = waitsOf(x.issue) ? ++place : 0;
      return `<a class="dv-prep" href="${issueUrl(x.issue.number)}" target="_blank" rel="noopener"><span class="t-ico">${wait ? '⏳' : '🛠️'}</span><span class="l-txt"><b>#${x.issue.number} ${wait ? `in coda · ${wait}° posto` : 'in preparazione'}</b>
      <small>${esc(cut(shortTitle(x.issue)))}${nameOf(x) ? ` · di ${esc(nameOf(x))}` : ''}</small><small>${wait ? 'Claude prepara una proposta alla volta: parte da sola quando tocca a lei.' : "Claude sta scrivendo la modifica: l'anteprima arriva tra pochi minuti."}</small></span></a>`;
    }),
    ...queued.map((p) => `<div class="dv-prep"><span class="t-ico">⏳</span><span class="l-txt"><b>Proposta approvata</b>
      <small>${esc(cut(p.text))}${p.nickname ? ` · di ${esc(p.nickname)}` : ''}</small><small>Tra poco il robot la mette in coda per Claude.</small></span></div>`),
  ];
  return `<div class="card dv-preps"><h3>🛠️ In preparazione</h3>${rows.join('')}</div>`;
}

/** un'anteprima nell'elenco: toccandola si apre la sua scheda (`data-a="open:<numero>"`), con un riassunto dei voti */
export function previewHead(x: PrevItem, link = false) {
  const i = x.issue;
  const name = nameOf(x);
  const vs = x.prop?.votes ?? [];
  const yes = vs.filter((v) => v.vote === 'si').length;
  const com = vs.filter((v) => v.comment).length;
  const sum = vs.length ? ` · 👍 ${yes} · 👎 ${vs.length - yes}${com ? ` · 💬 ${com}` : ''}` : '';
  const inner = `<span class="t-ico">📱</span><span class="l-txt"><b>#${i.number} · ${esc(shortTitle(i))}</b>
      <small>${name ? `di <span class="dv-who">${esc(name)}</span> · ` : ''}aggiornata ${ago(Date.parse(i.updated_at))}${sum}</small></span>`;
  return link
    ? `<a class="t-btn" href="${preview(i.number)}" target="_blank" rel="noopener">${inner}</a>`
    : `<button class="t-btn dv-open" data-a="open:${i.number}">${inner}<span class="dv-go">›</span></button>`;
}

// ---------------- scheda di un'anteprima ----------------

/** testo dei commenti di GitHub reso leggibile: grassetti, elenchi, link senza indirizzo */
function mdLite(md: string) {
  return md.split('\n').map((line) => {
    let l = esc(line.trim());
    l = l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '$1');
    if (/^#+ /.test(l)) return `<b>${l.replace(/^#+ /, '')}</b>`;
    if (/^[-*] /.test(l)) return `<div class="dv-li">• ${l.slice(2)}</div>`;
    if (/^\d+\. /.test(l)) return `<div class="dv-li">${l}</div>`;
    return l ? `<div>${l}</div>` : '<div class="dv-gap"></div>';
  }).join('');
}

const explains = new Map<number, string | null>();
const loadingExplain = new Set<number>();
/** dopo "Aggiorna": le spiegazioni si rileggono (Claude può aver cambiato la proposta) */
export const forgetExplains = () => explains.clear();
/**
 * Cosa ha cambiato Claude (e come provarlo): l'ultima spiegazione scritta nella proposta su GitHub. `done` ridisegna
 * quando arriva; finché non c'è dà `undefined`, se non c'è nessuna spiegazione `null`.
 */
export function explainOf(issue: number, done: () => void): string | null | undefined {
  if (explains.has(issue)) return explains.get(issue);
  if (loadingExplain.has(issue)) return undefined;
  loadingExplain.add(issue);
  void gh<{ body: string; user: { login: string } }[]>(`/issues/${issue}/comments?per_page=100`)
    .then((cs) => {
      const ok = cs.filter((c) => c.user.login !== 'claude' && !c.body.startsWith('<!--') && !c.body.startsWith('Nota:') && !c.body.startsWith('✏️') && c.body.length > 150);
      const best = [...ok].reverse().find((c) => /Come provarlo|Cosa cambia/i.test(c.body)) ?? ok[ok.length - 1];
      // via i link per accettare o cambiare (nelle app ci sono i tasti)
      explains.set(issue, best ? best.body.split('\n').filter((l) => !/^(📱|✅|✏️) \*\*/.test(l.trim())).join('\n').trim() : null);
    })
    .catch(() => explains.set(issue, null))
    .finally(() => {
      loadingExplain.delete(issue);
      done();
    });
  return undefined;
}

/** la parte comune della scheda: indietro, tasto per giocare l'anteprima, la proposta, cosa cambia, modifiche chieste */
export function detailHtml(x: PrevItem, explain: string | null | undefined, dev: boolean) {
  const i = x.issue;
  const p = x.prop;
  const name = nameOf(x);
  const ex = explain === undefined ? '<p class="small muted" style="margin:0">Carico…</p>' : explain ? mdLite(explain) : '<p class="small muted" style="margin:0">Nessuna spiegazione.</p>';
  const ch = p?.change
    ? `<div class="card dv-change"><h3>✏️ Modifiche chieste ${p.changeAt ? ago(p.changeAt) : ''}</h3><div class="dv-text">${esc(p.change)}</div>
        <p class="small muted" style="margin:6px 0 0">${p.changeState === 'attesa' ? 'Il robot le passa a Claude appena è libero (prepara una cosa alla volta).' : 'Claude le sta preparando o le ha già fatte: l\'anteprima si aggiorna da sola (guarda "aggiornata").'}</p></div>`
    : '';
  return `<button class="dv-back" data-a="back">‹ Tutte le anteprime</button>
    <div class="card dv-detail-top"><h3>#${i.number} · ${esc(shortTitle(i))}</h3>
      <p class="small muted" style="margin:0 0 8px">${name ? `di <b>${esc(name)}</b> · ` : ''}aggiornata ${ago(Date.parse(i.updated_at))}</p>
      <a class="btn good full" href="${preview(i.number)}?subito" target="_blank" rel="noopener">📱 Gioca l'anteprima</a></div>
    <div class="card"><h3>📝 La proposta</h3><div class="dv-text">${esc(p?.text ?? shortTitle(i))}</div>
      ${dev && p?.why ? `<p class="small" style="margin:6px 0 0"><b>Perché:</b> ${esc(p.why)}</p>` : ''}${dev && p?.where ? `<p class="small muted" style="margin:4px 0 0">📍 ${esc(p.where)}</p>` : ''}</div>
    <div class="card dv-explain"><h3>🛠️ Cosa cambia</h3>${ex}</div>${ch}`;
}

/** i voti con i commenti, oppure "nessun voto" (nella scheda dell'anteprima) */
export function votesBlock(p: Prop | undefined, skipMine = false) {
  return votesHtml(p, skipMine) || '<div class="card"><p class="small muted center" style="margin:0">Nessun tester l\'ha ancora votata.</p></div>';
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
    ${x.ready ? previewHead(x, true).replace('</b>', ' · prova</b>') : ''}
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
