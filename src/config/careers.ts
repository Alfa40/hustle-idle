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
  // 🚚 Trasporti e logistica (tabella completa in CARRIERE.md)
  { id: 'consegna', sector: 'logistica', name: 'Consegne', icon: '📦', ready: true, ladder: ['Consegna pacchi', 'Trasporto mobili', 'Traslochi', 'Trasporti delicati', "Traslochi d'azienda"] },
  { id: 'magazzino', sector: 'logistica', name: 'Magazzino', icon: '🏭', ready: true, ladder: ['Magazziniere', 'Carrellista', 'Preparatore ordini', 'Addetto spedizioni', 'Centro di smistamento'] },
  { id: 'autista', sector: 'logistica', name: 'Autista', icon: '🚌', ready: true, ladder: ['Autista di navetta', 'Autista di autobus', 'Bus turistico', 'Autista privato', 'Limousine per eventi'] },
  // 🍳 Ristorazione e ospitalità (tabella in CARRIERE.md)
  { id: 'piatti', sector: 'cucina', name: 'Cucina', icon: '🍽️', ready: true, ladder: ['Lavapiatti', 'Aiuto cuoco', 'Cuoco di linea', 'Cuoco dal vivo', 'Chef'] },
  { id: 'festa', sector: 'cucina', name: 'Sala', icon: '🥂', ready: true, ladder: ['Cameriere a una festa', 'Catering', 'Cameriere al ristorante', 'Maître', 'Cena di gala'] },
  { id: 'hotel', sector: 'cucina', name: 'Ospitalità', icon: '🛎️', ready: true, ladder: ["Facchino d'albergo", 'Cameriera ai piani', 'Receptionist', 'Concierge', 'Suite VIP'] },
  { id: 'bar', sector: 'cucina', name: 'Bar', icon: '☕', ready: true, ladder: ['Barista', 'Latte art', 'Barman', 'Barman acrobatico', 'Sommelier'] },
  { id: 'forno', sector: 'cucina', name: 'Forno e pasticceria', icon: '🥐', ready: true, ladder: ['Panettiere notturno', 'Pasticcere', 'Torte su ordinazione', 'Torte nuziali', 'Maestro cioccolatiere'] },
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

/**
 * Settori attivi per ora: si sviluppa un settore alla volta e, finché non è completo, gli altri restano spenti
 * (niente offerte di lavoretti né attività da comprare di quei settori). `null` = tutti accesi.
 * Le attività che una partita ha già restano sue e continuano a lavorare.
 */
export const FOCUS_SECTORS: SkillId[] | null = ['logistica', 'cucina'];
export const sectorOn = (k: SkillId) => !FOCUS_SECTORS || FOCUS_SECTORS.includes(k);
/**
 * Settori di cui si possono comprare le attività: Ristorazione e ospitalità ha già i lavoretti accesi, ma le sue
 * attività aspettano di essere rifatte ad albero (come i trasporti).
 */
export const BIZ_SECTORS: SkillId[] | null = ['logistica'];
export const bizSectorOn = (k: SkillId) => !BIZ_SECTORS || BIZ_SECTORS.includes(k);

export const careerLine = (id: string) => CAREER_LINES.find((l) => l.id === id);
export const linesOf = (sector: SkillId, onlyReady = true) => CAREER_LINES.filter((l) => l.sector === sector && (!onlyReady || (l.ready && sectorOn(l.sector))));
/** ogni quanti livelli una linea si evolve nel lavoro successivo */
export const EVOLVE_EVERY = 10;
/** i tipi di lavoretto giocabili (le linee pronte dei settori accesi) */
export const readyJobTypes = () => CAREER_LINES.filter((l) => l.ready && sectorOn(l.sector)).map((l) => l.id as JobType);

/** Gradino della carriera (0 = base) per un livello della linea: uno ogni EVOLVE_EVERY livelli, fino all'ultimo. */
export const rungOf = (line: string, level: number) => Math.min(Math.floor(level / EVOLVE_EVERY), (careerLine(line)?.ladder.length ?? 1) - 1);
/**
 * Quanto sei avanti dentro il gradino (0 al primo livello del gradino, 1 al nono): decide cosa cresce
 * (quante consegne, quanti pezzi…) come nella colonna "Cosa sale" di CARRIERE.md. All'ultimo gradino
 * si arriva a 1 dopo 9 livelli e poi resta lì: il lavoro non si allunga più (regola dei 5 minuti).
 */
export function rungProgress(line: string, level: number) {
  const r = rungOf(line, level);
  const start = r === 0 ? 1 : r * EVOLVE_EVERY;
  return Math.max(0, Math.min(1, (level - start) / (EVOLVE_EVERY - 1 - (r === 0 ? 1 : 0))));
}
