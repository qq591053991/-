import type { Rarity, Stats } from '../game/types';

export interface ItemDef {
  id: string;
  name: string;
  glyph: string;
  rarity: Rarity;
  desc: string;
  apply: (s: Stats) => void;
}

export const ITEMS: ItemDef[] = [
  { id: 'huanglong', name: '黄龙丹', glyph: '丹', rarity: 0, desc: '修为获取 +12%，生命上限 +3', apply: (s) => { s.expGain += 12; s.maxHp += 3; } },
  { id: 'huichun', name: '回春丹', glyph: '春', rarity: 0, desc: '生命回复 +0.4/秒', apply: (s) => { s.regen += 0.4; } },
  { id: 'jingang', name: '金刚符', glyph: '金', rarity: 0, desc: '护甲 +2', apply: (s) => { s.armor += 2; } },
  { id: 'jifeng', name: '疾风符', glyph: '疾', rarity: 0, desc: '移速 +6%', apply: (s) => { s.speed += 6; } },
  { id: 'qingling', name: '清灵散', glyph: '散', rarity: 0, desc: '攻速 +6%', apply: (s) => { s.attackSpeed += 6; } },
  { id: 'shenshi', name: '神识丹', glyph: '识', rarity: 0, desc: '拾取范围 +25', apply: (s) => { s.pickup += 25; } },
  { id: 'gengjing', name: '庚精', glyph: '庚', rarity: 1, desc: '伤害 +8%', apply: (s) => { s.damage += 8; } },
  { id: 'xuejing', name: '血精丹', glyph: '血', rarity: 1, desc: '吸血 +3%', apply: (s) => { s.lifesteal += 0.03; } },
  { id: 'dingyan', name: '定颜丹', glyph: '颜', rarity: 1, desc: '生命上限 +10，生命回复 +0.2/秒', apply: (s) => { s.maxHp += 10; s.regen += 0.2; } },
  { id: 'juling', name: '聚灵阵盘', glyph: '阵', rarity: 1, desc: '灵石获取 +12%，机缘 +5', apply: (s) => { s.goldGain += 12; s.luck += 5; } },
  { id: 'tianlei', name: '天雷竹', glyph: '竹', rarity: 2, desc: '暴击率 +5%，暴击伤害 +25%', apply: (s) => { s.crit += 0.05; s.critDmg += 0.25; } },
  { id: 'lingru', name: '千年灵乳', glyph: '乳', rarity: 2, desc: '生命上限 +25，护甲 +1', apply: (s) => { s.maxHp += 25; s.armor += 1; } },
  { id: 'yanghun', name: '养魂木', glyph: '魂', rarity: 2, desc: '遁术冷却 -12%，拾取 +30，伤害 +4%', apply: (s) => { s.dashCd += 12; s.pickup += 30; s.damage += 4; } },
  { id: 'zhuji', name: '筑基丹', glyph: '基', rarity: 3, desc: '生命上限 +30，伤害 +10%，攻速 +10%', apply: (s) => { s.maxHp += 30; s.damage += 10; s.attackSpeed += 10; } },
  { id: 'xutian', name: '虚天鼎', glyph: '鼎', rarity: 3, desc: '护甲 +6，生命回复 +1.5/秒', apply: (s) => { s.armor += 6; s.regen += 1.5; } },
  { id: 'fenglei', name: '风雷翅', glyph: '翅', rarity: 3, desc: '移速 +12%，遁术冷却 -20%，攻速 +8%', apply: (s) => { s.speed += 12; s.dashCd += 20; s.attackSpeed += 8; } },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const ITEM_RARITY_PRICE = [15, 30, 55, 90] as const;

export function itemPrice(id: string, wave: number): number {
  return Math.round(ITEM_RARITY_PRICE[ITEM_BY_ID[id].rarity] * (1 + 0.12 * (wave - 1)));
}
