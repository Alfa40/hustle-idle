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
}

export const JOBS: Record<JobType, JobDef> = {
  giardino: {
    name: 'Sistemare il giardino', icon: '🌿', skill: 'manualita', basePay: 30, xp: 14, fame: 1.2, where: 'house',
    intro: 'Prendi il tosasiepi, taglia i cespugli, raccogli le foglie e svuota il sacco nel bidone. Resta nella zona di lavoro!',
  },
  consegna: {
    name: 'Consegna pacchi', icon: '📦', skill: 'logistica', basePay: 26, xp: 12, fame: 1, where: 'shop', vehicleOk: true,
    intro: 'Carica i pacchi in negozio, consegnali agli indirizzi segnati (nell\'ordine che vuoi) e torna a firmare la ricevuta. Con un veicolo fai prima!',
  },
  piatti: {
    name: 'Lavapiatti part-time', icon: '🍽️', skill: 'cucina', basePay: 28, xp: 13, fame: 1, where: 'restaurant',
    intro: 'Nel retro del ristorante: per ogni tavolo prendi i piatti sporchi, lavali al lavello e appoggiali sullo scolapiatti.',
  },
  volantini: {
    name: 'Volantinaggio', icon: '📰', skill: 'clientela', basePay: 24, xp: 12, fame: 1, where: 'shop', vehicleOk: true,
    intro: 'Prendi i volantini in negozio, imbucali in tutte le cassette segnate e torna per la ricevuta. Sono tante e vicine: corri!',
  },
  lavaggio: {
    name: 'Lavaggio auto', icon: '🚿', skill: 'manualita', basePay: 32, xp: 14, fame: 1.1, where: 'house',
    intro: 'Prendi secchio e spugna, insapona i quattro lati dell\'auto, poi prendi la canna e risciacqua tutto.',
  },
  imbianchino: {
    name: 'Dipingere il muretto', icon: '🖌️', skill: 'artigianato', basePay: 34, xp: 15, fame: 1.2, where: 'house',
    intro: 'Copri le piante con i teli, prendi la vernice, dipingi ogni tratto del muretto e alla fine togli i teli.',
  },
};

export const JOB_TYPES = Object.keys(JOBS) as JobType[];
