import type { MainAttack, Stats } from '../game/types';

export interface UpgradeCtx {
  stats: Stats;
  main: MainAttack;
}

export interface UpgradeDef {
  id: string;
  name: string;
  /** 各稀有度的数值；null 表示该稀有度不出现 */
  values: readonly (number | null)[];
  desc: (v: number) => string;
  apply: (c: UpgradeCtx, v: number) => void;
  /** 是否还能出现（例如分光次数上限） */
  available?: (c: UpgradeCtx) => boolean;
  weight?: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'changchun', name: '长春功', values: [4, 7, 10, 14], desc: (v) => `生命上限 +${v}`, apply: (c, v) => { c.stats.maxHp += v; } },
  { id: 'qingyuan', name: '青元剑诀', values: [5, 8, 12, 16], desc: (v) => `伤害 +${v}%`, apply: (c, v) => { c.stats.damage += v; } },
  { id: 'zhayan', name: '眨眼剑法', values: [3, 5, 7, 10], desc: (v) => `暴击率 +${v}%`, apply: (c, v) => { c.stats.crit += v / 100; } },
  { id: 'luoyan', name: '罗烟步', values: [4, 6, 9, 12], desc: (v) => `移速 +${v}%`, apply: (c, v) => { c.stats.speed += v; } },
  { id: 'dayan', name: '大衍诀', values: [15, 25, 35, 50], desc: (v) => `神识（拾取范围）+${v}`, apply: (c, v) => { c.stats.pickup += v; } },
  { id: 'huichun', name: '回春术', values: [0.2, 0.35, 0.5, 0.75], desc: (v) => `生命回复 +${v}/秒`, apply: (c, v) => { c.stats.regen += v; } },
  { id: 'jingang', name: '金刚诀', values: [1, 2, 3, 4], desc: (v) => `护甲 +${v}`, apply: (c, v) => { c.stats.armor += v; } },
  { id: 'yuqi', name: '驭器诀', values: [5, 8, 11, 15], desc: (v) => `攻速 +${v}%`, apply: (c, v) => { c.stats.attackSpeed += v; } },
  { id: 'xueji', name: '血祭术', values: [1, 2, 3, 4], desc: (v) => `吸血 +${v}%`, apply: (c, v) => { c.stats.lifesteal += v / 100; } },
  { id: 'tianyan', name: '天眼术', values: [4, 6, 9, 13], desc: (v) => `机缘 +${v}`, apply: (c, v) => { c.stats.luck += v; } },
  {
    id: 'fenguang',
    name: '青元剑芒·分光',
    values: [null, null, 1, 1],
    desc: () => '剑芒数量 +1（扇形散射）',
    apply: (c) => { c.main.projectiles += 1; },
    available: (c) => c.main.projectiles < 5,
    weight: 0.6,
  },
  {
    id: 'touti',
    name: '青元剑芒·透体',
    values: [null, 1, 1, 2],
    desc: (v) => `剑芒穿透 +${v}`,
    apply: (c, v) => { c.main.pierce += v; },
    available: (c) => c.main.pierce < 4,
    weight: 0.6,
  },
  {
    id: 'jianmang',
    name: '青元剑芒·凝锋',
    values: [2, 3, 4, 6],
    desc: (v) => `剑芒基础伤害 +${v}`,
    apply: (c, v) => { c.main.damage += v; },
    weight: 0.8,
  },
];
