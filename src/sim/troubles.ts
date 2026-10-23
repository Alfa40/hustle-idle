import { TROUBLES as T } from '../config/balance';
import { bizType } from '../config/business';
import { bus, toast } from './bus';
import { addNews } from './crisis';
import { hasManager, insuranceCost, lotDef, upg, weekOf } from './economy';
import { euro, type Business, type GameState } from './state';

/**
 * Imprevisti delle attività (GDD §"Imprevisti"): guasti e furgone in panne, furti, ispezioni, concorrenza,
 * dimissioni e sciopero. Si tirano a sorte una volta al giorno di gioco e **solo col gioco aperto** (così si può
 * reagire); gli effetti (meno capacità, meno clienti) stanno in economy.ts (`troubleCap`, `rivalMult`).
 * Difese: un manager (−30% a tutto), attrezzatura (guasti), cassa (furti), assicurazione (paga il 70% di guasti
 * e furti).
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const name = (b: Business) => `${bizType(b.type).icon} ${bizType(b.type).name} in ${lotDef(b.lotId).name}`;
/** quanto paghi davvero: con l'assicurazione solo la parte non coperta */
export const youPay = (b: Business, cost: number) => Math.round(b.insured ? cost * (1 - T.INSURANCE_COVER) : cost);

/** personale sotto sforzo: questa settimana più del 15% dei clienti persi per mancanza di personale */
function busy(s: GameState, b: Business) {
  const w = weekOf(s, b);
  return (w.lostStaff ?? 0) / Math.max(1, w.served + w.lost) > 0.15;
}

function fame(s: GameState, b: Business, share: number) {
  for (const k of bizType(b.type).skills) s.fame[k] *= 1 + share;
}

