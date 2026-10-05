import type { SkillId } from './skills';

export type JobType = 'giardino' | 'consegna' | 'piatti' | 'volantini' | 'lavaggio' | 'imbianchino';

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
  imbianchino: {
    name: 'Dipingere la recinzione', icon: '🖌️', skill: 'artigianato', basePay: 34, xp: 15, fame: 1.2, where: 'house',
    intro: 'Copri con i teloni tutto quello che c\'è in giardino (cespugli, aiuole, giochi…), prendi la vernice, dipingi ogni tratto del muretto di recinzione e alla fine togli i teloni.',
    steps: [['🛡️', 'Copri con i teloni le cose del giardino', 'tap'], ['🪣', 'Prendi la vernice', 'tap'], ['🖌️', 'Dipingi ogni tratto del muretto', 'hold'], ['🧹', 'Togli i teloni', 'tap']],
  },
};

export const JOB_TYPES = Object.keys(JOBS) as JobType[];
