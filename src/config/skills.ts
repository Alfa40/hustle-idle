export type SkillId = 'cucina' | 'manualita' | 'clientela' | 'logistica' | 'artigianato';

/**
 * I 5 settori di carriera (le esperienze che formano la fama). Le chiavi restano quelle di prima
 * (le partite salvate non cambiano); nomi e linee di lavoro: config/careers.ts.
 */
export const SKILLS: Record<SkillId, { name: string; icon: string }> = {
  logistica: { name: 'Trasporti e logistica', icon: '🚚' },
  cucina: { name: 'Ristorazione', icon: '🍳' },
  clientela: { name: 'Commercio e pubbliche relazioni', icon: '🤝' },
  artigianato: { name: 'Design e arte', icon: '🎨' },
  manualita: { name: 'Costruzione e manualità', icon: '🔨' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
