import { CAREER_LINES, FOCUS_SECTORS, careerLine, readyJobTypes } from '../config/careers';
import { bizType, evolvesFrom, type BusinessType } from '../config/business';
import { SKILLS, type SkillId } from '../config/skills';
import { addMoney, lineLevel, skillLevel, totalLevel } from './progress';
import { bus, toast } from './bus';
import type { GameState } from './state';

/**
 * Campi di carriera (GDD §"Campi"): si parte da **un campo solo**, scelto all'inizio (lavoretti e attività solo
 * di quel campo). Raggiunto un livello del giocatore (`totalLevel`) si può entrare in un campo nuovo pagando
 * (`FIELD_STEPS`): ogni campo costa più del precedente. Le attività si sbloccano coi lavoretti: un'attività base
 * quando un suo lavoretto arriva alla prima evoluzione (Liv. 10), ogni evoluzione dell'attività vuole il lavoretto
 * all'evoluzione dopo (gradino 1 → Liv. 20, 2 → 30, 3 → 40).
 * `GameState.fields`: i campi aperti, il primo è quello principale. Assente (partite di prima) = tutti aperti;
 * vuoto = partita nuova che deve ancora scegliere.
 */

/** i campi che si possono scegliere (quelli accesi in config/careers.ts) */
export const FIELDS: SkillId[] = (FOCUS_SECTORS ?? (Object.keys(SKILLS) as SkillId[])).slice();

/** per entrare nel 2°, 3°, 4°, 5° campo: livello del giocatore e prezzo (corso e licenza) */
export const FIELD_STEPS = [
  { level: 15, cost: 150_000 },
  { level: 30, cost: 750_000 },
  { level: 45, cost: 3_000_000 },
  { level: 60, cost: 10_000_000 },
];

/** livello del lavoretto per aprire l'attività base, e in più per ogni gradino dell'albero */
export const BIZ_UNLOCK_LEVEL = 10;

/** il campo appena aperto ha più offerte in città finché i suoi lavoretti sono sotto questo livello */
export const NEW_FIELD_BOOST_LEVEL = 5;
/** quante delle offerte nuove vengono dal campo appena aperto */
export const NEW_FIELD_BOOST_SHARE = 0.5;

export const openFields = (s: GameState): SkillId[] => s.fields ?? FIELDS;
export const fieldOpen = (s: GameState, k: SkillId) => openFields(s).includes(k);
/** la partita nuova deve ancora scegliere il campo principale */
export const needsField = (s: GameState) => !!s.fields && s.fields.length === 0;
export const mainField = (s: GameState): SkillId | null => openFields(s)[0] ?? null;

/** il prossimo passo per un campo nuovo (null: sono già tutti aperti o non ce ne sono altri) */
export function nextFieldStep(s: GameState) {
  const n = openFields(s).length;
  if (n === 0 || n >= FIELDS.length) return null;
  return FIELD_STEPS[Math.min(n - 1, FIELD_STEPS.length - 1)];
}

/** Si può entrare in un campo nuovo: livello raggiunto (i soldi si guardano a parte). */
export const fieldLevelReached = (s: GameState) => {
  const st = nextFieldStep(s);
  return !!st && totalLevel(s) >= st.level;
};

/** Sceglie il campo principale (partita nuova). */
export function chooseMainField(s: GameState, k: SkillId) {
  if (!needsField(s) || !FIELDS.includes(k)) return false;
  s.fields = [k];
  bus.emit('fields');
  return true;
}

/** Entra in un campo nuovo: serve il livello e si paga il corso. */
export function openField(s: GameState, k: SkillId) {
  const st = nextFieldStep(s);
  if (!st || fieldOpen(s, k) || !FIELDS.includes(k) || totalLevel(s) < st.level || s.money < st.cost) return false;
  addMoney(s, -st.cost);
  s.fields = [...openFields(s), k];
  s.newField = k;
  toast(`${SKILLS[k].icon} Sei entrato in ${SKILLS[k].name}: nuovi lavoretti in città!`, 'good');
  bus.emit('fields');
  return true;
}