/** Un giorno di gioco col gioco aperto: per ogni attività si tirano a sorte gli imprevisti. */
export function dailyTroubles(s: GameState) {
  for (const b of s.businesses) {
    const mgr = hasManager(b) ? 1 - T.MANAGER_CUT : 1;
    const truck = lotDef(b.lotId).kind === 'truck';
    // guasto (o furgone in panne sui posteggi)
    // allarme e manutenzione: −15% a guasti e furti per livello; corsi: −15% a dimissioni e scioperi
    const safe = Math.max(0.2, 1 - 0.15 * upg(b, 'sicurezza'));
    const calm = Math.max(0.2, 1 - 0.15 * upg(b, 'formazione'));
    if (!b.broken && Math.random() < T.BREAK * mgr * safe * Math.max(0.2, 1 - T.EQUIP_CUT * upg(b, 'attrezzatura'))) {
      if (truck) {
        const cost = Math.max(300, Math.round((b.boughtFor * T.TOW_SHARE) / 10) * 10);
        b.broken = { kind: 'panne', cost, until: s.minutes + 2 * 1440 };
        addNews(s, { icon: '🚧', kind: 'bad', text: `${name(b)}: furgone in panne, fermo 2 giorni. Carro attrezzi per ripartire subito`, biz: b.id, action: { kind: 'repair', cost } });
      } else {
        const cost = Math.max(500, Math.round((b.boughtFor * T.REPAIR_SHARE) / 10) * 10);
        b.broken = { kind: 'guasto', cost };
        addNews(s, { icon: '🔧', kind: 'bad', text: `${name(b)}: macchinario guasto, lavora a metà finché non lo ripari`, biz: b.id, action: { kind: 'repair', cost } });
      }
      toast(`🔧 Guasto: ${bizType(b.type).name}. Guarda le Notizie`, 'bad');
    }
    // furto: parte dell'incasso di ieri
    if (Math.random() < T.THEFT * mgr * safe * Math.max(0.2, 1 - T.CASH_CUT * upg(b, 'cassa'))) {
      const stolen = Math.max(100, Math.round(b.yesterday.revenue * rnd(T.THEFT_MIN, T.THEFT_MAX)));
      const loss = youPay(b, stolen);
      s.money -= loss;
      addNews(s, { icon: '🕵️', kind: 'bad', text: `${name(b)}: furto di ${euro(stolen)}${b.insured ? `, l'assicurazione ne copre ${euro(stolen - loss)}` : ''}`, biz: b.id });
      toast(`🕵️ Furto: −${euro(loss)}`, 'bad');
    }
    // ispezione: attività trascurata → multa e fama in meno, curata → fama in più
    if (Math.random() < T.INSPECTION) {
      const w = weekOf(s, b);
      const lostShare = w.lost / Math.max(1, w.served + w.lost);
      const roles = bizType(b.type).roles.every((r) => b.staff.some((e) => e.role === r));
      const bad = lostShare > 0.2 || (w.lostStock ?? 0) > 0 || !roles;
      if (bad) {
        const fine = Math.max(500, Math.round((b.month.revenue * T.FINE_SHARE) / 10) * 10);
        s.money -= fine;
        fame(s, b, -T.FINE_FAME);
        const why = !roles ? 'manca personale' : (w.lostStock ?? 0) > 0 ? 'magazzino spesso vuoto' : 'troppi clienti persi';
        addNews(s, { icon: '📋', kind: 'bad', text: `${name(b)}: ispezione, multa di ${euro(fine)} (${why}). Fama in calo`, biz: b.id });
        toast(`📋 Multa: −${euro(fine)}`, 'bad');
      } else {
        fame(s, b, T.PASS_FAME);
        addNews(s, { icon: '📋', kind: 'good', text: `${name(b)}: ispezione superata, tutto in regola. Fama in aumento`, biz: b.id });
      }
    }
    // concorrenza: un rivale apre vicino
    if (!b.rival && Math.random() < T.RIVAL) {
      const cut = rnd(T.RIVAL_CUT[0], T.RIVAL_CUT[1]);
      const days = Math.round(rnd(T.RIVAL_DAYS[0], T.RIVAL_DAYS[1]));
      b.rival = { until: s.minutes + days * 1440, cut };
      addNews(s, { icon: '🏪', kind: 'warn', text: `${name(b)}: un rivale ha aperto vicino, −${Math.round(cut * 100)}% clienti per ${days} giorni. Pubblicità e look aiutano`, biz: b.id });
    }
    const tired = busy(s, b);
    // dimissioni: più facili se lavorano troppo
    if (Math.random() < (tired ? T.QUIT_BUSY : T.QUIT_CALM) * mgr * calm) {
      const list = b.staff.filter((e) => e.role !== 'manager');
      if (list.length > 1) {
        const e = list[Math.floor(Math.random() * list.length)];
        b.staff = b.staff.filter((x) => x !== e);
        addNews(s, { icon: '👋', kind: 'bad', text: `${name(b)}: ${e.name.split(' ')[0]} ha lasciato il lavoro${tired ? ' (troppo lavoro)' : ''}. Assumi qualcuno`, biz: b.id });
      }
    }
    // sciopero: raro, con l'attività in crisi o il personale sotto sforzo
    if (!b.strike && ((b.redMonths ?? 0) >= 2 || tired) && Math.random() < T.STRIKE * mgr * calm) {
      const cost = Math.max(200, Math.round(b.staff.reduce((a, e) => a + e.salary, 0) * 0.1 / 10) * 10);
      b.strike = { until: s.minutes + 1440, cost };
      addNews(s, { icon: '✊', kind: 'bad', text: `${name(b)}: sciopero, chiusa per un giorno. Un premio ai dipendenti lo ferma subito`, biz: b.id, action: { kind: 'strike', cost } });
      toast(`✊ Sciopero: ${bizType(b.type).name}`, 'bad');
    }
  }
  bus.emit('news');
}

/** l'imprevisto della notizia è ancora in corso (se no il pulsante sparisce) */
export function troubleActive(s: GameState, b: Business, kind: 'repair' | 'strike') {
  return kind === 'repair' ? !!b.broken && (b.broken.until === undefined || s.minutes < b.broken.until) : !!b.strike && s.minutes < b.strike.until;
}

/** costo della scelta in corso (riparazione o premio) già con l'assicurazione */
export function troubleCost(b: Business, kind: 'repair' | 'strike') {
  return kind === 'repair' ? youPay(b, b.broken?.cost ?? 0) : b.strike?.cost ?? 0;
}

/** Ripara subito / carro attrezzi / premio ai dipendenti. */
export function solveTrouble(s: GameState, b: Business, kind: 'repair' | 'strike') {
  if (!troubleActive(s, b, kind)) return false;
  const cost = troubleCost(b, kind);
  if (s.money < cost) return false;
  s.money -= cost;
  if (kind === 'repair') b.broken = undefined;
  else b.strike = undefined;
  toast(kind === 'repair' ? '🔧 Riparato: si torna a lavorare' : '✊ Sciopero finito', 'good');
  return true;
}

export { insuranceCost };
