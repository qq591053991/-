import type { Rarity } from '../game/types';

export type WeaponId = 'jinfu' | 'huodan' | 'fengren' | 'fengyun' | 'shijin' | 'leifu';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  glyph: string;
  color: string;
  basePrice: number;
  cooldown: readonly number[]; // 每个品阶
  damage: readonly number[];
  extra: readonly number[]; // 含义见 extraLabel
  extraLabel: string;
  range: number;
  desc: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  jinfu: {
    id: 'jinfu',
    name: '金蚨子母刃',
    glyph: '刃',
    color: '#d9a520',
    basePrice: 22,
    cooldown: [1.4, 1.25, 1.1, 0.9],
    damage: [12, 18, 27, 40],
    extra: [1, 1, 2, 3],
    extraLabel: '飞刃数',
    range: 360,
    desc: '子母双刃飞出后折返，往返皆可伤敌，无视穿透上限。',
  },
  huodan: {
    id: 'huodan',
    name: '火弹符',
    glyph: '火',
    color: '#e8582a',
    basePrice: 20,
    cooldown: [1.3, 1.15, 1.0, 0.8],
    damage: [14, 22, 33, 50],
    extra: [45, 55, 65, 80],
    extraLabel: '爆炸半径',
    range: 380,
    desc: '自动射向最近敌人，命中后爆开，波及周围。',
  },
  fengren: {
    id: 'fengren',
    name: '风刃符',
    glyph: '风',
    color: '#4fb39a',
    basePrice: 20,
    cooldown: [0.9, 0.8, 0.7, 0.55],
    damage: [9, 14, 21, 32],
    extra: [2, 3, 4, 6],
    extraLabel: '穿透',
    range: 400,
    desc: '高速风刃，可穿透多名敌人。',
  },
  fengyun: {
    id: 'fengyun',
    name: '青竹蜂云剑',
    glyph: '剑',
    color: '#3aa76d',
    basePrice: 30,
    cooldown: [0.35, 0.33, 0.31, 0.28],
    damage: [7, 11, 16, 24],
    extra: [2, 3, 4, 6],
    extraLabel: '飞剑数',
    range: 0,
    desc: '飞剑环绕周身，触之即伤。（冷却为对同一敌人的命中间隔）',
  },
  shijin: {
    id: 'shijin',
    name: '噬金虫',
    glyph: '虫',
    color: '#c7b14a',
    basePrice: 32,
    cooldown: [2.4, 2.2, 2.0, 1.6],
    damage: [5, 8, 12, 18],
    extra: [2, 3, 4, 6],
    extraLabel: '虫数',
    range: 450,
    desc: '放出噬金虫自动追咬敌人，每只可连咬三次。',
  },
  leifu: {
    id: 'leifu',
    name: '掌心雷',
    glyph: '雷',
    color: '#7a7cff',
    basePrice: 28,
    cooldown: [1.7, 1.5, 1.3, 1.1],
    damage: [13, 20, 30, 45],
    extra: [2, 3, 4, 6],
    extraLabel: '连锁',
    range: 380,
    desc: '雷光击中最近敌人，并在敌人之间跳跃连锁。',
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const MAX_WEAPONS = 6;
export const TIER_PRICE_MULT = [1, 2, 3.6, 6] as const;

export function weaponPrice(id: WeaponId, tier: Rarity, wave: number): number {
  return Math.round(WEAPONS[id].basePrice * TIER_PRICE_MULT[tier] * (1 + 0.12 * (wave - 1)));
}

export function weaponSummary(id: WeaponId, tier: Rarity): string {
  const w = WEAPONS[id];
  return `伤害 ${w.damage[tier]} · 冷却 ${w.cooldown[tier]}s · ${w.extraLabel} ${w.extra[tier]}`;
}
