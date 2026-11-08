import { ITEMS, itemPrice } from '../data/items';
import { rollRarity } from '../data/rarity';
import { UPGRADES } from '../data/upgrades';
import { MAX_WEAPONS, WEAPON_IDS, weaponPrice } from '../data/weapons';
import { pick, pickWeighted } from '../core/math';
import type { LevelChoice, MainAttack, Offer, Rarity, Stats, WeaponInst } from './types';

export interface ShopCtx {
  wave: number;
  stats: Stats;
  weapons: WeaponInst[];
}

export function genOffer(c: ShopCtx): Offer {
  const rarity = rollRarity(c.wave, c.stats.luck);
  if (Math.random() < 0.4) {
    const candidates = WEAPON_IDS.filter((id) => {
      const owned = c.weapons.find((w) => w.id === id);
      return owned ? owned.tier < 3 : c.weapons.length < MAX_WEAPONS;
    });
    if (candidates.length) {
      const id = pick(candidates);
      return { kind: 'weapon', id, tier: rarity, price: weaponPrice(id, rarity, c.wave), sold: false };
    }
  }
  for (let r = rarity; r >= 0; r--) {
    const pool = ITEMS.filter((i) => i.rarity === r);
    if (pool.length) {
      const it = pick(pool);
      return { kind: 'item', id: it.id, tier: r as Rarity, price: itemPrice(it.id, c.wave), sold: false };
    }
  }
  const it = ITEMS[0];
  return { kind: 'item', id: it.id, tier: 0, price: itemPrice(it.id, c.wave), sold: false };
}

export function genOffers(c: ShopCtx, n = 4): Offer[] {
  return Array.from({ length: n }, () => genOffer(c));
}

export function genLevelChoices(stats: Stats, main: MainAttack, level: number, n = 4): LevelChoice[] {
  const ctx = { stats, main };
  const used = new Set<string>();
  const out: LevelChoice[] = [];
  for (let guard = 0; out.length < n && guard < 50; guard++) {
    let rarity = rollRarity(level, stats.luck, 0.8);
    let pool = UPGRADES.filter((u) => !used.has(u.id) && (u.available?.(ctx) ?? true) && u.values[rarity] != null);
    while (!pool.length && rarity > 0) {
      rarity = (rarity - 1) as Rarity;
      pool = UPGRADES.filter((u) => !used.has(u.id) && (u.available?.(ctx) ?? true) && u.values[rarity] != null);
    }
    if (!pool.length) break;
    const def = pickWeighted(pool.map((u) => ({ item: u, w: u.weight ?? 1 })));
    const v = def.values[rarity] as number;
    used.add(def.id);
    out.push({ id: def.id, rarity, name: def.name, desc: def.desc(v), apply: () => def.apply(ctx, v) });
  }
  return out;
}

/** 购买法宝：已拥有则提升品阶（买到更高品阶时直接替换），否则占用新栏位。返回是否成功。 */
export function applyWeaponPurchase(weapons: WeaponInst[], id: string, tier: Rarity): boolean {
  const owned = weapons.find((w) => w.id === id);
  if (owned) {
    if (owned.tier >= 3) return false;
    owned.tier = (tier > owned.tier ? tier : owned.tier + 1) as Rarity;
    return true;
  }
  if (weapons.length >= MAX_WEAPONS) return false;
  weapons.push({ id: id as WeaponInst['id'], tier, cd: 0 });
  return true;
}

export function rerollCostFor(wave: number, times: number): number {
  return Math.floor(2 + wave * 0.8) + times * 2;
}

export function lingyeUpgradeCost(tier: Rarity): number {
  return tier + 1;
}

export function lingyeSellValue(wave: number): number {
  return 10 + wave * 4;
}
