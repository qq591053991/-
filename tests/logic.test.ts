import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { rollRarity } from '../src/data/rarity';
import { expToNext, majorBreakthrough, realmName } from '../src/data/realms';
import { UPGRADES } from '../src/data/upgrades';
import { TOTAL_WAVES, WAVES, enemyScale } from '../src/data/waves';
import { ENEMIES } from '../src/data/enemies';
import { WEAPONS, WEAPON_IDS } from '../src/data/weapons';
import { applyWeaponPurchase, genLevelChoices, genOffers } from '../src/game/shop';
import { baseStats, type WeaponInst } from '../src/game/types';

describe('境界', () => {
  it('炼气十三层后进入筑基', () => {
    expect(realmName(0)).toBe('炼气一层');
    expect(realmName(12)).toBe('炼气十三层');
    expect(realmName(13)).toBe('筑基初期');
    expect(realmName(15)).toBe('筑基后期');
    expect(realmName(16)).toBe('结丹初期');
    expect(realmName(99)).toBe('化神大圆满');
  });
  it('只在大境界门槛触发突破', () => {
    expect(majorBreakthrough(12)).toBeNull();
    expect(majorBreakthrough(13)).toBe('筑基');
    expect(majorBreakthrough(14)).toBeNull();
    expect(majorBreakthrough(16)).toBe('结丹');
  });
  it('所需修为单调递增', () => {
    for (let l = 0; l < 30; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
  });
});

describe('数据完整性', () => {
  it('波次引用的敌人都存在，且每 5 波一个首领', () => {
    expect(TOTAL_WAVES).toBe(15);
    WAVES.forEach((w, i) => {
      for (const p of w.pool) expect(ENEMIES[p.id]).toBeDefined();
      if ((i + 1) % 5 === 0) {
        expect(w.boss).toBeDefined();
        expect(ENEMIES[w.boss as string].behavior).toBe('boss');
        expect(w.duration).toBe(0);
      } else {
        expect(w.boss).toBeUndefined();
        expect(w.duration).toBeGreaterThan(0);
      }
    });
  });
  it('法宝每个品阶都有数值', () => {
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      expect(w.cooldown).toHaveLength(4);
      expect(w.damage).toHaveLength(4);
      expect(w.extra).toHaveLength(4);
    }
  });
  it('宝物 id 唯一', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });
  it('敌人成长倍率随波数递增', () => {
    expect(enemyScale(1)).toEqual({ hp: 1, dmg: 1 });
    expect(enemyScale(10).hp).toBeGreaterThan(enemyScale(5).hp);
  });
});

describe('坊市与升级', () => {
  it('购买已持有法宝会升阶，满阶后无法购买', () => {
    const ws: WeaponInst[] = [{ id: 'huodan', tier: 0, cd: 0 }];
    expect(applyWeaponPurchase(ws, 'huodan', 0)).toBe(true);
    expect(ws[0].tier).toBe(1);
    expect(applyWeaponPurchase(ws, 'huodan', 3)).toBe(true);
    expect(ws[0].tier).toBe(3);
    expect(applyWeaponPurchase(ws, 'huodan', 0)).toBe(false);
  });
  it('法宝栏满时无法购买新法宝', () => {
    const ws: WeaponInst[] = WEAPON_IDS.map((id) => ({ id, tier: 0, cd: 0 }));
    const extra = ws.pop() as WeaponInst;
    ws.push({ ...ws[0] });
    expect(ws).toHaveLength(6);
    expect(applyWeaponPurchase(ws, extra.id, 0)).toBe(false);
  });
  it('货架生成 4 件且价格为正', () => {
    const offers = genOffers({ wave: 5, stats: baseStats(), weapons: [] });
    expect(offers).toHaveLength(4);
    for (const o of offers) expect(o.price).toBeGreaterThan(0);
  });
  it('升级选项不重复且可生效', () => {
    const stats = baseStats();
    const main = { damage: 10, rate: 3.5, projectiles: 1, pierce: 0, speed: 640, life: 0.6 };
    for (let i = 0; i < 50; i++) {
      const cs = genLevelChoices(stats, main, 10);
      expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
      expect(cs.length).toBe(4);
    }
    const before = JSON.stringify({ stats, main });
    genLevelChoices(stats, main, 10)[0].apply();
    expect(JSON.stringify({ stats, main })).not.toBe(before);
  });
  it('分光有次数上限', () => {
    const fen = UPGRADES.find((u) => u.id === 'fenguang');
    expect(fen?.available?.({ stats: baseStats(), main: { damage: 1, rate: 1, projectiles: 5, pierce: 0, speed: 1, life: 1 } })).toBe(false);
  });
  it('稀有度在合法范围内', () => {
    for (let i = 0; i < 500; i++) {
      const r = rollRarity(15, 50);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(3);
    }
    for (let i = 0; i < 200; i++) expect(rollRarity(1, 0)).toBeLessThanOrEqual(1);
  });
});

describe('摄像机与演出', async () => {
  const { Director, PRESETS, gameplayPose, lerpPose } = await import('../src/game/camera');
  const { introShots, enrageShots, deathShots } = await import('../src/game/cinematics');
  const game = gameplayPose(PRESETS[0], 600, 400);

  it('姿态插值取最短角度', () => {
    const a = { ...game, yaw: 3 };
    const b = { ...game, yaw: -3 };
    const mid = lerpPose(a, b, 0.5);
    expect(Math.abs(Math.abs(mid.yaw) - Math.PI)).toBeLessThan(0.3);
  });

  it('演出按镜头推进，最后回到战斗视角并结束', () => {
    const d = new Director();
    const shots = introShots('modaifu');
    d.play(shots, { x: 640, y: 200, h: 60 });
    expect(d.active).toBe(true);
    expect(d.timeScale).toBe(0);
    const total = shots.reduce((s, x) => s + x.dur, 0);
    let t = 0;
    while (t < total + 0.1) {
      d.pose(game);
      d.update(1 / 60);
      t += 1 / 60;
    }
    expect(d.active).toBe(false);
    expect(d.pose(game)).toEqual(game);
  });

  it('跳过会直接进入回到战斗的镜头', () => {
    const d = new Director();
    const shots = enrageShots('wangchan');
    d.play(shots, { x: 0, y: 0, h: 0 });
    d.skip();
    expect(d.idx).toBe(shots.length - 1);
    expect(d.timeScale).toBe(1);
  });

  it('每位首领三段演出都有镜头，伏诛为慢动作', () => {
    for (const k of ['modaifu', 'wangchan', 'jiyin'] as const) {
      expect(introShots(k).length).toBeGreaterThan(1);
      expect(enrageShots(k).length).toBeGreaterThan(1);
      const ds = deathShots(k);
      expect(ds[0].timeScale).toBeGreaterThan(0);
      expect(ds[0].timeScale).toBeLessThan(1);
    }
  });
});

describe('3D 模型', async () => {
  const { MODEL_IDS, createModel } = await import('../src/render3d/models');
  it('每种敌人和玩家都有对应模型', () => {
    for (const id of Object.keys(ENEMIES)) expect(MODEL_IDS).toContain(id);
    expect(MODEL_IDS).toContain('player');
  });
  it('模型可创建并能驱动动画', () => {
    for (const id of MODEL_IDS) {
      const m = createModel(id);
      expect(m.height).toBeGreaterThan(10);
      expect(m.root.children.length).toBeGreaterThan(0);
      m.update({ t: 1, dt: 1 / 60, phase: 2, speed: 1, action: 1, lean: 1 });
      m.setFlash(1);
      m.setTint('#ff0000');
      m.setOpacity(0.5);
    }
  });
});
