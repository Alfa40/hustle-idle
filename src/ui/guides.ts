import { LOTS } from '../config/map';
import type { Game } from '../game';
import { bizType } from '../config/business';
import { chainTypes } from '../sim/chains';
import type { Business } from '../sim/state';
import { lotPrice, typesForLot } from '../sim/economy';
import { moveSide } from '../settings';
import type { GuideDef, GuideStep } from './guide';

/**
 * Le guide obbligatorie, una per ogni tasto o funzione. Frasi corte: una cosa per passo.
 * Chiavi:
 * - `start`: la prima volta in partita;
 * - `unlock:…`: quando si sblocca qualcosa (si guardano da sole quando il gioco è libero, vedi `auto`);
 * - `hud:…`: un tasto della colonna di destra che non apre una finestra (casa, camera, menu, mappa);
 * - `panel:<finestra>`: la prima volta che si apre quella finestra (`guide` del pannello in ui.ts);
 * - `<finestra>/tab:<scheda>`: la prima volta che si apre quella scheda;
 * - `<finestra>/<azione>`: la prima volta che si tocca quel pulsante.
 * Dopo un `#` si possono mettere altre guide sulla stessa cosa (es. `panel:report#turni`, con il suo `when`).
 */

const M = '.modal';
const tab = (k: string) => `${M} .tab[data-a="tab:${k}"]`;
const btn = (a: string) => `${M} [data-a="${a}"]`;
const btnStart = (a: string) => `${M} [data-a^="${a}"]`;
const g = (k: string) => `${M} [data-g="${k}"]`;
const exists = (sel: string) => {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) return true;
  }
  return false;
};
/** tasto della colonna di destra: se è nel menu ☰, prima si apre il menu */
const hud = (k: string, say: string): GuideStep[] => [
  { at: '.hud-menu-btn', say: 'Apri il menu ☰', tap: true, if: () => !exists(`.hud-btns > [data-h="${k}"]`) && exists('.hud-menu-btn') },
  { at: `[data-h="${k}"]`, say, tap: true },
];
const tabStep = (k: string, say: string): GuideStep => ({ at: tab(k), say });

