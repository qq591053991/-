import { WEAPONS } from '../data/weapons';
import { TAU, dist2, rand } from '../core/math';
import type { Enemy, Projectile, WeaponInst } from './types';
import type { Game } from './game';

export function orbitRadius(count: number): number {
  return 58 + count * 4;
}

export function updateWeapons(g: Game, dt: number): void {
  const p = g.player;
  const atk = g.atkMult();
  g.orbitAngle += dt * 3.4;

  for (const w of g.weapons) {
    const def = WEAPONS[w.id];
    const t = w.tier;
    if (w.id === 'fengyun') {
      orbitHits(g, w);
      continue;
    }
    w.cd -= dt * atk;
    if (w.cd > 0) continue;
    const target = g.nearestEnemy(p.x, p.y, def.range);
    if (!target) {
      w.cd = 0;
      continue;
    }
    w.cd = def.cooldown[t];
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    const dmg = def.damage[t];

    switch (w.id) {
      case 'jinfu': {
        const n = def.extra[t];
        for (let i = 0; i < n; i++) {
          const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * 0.6 : 0);
          g.projectiles.push(makeProj('blade', p.x, p.y, a, 520, 9, dmg, 999, 3, def.color, { maxTravel: def.range, travel: 0 }));
        }
        break;
      }
      case 'huodan':
        g.projectiles.push(makeProj('fire', p.x, p.y, ang, 480, 8, dmg, 0, def.range / 480, def.color, { explode: def.extra[t] }));
        break;
      case 'fengren':
        g.projectiles.push(makeProj('wind', p.x, p.y, ang, 760, 7, dmg, def.extra[t], def.range / 760 + 0.1, def.color));
        break;
      case 'shijin': {
        const n = def.extra[t];
        for (let i = 0; i < n; i++) {
          const a = ang + rand(-1.2, 1.2);
          g.projectiles.push(makeProj('bug', p.x, p.y, a, 300, 5, dmg, 2, 4, def.color, { target }));
        }
        break;
      }
      case 'leifu':
        chainLightning(g, target, dmg, def.extra[t]);
        break;
    }
  }
}

function makeProj(
  kind: Projectile['kind'], x: number, y: number, ang: number, speed: number, r: number,
  dmg: number, pierce: number, life: number, color: string, extra: Partial<Projectile> = {},
): Projectile {
  return { kind, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, dmg, pierce, life, hit: new Set(), color, ...extra };
}

function orbitHits(g: Game, w: WeaponInst): void {
  const def = WEAPONS.fengyun;
  const n = def.extra[w.tier];
  const rad = orbitRadius(n);
  const p = g.player;
  for (let i = 0; i < n; i++) {
    const a = g.orbitAngle + (i * TAU) / n;
    const sx = p.x + Math.cos(a) * rad;
    const sy = p.y + Math.sin(a) * rad;
    for (const e of g.enemies) {
      if (e.dead || e.orbitCd > 0) continue;
      const rr = e.r + 12;
      if (dist2(sx, sy, e.x, e.y) < rr * rr) {
        e.orbitCd = def.cooldown[w.tier];
        g.damageEnemy(e, def.damage[w.tier], sx, sy, 120);
      }
    }
  }
}

function chainLightning(g: Game, first: Enemy, dmg: number, chains: number): void {
  const pts = [{ x: g.player.x, y: g.player.y }];
  const hit = new Set<Enemy>();
  let cur: Enemy | null = first;
  for (let i = 0; i <= chains && cur; i++) {
    hit.add(cur);
    pts.push({ x: cur.x, y: cur.y });
    const from: Enemy = cur;
    g.damageEnemy(from, dmg, from.x, from.y, 40);
    cur = null;
    let best = 170 * 170;
    for (const e of g.enemies) {
      if (e.dead || hit.has(e)) continue;
      const d = dist2(from.x, from.y, e.x, e.y);
      if (d < best) {
        best = d;
        cur = e;
      }
    }
  }
  g.bolts.push({ points: pts, life: 0.15 });
  g.audio.play('thunder');
}
