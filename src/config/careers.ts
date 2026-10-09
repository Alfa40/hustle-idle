import type { JobType } from './jobs';
import type { SkillId } from './skills';

/**
 * Carriere: 5 settori (le esperienze che formano la fama), ognuno con le sue linee di lavoro.
 * Ogni linea ha un livello suo e ogni 10 livelli si evolve in un lavoro più complesso
 * (le versioni giocabili sono in config/jobs.ts: JOBS è il gradino di base, JOB_VARIANTS i successivi).
 *
 * Per aggiungere un lavoro: una riga qui (settore, nome, gradini) e, quando il minigioco è pronto,
 * il tipo in config/jobs.ts con `ready: true`. Le linee non pronte restano nascoste nel gioco.
 * Il registro può crescere fino a centinaia di linee: tutto il resto (offerte, livelli, profilo) lo legge da qui.
 *
 * Livello del settore = somma dell'esperienza di tutte le sue linee + il lavoro fatto nelle attività
 * di quel settore (sim/progress.ts: sectorXp).
 */
export interface CareerLine {
  id: string;
  sector: SkillId;
  /** nome della linea (il mestiere) */
  name: string;
  icon: string;
  /** il minigioco esiste: compare nelle offerte. Se no, la linea è nascosta finché non è pronta */
  ready: boolean;
  /** i gradini della carriera, uno ogni 10 livelli (anche quelli non ancora giocabili, per i piani) */
  ladder: string[];
}

export const CAREER_LINES: CareerLine[] = [
  // 🚚 Trasporti e logistica
  { id: 'consegna', sector: 'logistica', name: 'Consegne', icon: '📦', ready: true, ladder: ['Consegna pacchi', 'Trasporto mobili', 'Traslochi'] },
  { id: 'rider', sector: 'logistica', name: 'Corriere', icon: '🛵', ready: false, ladder: ['Rider di cibo', 'Corriere espresso', 'Consegne urgenti'] },
  { id: 'magazzino', sector: 'logistica', name: 'Magazzino', icon: '🏭', ready: false, ladder: ['Magazziniere', 'Carrellista', 'Capo magazzino'] },
  // 🍳 Ristorazione
  { id: 'piatti', sector: 'cucina', name: 'Cucina', icon: '🍽️', ready: true, ladder: ['Lavapiatti', 'Aiuto cuoco', 'Cuoco di linea'] },
  { id: 'festa', sector: 'cucina', name: 'Sala ed eventi', icon: '🥂', ready: false, ladder: ['Cameriere a una festa', 'Catering', 'Banchetti'] },
  { id: 'forno', sector: 'cucina', name: 'Forno e pasticceria', icon: '🥐', ready: false, ladder: ['Panettiere notturno', 'Pasticcere', 'Torte su ordinazione'] },
  // 🤝 Commercio e pubbliche relazioni
  { id: 'volantini', sector: 'clientela', name: 'Porta a porta', icon: '📰', ready: true, ladder: ['Consegna giornali', 'Sondaggi porta a porta', 'Vendita porta a porta'] },
  { id: 'promoter', sector: 'clientela', name: 'Pubbliche relazioni', icon: '📣', ready: false, ladder: ['Promoter in piazza', 'Hostess agli eventi', 'Relazioni pubbliche'] },
  { id: 'vendita', sector: 'clientela', name: 'Vendita', icon: '🏷️', ready: false, ladder: ['Commesso in negozio', 'Venditore di auto', 'Concessionario di lusso'] },
  // 🎨 Design e arte
  { id: 'imbianchino', sector: 'artigianato', name: 'Pittura', icon: '🖌️', ready: true, ladder: ['Dipingere la recinzione', 'Dipingere la facciata', 'Murales'] },
  { id: 'ceramica', sector: 'artigianato', name: 'Ceramica', icon: '🏺', ready: false, ladder: ['Vasi in ceramica', 'Servizi da tavola', 'Opere in ceramica'] },
  { id: 'falegnameria', sector: 'artigianato', name: 'Falegnameria', icon: '🪚', ready: false, ladder: ['Piccola falegnameria', 'Mobili su misura', 'Restauro di mobili antichi'] },
  // 🔨 Costruzione e manualità
  { id: 'giardino', sector: 'manualita', name: 'Giardinaggio', icon: '🌿', ready: true, ladder: ['Sistemare il giardino', 'Potatura di siepi e alberi', 'Progettare giardini'] },
  { id: 'lavaggio', sector: 'manualita', name: 'Auto', icon: '🚗', ready: true, ladder: ['Lavaggio auto', 'Carrozzeria e lucidatura', 'Officina di auto di lusso'] },
  { id: 'montaggio', sector: 'manualita', name: 'Lavori in casa', icon: '🔧', ready: false, ladder: ['Montaggio mobili', 'Riparazioni in casa', 'Ristrutturazioni'] },
];

export const careerLine = (id: string) => CAREER_LINES.find((l) => l.id === id);
export const linesOf = (sector: SkillId, onlyReady = true) => CAREER_LINES.filter((l) => l.sector === sector && (!onlyReady || l.ready));
/** ogni quanti livelli una linea si evolve nel lavoro successivo */
export const EVOLVE_EVERY = 10;
/** i tipi di lavoretto giocabili (le linee pronte) */
export const readyJobTypes = () => CAREER_LINES.filter((l) => l.ready).map((l) => l.id as JobType);
