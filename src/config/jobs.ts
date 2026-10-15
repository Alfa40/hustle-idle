import type { SkillId } from './skills';

export type JobType = 'giardino' | 'consegna' | 'piatti' | 'volantini' | 'lavaggio' | 'imbianchino' | 'magazzino' | 'autista';

export interface JobDef {
  name: string;
  icon: string;
  skill: SkillId;
  /** compenso base prima dei moltiplicatori */
  basePay: number;
  xp: number;
  fame: number;
  intro: string;
  /** dove compare l'NPC: case, negozi o ristoranti */
  where: 'house' | 'shop' | 'restaurant';
  /** si può fare restando sul veicolo */
  vehicleOk?: boolean;
  /** la procedura passo passo, per la spiegazione animata prima di accettare */
  steps: HowStep[];
}

/** Un passo della procedura: icona, cosa fare e il gesto (tocca, tieni premuto, cammina). */
export type HowStep = [icon: string, text: string, how: 'tap' | 'hold' | 'walk'];

export const JOBS: Record<JobType, JobDef> = {
  giardino: {
    name: 'Sistemare il giardino', icon: '🌿', skill: 'manualita', basePay: 30, xp: 14, fame: 1.2, where: 'house',
    intro: 'Prendi il tosasiepi, taglia i cespugli, raccogli le foglie e svuota il sacco nel bidone. Resta nella zona di lavoro!',
    steps: [['🧰', 'Prendi il tosasiepi dalla cassetta rossa', 'tap'], ['✂️', 'Taglia ogni cespuglio che brilla', 'hold'], ['🍂', 'Raccogli i mucchi di foglie', 'tap'], ['🗑️', 'Svuota il sacco nel bidone verde', 'tap']],
  },
  consegna: {
    name: 'Consegna pacchi', icon: '📦', skill: 'logistica', basePay: 26, xp: 12, fame: 1, where: 'shop', vehicleOk: true,
    intro: 'Ritira i pacchi al negozio dei pacchi, consegnali alle cassette gialle segnate (nell\'ordine che vuoi) e torna a firmare la ricevuta. Con un veicolo fai prima!',
    steps: [['📦', 'Ritira i pacchi al negozio dei pacchi', 'tap'], ['🏠', 'Consegna un pacco a ogni cassetta gialla segnata, in qualsiasi ordine', 'walk'], ['🧾', 'Torna al negozio a firmare la ricevuta', 'tap']],
  },
  piatti: {
    name: 'Lavapiatti part-time', icon: '🍽️', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'restaurant',
    intro: 'Il ristorante ha chiuso: entra nella sua cucina e lava tutti i piatti. Per ogni pila: prendila dal carrello, lavala al lavello e appoggiala sullo scolapiatti.',
    steps: [['🚪', 'Entra nella cucina del ristorante (è chiuso)', 'walk'], ['🍽️', 'Prendi una pila di piatti sporchi dal carrello', 'tap'], ['🫧', 'Lavala al lavello', 'hold'], ['✨', 'Appoggiala sullo scolapiatti', 'tap']],
  },
  volantini: {
    name: 'Consegna giornali', icon: '📰', skill: 'clientela', basePay: 24, xp: 12, fame: 1, where: 'shop', vehicleOk: true,
    intro: 'Prendi i giornali all\'edicola, imbucane uno in ogni cassetta blu segnata e torna all\'edicola per la ricevuta. Sono tante e vicine: corri!',
    steps: [['📰', 'Prendi i giornali all\'edicola', 'tap'], ['📬', 'Imbuca un giornale in ogni cassetta blu segnata', 'walk'], ['🧾', 'Torna all\'edicola per la ricevuta', 'tap']],
  },
  lavaggio: {
    name: 'Lavaggio auto', icon: '🚿', skill: 'manualita', basePay: 32, xp: 14, fame: 1.1, where: 'house',
    intro: 'Spruzza il sapone su tutta l\'auto, poi prendi la canna e fai il giro dell\'auto sciacquandola tutta, infine asciugala con lo straccio.',
    steps: [['🧴', 'Prendi lo spruzzino del sapone', 'tap'], ['🫧', 'Spruzza il sapone su tutti e 4 i lati', 'hold'], ['🚿', 'Prendi la canna e fai il giro sciacquando', 'hold'], ['🧽', 'Prendi lo straccio e asciuga tutto', 'hold']],
  },
  magazzino: {
    name: 'Magazziniere', icon: '🏭', skill: 'logistica', basePay: 28, xp: 13, fame: 1, where: 'shop',
    intro: 'Al magazzino è arrivato un camion: scarica le scatole e metti ognuna sullo scaffale del suo colore. Le scatole pesanti si sollevano tenendo premuto e vanno sul ripiano in basso.',
    steps: [['📦', 'Prendi una scatola dal camion', 'tap'], ['🎨', 'Portala allo scaffale del suo colore', 'walk'], ['⬇️', 'Le pesanti vanno sul ripiano in basso', 'hold']],
  },
  autista: {
    name: 'Autista di navetta', icon: '🚐', skill: 'logistica', basePay: 30, xp: 14, fame: 1.1, where: 'shop',
    intro: 'Guida il pulmino: fermati dentro la zona della fermata, aspetta che i passeggeri salgano e portali a destinazione. Accosta bene: fuori dalla zona non sale nessuno!',
    steps: [['🚐', 'Sali sul pulmino', 'tap'], ['🚏', 'Fermati dentro la zona della fermata', 'walk'], ['🧍', 'Aspetta che i passeggeri salgano', 'hold'], ['🏁', 'Portali a destinazione', 'walk']],
  },
  imbianchino: {
    name: 'Dipingere la recinzione', icon: '🖌️', skill: 'artigianato', basePay: 34, xp: 15, fame: 1.2, where: 'house',
    intro: 'Copri con i teloni tutto quello che c\'è in giardino (cespugli, aiuole, giochi…), prendi la vernice, dipingi ogni tratto del muretto di recinzione e alla fine togli i teloni.',
    steps: [['🛡️', 'Copri con i teloni le cose del giardino', 'tap'], ['🪣', 'Prendi la vernice', 'tap'], ['🖌️', 'Dipingi ogni tratto del muretto', 'hold'], ['🧹', 'Togli i teloni', 'tap']],
  },
};

