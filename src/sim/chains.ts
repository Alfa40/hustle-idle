import { bizType, UPGRADES, type BusinessType, type UpgradeId } from '../config/business';
import { ZONES, type ZoneId } from '../config/map';
import type { ProductId } from '../config/products';
import { extraRoom, hasInterior, productLevel } from '../config/recipes';
import { buyStock, buyUpgrade, lotZone, menuSlots, resetBizStats, stockCap, upg } from './economy';
import { PRODUCTS } from '../config/products';
import type { Business, ChainGroup, GameState } from './state';

/**
 * Catene: quando hai 2 o più attività dello stesso tipo formano una catena. Dalla schermata della
 * catena si applicano le stesse modifiche a tutti i negozi, a quelli di una zona o a gruppi scelti da te.
 */

/** tipi di attività con almeno 2 negozi */
export const chainTypes = (s: GameState) => {
  const n = new Map<BusinessType, number>();
  for (const b of s.businesses) n.set(b.type, (n.get(b.type) ?? 0) + 1);
  return [...n].filter(([, k]) => k >= 2).map(([t]) => t);
};

export const chainOf = (s: GameState, type: BusinessType) => s.businesses.filter((b) => b.type === type);

/** Un gruppo della catena: tutti, una zona o un gruppo tuo. */
export interface ChainSel {
  id: string;
  name: string;
  icon: string;
  bizs: Business[];
  custom?: ChainGroup;
}

export function chainGroups(s: GameState, type: BusinessType): ChainSel[] {
  const all = chainOf(s, type);
  const out: ChainSel[] = [{ id: 'all', name: 'Tutta la catena', icon: '🔗', bizs: all }];
  for (const z of Object.keys(ZONES) as ZoneId[]) {
    const bizs = all.filter((b) => lotZone[b.lotId] === z);
    if (bizs.length && bizs.length < all.length) out.push({ id: 'zone:' + z, name: ZONES[z].name, icon: '📍', bizs });
  }
  for (const g of s.chainGroups ?? []) {
    if (g.type !== type) continue;
    const bizs = all.filter((b) => g.bizIds.includes(b.id));
    if (bizs.length) out.push({ id: 'g:' + g.id, name: g.name, icon: '⭐', bizs, custom: g });
  }
  return out;
}

export function saveGroup(s: GameState, type: BusinessType, name: string, bizIds: string[], id?: string) {
  s.chainGroups ??= [];
  const old = id ? s.chainGroups.find((g) => g.id === id) : undefined;
  if (old) {
    old.name = name;
    old.bizIds = bizIds;
    return old;
  }
  const g: ChainGroup = { id: 'g' + Date.now().toString(36), type, name, bizIds };
  s.chainGroups.push(g);
  return g;
}

export const deleteGroup = (s: GameState, id: string) => (s.chainGroups = (s.chainGroups ?? []).filter((g) => g.id !== id));

/** Mette o toglie un prodotto in tutti i negozi del gruppo (dove si può). Quanti cambiati e perché gli altri no. */
export function groupProduct(s: GameState, bizs: Business[], pid: ProductId, add: boolean) {
  const r = { done: 0, locked: 0, full: 0, last: 0 };
  for (const b of bizs) {
    const has = b.products.includes(pid);
    if (add) {
      if (has) continue;
      if (productLevel(b.type, pid) > upg(b, 'ampliamento')) r.locked++;
      else if (b.products.length >= menuSlots(b)) r.full++;
      else {
        b.products.push(pid);
        resetBizStats(s, b, `messo in vendita ${PRODUCTS[pid].name}`);
        r.done++;
      }
    } else if (has) {
      if (b.products.length <= 1) r.last++;
      else {
        b.products = b.products.filter((x) => x !== pid);
        resetBizStats(s, b, `tolto dalla vendita ${PRODUCTS[pid].name}`);
        r.done++;
      }
    }
  }
  return r;
}

/** Il prossimo livello di una miglioria si può comprare in questo negozio (spazio sul muro compreso)? */
export function canUpgrade(b: Business, id: UpgradeId) {
  if (upg(b, id) >= UPGRADES[id].max) return false;
  if ((id === 'fuochi' || id === 'banco') && hasInterior(b.type)) {
    return extraRoom(b.type, Math.min(2, upg(b, 'ampliamento')), upg(b, 'fuochi'), upg(b, 'banco')) > 0;
  }
  return true;
}

/** Costo per migliorare di un livello tutti i negozi del gruppo che possono. */
export const groupUpgradeCost = (bizs: Business[], id: UpgradeId) =>
  bizs.filter((b) => canUpgrade(b, id)).reduce((a, b) => a + UPGRADES[id].cost(upg(b, id)), 0);

/** Migliora di un livello ogni negozio del gruppo (finché bastano i soldi). */
export function groupUpgrade(s: GameState, bizs: Business[], id: UpgradeId) {
  const r = { done: 0, skipped: 0, spent: 0 };
  for (const b of bizs) {
    if (!canUpgrade(b, id)) {
      r.skipped++;
      continue;
    }
    const cost = UPGRADES[id].cost(upg(b, id));
    if (s.money < cost) {
      r.skipped++;
      continue;
    }
    if (buyUpgrade(s, b, id)) {
      r.done++;
      r.spent += cost;
    }
  }
  return r;
}

/** Riempie il magazzino di ogni prodotto in vendita in tutti i negozi del gruppo. */
export function groupFill(s: GameState, bizs: Business[]) {
  const before = s.money;
  let items = 0;
  for (const b of bizs) for (const p of b.products) items += buyStock(s, b, p, stockCap(b));
  return { items, spent: before - s.money };
}

/** I servizi (pulizie, traslochi) e il laboratorio non hanno un menù da riempire. */
export const hasMenu = (type: BusinessType) => bizType(type).kind === 'truck' || bizType(type).kind === 'shop';
