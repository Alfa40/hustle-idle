import type { SkillId } from './skills';

export type JobType = 'giardino' | 'consegna' | 'piatti' | 'volantini' | 'lavaggio' | 'imbianchino' | 'magazzino' | 'autista' | 'festa' | 'hotel' | 'bar' | 'forno';

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
    steps: [['📦', 'Ritira i pacchi al negozio dei pacchi', 'tap'], ['🏠', 'Consegna un pacco a ogni civico: leggi le targhe sulle case', 'walk'], ['🧾', 'Torna al negozio a firmare la ricevuta', 'tap']],
  },
  piatti: {
    name: 'Lavapiatti part-time', icon: '🍽️', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'restaurant',
    intro: "Il ristorante ha chiuso: nella sua cucina lava le stoviglie una alla volta. Prendile dalla pila sporca sul carrello, al lavello bagna la spugna nel sapone e strofina via le macchie, sciacqua sotto l'acqua finché non resta schiuma e mettile ad asciugare al posto giusto (scolapiatti, portabicchieri, cestello delle posate).",
    steps: [['', 'Prendi una stoviglia dalla pila sporca', 'tap'], ['', 'Al lavello: spugna nel sapone, strofina le macchie', 'hold'], ['', "Sciacqua sotto l'acqua", 'hold'], ['', 'Mettila ad asciugare al posto giusto', 'tap']],
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
  festa: {
    name: 'Cameriere a una festa', icon: '🥂', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'house',
    intro: 'Festa in giardino: prendi i bicchieri al buffet e porta da bere agli ospiti che alzano la mano. Cammina: correndo il vassoio si rovescia!',
    steps: [['🍹', 'Prendi i bicchieri al buffet', 'tap'], ['🙋', 'Servi gli ospiti che chiamano', 'tap'], ['🚶', 'Cammina, non correre', 'walk']],
  },
  hotel: {
    name: "Facchino d'albergo", icon: '🛎️', skill: 'cucina', basePay: 27, xp: 13, fame: 1, where: 'shop',
    intro: "All'hotel sono arrivati gli ospiti: porta ogni valigia alla porta della camera col numero scritto sulla sua etichetta.",
    steps: [['🧳', 'Prendi una valigia alla reception', 'tap'], ['🔢', "Leggi il numero sull'etichetta", 'walk'], ['🚪', 'Lasciala alla porta di quella camera', 'tap']],
  },
  bar: {
    name: 'Barista', icon: '☕', skill: 'cucina', basePay: 27, xp: 13, fame: 1, where: 'restaurant',
    intro: 'Al bancone del bar i clienti ordinano: prendi la tazza, falla alla macchina del caffè (e monta il latte per il cappuccino) e servi i clienti in ordine di arrivo.',
    steps: [['☕', 'Prendi una tazza', 'tap'], ['⚙️', 'Fai il caffè alla macchina', 'hold'], ['🥛', 'Per il cappuccino monta il latte', 'hold'], ['🙋', 'Servi il cliente', 'tap']],
  },
  forno: {
    name: 'Panettiere notturno', icon: '🥖', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'shop',
    intro: "Di notte al forno: prendi la farina, impastala, dai la forma al pane, infornalo e toglilo quando è dorato (prima è crudo, dopo brucia). Poi sullo scaffale.",
    steps: [['🌾', 'Prendi la farina', 'tap'], ['🌀', "Impasta all'impastatrice", 'hold'], ['🥖', 'Dai la forma al pane', 'hold'], ['🔥', 'Inforna e togli quando è dorato', 'tap']],
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
  piatti: [
    { minLevel: 10, name: 'Aiuto cuoco', icon: '🔪', intro: 'In cucina segui il foglio delle preparazioni: prendi l\'ingrediente dal frigo, al tagliere prendi il coltello col dito e muovilo su e giù sopra ogni linea finché la fetta si stacca. Poi le fette nella ciotola giusta. Più tagli sulle linee, più stelle prendi.', steps: [['🧊', 'Prendi l\'ingrediente dal frigo', 'tap'], ['🔪', 'Al tagliere: prendi il coltello e muovilo su e giù sulle linee', 'hold'], ['🥣', 'Metti le fette nella ciotola giusta', 'tap']] },
    { minLevel: 20, name: 'Cuoco di linea', icon: '🍔', intro: 'Arrivano le comande degli hamburger: prendi la carne dal frigo, alla piastra trascinala sulla piastra, toccala per girarla quando la barra è verde e mettila sul panino quando è cotta (prima è cruda, dopo brucia). Al bancone componi il panino come sullo scontrino, con la salsa a zig-zag, e portalo al passe.', steps: [['🥩', 'Prendi la carne dal frigo', 'tap'], ['🔥', 'Piastra: trascina, gira sul verde, togli quando è cotta', 'hold'], ['🧾', 'Componi il panino come sullo scontrino', 'tap'], ['🛎️', 'Portalo al passe', 'tap']] },
    { minLevel: 30, name: 'Cuoco dal vivo', icon: '🔥', intro: 'Cucini davanti ai clienti, a ritmo: tocca quando il segno arriva sul cerchio per saltare la padella, tieni premuto per il flambé.', steps: [['👆', 'Tocca a tempo per saltare la padella', 'tap'], ['🔥', 'Tieni premuto per il flambé', 'hold']] },
    { minLevel: 40, name: 'Chef', icon: '👨‍🍳', intro: 'Cuoci il piatto fermando la cottura nel punto giusto, poi impiatta trascinando gli elementi come nella foto.', steps: [['🔥', 'Ferma la cottura sul verde', 'tap'], ['🍽️', 'Impiatta come nella foto', 'tap']] },
  ],
  festa: [
    { minLevel: 10, name: 'Catering', icon: '🍱', intro: 'Prepara il buffet: trascina ogni vassoio al suo posto sul tavolo, uguale allo schema.', steps: [['📋', 'Guarda lo schema', 'tap'], ['✋', 'Trascina i vassoi al loro posto', 'tap']] },
    { minLevel: 20, name: 'Cameriere al ristorante', icon: '🍽️', intro: 'Per ogni tavolo: prendi l\'ordinazione, porta il piatto giusto dal passe (guarda il numero del tavolo) e alla fine il conto.', steps: [['📝', "Prendi l'ordinazione", 'tap'], ['🛎️', 'Prendi il piatto al passe', 'tap'], ['🍽️', 'Servilo al tavolo', 'tap'], ['🧾', 'Porta il conto', 'tap']] },
    { minLevel: 30, name: 'Maître', icon: '🎩', intro: 'Fai sedere ogni gruppo al tavolo giusto: abbastanza posti, e se lo chiedono vicino alla finestra o in un angolo tranquillo.', steps: [['👥', 'Guarda il gruppo', 'tap'], ['✋', 'Trascinalo al tavolo giusto', 'tap']] },
    { minLevel: 40, name: 'Cena di gala', icon: '🎻', intro: 'Tutti i camerieri servono insieme al segnale: tocca quando il segno arriva sul cerchio. Tre portate.', steps: [['👆', 'Tocca a tempo col segnale', 'tap']] },
  ],
  hotel: [
    { minLevel: 10, name: 'Cameriera ai piani', icon: '🛏️', intro: 'Rifai le camere: prendi le lenzuola e gli asciugamani puliti dal carrello, rifai il letto, cambia gli asciugamani, svuota il cestino e togli la polvere.', steps: [['🧺', 'Prendi dal carrello', 'tap'], ['🛏️', 'Rifai il letto', 'hold'], ['🗑️', 'Svuota il cestino', 'tap'], ['🧹', 'Togli la polvere', 'hold']] },
    { minLevel: 20, name: 'Receptionist', icon: '🗝️', intro: 'Dai a ogni ospite la camera giusta: guarda cosa chiede (letti, vista, piano) e trascinalo sulla camera adatta.', steps: [['🙋', 'Leggi cosa chiede', 'tap'], ['✋', 'Trascinalo sulla camera', 'tap']] },
    { minLevel: 30, name: 'Concierge', icon: '🛎️', intro: 'Gli ospiti nella hall chiedono qualcosa: prendi la cosa giusta (ombrello, biglietti, mappa…) e portala a chi l\'ha chiesta.', steps: [['🙋', 'Senti cosa chiede', 'tap'], ['📦', 'Prendi la cosa giusta', 'tap'], ['🤝', 'Portala all\'ospite', 'tap']] },
    { minLevel: 40, name: 'Suite VIP', icon: '👑', intro: 'Servizio in camera per un ospite importante: prepara il carrello come sulla sua scheda, apparecchia, metti i fiori e apri le tende.', steps: [['📋', 'Leggi la scheda', 'tap'], ['🛒', 'Prepara il carrello', 'tap'], ['🍽️', 'Apparecchia', 'tap']] },
  ],
  bar: [
    { minLevel: 10, name: 'Latte art', icon: '🎨', intro: 'Disegna sulla schiuma del cappuccino col dito, come nella foto: cuore, foglia o cigno.', steps: [['👆', 'Trascina il dito sul disegno', 'hold']] },
    { minLevel: 20, name: 'Barman', icon: '🍸', intro: 'Prepara i cocktail: tieni premuto sulla bottiglia per versare e lascia quando arrivi alla tacca. Segui l\'ordine della ricetta.', steps: [['📋', 'Leggi la ricetta', 'tap'], ['🍾', 'Tieni premuto per versare', 'hold'], ['📏', 'Lascia alla tacca', 'hold']] },
    { minLevel: 30, name: 'Barman acrobatico', icon: '🤹', intro: 'Lancia e riprendi la bottiglia a ritmo: tocca quando il segno arriva sul cerchio.', steps: [['👆', 'Tocca a tempo', 'tap']] },
    { minLevel: 40, name: 'Sommelier', icon: '🍷', intro: 'Scegli il vino giusto per ogni piatto e versalo fino al segno senza farlo traboccare.', steps: [['🍽️', 'Guarda il piatto', 'tap'], ['🍷', 'Scegli il vino adatto', 'tap'], ['📏', 'Versa fino al segno', 'hold']] },
  ],
  forno: [
    { minLevel: 10, name: 'Pasticcere', icon: '🧁', intro: 'Decora i dolci con la sac à poche: trascina il dito seguendo il disegno.', steps: [['👆', 'Segui il disegno col dito', 'hold']] },
    { minLevel: 20, name: 'Torte su ordinazione', icon: '🎂', intro: 'Decora la torta uguale alla foto: trascina ogni decorazione al suo posto.', steps: [['🖼️', 'Guarda la foto', 'tap'], ['✋', 'Trascina le decorazioni', 'tap']] },
    { minLevel: 30, name: 'Torte nuziali', icon: '💒', intro: 'Il piano della torta dondola appeso: tocca per lasciarlo cadere ben centrato sopra quello di sotto.', steps: [['👆', 'Tocca quando è centrato', 'tap']] },
    { minLevel: 40, name: 'Maestro cioccolatiere', icon: '🍫', intro: 'Tieni il cioccolato alla temperatura giusta (tieni premuto per scaldare), poi versalo negli stampi fino al segno.', steps: [['🌡️', 'Tieni la temperatura nel verde', 'hold'], ['🍫', 'Versa fino al segno', 'hold']] },
  ],
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
