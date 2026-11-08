import { ENEMIES, type EnemyDef } from '../data/enemies';
import { TAU, rand } from '../core/math';
import type { Enemy } from './types';
import type { Game } from './game';

type PatType = 'spread' | 'fan' | 'ring' | 'slowring' | 'spiral' | 'summon' | 'dash' | 'rest';
interface Pat {
  type: PatType;
  dur: number;
  n?: number;
  id?: string;
  arms?: number;
}

const SCRIPTS: Record<string, { normal: Pat[]; enraged: Pat[] }> = {
  modaifu: {
    normal: [
      { type: 'spread', dur: 1.6, n: 5 },
      { type: 'rest', dur: 0.6 },
      { type: 'ring', dur: 2.0, n: 14 },
      { type: 'rest', dur: 0.6 },
      { type: 'summon', dur: 0.4, id: 'bandit', n: 4 },
      { type: 'rest', dur: 0.8 },
    ],
    enraged: [
      { type: 'spread', dur: 1.5, n: 7 },
      { type: 'spiral', dur: 2.6, arms: 2 },
      { type: 'rest', dur: 0.4 },
      { type: 'ring', dur: 2.0, n: 18 },
      { type: 'summon', dur: 0.4, id: 'archer', n: 3 },
      { type: 'rest', dur: 0.6 },
    ],
  },
  wangchan: {
    normal: [
      { type: 'dash', dur: 0, n: 3 },
      { type: 'rest', dur: 0.7 },
      { type: 'spiral', dur: 3.0, arms: 3 },
      { type: 'rest', dur: 0.6 },
      { type: 'ring', dur: 2.0, n: 18 },
      { type: 'summon', dur: 0.4, id: 'spider', n: 3 },
      { type: 'rest', dur: 0.6 },
    ],
    enraged: [
      { type: 'dash', dur: 0, n: 4 },
      { type: 'rest', dur: 0.4 },
      { type: 'spiral', dur: 3.0, arms: 4 },
      { type: 'fan', dur: 1.8, n: 9 },
      { type: 'summon', dur: 0.4, id: 'wolf', n: 5 },
      { type: 'rest', dur: 0.5 },
    ],
  },
  jiyin: {
    normal: [
      { type: 'spiral', dur: 4.0, arms: 2 },
      { type: 'rest', dur: 0.6 },
      { type: 'slowring', dur: 2.6, n: 24 },
      { type: 'fan', dur: 1.8, n: 9 },
      { type: 'summon', dur: 0.4, id: 'ghost', n: 6 },
      { type: 'rest', dur: 0.8 },
    ],
    enraged: [
      { type: 'spiral', dur: 4.0, arms: 3 },
      { type: 'slowring', dur: 2.6, n: 30 },
      { type: 'dash', dur: 0, n: 2 },
      { type: 'fan', dur: 1.8, n: 11 },
      { type: 'summon', dur: 0.4, id: 'ghost', n: 8 },
      { type: 'rest', dur: 0.5 },
    ],
  },
};

const BULLET_RED = '#c0392b';

function bulletColor(def: EnemyDef): string {
  if (def.id === 'demon' || def.id === 'jiyin') return '#7b2fa0';
  if (def.id === 'pirate' || def.id === 'jiao') return '#1f6fa0';
  return BULLET_RED;
}

export function updateEnemy(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  let mx = 0;
  let my = 0;
  let spd = e.speed;

  if (e.orbitCd > 0) e.orbitCd -= dt;
  if (e.flash > 0) e.flash -= dt;

  switch (e.def.behavior) {
    case 'chase':
    case 'tank':
      mx = nx;
      my = ny;
      break;
    case 'ghost': {
      e.wobble += dt * 3.5;
      const s = Math.sin(e.wobble) * 0.8;
      mx = nx - ny * s;
      my = ny + nx * s;
      break;
    }
    case 'ranged': {
      const keep = e.def.keepDist ?? 250;
      if (d > keep + 40) {
        mx = nx;
        my = ny;
      } else if (d < keep - 40) {
        mx = -nx;
        my = -ny;
      } else {
        const s = Math.sin(e.wobble) > 0 ? 1 : -1;
        mx = -ny * s;
        my = nx * s;
        spd *= 0.6;
        e.wobble += dt * 0.5;
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && e.def.shoot) {
        e.shootCd = e.def.shoot.cd * rand(0.85, 1.15);
        shoot(g, e, Math.atan2(dy, dx));
      }
      break;
    }
    case 'charger':
      if (e.state === 0) {
        mx = nx;
        my = ny;
        e.stateT -= dt;
        if (d < 320 && e.stateT <= 0) {
          e.state = 1;
          e.stateT = 0.6;
          e.dirX = nx;
          e.dirY = ny;
        }
      } else if (e.state === 1) {
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 2;
          e.stateT = 0.45;
        }
      } else {
        mx = e.dirX;
        my = e.dirY;
        spd = e.speed * 5;
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 0;
          e.stateT = 1.4;
        }
      }
      break;
    case 'boss': {
      const mv = updateBoss(g, e, dt, nx, ny, d);
      mx = mv.x;
      my = mv.y;
      spd = mv.spd;
      break;
    }
  }

  e.x += (mx * spd + e.kbx) * dt;
  e.y += (my * spd + e.kby) * dt;
  const decay = Math.min(1, dt * 10);
  e.kbx -= e.kbx * decay;
  e.kby -= e.kby * decay;
  g.clampToArena(e, e.r);
}

