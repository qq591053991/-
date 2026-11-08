export interface WaveDef {
  duration: number; // 秒；Boss 波为 0（击败 Boss 后结束）
  interval: number; // 每组刷怪间隔
  group: [number, number];
  pool: { id: string; w: number }[];
  boss?: string;
}

export interface StageDef {
  name: string;
  subtitle: string;
  paper: string;
  ink: string;
  mist: string;
}

export const STAGES: StageDef[] = [
  { name: '七玄门', subtitle: '神手谷外，野狼帮来犯', paper: '#e8e2cf', ink: '#2f3a2c', mist: 'rgba(70,110,70,0.10)' },
  { name: '血色禁地', subtitle: '五派试炼，妖兽横行', paper: '#e6d3c6', ink: '#3b1d1a', mist: 'rgba(150,30,30,0.10)' },
  { name: '乱星海', subtitle: '海域茫茫，魔头盘踞', paper: '#d5dde0', ink: '#1a2c38', mist: 'rgba(30,80,120,0.12)' },
];

export const WAVES: WaveDef[] = [
  { duration: 20, interval: 1.6, group: [2, 3], pool: [{ id: 'bandit', w: 1 }] },
  { duration: 25, interval: 1.45, group: [2, 4], pool: [{ id: 'bandit', w: 3 }, { id: 'wolf', w: 2 }] },
  { duration: 30, interval: 1.35, group: [3, 4], pool: [{ id: 'bandit', w: 3 }, { id: 'wolf', w: 2 }, { id: 'archer', w: 2 }] },
  { duration: 35, interval: 1.25, group: [3, 5], pool: [{ id: 'bandit', w: 3 }, { id: 'wolf', w: 2 }, { id: 'archer', w: 2 }, { id: 'corpse', w: 1 }] },
  { duration: 0, interval: 3.0, group: [2, 3], pool: [{ id: 'bandit', w: 2 }, { id: 'archer', w: 1 }], boss: 'modaifu' },

  { duration: 35, interval: 1.3, group: [3, 5], pool: [{ id: 'spider', w: 3 }, { id: 'wolf', w: 2 }, { id: 'beast', w: 1 }] },
  { duration: 40, interval: 1.2, group: [3, 5], pool: [{ id: 'spider', w: 3 }, { id: 'beast', w: 2 }, { id: 'corpse', w: 1 }, { id: 'wolf', w: 2 }] },
  { duration: 40, interval: 1.15, group: [4, 6], pool: [{ id: 'spider', w: 2 }, { id: 'beast', w: 2 }, { id: 'demon', w: 2 }, { id: 'wolf', w: 2 }] },
  { duration: 45, interval: 1.1, group: [4, 6], pool: [{ id: 'spider', w: 2 }, { id: 'beast', w: 2 }, { id: 'demon', w: 2 }, { id: 'corpse', w: 2 }] },
  { duration: 0, interval: 2.6, group: [2, 4], pool: [{ id: 'spider', w: 2 }, { id: 'wolf', w: 2 }], boss: 'wangchan' },

  { duration: 40, interval: 1.2, group: [4, 6], pool: [{ id: 'ghost', w: 3 }, { id: 'pirate', w: 2 }, { id: 'jiao', w: 1 }] },
  { duration: 45, interval: 1.1, group: [4, 6], pool: [{ id: 'ghost', w: 3 }, { id: 'pirate', w: 2 }, { id: 'jiao', w: 2 }, { id: 'demon', w: 1 }] },
  { duration: 45, interval: 1.05, group: [5, 7], pool: [{ id: 'ghost', w: 3 }, { id: 'pirate', w: 2 }, { id: 'jiao', w: 2 }, { id: 'demon', w: 2 }] },
  { duration: 50, interval: 1.0, group: [5, 7], pool: [{ id: 'ghost', w: 3 }, { id: 'pirate', w: 3 }, { id: 'jiao', w: 2 }, { id: 'demon', w: 2 }, { id: 'corpse', w: 1 }] },
  { duration: 0, interval: 2.4, group: [3, 4], pool: [{ id: 'ghost', w: 3 }, { id: 'pirate', w: 1 }], boss: 'jiyin' },
];

export const TOTAL_WAVES = WAVES.length;

export function stageOf(wave: number): number {
  return Math.min(STAGES.length - 1, Math.floor((wave - 1) / 5));
}

/** 普通敌人随波数成长的倍率。 */
export function enemyScale(wave: number): { hp: number; dmg: number } {
  const w = wave - 1;
  return { hp: 1 + 0.18 * w + 0.012 * w * w, dmg: 1 + 0.07 * w };
}