/**
 * Lavoretti che sbloccano ogni attività. Le basi possono averne più di uno (basta uno qualsiasi), le evolute
 * hanno quello del loro ramo; un'attività che non è qui prende quelli dell'attività da cui si evolve.
 */
const BIZ_LINES: Partial<Record<BusinessType, string[]>> = {
  foodtruck: ['piatti', 'bar', 'festa'], trattoria: ['piatti'], bar_caffe: ['bar'], catering: ['festa'],
  panificio: ['forno'], bnb: ['hotel'],
  traslochi: ['consegna'], trasporti_delicati: ['consegna'], deposito_mobili: ['magazzino'], autotrasporti: ['autista'],
  bici: ['consegna', 'magazzino'], consegne_veloci: ['consegna'], punto_ritiro: ['magazzino'],
  navetta: ['autista'],
  pulizie: ['pulizie'], giardiniere: ['giardino'],
  tuttofare: ['montaggio', 'idraulico'], costruzioni: ['montaggio'], ditta_impianti: ['idraulico'],
  pittore: ['imbianchino', 'ristrutturazione'], ristrutturazioni: ['ristrutturazione'], decorazioni: ['imbianchino'],
  falegnameria: ['falegnameria'],
  studio_foto: ['foto', 'moda'], foto_matrimoni: ['foto'], sartoria: ['moda'],
};

export function bizLines(t: BusinessType): string[] {
  for (let k: BusinessType | null = t; k; k = evolvesFrom(k)) if (BIZ_LINES[k]) return BIZ_LINES[k]!.filter((l) => careerLine(l)?.ready);
  return [];
}

/** livello del lavoretto che serve per avere questa attività (base: 10, poi +10 a gradino) */
export const bizNeedLevel = (t: BusinessType) => BIZ_UNLOCK_LEVEL * ((bizType(t).tier ?? 0) + 1);

/**
 * L'attività è sbloccata dai lavoretti? `line` = il lavoretto più avanti tra i suoi (quello da far salire),
 * `need` il livello che serve, `have` quello di adesso. Partite di prima (tutti i campi, `fields` assente): sempre sì.
 */
export function bizUnlock(s: GameState, t: BusinessType) {
  const lines = bizLines(t);
  const need = bizNeedLevel(t);
  if (!s.fields || !lines.length) return { ok: true, line: lines[0] ?? '', need, have: need };
  let best = lines[0];
  for (const l of lines) if (lineLevel(s, l) > lineLevel(s, best)) best = l;
  const have = lineLevel(s, best);
  return { ok: have >= need, line: best, need, have };
}

/** "Porta Cucina al Liv. 10 (ora 7)": cosa manca per sbloccare l'attività */
export function bizLockText(s: GameState, t: BusinessType) {
  const u = bizUnlock(s, t);
  if (u.ok) return '';
  const names = bizLines(t).map((l) => `${careerLine(l)!.icon} ${careerLine(l)!.name}`);
  return `🔒 Porta ${names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}` : names[0]} al Liv. ${u.need} (ora ${u.have})`;
}

/** Il campo appena aperto ha ancora lavoretti sotto il Liv. 5: ricevono più offerte. */
export function boostedLines(s: GameState): string[] {
  const k = s.newField;
  if (!k || !fieldOpen(s, k)) return [];
  return CAREER_LINES.filter((l) => l.sector === k && l.ready && lineLevel(s, l.id) < NEW_FIELD_BOOST_LEVEL).map((l) => l.id);
}

/** Livello che decide la paga dei lavoretti: il tuo settore migliore tra quelli aperti. */
export const payLevel = (s: GameState) => Math.max(1, ...openFields(s).map((k) => skillLevel(s, k)));
/** Fama che decide la paga: la più alta tra i campi aperti (chi è famoso lo è anche nel campo nuovo). */
export const payFame = (s: GameState) => Math.max(0, ...openFields(s).map((k) => s.fame[k] ?? 0));

/** I lavoretti che compaiono in città: le linee pronte dei campi aperti. */
export const readyJobs = (s: GameState) => readyJobTypes().filter((t) => fieldOpen(s, careerLine(t)!.sector));
/** quanto sale la paga dei lavoretti a ogni livello del tuo settore migliore */
export const PAY_PER_LEVEL = 0.1;
