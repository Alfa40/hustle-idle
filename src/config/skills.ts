export type SkillId = 'cucina' | 'manualita' | 'clientela' | 'logistica';

export const SKILLS: Record<SkillId, { name: string; icon: string }> = {
  cucina: { name: 'Cucina', icon: '🍳' },
  manualita: { name: 'Manualità', icon: '🔨' },
  clientela: { name: 'Clientela', icon: '🤝' },
  logistica: { name: 'Logistica', icon: '📦' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
