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
    intro: 'Carica i pacchi in negozio, consegnali agli indirizzi segnati (nell\'ordine che vuoi) e torna a firmare la ricevuta. Con un veicolo fai prima!',
    steps: [['📦', 'Carica i pacchi dalla pila in negozio', 'tap'], ['🏠', 'Porta un pacco a ogni cassetta gialla segnata, in qualsiasi ordine', 'walk'], ['🧾', 'Torna in negozio a firmare la ricevuta', 'tap']],
  },
  piatti: {
    name: 'Lavapiatti part-time', icon: '🍽️', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'restaurant',
    intro: 'Nel retro del ristorante: per ogni tavolo prendi i piatti sporchi, lavali al lavello e appoggiali sullo scolapiatti.',
    steps: [['🍽️', 'Prendi i piatti sporchi dal tavolo', 'tap'], ['🫧', 'Lavali al lavello', 'hold'], ['✨', 'Appoggiali sullo scolapiatti', 'tap'], ['🔁', 'Ripeti per ogni tavolo', 'walk']],
  },
  volantini: {
    name: 'Volantinaggio', icon: '📰', skill: 'clientela', basePay: 24, xp: 12, fame: 1, where: 'shop', vehicleOk: true,
    intro: 'Prendi i volantini in negozio, imbucali in tutte le cassette segnate e torna per la ricevuta. Sono tante e vicine: corri!',
    steps: [['📰', 'Prendi i volantini dall\'espositore giallo', 'tap'], ['📬', 'Imbuca un volantino in ogni cassetta blu segnata', 'walk'], ['🧾', 'Torna in negozio per la ricevuta', 'tap']],
  },
  lavaggio: {
    name: 'Lavaggio auto', icon: '🚿', skill: 'manualita', basePay: 32, xp: 14, fame: 1.1, where: 'house',
    intro: 'Prendi secchio e spugna, insapona i quattro lati dell\'auto, poi prendi la canna e risciacqua tutto.',
    steps: [['🪣', 'Prendi il secchio', 'tap'], ['🧽', 'Insapona i 4 lati dell\'auto', 'hold'], ['🚿', 'Prendi la canna dell\'acqua', 'tap'], ['💦', 'Risciacqua i 4 lati', 'hold']],
  },
  imbianchino: {
    name: 'Dipingere il muretto', icon: '🖌️', skill: 'artigianato', basePay: 34, xp: 15, fame: 1.2, where: 'house',
    intro: 'Copri le piante con i teli, prendi la vernice, dipingi ogni tratto del muretto e alla fine togli i teli.',
    steps: [['🪴', 'Copri le 2 piante con i teli', 'tap'], ['🪣', 'Prendi la vernice', 'tap'], ['🖌️', 'Dipingi ogni tratto del muretto', 'hold'], ['🧹', 'Togli i teli dalle piante', 'tap']],
  },
};

export const JOB_TYPES = Object.keys(JOBS) as JobType[];
