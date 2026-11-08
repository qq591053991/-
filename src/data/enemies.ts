export type Behavior = 'chase' | 'ranged' | 'charger' | 'tank' | 'ghost' | 'boss';
export type ShotPattern = 'aim' | 'spread' | 'ring';

export interface EnemyDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  drop: number;
  behavior: Behavior;
  keepDist?: number;
  shoot?: { pattern: ShotPattern; cd: number; speed: number; count?: number; arc?: number };
  bossKey?: 'modaifu' | 'wangchan' | 'jiyin';
}

export const ENEMIES: Record<string, EnemyDef> = {
  bandit: { id: 'bandit', name: '野狼帮众', glyph: '匪', color: '#5b4636', r: 15, hp: 10, speed: 85, dmg: 6, drop: 1, behavior: 'chase' },
  archer: {
    id: 'archer', name: '野狼帮箭手', glyph: '弓', color: '#6e5a3a', r: 14, hp: 8, speed: 70, dmg: 6, drop: 1, behavior: 'ranged', keepDist: 260,
    shoot: { pattern: 'aim', cd: 2.2, speed: 230 },
  },
  wolf: { id: 'wolf', name: '妖狼', glyph: '狼', color: '#55606b', r: 13, hp: 7, speed: 150, dmg: 5, drop: 1, behavior: 'chase' },
  corpse: { id: 'corpse', name: '铁甲尸', glyph: '尸', color: '#3f4a3c', r: 22, hp: 45, speed: 50, dmg: 12, drop: 3, behavior: 'tank' },
  spider: {
    id: 'spider', name: '血纹蛛', glyph: '蛛', color: '#7a2630', r: 15, hp: 18, speed: 80, dmg: 7, drop: 2, behavior: 'ranged', keepDist: 220,
    shoot: { pattern: 'spread', cd: 2.4, speed: 210, count: 3, arc: 0.5 },
  },
  demon: {
    id: 'demon', name: '魔道修士', glyph: '魔', color: '#4a2850', r: 16, hp: 26, speed: 70, dmg: 8, drop: 2, behavior: 'ranged', keepDist: 300,
    shoot: { pattern: 'ring', cd: 3.0, speed: 170, count: 8 },
  },
  beast: { id: 'beast', name: '赤鳞兽', glyph: '兽', color: '#8a3a1e', r: 18, hp: 30, speed: 60, dmg: 10, drop: 2, behavior: 'charger' },
  jiao: { id: 'jiao', name: '海中妖蛟', glyph: '蛟', color: '#1f4e6b', r: 19, hp: 40, speed: 65, dmg: 11, drop: 3, behavior: 'charger' },
  ghost: { id: 'ghost', name: '阴魂', glyph: '魂', color: '#3a3f6e', r: 14, hp: 16, speed: 115, dmg: 7, drop: 1, behavior: 'ghost' },
  pirate: {
    id: 'pirate', name: '乱星海散修', glyph: '修', color: '#2c5a5a', r: 15, hp: 22, speed: 80, dmg: 8, drop: 2, behavior: 'ranged', keepDist: 240,
    shoot: { pattern: 'spread', cd: 2.0, speed: 250, count: 5, arc: 0.8 },
  },

  modaifu: { id: 'modaifu', name: '墨大夫', glyph: '墨', color: '#2b2b2b', r: 34, hp: 1100, speed: 70, dmg: 10, drop: 40, behavior: 'boss', bossKey: 'modaifu' },
  wangchan: { id: 'wangchan', name: '鬼灵门少主·王蝉', glyph: '蝉', color: '#6b1020', r: 34, hp: 3400, speed: 80, dmg: 14, drop: 80, behavior: 'boss', bossKey: 'wangchan' },
  jiyin: { id: 'jiyin', name: '极阴老祖', glyph: '阴', color: '#1d1b3a', r: 38, hp: 8000, speed: 75, dmg: 18, drop: 0, behavior: 'boss', bossKey: 'jiyin' },
};