export const JOB_TYPES = Object.keys(JOBS) as JobType[];

/**
 * Ogni 10 livelli dell'esperienza del lavoretto, il lavoretto cambia: le persone offrono una versione
 * nuova e diversa (es. dal Liv. 10 di manualità il giardino diventa la potatura di siepi e alberi).
 * Missioni e statistiche restano per tipo; ogni versione ha il suo tutorial la prima volta.
 */
export interface JobVariant {
  /** livello dell'esperienza da cui compare */
  minLevel: number;
  name: string;
  icon: string;
  intro: string;
  steps: HowStep[];
  /** si può fare restando sul veicolo (se diverso dal gradino di base) */
  vehicleOk?: boolean;
}

export const JOB_VARIANTS: Partial<Record<JobType, JobVariant[]>> = {
  consegna: [
    {
      minLevel: 10, name: 'Trasporto mobili', icon: '🛋️', vehicleOk: false,
      intro: 'Carica il mobile sul carrello e portalo fino alla porta del cliente senza urtare niente: ogni urto lo rovina. Sui gradini metti la rampa e nella porta stretta gira il mobile.',
      steps: [['🚚', 'Carica il mobile sul carrello', 'tap'], ['🪜', 'Metti la rampa sui gradini', 'tap'], ['🛋️', 'Spingi il mobile senza urtare', 'walk'], ['🔄', 'Gira il mobile per passare dalla porta', 'hold']],
    },
    {
      minLevel: 20, name: 'Traslochi', icon: '🚛', vehicleOk: false,
      intro: 'Carica il furgone: trascina ogni pezzo nel cassone e toccalo per girarlo. I pesanti vanno sul fondo, sopra i fragili non va niente. Lo scarico lo fanno i colleghi.',
      steps: [['✋', 'Trascina i pezzi nel furgone', 'tap'], ['🔄', 'Tocca un pezzo per girarlo', 'tap'], ['🏋️', 'Pesanti sul fondo, niente sopra i fragili', 'tap']],
    },
    {
      minLevel: 30, name: 'Trasporti delicati', icon: '🎹', vehicleOk: false,
      intro: 'Un pianoforte sale col montacarichi fino alla finestra: tienilo dritto spostando il dito a destra e a sinistra, il vento lo fa dondolare. Se si inclina troppo, il cliente si arrabbia.',
      steps: [['🎹', 'Tieni il dito sullo schermo', 'hold'], ['↔️', 'Spostalo dalla parte opposta a dove pende', 'hold'], ['🏠', 'Arriva alla finestra senza inclinarlo troppo', 'hold']],
    },
    {
      minLevel: 40, name: "Traslochi d'azienda", icon: '🏢', vehicleOk: false,
      intro: "Un ufficio da svuotare: chiama gli aiutanti, che portano da soli gli oggetti al camion, e intanto porta anche tu i tuoi. Il server va staccato prima, l'acquario si porta piano.",
      steps: [['📣', 'Chiama gli aiutanti', 'tap'], ['📦', "Prendi un oggetto dall'ufficio", 'tap'], ['🚛', 'Caricalo sul camion', 'tap']],
    },
  ],
  magazzino: [
    {
      minLevel: 10, name: 'Carrellista', icon: '🚜',
      intro: 'Guida il muletto: avvicinati a un bancale, tieni premuto per alzare le forche e caricarlo, poi portalo nel camion e abbassalo. Non urtare gli scaffali!',
      steps: [['🚜', 'Sali sul muletto', 'tap'], ['⬆️', 'Alza le forche sotto il bancale', 'hold'], ['🚛', 'Portalo nel camion e abbassalo', 'hold']],
    },
    {
      minLevel: 20, name: 'Preparatore ordini', icon: '📋',
      intro: "Prepara l'ordine della lista: prendi il carrello, trova ogni articolo sugli scaffali (attento a quelli simili!) e porta tutto al banco delle spedizioni. Il giro più corto ti fa risparmiare tempo.",
      steps: [['🛒', 'Prendi il carrello', 'tap'], ['📋', 'Prendi gli articoli della lista', 'tap'], ['📦', 'Porta tutto al banco spedizioni', 'tap']],
    },
    {
      minLevel: 30, name: 'Addetto spedizioni', icon: '📮',
      intro: "Imballa ogni pacco: scatola della misura giusta, riempitivo, nastro ed etichetta. Poi caricali nel furgone dall'ultimo al primo: chi riceve per primo va messo per ultimo.",
      steps: [['📦', 'Scegli la scatola della misura giusta', 'tap'], ['🫧', 'Riempitivo e nastro', 'hold'], ['🏷️', "Attacca l'etichetta", 'tap'], ['🚐', "Carica dall'ultimo al primo", 'tap']],
    },
    {
      minLevel: 40, name: 'Centro di smistamento', icon: '🔀',
      intro: 'I pacchi corrono sui nastri: tocca i deviatori al momento giusto per mandare ogni pacco al nastro del suo colore. Il turno dura 2 minuti e i nastri vanno sempre più veloci.',
      steps: [['👆', 'Tocca un deviatore per girarlo', 'tap'], ['🎨', 'Ogni pacco al nastro del suo colore', 'tap'], ['⏱️', 'Resisti fino alla fine del turno', 'tap']],
    },
  ],
  autista: [
    {
      minLevel: 10, name: 'Autista di autobus', icon: '🚌',
      intro: "Guida l'autobus lungo la linea: fermati a ogni fermata in orario. Le fermate prenotate 🔔 non si saltano mai; nelle altre fermati solo se c'è qualcuno.",
      steps: [['🚌', "Sali sull'autobus", 'tap'], ['🚏', 'Fermati alle fermate prenotate', 'walk'], ['🕐', "Rispetta l'orario", 'walk']],
    },
    {
      minLevel: 20, name: 'Bus turistico', icon: '🚍',
      intro: 'Porta i turisti ai monumenti e fermati per le foto. Guida dolce: ogni frenata o curva brusca fa scendere il gradimento dei passeggeri.',
      steps: [['🚍', 'Sali sul bus scoperto', 'tap'], ['🏛️', 'Fermati a ogni monumento', 'walk'], ['📸', 'Aspetta le foto', 'hold'], ['😊', 'Guida dolce', 'walk']],
    },
    {
      minLevel: 30, name: 'Autista privato', icon: '🚘',
      intro: "Un cliente importante: sul cruscotto c'è un bicchiere d'acqua che non deve rovesciarsi. Guida dolce e segui le sue richieste: a volte cambia destinazione.",
      steps: [['🚘', "Sali sull'auto", 'tap'], ['🥛', "Guida senza rovesciare l'acqua", 'walk'], ['🏁', 'Portalo dove vuole', 'walk']],
    },
    {
      minLevel: 40, name: 'Limousine per eventi', icon: '🎩',
      intro: "Matrimonio! Prendi la sposa in orario, segui l'auto dello sposo nel corteo senza staccarti né avvicinarti troppo e fermati sul tappeto rosso.",
      steps: [['🎩', 'Sali sulla limousine', 'tap'], ['👰', 'Prendi la sposa in orario', 'walk'], ['🚗', "Segui il corteo alla giusta distanza", 'walk'], ['🟥', 'Fermati sul tappeto rosso', 'walk']],
    },
  ],
  giardino: [
    {
      minLevel: 10, name: 'Potatura di siepi e alberi', icon: '🌳',
      intro: 'Prendi le cesoie, taglia le punte cresciute troppo sulle siepi e i rami in eccesso sugli alberi (tieni il dito proprio sulla punta o sul ramo), raccogli i rami caduti e buttali nella cippatrice.',
      steps: [['🧰', 'Prendi le cesoie dalla cassetta rossa', 'tap'], ['✂️', 'Taglia le punte che sporgono dalle siepi', 'hold'], ['🪚', 'Taglia i rami in eccesso sugli alberi', 'hold'], ['🌿', 'Raccogli i rami caduti', 'tap'], ['🪵', 'Buttali nella cippatrice', 'tap']],
    },
  ],
};

/** Quale versione del lavoretto tocca a questo livello (0 = quella di base). */
export function jobVariant(type: JobType, level: number) {
  const vs = JOB_VARIANTS[type] ?? [];
  let v = 0;
  vs.forEach((x, i) => {
    if (level >= x.minLevel) v = i + 1;
  });
  return v;
}

/** Il lavoretto com'è a questo livello (nome, icona, spiegazione) e la chiave per il suo tutorial. */
export function jobInfo(type: JobType, level: number) {
  const v = jobVariant(type, level);
  const base = JOBS[type];
  const over = v ? JOB_VARIANTS[type]![v - 1] : null;
  return { ...base, ...(over ?? {}), variant: v, key: v ? `${type}:${v}` : type };
}
