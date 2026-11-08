import type { EnemyDef } from '../data/enemies';
import type { WeaponId } from '../data/weapons';

export type GameState = 'title' | 'select' | 'playing' | 'paused' | 'levelup' | 'shop' | 'gameover' | 'victory';

export type Rarity = 0 | 1 | 2 | 3;

export interface Stats {
  maxHp: number;
  regen: number; // 每秒回复
  armor: number;
  speed: number; // 移速加成 %
  damage: number; // 伤害加成 %
  attackSpeed: number; // 攻速加成 %
  crit: number; // 暴击率 0..1
  critDmg: number; // 暴击额外倍率（基础 0.5 → 1.5 倍）
  pickup: number; // 神识/拾取半径 px
  lifesteal: number; // 每次命中回 1 血的概率 0..1
  luck: number; // 机缘
  expGain: number; // 修为获取 %
  goldGain: number; // 灵石获取 %
  dashCd: number; // 遁术冷却缩减 %
}

export function baseStats(): Stats {
  return {
    maxHp: 60,
    regen: 0,
    armor: 0,
    speed: 0,
    damage: 0,
    attackSpeed: 0,
    crit: 0.03,
    critDmg: 0.5,
    pickup: 70,
    lifesteal: 0,
    luck: 0,
    expGain: 0,
    goldGain: 0,
    dashCd: 0,
  };
}

/** 主修功法：青元剑诀，鼠标瞄准手动释放。 */
export interface MainAttack {
  damage: number;
  rate: number; // 每秒次数
  projectiles: number;
  pierce: number;
  speed: number;
  life: number;
}

export interface Player {
  x: number;
  y: number;
  r: number;
  hp: number;
  aim: number;
  iframes: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  fireCd: number;
  moving: boolean;
}

export interface WeaponInst {
  id: WeaponId;
  tier: Rarity;
  cd: number;
}

export type ProjKind = 'sword' | 'fire' | 'wind' | 'blade' | 'bug';

export interface Projectile {
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  pierce: number;
  life: number;
  hit: Set<Enemy>;
  color: string;
  explode?: number;
  returning?: boolean;
  travel?: number;
  maxTravel?: number;
  target?: Enemy | null;
  dead?: boolean;
}

export interface Enemy {
  def: EnemyDef;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  kbx: number;
  kby: number;
  flash: number;
  shootCd: number;
  state: number;
  stateT: number;
  dirX: number;
  dirY: number;
  orbitCd: number;
  wobble: number;
  dead: boolean;
  boss: boolean;
  // Boss 专用
  pIdx: number;
  pT: number;
  pSub: number;
  pTimer: number;
  spin: number;
  enraged: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  color: string;
  accel?: number;
  dead?: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  value: number;
  magnet: boolean;
  vx: number;
  vy: number;
}

export interface SpawnMarker {
  x: number;
  y: number;
  t: number;
  def: EnemyDef;
  boss: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}

export interface Bolt {
  points: { x: number; y: number }[];
  life: number;
}

export interface Offer {
  kind: 'weapon' | 'item';
  id: string;
  tier: Rarity;
  price: number;
  sold: boolean;
}

export interface LevelChoice {
  id: string;
  rarity: Rarity;
  name: string;
  desc: string;
  apply: () => void;
}
