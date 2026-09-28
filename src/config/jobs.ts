import type { SkillId } from './skills';

export type JobType = 'giardino' | 'consegna' | 'piatti';

export interface JobDef {
  name: string;
  icon: string;
  skill: SkillId;
  /** compenso base prima dei moltiplicatori */
  basePay: number;
  xp: number;
  fame: number;
  intro: string;
}

export const JOBS: Record<JobType, JobDef> = {
  giardino: {
    name: 'Sistemare il giardino', icon: '🌿', skill: 'manualita', basePay: 30, xp: 14, fame: 1.2,
    intro: 'Taglia tutti i cespugli prima che scada il tempo. Avvicinati e tieni premuto.',
  },
  consegna: {
    name: 'Consegna pacchi', icon: '📦', skill: 'logistica', basePay: 26, xp: 12, fame: 1,
    intro: 'Porta il pacco all\'indirizzo segnato prima che scada il tempo.',
  },
  piatti: {
    name: 'Lavapiatti part-time', icon: '🍽️', skill: 'cucina', basePay: 28, xp: 13, fame: 1,
    intro: 'Strofina via lo sporco da ogni piatto. Più veloce sei, più guadagni.',
  },
};

export const JOB_TYPES = Object.keys(JOBS) as JobType[];
