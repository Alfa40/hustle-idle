// Tutti i numeri "tarabili" del gioco in un unico posto (vedi GDD).

export const TIME = {
  /** minuti di gioco per secondo reale mentre si gioca: 1 mese (30 gg) = 2 ore reali */
  GAME_MIN_PER_SEC: (30 * 24 * 60) / 7200,
  /** offline il tempo scorre 100 volte più lento */
  OFFLINE_SLOWDOWN: 100,
  DAYS_PER_MONTH: 30,
  START_HOUR: 8,
  /** fasce di efficienza del guadagno offline (ore reali → efficienza) */
  OFFLINE_TIERS: [
    { hours: 24, eff: 0.8 },
    { hours: 48, eff: 0.5 },
    { hours: Infinity, eff: 0.2 },
  ],
};

export const START_MONEY = 50;

/** Crisi delle attività e pignoramento (src/sim/crisis.ts). */
export const CRISIS = {
  /** mesi di fila in perdita che fanno fallire un'attività */
  FAIL_MONTHS: 4,
  /** fama dei settori dell'attività persa: a ogni mese in crisi/debiti e al fallimento */
  CRISIS_FAME: 0.02,
  FAIL_FAME: 0.1,
  /** con i debiti la merce costa di più */
  DEBT_STOCK_MULT: 1.25,
  /** giorni di gioco col conto sotto zero prima del pignoramento, e quando arrivano gli avvisi */
  SEIZE_DAYS: 30,
  SEIZE_WARN_AT: [10, 20, 27],
  /** al pignoramento le cose si vendono a metà valore; fama totale persa */
  SEIZE_SHARE: 0.5,
  SEIZE_FAME: 0.05,
};

export const FAME = {
  /** moltiplicatore domanda: 1 + fama/(fama+K) → massimo ×2 (fama media dei settori dell'attività) */
  K: 2000,
  /** fama per ogni vendita fatta dai dipendenti (lenta: la scalata dura mesi) */
  PER_AUTO_SALE: 0.002,
  PER_MANUAL_SALE: 0.025,
  /** fama tolta per ogni cliente perso (5 volte una vendita: perdere più di 1 cliente su 6 fa scendere) */
  PER_LOST: 0.01,
  /** lavoretto o ordine fallito */
  FAIL_PENALTY: 2,
  /** calo giornaliero della fama (parte della fama di ogni settore, per giorno di gioco) */
  DECAY_DAY: 0.0005,
  /** a gioco chiuso fama persa e calo valgono meno (attenuati) */
  OFFLINE_FACTOR: 0.5,
  /** missioni: la fama totale fa crescere obiettivi e premi in soldi (scala = 1 + fama / questo) */
  MISSION_SCALE: 800,
  /**
   * fama data da una missione: fissa + fama/DIV (cresce piano). Stima con 3 missioni al giorno, 1 a settimana e
   * qualche lavoretto: Magnate (20.000) dopo ~40 ore di gioco attivo, Mito (100.000) dopo ~140
   */
  DAILY_MISSION: 8,
  DAILY_MISSION_DIV: 4000,
  WEEKLY_MISSION: 30,
  WEEKLY_MISSION_DIV: 1000,
};

export const JOB = {
  /** lavoretti offerti insieme in città, e ogni quanto ne compare uno nuovo (secondi) */
  MAX_ACTIVE: 6,
  RESPAWN_MIN_SEC: 5,
  RESPAWN_MAX_SEC: 12,
  /** dopo un lavoretto il prossimo compare quasi subito (secondi) */
  AFTER_JOB_MIN_SEC: 2,
  AFTER_JOB_MAX_SEC: 4,
  STAR_PAY: [0, 0.7, 1.0, 1.35],
  /** frazione di tempo rimasto per 3 e 2 stelle */
  STAR3: 0.45,
  STAR2: 0.2,
  /** regola dei 5 minuti: il tempo di un lavoretto non supera mai questo (secondi) */
  MAX_SEC: 300,
  /** secondi persi con una scelta sbagliata (scaffale, scatola, pacco sbagliato…) */
  WRONG_PENALTY: 5,
};

export const BUSINESS = {
  OPEN_HOUR: 8,
  CLOSE_HOUR: 22,
  /** pazienza cliente in minuti di gioco (25 secondi reali) */
  CUSTOMER_PATIENCE_MIN: ((30 * 24 * 60) / 7200) * 55,
  MAX_QUEUE: 5,
  PLAYER_COOK_SEC: 1.4,
  UTILITIES_MONTH: 90,
  BASE_STOCK_CAP: 40,
};

/**
 * Livelli di esperienza: all'inizio si sale in fretta (fino al Liv. 5 servono il 40% di XP in meno
 * di prima), poi la salita è graduale e più lenta.
 *   Liv. 2: 30 · 3: 120 · 4: 270 · 5: 480 · 6: 990 · 7: 1620 · 8: 2370 · 10: 4230
 */
const xpForLevel = (lvl: number) => (lvl <= 5 ? 30 * (lvl - 1) ** 2 : 480 + 450 * (lvl - 5) + 60 * (lvl - 5) ** 2);
export const LEVEL = {
  xpForLevel,
  levelFromXp: (xp: number) => {
    let l = 1;
    while (l < 200 && xpForLevel(l + 1) <= xp) l++;
    return l;
  },
};

/**
 * Difficoltà dei lavoretti per livello: cresce di un gradino a livello fino al Liv. 5 (si passa
 * presto a lavori più complessi), poi più piano (0,6 a livello).
 */
export const jobDifficulty = (lvl: number) => (lvl <= 5 ? lvl : 5 + (lvl - 5) * 0.6);
