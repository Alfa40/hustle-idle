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

export const FAME = {
  /** moltiplicatore domanda: 1 + fama/(fama+K) → massimo ×2 */
  K: 150,
  /** fama per ogni vendita fatta dai dipendenti (lenta) */
  PER_AUTO_SALE: 0.01,
  PER_MANUAL_SALE: 0.12,
  FAIL_PENALTY: 1,
};

export const JOB = {
  MAX_ACTIVE: 3,
  RESPAWN_MIN_SEC: 12,
  RESPAWN_MAX_SEC: 30,
  STAR_PAY: [0, 0.7, 1.0, 1.35],
  /** frazione di tempo rimasto per 3 e 2 stelle */
  STAR3: 0.45,
  STAR2: 0.2,
};

export const BUSINESS = {
  OPEN_HOUR: 8,
  CLOSE_HOUR: 22,
  /** pazienza cliente in minuti di gioco (25 secondi reali) */
  CUSTOMER_PATIENCE_MIN: ((30 * 24 * 60) / 7200) * 25,
  MAX_QUEUE: 5,
  PLAYER_COOK_SEC: 1.4,
  UTILITIES_MONTH: 90,
  BASE_STOCK_CAP: 40,
};

export const LEVEL = {
  xpForLevel: (lvl: number) => 50 * (lvl - 1) * (lvl - 1),
  levelFromXp: (xp: number) => Math.floor(Math.sqrt(xp / 50)) + 1,
};