function shoot(g: Game, e: Enemy, ang: number): void {
  const s = e.def.shoot;
  if (!s) return;
  const color = bulletColor(e.def);
  if (s.pattern === 'aim') {
    g.fireBullet(e.x, e.y, ang, s.speed, e.dmg, 6, color);
  } else if (s.pattern === 'spread') {
    g.spreadBullets(e.x, e.y, ang, s.count ?? 3, s.arc ?? 0.5, s.speed, e.dmg, color);
  } else {
    g.ringBullets(e.x, e.y, s.count ?? 8, s.speed, e.dmg, rand(0, TAU), color);
  }
}

function updateBoss(g: Game, e: Enemy, dt: number, nx: number, ny: number, d: number): { x: number; y: number; spd: number } {
  const key = e.def.bossKey ?? 'modaifu';
  const script = SCRIPTS[key];
  if (!e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    e.pIdx = 0;
    e.pT = 0;
    e.pSub = 0;
    e.pTimer = 0;
    e.state = 0;
    g.onBossEnrage(e);
  }
  const pats = e.enraged ? script.enraged : script.normal;
  const pat = pats[e.pIdx % pats.length];
  const sm = e.enraged ? 1.15 : 1;
  const ang = Math.atan2(ny, nx);
  const color = bulletColor(e.def);
  let canMove = true;

  e.pT += dt;
  e.pTimer -= dt;

  switch (pat.type) {
    case 'spread':
      if (e.pTimer <= 0 && e.pSub < 3) {
        e.pTimer = 0.45;
        e.pSub++;
        g.spreadBullets(e.x, e.y, ang, pat.n ?? 5, 0.7, 230 * sm, e.dmg, color);
      }
      break;
    case 'fan':
      if (e.pTimer <= 0 && e.pSub < 3) {
        e.pTimer = 0.55;
        e.pSub++;
        g.spreadBullets(e.x, e.y, ang, pat.n ?? 9, 1.3, 200 * sm, e.dmg, color);
      }
      break;
    case 'ring':
      if (e.pTimer <= 0 && e.pSub < 3) {
        e.pTimer = 0.6;
        const n = pat.n ?? 14;
        g.ringBullets(e.x, e.y, n, 170 * sm, e.dmg, (e.pSub * Math.PI) / n, color);
        e.pSub++;
      }
      break;
    case 'slowring':
      if (e.pTimer <= 0 && e.pSub < 3) {
        e.pTimer = 0.8;
        const n = pat.n ?? 24;
        g.ringBullets(e.x, e.y, n, 90 * sm, e.dmg, (e.pSub * Math.PI) / n, color, 70);
        e.pSub++;
      }
      break;
    case 'spiral':
      canMove = false;
      if (e.pTimer <= 0) {
        e.pTimer = 0.075;
        const arms = pat.arms ?? 2;
        for (let k = 0; k < arms; k++) g.fireBullet(e.x, e.y, e.spin + (k * TAU) / arms, 190 * sm, e.dmg, 6, color);
        e.spin += 0.21;
      }
      break;
    case 'summon':
      if (e.pSub === 0) {
        e.pSub = 1;
        const def = ENEMIES[pat.id ?? 'bandit'];
        for (let i = 0; i < (pat.n ?? 3); i++) {
          const a = (i / (pat.n ?? 3)) * TAU;
          g.addSpawnMarker(def, e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80, false, 0.6);
        }
      }
      break;
    case 'dash':
      canMove = false;
      if (e.state === 0) {
        e.state = 1;
        e.stateT = 0.55;
        e.dirX = nx;
        e.dirY = ny;
      } else if (e.state === 1) {
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 2;
          e.stateT = 0.42;
        }
      } else if (e.state === 2) {
        e.stateT -= dt;
        if (e.pTimer <= 0) {
          e.pTimer = 0.09;
          const a = Math.atan2(e.dirY, e.dirX);
          g.fireBullet(e.x, e.y, a + Math.PI / 2, 90, e.dmg, 6, color);
          g.fireBullet(e.x, e.y, a - Math.PI / 2, 90, e.dmg, 6, color);
        }
        if (e.stateT <= 0) {
          e.state = 3;
          e.stateT = 0.3;
        }
        return { x: e.dirX, y: e.dirY, spd: 600 * sm };
      } else {
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 0;
          e.pSub++;
        }
      }
      break;
    case 'rest':
      break;
  }

  const finished = pat.type === 'dash' ? e.pSub >= (pat.n ?? 3) && e.state === 0 : e.pT >= pat.dur;
  if (finished) {
    e.pIdx++;
    e.pT = 0;
    e.pSub = 0;
    e.pTimer = 0;
    e.state = 0;
  }

  if (!canMove) return { x: 0, y: 0, spd: 0 };
  const keep = 230;
  const spd = e.speed * sm;
  if (d > keep + 30) return { x: nx, y: ny, spd };
  if (d < keep - 60) return { x: -nx * 0.6, y: -ny * 0.6, spd };
  return { x: -ny * 0.5, y: nx * 0.5, spd };
}

/** 冲锋型敌人与 Boss 冲刺前的预警线是否需要绘制。 */
export function isTelegraphing(e: Enemy): boolean {
  return e.state === 1 && (e.def.behavior === 'charger' || e.def.behavior === 'boss');
}