export function makeGuides(game: Game): Record<string, GuideDef> {
  const s = () => game.state;
  const W = () => innerWidth;
  const H = () => innerHeight;
  const half = (move: boolean) => {
    const left = (moveSide() === 'sinistra') === move;
    return new DOMRect(left ? 0 : W() / 2, H() * 0.42, W() / 2, H() * 0.5);
  };
  const cheapest = () => Math.min(...LOTS.map((l) => Math.min(...typesForLot(l.id).map((t) => lotPrice(l.id, t)))));
  const hasBiz = () => s().businesses.length > 0;
  /** un'attività con una sola persona per reparto: nelle ore di punta perde clienti */
  const understaffed = (b: Business) => bizType(b.type).roles.every((r) => b.staff.filter((e) => e.role === r).length <= 1);
  // la prima attività parte con 1 persona per reparto: rischia già di perdere clienti, la guida fa assumere
  const hireSteps = (): GuideStep[] => [
    { say: '⚠️ Ha solo 1 persona per reparto' },
    { say: '😠 Nelle ore di punta perderà clienti: meno soldi e meno fama' },
    ...hud('biz', '🏢 Rimediamo: tocca Attività'),
    { at: tab('mie'), say: '🏢 Tocca Le mie', tap: true, if: () => !exists(`${tab('mie')}.on`) },
    { at: `${btnStart('report:')} .report-more`, say: 'Tocca la tua attività per il resoconto', tap: true },
    { at: btn('go:personale'), say: '👥 Tocca Personale', tap: true },
    { at: g('cands'), say: '📝 Questi sono i candidati di oggi' },
    { at: g('hire-role'), say: '➕ Assumi una persona in più', tap: true },
    { say: '✅ Ora regge di più. Il resoconto ti dice se serve altra gente' },
  ];

  return {
    // ---------------- la prima volta ----------------
    start: {
      auto: () => !s().tutorialDone,
      done: () => (s().tutorialDone = true),
      steps: [
        { say: '👋 Benvenuto in città!' },
        { rect: () => half(true), say: '🕹️ Trascina il dito qui per camminare' },
        { rect: () => half(false), say: '👆 Tocca qui per parlare, entrare e lavorare' },
        { say: '❗ Chi ha il ! giallo ti offre un lavoretto' },
        { at: '.edge-ptr[style*="block"]', say: '👉 Le frecce ai bordi ti portano da loro' },
        { at: '#h-money', say: '💰 Qui vedi i tuoi soldi' },
        { at: '.pill.date', say: '📅 Giorno e ora: toccali per il calendario' },
        { at: '.minimap', say: '🗺️ La mappa: toccala per vedere tutta la città' },
        { at: '.hud-btns', say: 'I tasti del gioco: ti spiego ognuno la prima volta che lo tocchi' },
        { say: '🚚 Fai lavoretti, metti da parte i soldi e apri un food truck!' },
      ],
    },

    // ---------------- sblocchi ----------------
    'unlock:lot': {
      auto: () => !hasBiz() && s().money >= cheapest(),
      steps: [
        { say: '💰 Hai abbastanza soldi per la tua prima attività!' },
        ...hud('biz', '🏢 Tocca Attività'),
      ],
    },
    'unlock:biz': {
      auto: hasBiz,
      covers: ['unlock:hire', 'biz/tab:personale'],
      steps: [{ say: '🎉 Hai la tua prima attività!' }, ...hireSteps()],
    },
    // partite di prima: le attività aprono con 1 persona per reparto, e ora i clienti persi tolgono fama
    'unlock:hire': {
      auto: () => (s().guides ?? []).includes('unlock:biz') && s().businesses.some(understaffed),
      covers: ['biz/tab:personale'],
      steps: hireSteps(),
    },
    'unlock:chain': {
      auto: () => chainTypes(s()).length > 0,
      steps: [
        { say: '🔗 Hai due attività uguali: ora sono una catena!' },
        ...hud('biz', '🏢 Tocca Attività'),
        { at: tab('mie'), say: '🏢 Tocca Le mie', tap: true, if: () => !exists(`${tab('mie')}.on`) },
        { at: btnStart('chain:'), say: '🔗 Tocca la catena: le gestisci tutte insieme', tap: true },
      ],
    },
    'unlock:vehicle': {
      auto: () => s().vehicles.length > 0 && exists('.ride-btn'),
      steps: [{ at: '.ride-btn', say: '🛵 Tocca qui per salire e scendere dal veicolo' }],
    },
    'unlock:mission': {
      auto: () => [...s().missions, ...(s().weekly ?? [])].some((m) => m.progress >= m.target && !m.claimed),
      steps: [
        { say: '🎯 Hai finito una missione!' },
        ...hud('missions', '📋 Tocca Missioni'),
        { at: btnStart('claim:'), say: '💰 Tocca Riscuoti per il premio', tap: true },
      ],
    },

    // ---------------- tasti senza finestra ----------------
    'hud:home': { steps: [{ say: '🏠 Sei a casa: con questo tasto torni qui da ovunque' }] },
    'hud:menu': { steps: [{ at: '.hud-drop', say: 'Qui ci sono gli altri tasti' }] },
    'hud:camera': {
      steps: [
        { at: '.cam-grid [data-v="spin:1"], .cam-grid [data-v="spin:-1"]', say: '🔄 Gira la visuale' },
        { at: '.cam-grid [data-v="zoom:1"]', say: '🔍 Avvicina e allontana' },
        { at: '.cam-grid [data-v="tilt:1"]', say: '↕️ Guarda più dall\'alto o di lato' },
        { at: '.cam-grid [data-v="reset"]', say: 'Torna alla visuale normale' },
      ],
    },
    'hud:map': {
      steps: [
        { at: '.ms-search', say: '🔍 Cerca un posto per nome' },
        { at: '.ms-chips', say: 'Scegli cosa vedere sulla mappa' },
        { at: '.ms-zoom', say: '◎ Ingrandisci o torna su di te' },
        { say: '📍 Tocca un punto: puoi farti portare lì' },
      ],
    },

    // ---------------- attività ----------------
    'panel:agency': {
      steps: [
        tabStep('compra', '🛒 In vendita: i posti da comprare'),
        tabStep('mie', '🏢 Le mie: le tue attività'),
        tabStep('resoconti', '📊 Resoconto: quanto guadagni e spendi'),
        tabStep('mercato', '📈 Mercato: cosa compra la gente'),
        { at: `${M} .help-q:not([hidden])`, say: '❓ Il ? spiega tutto quello che vedi' },
      ],
    },
    'agency/tab:compra': {
      steps: [
        { at: btnStart('lot:'), say: 'Ogni riga è un posto: zona e prezzo' },
        { at: btnStart('lot:'), say: 'Toccane uno per vedere cosa ci puoi aprire', tap: true },
        { at: `${M} .stat.s-purple`, say: '📍 La zona: in centro ci sono più clienti' },
        { at: `${M} .stat.s-orange`, say: '🏠 Quanto paghi ogni mese' },
        { at: `${M} .grid3`, say: '📊 Clienti, incassi e guadagno previsti' },
        { at: btnStart('buy:'), say: '🛒 Qui la compri (all\'agenzia o davanti al posto)' },
        { at: btnStart('target:'), say: '📍 Qui ti segna la strada sulla mappa' },
        { at: btn('back'), say: '◀ Torna alla lista', tap: true },
      ],
    },
    'agency/tab:notizie': {
      steps: [{ at: `${M} .sec-title, ${M} .card`, say: '📰 Qui arrivano crisi, fallimenti e imprevisti' }],
    },
    'agency/tab:mie': {
      when: hasBiz,
      steps: [
        { at: btnStart('chain:'), say: '🔗 Le tue catene: attività uguali insieme' },
        { at: btnStart('grp:'), say: 'Tocca un gruppo per aprirlo o chiuderlo' },
        { at: btnStart('report:'), say: 'Questa è una tua attività: incasso di oggi' },
        { at: btnStart('open:'), say: 'Gestisci: prodotti, magazzino e migliorie' },
        { at: `${btnStart('report:')} .report-more`, say: 'Tocca l\'attività per il resoconto', tap: true },
      ],
    },
    'agency/tab:resoconti': {
      when: hasBiz,
      steps: [
        { at: g('totals'), say: '💶 Guadagni, spese e utile di tutte le attività' },
        { at: `${M} .lv-head`, say: 'Oggi e il mese, uno accanto all\'altro' },
        { at: `${M} .lv-tot`, say: '📊 Utile: verde guadagni, rosso perdi' },
        { at: `${M} .sheet-body > .card + .card`, say: '💸 Dove vanno i soldi del mese' },
      ],
    },
    'agency/tab:mercato': {
      steps: [
        { at: `${M} .sheet-body > .card`, say: 'Ogni riga è un prodotto' },
        { at: `${M} .sheet-body > .card .row.muted`, say: '📍 Ogni colonna è una zona' },
        { say: 'Il numero: clienti all\'ora che lo vogliono' },
        { say: '💡 Apri dove i numeri sono alti' },
      ],
    },
    // terreno edificabile: ogni momento ha la sua guida la prima volta che compare
    'panel:plot': {
      steps: [
        { at: `${M} .stat.s-purple`, say: '📍 La zona: in centro più clienti, lavori più cari' },
        { at: `${M} .help-q:not([hidden])`, say: '❓ Il ? spiega come si costruisce' },
      ],
    },
    'plot/buy': {
      steps: [
        { at: `${M} .sec-title`, say: '🚧 Questi lavori servono per sistemare il terreno' },
        { at: btnStart('buyPlot'), say: '🛒 Prima compri il terreno' },
      ],
    },
    'plot/works': {
      steps: [{ at: btnStart('work:'), say: '🚧 Paga un lavoro: dura qualche ora di gioco' }],
    },
    'plot/build': {
      steps: [{ at: btnStart('build:'), say: '🏗️ Scegli il palazzo: più grande, più negozi' }],
    },
    'plot/floors': {
      steps: [{ at: btnStart('floor:'), say: '🏬 Ogni piano è un negozio: tocca per aprirlo' }],
    },
    'panel:lot': {
      steps: [
        { at: `${M} .stat.s-purple`, say: '📍 La zona: in centro ci sono più clienti' },
        { at: `${M} .stat.s-orange`, say: '🏠 Quanto paghi ogni mese' },
        { at: `${M} .grid3`, say: '📊 Clienti, incassi e guadagno previsti' },
        { at: btnStart('buy:'), say: '🛒 Qui compri e apri l\'attività' },
      ],
    },

    // resoconto di un'attività
    'panel:report': {
      steps: [
        { at: g('money'), say: '💶 I conti di oggi e del mese' },
        { at: btn('go:personale'), say: '👥 Personale: assumi e licenzia' },
      ],
    },
    'panel:report#turni': {
      when: () => exists(`${M} .shg-who`),
      steps: [
        { at: `${M} .shg-wrap`, say: '🗓️ I turni: chi lavora e a che ora' },
        { at: `${M} .shg-who`, say: 'Tocca un dipendente', tap: true },
        { at: `${M} .sh-what`, say: 'Ecco cosa succede senza quella persona' },
        { at: `${M} .sh-what [data-a^="shf:"]`, say: 'Licenzia: serve un secondo tocco' },
        { at: `${M} .sh-what [data-a^="shx:"]`, say: '↩️ Rimettilo', tap: true },
      ],
    },

    // gestione di un'attività
    'panel:biz': {
      steps: [
        tabStep('ordini', '📋 Ordini: i lavori chiesti dai clienti'),
        tabStep('lavori', '🛠️ Lavori su richiesta, fatti da te'),
        tabStep('panoramica', '📊 Panoramica: stato e costi'),
        tabStep('prodotti', '🍔 Prodotti: cosa vendi'),
        tabStep('magazzino', '📦 Magazzino: la merce'),
        tabStep('personale', '👥 Personale: chi lavora qui'),
        tabStep('migliorie', '⬆️ Migliorie: rendila più forte'),
        tabStep('evoluzione', '🌱 Evoluzione: falla diventare più grande'),
      ],
    },
    'biz/tab:panoramica': {
      steps: [
        { at: g('state'), say: 'Stato: lavora da sola o serve aiuto?' },
        { at: g('costs'), say: '🧾 Quanto paghi ogni mese' },
        { at: btn('chain'), say: '🔗 La catena di cui fa parte' },
        { at: btn('sell'), say: '🏷️ Vendi l\'attività (serve un secondo tocco)' },
      ],
    },
    'biz/tab:prodotti': {
      steps: [
        { at: `${M} label.toggle`, say: '✔️ Spunta per metterlo in vendita' },
        { at: `${M} h3[data-a^="prodInfo:"]`, say: '🔎 Tocca il nome: domanda e prossimi giorni' },
      ],
    },
    'biz/tab:magazzino': {
      steps: [
        { at: `${M} label.toggle`, say: '🔁 Riordino automatico: compra la merce da solo' },
        { at: `${M} [data-a$="|10"]`, say: '➕ Compra 10 pezzi' },
        { at: `${M} [data-a$="|max"]`, say: '📦 Riempi il magazzino' },
      ],
    },
    'biz/tab:personale': {
      steps: [
        { at: g('staff'), say: '👥 Chi lavora qui' },
        { at: btnStart('train:'), say: '🎓 Corso: impara a lavorare meglio' },
        { at: btnStart('move:'), say: '↔️ Sposta in un\'altra attività' },
        { at: btnStart('fire:'), say: 'Licenzia' },
        { at: g('cands'), say: '📝 Candidati: nuovi ogni giorno' },
        { at: btnStart('previewHire:'), say: '👁️ Prova: lo vedi lavorare prima' },
        { at: btnStart('hire:'), say: '🤝 Assumi' },
        { at: btn('reroll'), say: '🔄 Cerca altri candidati' },
      ],
    },
    'biz/tab:migliorie': {
      steps: [
        { at: `${M} .sheet-body > .card`, say: 'Ogni miglioria ha più livelli' },
        { at: btnStart('previewUpg:'), say: '👁️ Prova: la vedi prima di comprarla' },
        { at: btnStart('upgrade:'), say: '⬆️ Compra il livello dopo' },
      ],
    },
    'biz/tab:ordini': {
      steps: [
        { at: btnStart('exec:'), say: 'Esegui: fai tu il lavoro e guadagni' },
        { say: '👥 Con il personale gli ordini si fanno da soli' },
      ],
    },
    'biz/tab:lavori': { steps: [{ at: btnStart('special:'), say: '🏺 Realizza: lo fai tu, a mano' }] },
    'biz/tab:evoluzione': { steps: [{ at: btnStart('evolve:'), say: '🌱 Scegli in cosa trasformarla' }] },

    // mercato di un prodotto
    'panel:product': {
      steps: [
        { at: `${M} [data-a^="zone:"]`, say: '📍 Scegli la zona' },
        { at: g('now'), say: '📊 Quanti lo vogliono adesso' },
        { at: g('why'), say: '🔎 Perché: un motivo per riga' },
        { at: g('fc'), say: '⛅ I prossimi 7 giorni' },
        { at: g('fc'), say: 'Più è lontano, meno è sicuro' },
      ],
    },

    // catena
    'panel:chain': {
      steps: [
        { at: btnStart('group:'), say: 'Tutti i negozi o solo un gruppo' },
        { at: btn('newGroup'), say: '➕ Crea un gruppo di negozi' },
        tabStep('resoconto', '📊 Resoconto di tutti insieme'),
        tabStep('prodotti', '🍔 Prodotti per tutti i negozi'),
        tabStep('migliorie', '⬆️ Migliorie per tutti'),
        tabStep('magazzino', '📦 Merce per tutti'),
      ],
    },
    'chain/tab:resoconto': {
      steps: [
        { at: g('chain-overview'), say: '📊 Come va la catena, sempre aggiornato' },
        { at: btnStart('insureAll:'), say: '🛡️ Assicura tutti i negozi in un tocco' },
        { at: g('shops'), say: '🏪 Negozio per negozio' },
        { at: btnStart('manage:'), say: '⚙️ Gestione di quel negozio' },
      ],
    },
    'chain/tab:prodotti': {
      steps: [
        { at: `${M} [data-a$="|1"]`, say: '➕ Mettilo in vendita in tutti' },
        { at: `${M} [data-a$="|0"]`, say: 'Toglilo da tutti' },
      ],
    },
    'chain/tab:migliorie': { steps: [{ at: btnStart('upg:'), say: '⬆️ Migliora tutti insieme' }] },
    'chain/tab:magazzino': {
      steps: [
        { at: btn('fill'), say: '📦 Riempi tutti i magazzini' },
        { at: btn('auto'), say: '🔁 Riordino automatico per tutti' },
      ],
    },

    // ---------------- altre finestre ----------------
    'panel:missions': {
      steps: [
        { at: `${M} .sheet-body > .card`, say: '🎯 Fai quello che chiede la missione' },
        { at: `${M} .sheet-body > .card .bar`, say: 'La barra si riempie mentre giochi' },
        { say: '💰 Barra piena? Tocca Riscuoti' },
        { at: btn('cal'), say: '📅 Feste ed eventi dei prossimi giorni' },
      ],
    },
    'panel:calendar': {
      steps: [
        { at: btnStart('month:'), say: 'Cambia mese' },
        { at: btnStart('sel:'), say: 'Tocca un giorno per vedere cosa succede' },
      ],
    },
    'panel:shop': {
      steps: [
        { at: btn('dealer'), say: '🛵 Veicoli per girare più veloce' },
        { at: btn('houses'), say: '🏡 Case da abitare o affittare' },
        { at: btn('style'), say: '👕 Vestiti e accessori' },
      ],
    },
    'panel:dealer': { steps: [{ at: btnStart('buyv:'), say: '🛒 Compra un veicolo' }, { at: btnStart('use:'), say: '🔑 Scegli quale usare' }] },
    'panel:houses': {
      steps: [
        { at: btnStart('buy:'), say: '🛒 Compra una casa' },
        { at: btnStart('rent:'), say: '💶 Affittala: soldi ogni giorno' },
        { at: btnStart('live:'), say: '🏠 Vivici: diventa casa tua' },
        { at: btnStart('map:'), say: '📍 Vedi dov\'è' },
      ],
    },
    'panel:style': { steps: [{ at: `${btnStart('buys:')}, ${btnStart('buya:')}, ${btnStart('wear:')}, ${btnStart('toggle:')}`, say: '👕 Tocca per comprare o indossare' }] },
    'panel:home': { steps: [{ at: btn('sleep'), say: '😴 Dormi: la notte passa subito' }] },
    'panel:profile': {
      steps: [
        { at: btn('name'), say: '✏️ Cambia il tuo nome' },
        { at: btn('stats'), say: '📊 Le tue statistiche' },
        { at: btn('friends'), say: '👥 I tuoi amici' },
        { at: btn('skills'), say: '⭐ Esperienza e livelli' },
        { at: btn('boards'), say: '🏆 Classifiche' },
        { at: btn('logo'), say: '🎨 Il tuo logo' },
        { at: btn('account'), say: '🔑 Account: salva le partite sul server' },
      ],
    },
    'panel:account': {
      steps: [
        tabStep('salva', '💾 Salva: crea l\'account con una password'),
        { at: g('name'), say: 'Per entrare usi il tuo nome: è unico' },
        tabStep('entra', '🔑 Entra: hai già un account? Ritrovi le partite'),
        { at: g('saved'), say: '💾 Ultimo salvataggio: si salva da solo' },
      ],
    },
    'panel:multi': {
      steps: [
        { at: btn('poker'), say: '🃏 Poker con gli amici' },
        { at: btn('bj'), say: '🂡 Blackjack contro il banco' },
      ],
    },
    'panel:casino': {
      steps: [
        { at: btn('create'), say: '➕ Crea un tavolo' },
        { at: btn('join'), say: '🤝 Entra col codice di un amico' },
      ],
    },
    'panel:settings': {
      steps: [
        tabStep('impostazioni', '⚙️ Comandi, grafica e suoni'),
        tabStep('partita', '💾 Salva o cambia partita'),
        tabStep('aiuto', '❓ Come si gioca'),
      ],
    },
    // solo sul telefono dello sviluppatore ci sono le schede (per i tester la finestra è solo il modulo)
    'panel:propose': {
      steps: [
        tabStep('proponi', '📝 Scrivi una proposta'),
        tabStep('proposte', '📮 Leggi e approva quelle dei tester'),
      ],
    },
    'panel:job': {
      steps: [
        { at: `${M} .stat.s-green`, say: '💰 La paga' },
        { at: `${M} .stat.s-yellow`, say: '⭐⭐⭐ Veloce = paga più alta' },
        { at: `${M} .tut-note`, say: '🎓 Ti guida passo passo, senza fretta' },
        { at: btn('yes'), say: '✅ Accetta per iniziare' },
      ],
    },
  };
}
