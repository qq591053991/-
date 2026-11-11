'use strict';
/* 凡人问道 —— 敌人：生成、波次、各类 AI 与四位首领的招式 */
(function () {
  const G = window.G, U = G.U, W = G.World, T = G.TILE, TAU = G.TAU;
  const E = G.Ent, FX = G.FX, Au = G.Audio;

  const FLY_Z = { bat: 26, skull: 18, wraith: 6, yinhun: 6, firespirit: 8 };
  const HPM = [1.6, 2.3, 3.4, 5.6], DMGM = [1, 1.25, 1.5, 1.8];
  const SHOT_C = { arrow: '235,225,195', fire: '255,140,60', bolt: '255,190,90', orb: '255,90,90', ice: '90,140,255' };

  /* ============================ 生成 ============================ */
  E.spawnEnemy = function (key, x, y, o = {}) {
    const boss = !!G.Bosses[key];
    const def = boss ? G.Bosses[key] : G.Enemies[key];
    // 杂兵随章节成长（首领的数值直接写在数据表里）
    const ch = G.Game.room.chapter || 0;
    const hp = boss ? def.hp : Math.round(def.hp * HPM[ch]), dmg = boss ? def.dmg : Math.round(def.dmg * DMGM[ch]);
    const e = {
      key, def, boss, x, y, z: FLY_Z[key] || 0, r: def.r, hp, maxHp: hp, dmg, spd: def.spd,
      face: Math.PI / 2, t: U.rand(10), st: 'spawn', stT: o.delay === undefined ? U.rand(0.7, 1.1) : o.delay,
      cd: U.rand(0.3, 1.1), flash: 0, slowT: 0, burnT: 0, burnTick: 0, stunT: 0, invT: 0, kx: 0, ky: 0,
      moving: false, wind: 0, atk: 0, alpha: 1, scale: def.scale || 1, touchCd: 0, strafe: U.chance(0.5) ? 1 : -1,
      mode: def.fly ? 2 : 1,
    };
    if (o.elite) {
      e.elite = true; e.hp = e.maxHp = Math.round(hp * 2.8); e.dmg = Math.round(dmg * 1.25);
      e.scale *= 1.28; e.r *= 1.15;
      e.affix = U.pick(['swift', 'burst', 'horde']);
      if (e.affix === 'swift') e.spd *= 1.35;
    }
    if (boss) {
      e.phase = 1; e.pat = null; e.pt = 0; e.pv = {}; e.idleDur = 1.4; e.used = {};
      const B = BOSS[key]; if (B.init) B.init(e);
    }
    G.Game.room.enemies.push(e);
    return e;
  };

  E.makeWaves = function (room) {
    const ch = G.Chapters[room.chapter], pool = ch.pool;
    let budget = [6.5, 9, 11, 12.5][room.chapter] + room.depth * 0.5;
    if (room.type === 'elite') budget *= 1.1;
    let nW = budget > 6.5 ? (U.chance(0.4) ? 3 : 2) : U.chance(0.55) ? 2 : 1;
    if (room.zones) { // 大图：至多四片空地里有埋伏，其余的是安静的；敌人总数相应增加
      nW = Math.min(4, room.zones.length); budget *= 1 + 0.22 * (nW - 2);
      const quiet = U.shuffle(room.zones.slice()).slice(nW); for (const z of quiet) z.done = true;
    }
    const waves = [];
    for (let i = 0; i < nW; i++) {
      let b = (budget / nW) * (i === nW - 1 ? 1.15 : 0.95);
      const types = U.shuffle(pool.slice()).slice(0, U.randi(2, 3));
      const w = []; let guard = 0;
      while (b > 0.4 && guard++ < 40 && w.length < 9) {
        const k = U.pick(types), d = G.Enemies[k];
        if (d.cost > b + 0.6) { if (types.every((t) => G.Enemies[t].cost > b + 0.6)) break; continue; }
        if ((d.ai === 'turret' || d.ai === 'tank') && w.filter((x) => x.key === k).length >= 2) continue;
        w.push({ key: k }); b -= d.cost;
      }
      if (!w.length) w.push({ key: pool[0] });
      waves.push(w);
    }
    if (room.type === 'elite') {
      const cand = pool.filter((k) => !['turret', 'exploder', 'swarm'].includes(G.Enemies[k].ai));
      waves[waves.length - 1].unshift({ key: U.pick(cand), elite: true });
    }
    room.waves = waves; room.waveI = 0;
  };

  E.spawnWave = function (room, zone) { // zone：这一波埋伏在哪片空地（大图）
    const p = G.Game.player, w = room.waves[room.waveI++];
    if (!w) return;
    for (const s of w) {
      const pos = zone ? W.randomFloorNear(room, zone.x * T, zone.y * T, Math.max(zone.rx, zone.ry) * T, p.x, p.y, 170) : room.zones ? W.randomFloorNear(room, p.x, p.y, 420, p.x, p.y, 200) : W.randomFloor(room, p.x, p.y, 210);
      E.spawnEnemy(s.key, pos.x, pos.y, { elite: s.elite });
    }
    Au.sfx('spawn');
  };

  /* ============================ 移动辅助 ============================ */
  function go(e, tx, ty, spd, dt, room) {
    let dx = tx - e.x, dy = ty - e.y; const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // 直线走不通就沿寻路场绕。会飞的（mode 2）能越过树石与水面，但越不过成片的林子与岩壁，被挡住时同样要绕
    if (!W.los(room, e.x, e.y, tx, ty, e.mode === 2 ? 2 : 1)) { const f = W.flowDir(room, e.x, e.y); if (f) { dx = f.x; dy = f.y; } }
    W.move(room, e, dx * spd * dt, dy * spd * dt, e.mode);
    e.moving = true;
  }
  function strafe(e, p, spd, dt, room) {
    const a = U.ang(e.x, e.y, p.x, p.y) + (Math.PI / 2) * e.strafe;
    if (W.move(room, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt, e.mode) || Math.random() < dt * 0.35) e.strafe *= -1;
    e.moving = true;
  }
  function kite(e, p, d, keep, spd, dt, room, los) {
    if (!los || d > keep + 70) go(e, p.x, p.y, spd, dt, room);
    else if (d < keep - 90) {
      const a = U.ang(p.x, p.y, e.x, e.y);
      if (W.move(room, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt, e.mode)) strafe(e, p, spd, dt, room);
      e.moving = true;
    } else strafe(e, p, spd * 0.6, dt, room);
  }
  const angTo = (e, p) => Math.atan2(p.y - e.y, p.x - e.x);
  const dTo = (e, p) => Math.hypot(p.x - e.x, p.y - e.y);

  function fireShot(e, s, p) {
    const base = angTo(e, p), n = s.n || 1, sp = s.spread || 0.2;
    for (let i = 0; i < n; i++) E.shootE(e.x + Math.cos(base) * 12, e.y + Math.sin(base) * 12, base + (i - (n - 1) / 2) * sp, s.spd, { kind: s.kind, dmg: e.dmg, c: SHOT_C[s.kind] || SHOT_C.orb });
    Au.sfx('shoot');
  }
  function ring(x, y, n, spd, off, o) { for (let i = 0; i < n; i++) E.shootE(x, y, off + (i / n) * TAU, spd, o); }

  /* ============================ 杂兵 AI ============================ */
  const AI = {
    melee(e, dt, p, room, sm) {
      const d = dTo(e, p), reach = e.r + p.r + 22;
      e.cd -= dt;
      if (e.st === 'idle') {
        e.face = angTo(e, p);
        if (e.def.lunge && d < 250 && d > 100 && e.cd <= 0 && W.los(room, e.x, e.y, p.x, p.y, 1)) {
          e.st = 'lwind'; e.stT = 0.45; e.dir = e.face;
          E.hazLine(e.x, e.y, e.x + Math.cos(e.dir) * 200, e.y + Math.sin(e.dir) * 200, 28, 0.45, 0, { visual: true });
        } else if (d < reach && e.cd <= 0) { e.st = 'wind'; e.stT = 0.36; }
        else if (d > reach - 10) go(e, p.x, p.y, e.spd * sm, dt, room);
        else e.moving = false;
      } else if (e.st === 'wind') {
        e.stT -= dt; e.wind = 1 - e.stT / 0.36; e.moving = false;
        if (e.stT <= 0) {
          e.atk = 1; e.wind = 0;
          FX.slash(e.x, e.y, e.face, reach + 8, '255,190,190');
          if (dTo(e, p) < reach + 14 && Math.abs(U.angDiff(e.face, angTo(e, p))) < 1.15) E.hurtPlayer(e.dmg, e.x, e.y);
          Au.sfx('sword');
          e.st = 'rec'; e.stT = 0.5; e.cd = U.rand(0.4, 0.8);
        }
      } else if (e.st === 'lwind') {
        e.stT -= dt; e.wind = 1 - e.stT / 0.45; e.moving = false;
        if (e.stT <= 0) { e.st = 'lunge'; e.stT = 0.22; e.hitOnce = false; e.wind = 0; e.atk = 1; Au.sfx('dash'); }
      } else if (e.st === 'lunge') {
        e.stT -= dt; W.move(room, e, Math.cos(e.dir) * 620 * dt, Math.sin(e.dir) * 620 * dt, 1); e.moving = true;
        FX.p(e.x, e.y, 16, { c: '255,90,110', life: 0.25, size: 4 });
        if (!e.hitOnce && dTo(e, p) < e.r + p.r + 4 && E.hurtPlayer(e.dmg, e.x, e.y)) e.hitOnce = true;
        if (e.stT <= 0) { e.st = 'rec'; e.stT = 0.45; e.cd = U.rand(1.6, 2.4); }
      } else { e.stT -= dt; e.moving = false; if (e.stT <= 0) e.st = 'idle'; }
      if (e.atk > 0) e.atk = Math.max(0, e.atk - dt * 4);
    },

    charger(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt;
      if (e.st === 'idle') {
        e.face = angTo(e, p);
        if (e.cd <= 0 && d < 340 && W.los(room, e.x, e.y, p.x, p.y, 1)) {
          e.st = 'wind'; e.stT = 0.55; e.dir = e.face;
          E.hazLine(e.x, e.y, e.x + Math.cos(e.dir) * 340, e.y + Math.sin(e.dir) * 340, e.r * 2, 0.55, 0, { visual: true });
        } else if (d > 230 || !W.los(room, e.x, e.y, p.x, p.y, 1)) go(e, p.x, p.y, e.spd * sm, dt, room); // 看不见玩家（被树石挡住）就绕路靠过去，而不是原地打转
        else strafe(e, p, e.spd * 0.7 * sm, dt, room);
      } else if (e.st === 'wind') {
        e.stT -= dt; e.wind = 1; e.moving = false;
        if (e.stT <= 0) { e.st = 'charge'; e.stT = 0.62; e.hitOnce = false; e.wind = 0; e.charge = true; Au.sfx('dash'); }
      } else if (e.st === 'charge') {
        e.stT -= dt; e.face = e.dir; e.moving = true;
        const hit = W.move(room, e, Math.cos(e.dir) * 540 * sm * dt, Math.sin(e.dir) * 540 * sm * dt, 1);
        if (Math.random() < 0.6) FX.p(e.x, e.y, 2, { c: '200,190,170', add: false, life: 0.35, size: 4, vz: 30 });
        if (!e.hitOnce && dTo(e, p) < e.r + p.r && E.hurtPlayer(e.dmg, e.x, e.y)) e.hitOnce = true;
        if (hit || e.stT <= 0) { e.st = 'rec'; e.stT = hit ? 0.9 : 0.5; e.charge = false; e.cd = U.rand(1.2, 2); if (hit) { FX.burst(e.x, e.y, 8, 8, { c: '200,190,170', add: false }); } }
      } else { e.stT -= dt; e.moving = false; if (e.stT <= 0) e.st = 'idle'; }
    },

    ranged(e, dt, p, room, sm) {
      const d = dTo(e, p), s = e.def.shot;
      e.cd -= dt; e.face = angTo(e, p);
      if (e.st === 'idle') {
        const los = W.los(room, e.x, e.y, p.x, p.y);
        if (e.cd <= 0 && los && d < 540) { e.st = 'wind'; e.stT = 0.42; e.burstN = s.burst || 1; }
        else kite(e, p, d, e.def.keep, e.spd * sm, dt, room, los);
      } else {
        e.stT -= dt; e.wind = Math.min(1, 1 - e.stT / 0.42); e.moving = false;
        if (e.stT <= 0) {
          fireShot(e, s, p); e.atk = 1; e.burstN--;
          if (e.burstN > 0) e.stT = 0.16;
          else { e.st = 'idle'; e.cd = s.cd * U.rand(0.85, 1.2) * (e.affix === 'swift' ? 0.7 : 1); e.wind = 0; }
        }
      }
      if (e.atk > 0) e.atk = Math.max(0, e.atk - dt * 4);
    },

    lobber(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt; e.face = angTo(e, p);
      if (e.st === 'idle') {
        if (d > 360) go(e, p.x, p.y, e.spd * sm, dt, room); else e.moving = false;
        if (e.cd <= 0 && d < 480) { e.st = 'wind'; e.stT = 0.55; }
      } else {
        e.stT -= dt; e.wind = 1 - e.stT / 0.55; e.moving = false;
        if (e.stT <= 0) {
          E.hazLob(e.x, e.y, p.x + U.rand(-24, 24), p.y + U.rand(-24, 24), 0.85, 50, e.dmg, { puddle: 3.5, c: '150,220,80' });
          e.st = 'idle'; e.cd = U.rand(2.4, 3.2); e.wind = 0; Au.sfx('shoot');
        }
      }
    },

    caster(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt; e.face = angTo(e, p);
      if (e.st === 'idle') {
        if (e.cd <= 0 && d < 560) { e.st = 'wind'; e.stT = 0.6; }
        else kite(e, p, d, e.def.keep, e.spd * sm, dt, room, true);
      } else {
        e.stT -= dt; e.wind = 1 - e.stT / 0.6; e.moving = false;
        if (e.stT <= 0) {
          E.hazCircle(p.x, p.y, 56, 0.9, e.dmg, { c: '255,120,60' });
          for (let i = 0; i < 2; i++) { const a = U.rand(TAU), r = U.rand(70, 130); E.hazCircle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 56, 0.9 + i * 0.15, e.dmg, { c: '255,120,60' }); }
          e.st = 'idle'; e.cd = U.rand(3, 3.8) * (e.affix === 'swift' ? 0.7 : 1); e.wind = 0; e.atk = 1; Au.sfx('warn');
        }
      }
      if (e.atk > 0) e.atk = Math.max(0, e.atk - dt * 3);
    },

    swarm(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.touchCd -= dt; e.cd -= dt;
      if (e.st === 'idle') {
        e.orb = (e.orb === undefined ? U.rand(TAU) : e.orb) + dt * 1.7 * e.strafe;
        go(e, p.x + Math.cos(e.orb) * 125, p.y + Math.sin(e.orb) * 125, e.spd * sm, dt, room);
        e.face = angTo(e, p);
        if (e.cd <= 0 && d < 280) { e.st = 'dive'; e.stT = 0.5; e.dir = e.face; e.cd = U.rand(1.6, 2.6); }
      } else {
        e.stT -= dt; e.face = e.dir;
        W.move(room, e, Math.cos(e.dir) * e.spd * 2.1 * sm * dt, Math.sin(e.dir) * e.spd * 2.1 * sm * dt, 2);
        if (e.stT <= 0) e.st = 'idle';
      }
      if (e.touchCd <= 0 && d < e.r + p.r * 0.8 && E.hurtPlayer(e.dmg, e.x, e.y)) e.touchCd = 0.8;
    },

    turret(e, dt, p, room) {
      const d = dTo(e, p);
      e.cd -= dt; e.face = angTo(e, p);
      if (e.st === 'idle') { if (e.cd <= 0 && d < 560) { e.st = 'wind'; e.stT = 0.6; } }
      else {
        e.stT -= dt; e.wind = 1 - e.stT / 0.6;
        if (e.stT <= 0) {
          if (e.def.pattern === 'ring') { e.rot = (e.rot || 0) + 0.4; ring(e.x, e.y, e.def.pn, 165, e.rot, { dmg: e.dmg, c: '255,90,140' }); }
          else for (let i = -1; i <= 1; i++) E.shootE(e.x, e.y, e.face + i * 0.2, 340, { kind: 'ice', dmg: e.dmg, c: '90,140,255' });
          e.st = 'idle'; e.cd = e.def.pcd * U.rand(0.9, 1.15); e.wind = 0; Au.sfx('shoot');
        }
      }
    },

    tank(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt;
      if (e.st === 'idle') {
        e.face = angTo(e, p);
        if (d < 80 && e.cd <= 0) {
          e.st = 'wind'; e.stT = 0.75;
          E.hazCircle(e.x, e.y, 92, 0.75, e.dmg, { follow: e, c: '255,100,60' });
        } else if (d > 58) go(e, p.x, p.y, e.spd * sm, dt, room); else e.moving = false;
      } else if (e.st === 'wind') {
        e.stT -= dt; e.wind = 1 - e.stT / 0.75; e.moving = false;
        if (e.stT <= 0) {
          e.st = 'rec'; e.stT = 0.7; e.cd = U.rand(1.3, 2); e.wind = 0;
          if (e.def.look.stone) ring(e.x, e.y, 10, 190, U.rand(TAU), { dmg: e.dmg * 0.6, c: '90,140,255' });
        }
      } else { e.stT -= dt; e.moving = false; if (e.stT <= 0) e.st = 'idle'; }
    },

    teleporter(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt;
      if (e.st === 'idle') {
        e.face = angTo(e, p);
        if (d > 170 || !W.los(room, e.x, e.y, p.x, p.y, 1)) go(e, p.x, p.y, e.spd * 0.7 * sm, dt, room); else strafe(e, p, e.spd * 0.5 * sm, dt, room);
        if (e.cd <= 0) { e.st = 'fade'; e.stT = 0.4; }
      } else if (e.st === 'fade') {
        e.stT -= dt; e.alpha = Math.max(0, e.stT / 0.4);
        if (e.stT <= 0) {
          e.untarget = true;
          for (let i = 0; i < 12; i++) {
            const a = U.rand(TAU), r = U.rand(64, 100), x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            if (!W.blocked(room, x, y, e.r, 2)) { e.x = x; e.y = y; break; }
          }
          e.face = angTo(e, p); e.st = 'appear'; e.stT = 0.5;
          E.hazCircle(e.x, e.y, 64, 0.5, e.dmg, { follow: e, c: '154,120,255', sfx: false });
        }
      } else if (e.st === 'appear') {
        e.stT -= dt; e.alpha = 1 - e.stT / 0.5; e.wind = e.alpha;
        if (e.stT < 0.3) e.untarget = false;
        if (e.stT <= 0) { FX.slash(e.x, e.y, e.face, 60, '180,255,220', 2.4); e.st = 'rec'; e.stT = 0.7; e.cd = U.rand(2.2, 3.2); e.wind = 0; e.alpha = 1; }
      } else { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; }
    },

    exploder(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.face = angTo(e, p);
      if (e.st === 'idle') {
        go(e, p.x, p.y, e.spd * sm, dt, room);
        if (d < 58) {
          e.st = 'fuse'; e.stT = 0.6;
          E.hazCircle(e.x, e.y, 80, 0.6, e.dmg, { follow: e, c: '255,150,40', onBoom: () => { if (!e.dead) E.killEnemy(e); } });
        }
      } else { e.stT -= dt; e.wind = 1 - e.stT / 0.6; go(e, p.x, p.y, e.spd * 0.3 * sm, dt, room); }
    },

    summoner(e, dt, p, room, sm) {
      const d = dTo(e, p);
      e.cd -= dt; e.face = angTo(e, p);
      if (e.st === 'idle') {
        if (e.cd <= 0) { e.st = 'wind'; e.stT = 0.7; }
        else kite(e, p, d, e.def.keep, e.spd * sm, dt, room, true);
      } else {
        e.stT -= dt; e.wind = 1 - e.stT / 0.7; e.moving = false;
        if (e.stT <= 0) {
          const minions = room.enemies.filter((m) => !m.dead && m.def.minion).length;
          if (minions < 6) for (let i = 0; i < 2; i++) E.spawnEnemy('skull', e.x + U.rand(-30, 30), e.y + U.rand(-30, 30), { delay: 0.35 });
          else for (let i = -1; i <= 1; i++) E.shootE(e.x, e.y, e.face + i * 0.25, 260, { dmg: e.dmg, c: '154,120,255' });
          e.st = 'idle'; e.cd = U.rand(3.8, 5); e.wind = 0; e.atk = 1; Au.sfx('spawn');
        }
      }
      if (e.atk > 0) e.atk = Math.max(0, e.atk - dt * 3);
    },
  };

  /* ============================ 首领 ============================ */
  const at = (e, dt, tm) => e.pt >= tm && e.pt - dt < tm;
  const every = (e, dt, iv, t0 = 0, t1 = 1e9) => e.pt >= t0 && e.pt - dt < t1 && Math.floor((e.pt - t0) / iv) > Math.floor((e.pt - dt - t0) / iv);
  const minionCount = (room) => room.enemies.filter((m) => !m.dead && !m.boss).length;

  function hover(e, p, keep, spd, dt, room) {
    const d = dTo(e, p);
    e.face = angTo(e, p);
    kite(e, p, d, keep, spd, dt, room, true);
  }
  function blinkNear(e, p, room, r0, r1) {
    FX.burst(e.x, e.y, 20, 14, { c: '255,80,100' }); FX.ring(e.x, e.y, 30, 6, '255,80,100', 0.25);
    for (let i = 0; i < 20; i++) {
      const a = U.rand(TAU), r = U.rand(r0, r1), x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!W.blocked(room, x, y, e.r + 6, 2)) { e.x = x; e.y = y; break; }
    }
    e.face = angTo(e, p);
    FX.ring(e.x, e.y, 6, 40, '255,80,100', 0.25); Au.sfx('dash');
  }

  function lungePat(e, dt, p, room, reps, wind) {
    const v = e.pv;
    if (v.i === undefined) { v.i = 0; v.ph = 0; v.t = 0; }
    v.t += dt;
    if (v.ph === 0) {
      if (!v.set) {
        v.set = 1; e.face = v.dir = angTo(e, p);
        E.hazLine(e.x, e.y, e.x + Math.cos(v.dir) * 330, e.y + Math.sin(v.dir) * 330, 36, wind, 0, { visual: true }); Au.sfx('warn');
      }
      e.wind = v.t / wind; e.moving = false;
      if (v.t >= wind) { v.ph = 1; v.t = 0; v.hit = false; Au.sfx('dash'); }
    } else if (v.ph === 1) {
      const hitW = W.move(room, e, Math.cos(v.dir) * 900 * dt, Math.sin(v.dir) * 900 * dt, 1);
      e.moving = true; e.wind = 0; e.atk = 1;
      FX.p(e.x, e.y, 20, { c: '220,230,245', life: 0.25, size: 5 });
      if (!v.hit && dTo(e, p) < e.r + p.r + 6 && E.hurtPlayer(e.dmg * 1.2, e.x, e.y)) v.hit = true;
      if (v.t >= 0.28 || hitW) {
        v.ph = 2; v.t = 0;
        FX.slash(e.x, e.y, v.dir, 70, '230,240,255', 2);
        E.hazCircle(e.x + Math.cos(v.dir) * 30, e.y + Math.sin(v.dir) * 30, 72, 0.22, e.dmg, { sfx: false, c: '220,230,255' });
      }
    } else {
      e.moving = false; e.atk = Math.max(0, e.atk - dt * 3);
      if (v.t >= (v.i + 1 >= reps ? 0.6 : 0.28)) { v.i++; v.ph = 0; v.t = 0; v.set = 0; if (v.i >= reps) return true; }
    }
    return false;
  }

  const BOSS = {
    /* ---------- 墨大夫 ---------- */
    modaifu: {
      p2: 0.5, line: '夺舍——！',
      idle(e, dt, p, room) { e.face = angTo(e, p); if (dTo(e, p) > 190) go(e, p.x, p.y, e.spd, dt, room); else strafe(e, p, e.spd * 0.5, dt, room); },
      next(e, room) {
        if (!e.used['s' + e.phase] && e.hp < e.maxHp * (e.phase === 1 ? 0.8 : 0.4) && minionCount(room) < 2) { e.used['s' + e.phase] = 1; return 'summon'; }
        return e.phase === 1 ? ['lunge', 'needles'] : ['lunge3', 'ghosts', 'ringneedle', 'needles'];
      },
      pats: {
        lunge: (e, dt, p, room) => lungePat(e, dt, p, room, 1, 0.6),
        lunge3: (e, dt, p, room) => lungePat(e, dt, p, room, 3, 0.4),
        needles(e, dt, p) {
          const n = e.phase === 2 ? 4 : 3, cnt = e.phase === 2 ? 9 : 7;
          e.face = angTo(e, p); e.wind = Math.min(1, e.pt / 0.4); e.moving = false;
          for (let k = 0; k < n; k++) if (at(e, dt, 0.4 + k * 0.36)) {
            for (let i = 0; i < cnt; i++) E.shootE(e.x, e.y, e.face + (i - (cnt - 1) / 2) * 0.14 + (k % 2 ? 0.07 : 0), 390, { kind: 'needle', dmg: e.dmg, c: '170,205,60', r: 5 });
            e.atk = 1; Au.sfx('shoot');
          }
          return e.pt > 0.4 + n * 0.36 + 0.35;
        },
        summon(e, dt, p, room) {
          e.wind = Math.min(1, e.pt / 0.8); e.moving = false;
          if (at(e, dt, 0.8)) {
            const keys = e.phase === 1 ? ['thug', 'thug'] : ['ironslave', 'thug'];
            for (const k of keys) { const pos = W.randomFloor(room, p.x, p.y, 160); E.spawnEnemy(k, pos.x, pos.y, { delay: 0.6 }); }
            G.Game.say(e, '铁奴，拿下他！'); Au.sfx('spawn');
          }
          return e.pt > 1.3;
        },
        ghosts(e, dt, p) {
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          if (every(e, dt, 0.22, 0.5, 0.5 + 7 * 0.22)) {
            E.shootE(e.x, e.y, U.rand(TAU), 230, { kind: 'skullp', dmg: e.dmg, c: '154,120,255', homing: 2.4, life: 4.2, r: 9, trail: 0.4 });
            Au.sfx('shoot');
          }
          return e.pt > 2.7;
        },
        ringneedle(e, dt, p) {
          e.wind = 1; e.moving = false;
          for (let k = 0; k < 3; k++) if (at(e, dt, 0.5 + k * 0.45)) { ring(e.x, e.y, 18, 230, k * 0.17, { kind: 'needle', dmg: e.dmg, c: '170,205,60', r: 5 }); Au.sfx('shoot'); e.atk = 1; }
          return e.pt > 2;
        },
      },
    },

    /* ---------- 墨蛟 ---------- */
    mojiao: {
      p2: 0.5, line: '吼————！',
      init(e) {
        e.mode = 2; e.segs = [];
        for (let i = 0; i < 15; i++) e.segs.push({ x: e.x, y: e.y + i * 4, r: i === 0 ? 26 : Math.max(8, 21 - i * 0.9), z: 0 });
        e.orb = U.rand(TAU); e.mouth = 0;
      },
      idle(e, dt, p, room) {
        e.orb += dt * 0.95 * e.strafe;
        const tx = p.x + Math.cos(e.orb) * 250, ty = p.y + Math.sin(e.orb) * 190;
        const a = Math.atan2(ty - e.y, tx - e.x);
        e.face += U.clamp(U.angDiff(e.face, a), -3.4 * dt, 3.4 * dt);
        const sp = e.spd * (e.phase === 2 ? 1.25 : 1);
        if (W.move(room, e, Math.cos(e.face) * sp * dt, Math.sin(e.face) * sp * dt, 2)) e.strafe *= -1;
        e.moving = true; e.mouth = Math.max(0, e.mouth - dt * 3);
      },
      next(e) { return ['charge', 'breath', 'tailring', 'dive']; },
      pats: {
        charge(e, dt, p, room) {
          const v = e.pv, reps = e.phase === 2 ? 2 : 1;
          if (v.i === undefined) { v.i = 0; v.ph = 0; v.t = 0; }
          v.t += dt;
          if (v.ph === 0) {
            if (!v.set) {
              v.set = 1; v.dir = angTo(e, p); e.face = v.dir;
              E.hazLine(e.x, e.y, e.x + Math.cos(v.dir) * 900, e.y + Math.sin(v.dir) * 900, 60, 0.7, 0, { visual: true }); Au.sfx('roar');
            }
            e.mouth = Math.min(1, v.t / 0.5);
            W.move(room, e, -Math.cos(v.dir) * 50 * dt, -Math.sin(v.dir) * 50 * dt, 2);
            if (v.t >= 0.7) { v.ph = 1; v.t = 0; v.hit = false; }
          } else if (v.ph === 1) {
            const hitW = W.move(room, e, Math.cos(v.dir) * 760 * dt, Math.sin(v.dir) * 760 * dt, 2);
            FX.p(e.x + U.rand(-16, 16), e.y + U.rand(-16, 16), 4, { c: '90,110,160', life: 0.4, size: 5, vz: 50 });
            if (!v.hit && dTo(e, p) < e.r + p.r + 4 && E.hurtPlayer(e.dmg * 1.3, e.x, e.y)) v.hit = true;
            if (hitW || v.t > 1) {
              v.ph = 2; v.t = 0;
              if (hitW) { G.Game.shake(10); Au.sfx('boom'); ring(e.x, e.y, 10, 210, U.rand(TAU), { kind: 'ink', dmg: e.dmg * 0.8, c: '120,140,220' }); }
            }
          } else {
            e.mouth = Math.max(0, e.mouth - dt * 3);
            if (v.t > 0.5) { v.i++; v.ph = 0; v.t = 0; v.set = 0; if (v.i >= reps) return true; }
          }
          return false;
        },
        breath(e, dt, p, room) {
          const v = e.pv, dur = 1.7;
          if (v.base === undefined) { v.base = angTo(e, p); v.sgn = U.chance(0.5) ? 1 : -1; Au.sfx('roar'); }
          e.face = v.base; e.mouth = 1;
          if (every(e, dt, 0.065, 0.5, 0.5 + dur)) {
            const k = (e.pt - 0.5) / dur, a = v.base + v.sgn * U.lerp(-0.75, 0.75, k);
            E.shootE(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, a + U.rand(-0.04, 0.04), 310, { kind: 'ink', dmg: e.dmg, c: '120,140,220', r: 8 });
            if (e.phase === 2) E.shootE(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, v.base - v.sgn * U.lerp(-0.75, 0.75, k), 250, { kind: 'ink', dmg: e.dmg, c: '120,140,220', r: 8 });
          }
          return e.pt > 0.5 + dur + 0.4;
        },
        tailring(e, dt) {
          const n = e.phase === 2 ? 3 : 2;
          for (let k = 0; k < n; k++) if (at(e, dt, 0.5 + k * 0.5)) {
            const tail = e.segs[e.segs.length - 3];
            ring(tail.x, tail.y, 18, 205, k * 0.175, { kind: 'ink', dmg: e.dmg, c: '120,140,220', r: 8 });
            FX.ring(tail.x, tail.y, 10, 120, '120,140,220', 0.35, 5); G.Game.shake(5); Au.sfx('boom');
          }
          BOSS.mojiao.idle(e, dt * 0.5, G.Game.player, G.Game.room);
          return e.pt > 0.5 + n * 0.5 + 0.3;
        },
        dive(e, dt, p, room) {
          const v = e.pv;
          if (e.pt < 0.5) { e.alpha = 1 - e.pt / 0.5; }
          if (at(e, dt, 0.5)) {
            e.untarget = true; e.alpha = 0;
            FX.ring(e.x, e.y, 80, 10, '90,110,160', 0.4, 5);
            v.h = E.hazCircle(p.x, p.y, 100, 1.7, e.dmg * 1.3, { track: 5, lockT: 0.5, c: '120,140,220',
              onBoom: (h) => {
                e.x = h.x; e.y = h.y; for (const s of e.segs) { s.x = h.x; s.y = h.y; }
                e.untarget = false; e.alpha = 1; e.mouth = 1; e.face = angTo(e, p);
                ring(h.x, h.y, e.phase === 2 ? 18 : 12, 220, U.rand(TAU), { kind: 'ink', dmg: e.dmg, c: '120,140,220', r: 8 });
                Au.sfx('roar'); G.Game.shake(9);
              } });
          }
          return e.pt > 2.9;
        },
      },
    },

    /* ---------- 王蝉 ---------- */
    wangchan: {
      p2: 0.5, line: '血灵大法！',
      init(e) { e.mode = 2; e.z = 6; },
      idle(e, dt, p, room) { hover(e, p, 270, e.spd, dt, room); },
      next(e, room) {
        if (!e.used['s' + e.phase] && e.hp < e.maxHp * (e.phase === 1 ? 0.78 : 0.3) && minionCount(room) < 2) { e.used['s' + e.phase] = 1; return 'summon'; }
        return e.phase === 1 ? ['spiral', 'blinkfan', 'rain'] : ['spiral', 'blinkfan', 'rain', 'beams', 'beams'];
      },
      pats: {
        spiral(e, dt, p) {
          const v = e.pv, arms = e.phase === 2 ? 4 : 3;
          if (v.rot === undefined) { v.rot = U.rand(TAU); v.sg = U.chance(0.5) ? 1 : -1; }
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          if (e.phase === 2 && at(e, dt, 1.6)) v.sg *= -1;
          if (every(e, dt, 0.11, 0.4, 2.7)) {
            for (let k = 0; k < arms; k++) E.shootE(e.x, e.y, v.rot + (k * TAU) / arms, 195, { kind: 'blood', dmg: e.dmg, c: '255,60,90', r: 8 });
            v.rot += 0.24 * v.sg; Au.sfx('shoot');
          }
          return e.pt > 3.1;
        },
        blinkfan(e, dt, p, room) {
          const reps = e.phase === 2 ? 4 : 3;
          for (let k = 0; k < reps; k++) {
            if (at(e, dt, k * 0.8)) { blinkNear(e, p, room, 200, 270); e.wind = 1; }
            if (at(e, dt, k * 0.8 + 0.42)) {
              const a = angTo(e, p); e.face = a; e.atk = 1;
              for (let i = 0; i < 9; i++) E.shootE(e.x, e.y, a + (i - 4) * 0.13, 420, { kind: 'blade', dmg: e.dmg, c: '255,70,100', r: 7 });
              Au.sfx('sword');
            }
          }
          return e.pt > reps * 0.8 + 0.3;
        },
        rain(e, dt, p) {
          const n = e.phase === 2 ? 16 : 10;
          e.wind = 1; e.moving = false;
          if (every(e, dt, 0.2, 0.3, 0.3 + n * 0.2)) {
            const k = Math.floor((e.pt - 0.3) / 0.2), off = k % 3 === 0 ? 0 : 1;
            const a = U.rand(TAU), r = U.rand(50, 150) * off;
            E.hazCircle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 56, 0.85, e.dmg, { c: '255,60,90' });
          }
          return e.pt > 0.3 + n * 0.2 + 0.7;
        },
        summon(e, dt, p, room) {
          e.wind = Math.min(1, e.pt / 0.8); e.moving = false;
          if (at(e, dt, 0.8)) {
            for (let i = 0; i < (e.phase === 2 ? 3 : 2); i++) { const pos = W.randomFloor(room, p.x, p.y, 150); E.spawnEnemy('wraith', pos.x, pos.y, { delay: 0.6 }); }
            G.Game.say(e, '鬼王听令！'); Au.sfx('spawn');
          }
          return e.pt > 1.3;
        },
        beams(e, dt, p, room) {
          const v = e.pv;
          if (at(e, dt, 0.3)) {
            FX.burst(e.x, e.y, 20, 14, { c: '255,80,100' });
            e.x = (room.w / 2) * T; e.y = (room.h / 2) * T;
            FX.ring(e.x, e.y, 6, 60, '255,80,100', 0.3); Au.sfx('roar');
          }
          if (at(e, dt, 0.7)) {
            const n = 3, a0 = U.rand(TAU), rot = (U.chance(0.5) ? 1 : -1) * 0.72;
            for (let i = 0; i < n; i++) E.hazBeam(e, a0 + (i * TAU) / n, 900, 30, 1.0, 4.2, e.dmg, rot);
          }
          e.wind = 1; e.moving = false; e.face = e.pt * 2;
          if (every(e, dt, 1.1, 2.0, 5.6)) ring(e.x, e.y, 10, 150, U.rand(TAU), { kind: 'blood', dmg: e.dmg, c: '255,60,90', r: 8 });
          return e.pt > 6.2;
        },
      },
    },

    /* ---------- 极阴祖师 ---------- */
    jiyin: {
      p2: 0.55, line: '天都尸火——炼！',
      init(e) { e.mode = 2; e.z = 8; },
      idle(e, dt, p, room) { hover(e, p, 290, e.spd, dt, room); },
      next(e, room) {
        if (!e.used['s' + e.phase] && e.hp < e.maxHp * (e.phase === 1 ? 0.8 : 0.35) && minionCount(room) < 2) { e.used['s' + e.phase] = 1; return 'summon'; }
        return e.phase === 1 ? ['firelines', 'claws', 'rings'] : ['firelines', 'claws', 'rings', 'orbs', 'combo'];
      },
      pats: {
        firelines(e, dt, p, room, sets) {
          const v = e.pv; sets = sets || (e.phase === 2 ? 3 : 2);
          if (v.o === undefined) v.o = U.chance(0.5) ? 0 : 1;
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          for (let k = 0; k < sets; k++) if (at(e, dt, 0.2 + k * 1.35)) {
            const horiz = (v.o + k) % 2 === 0, sp = 150, RW = room.w * T, RH = room.h * T, off = U.rand(0, sp);
            if (horiz) for (let y = T + off; y < RH - T; y += sp) E.hazLine(T, y, RW - T, y, 64, 0.95, e.dmg, { stay: 0.5, c: '154,200,50' });
            else for (let x = T + off; x < RW - T; x += sp) E.hazLine(x, T, x, RH - T, 64, 0.95, e.dmg, { stay: 0.5, c: '154,200,50' });
            Au.sfx('warn');
          }
          return e.pt > 0.2 + sets * 1.35 + 0.5;
        },
        claws(e, dt, p) {
          const n = e.phase === 2 ? 8 : 6;
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          if (every(e, dt, 0.42, 0.3, 0.3 + n * 0.42)) {
            E.hazCircle(p.x, p.y, 70, 0.7, e.dmg, { c: '150,120,255', kind: 'claw' });
            if (e.phase === 2) { const a = U.rand(TAU); E.hazCircle(p.x + Math.cos(a) * 130, p.y + Math.sin(a) * 130, 70, 0.8, e.dmg, { c: '150,120,255', kind: 'claw' }); }
          }
          return e.pt > 0.3 + n * 0.42 + 0.6;
        },
        rings(e, dt, p) {
          const n = e.phase === 2 ? 5 : 4;
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          for (let k = 0; k < n; k++) {
            if (at(e, dt, 0.4 + k * 0.55)) { ring(e.x, e.y, 20, 185, k % 2 ? TAU / 40 : 0, { kind: 'ghostfire', dmg: e.dmg, c: '154,200,50', r: 8 }); Au.sfx('fire'); e.atk = 1; }
            if (e.phase === 2 && at(e, dt, 0.68 + k * 0.55)) for (let i = -2; i <= 2; i++) E.shootE(e.x, e.y, e.face + i * 0.16, 360, { kind: 'ghostfire', dmg: e.dmg, c: '190,215,70', r: 7 });
          }
          return e.pt > 0.4 + n * 0.55 + 0.4;
        },
        summon(e, dt, p, room) {
          e.wind = Math.min(1, e.pt / 0.8); e.moving = false;
          if (at(e, dt, 0.8)) {
            for (let i = 0; i < 2; i++) { const pos = W.randomFloor(room, p.x, p.y, 170); E.spawnEnemy('corpse', pos.x, pos.y, { delay: 0.6 }); }
            G.Game.say(e, '铜甲尸，起！'); Au.sfx('spawn');
          }
          return e.pt > 1.3;
        },
        orbs(e, dt, p) {
          e.wind = 1; e.moving = false; e.face = angTo(e, p);
          if (every(e, dt, 0.3, 0.4, 0.4 + 5 * 0.3)) {
            E.shootE(e.x, e.y, e.face + U.rand(-1.4, 1.4), 175, { kind: 'ghostfire', dmg: e.dmg, c: '154,200,50', r: 13, homing: 1.7, life: 5.2, trail: 0.6,
              onEnd: (pr) => E.hazPuddle(pr.x, pr.y, 48, 3.2, e.dmg * 0.6, { c: '154,200,50' }) });
            Au.sfx('fire');
          }
          return e.pt > 2.4;
        },
        combo(e, dt, p, room) {
          const a = BOSS.jiyin.pats.firelines(e, dt, p, room, 2);
          if (every(e, dt, 0.6, 0.6, 3.0)) E.hazCircle(p.x, p.y, 62, 0.75, e.dmg, { c: '150,120,255', kind: 'claw' });
          return a;
        },
      },
    },
  };
  E.BOSS = BOSS;

  function bossUpdate(e, dt, p, room) {
    const B = BOSS[e.key];
    e.pt += dt;
    if (e.atk > 0 && !e.pat) e.atk = Math.max(0, e.atk - dt * 3);
    if (!e.pat) {
      e.wind = Math.max(0, e.wind - dt * 4);
      B.idle(e, dt, p, room);
      if (e.pt > e.idleDur) {
        const r = B.next(e, room);
        let pick = r;
        if (Array.isArray(r)) { const c = r.filter((x) => x !== e.last); pick = U.pick(c.length ? c : r); }
        e.last = pick; e.pat = pick; e.pt = 0; e.pv = {};
      }
    } else if (B.pats[e.pat](e, dt, p, room)) {
      e.pat = null; e.pt = 0; e.wind = 0;
      const low = e.hp < e.maxHp * 0.25;
      e.idleDur = (e.phase >= 2 ? (low ? 0.5 : 0.8) : 1.25) * U.rand(0.8, 1.2);
    }
    if (e.phase === 1 && e.hp < e.maxHp * B.p2) {
      e.phase = 2; e.invT = 1.2; e.untarget = false; e.alpha = 1;
      e.pat = null; e.pt = 0; e.idleDur = 1.3; e.wind = 0;
      G.Game.say(e, B.line);
      FX.ring(e.x, e.y, 10, 300, '255,90,90', 0.6, 7); FX.burst(e.x, e.y, 24, 40, { c: '255,90,90', s1: 320 });
      G.Game.shake(12); Au.sfx('roar');
      // 清掉场上敌方弹幕，给玩家喘息
      G.Game.clearHostile = true;
    }
    // 蛟身节点
    if (e.segs) {
      const s = e.segs; s[0].x = e.x; s[0].y = e.y;
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, gap = 15;
        if (d > gap) { b.x = a.x + (dx / d) * gap; b.y = a.y + (dy / d) * gap; }
        b.z = Math.max(0, Math.sin(e.t * 3 - i * 0.7)) * 5;
      }
    }
  }

  /* ============================ 每帧 ============================ */
  let flowT = 0, lastDt = 0;
  E.updateEnemies = function (dt) {
    const Gm = G.Game, room = Gm.room, p = Gm.player, L = room.enemies;
    flowT -= dt;
    if (flowT <= 0) { flowT = 0.25; W.flow(room, p.x, p.y); }
    // 由上一帧位移估算速度，供自动瞄准算提前量（瞬移类的突变会被限幅）
    for (const e of L) {
      if (e._px !== undefined && lastDt > 0.001) {
        const vx = U.clamp((e.x - e._px) / lastDt, -320, 320), vy = U.clamp((e.y - e._py) / lastDt, -320, 320);
        e.vx = (e.vx || 0) * 0.6 + vx * 0.4; e.vy = (e.vy || 0) * 0.6 + vy * 0.4;
      }
      e._px = e.x; e._py = e.y;
    }
    lastDt = dt;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.invT > 0) e.invT -= dt;
      if (e.kx || e.ky) {
        W.move(room, e, e.kx * dt, e.ky * dt, e.mode);
        const k = Math.max(0, 1 - 9 * dt); e.kx *= k; e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 4) e.kx = e.ky = 0;
      }
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; E.dmgEnemy(e, 4 * p.dmgMul, { noCrit: true, c: '#ff9a4a' }); if (e.dead) continue; }
        if (Math.random() < 0.3) FX.p(e.x + U.rand(-8, 8), e.y, U.rand(8, 30), { c: '120,200,255', life: 0.35, size: 3, vz: 50 });
      }
      if (e.rootCd > 0) e.rootCd -= dt;
      if (e.psn > 0) { // 毒：每层每秒 3 点，半秒结算一次
        e.psnT -= dt; e.psnTick = (e.psnTick || 0) - dt;
        if (e.psnTick <= 0) {
          e.psnTick = 0.5;
          let d = e.psn * 1.5 * p.dmgMul * p.psnMul;
          if (p.flags.psnRot && e.psn >= p.psnCap) d += e.maxHp * (e.boss ? 0.002 : 0.005);
          E.dmgEnemy(e, d, { noCrit: true, c: '#b4e04a', dot: true }); if (e.dead) continue;
        }
        if (Math.random() < 0.1 + e.psn * 0.03) FX.p(e.x + U.rand(-e.r, e.r), e.y + U.rand(-4, 4), U.rand(6, e.r * 2), { c: '154,200,50', life: 0.5, size: U.rand(2, 4), vz: 34 });
        if (e.psnT <= 0) e.psn = 0;
      }
      if (e.st === 'intro') continue;
      if (e.st === 'spawn') {
        e.stT -= dt;
        if (e.stT <= 0) { e.st = 'idle'; FX.ring(e.x, e.y, 34, 4, '255,120,120', 0.25); FX.burst(e.x, e.y, 10, 8, { c: '255,160,160' }); if (e.boss) { e.pt = 0; } }
        continue;
      }
      if (e.stunT > 0) { e.stunT -= dt; e.moving = false; continue; }
      const sm = (e.slowT > 0 ? 0.5 : 1) * (e.psn > 0 && p.flags.psnSlow ? 0.7 : 1);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.boss) bossUpdate(e, dt, p, room);
      else {
        AI[e.def.ai](e, dt, p, room, sm);
        if (e.affix === 'horde' && !e.hordeDone && e.hp < e.maxHp * 0.5) {
          e.hordeDone = true;
          for (let k = 0; k < 2; k++) E.spawnEnemy(e.key, e.x + U.rand(-40, 40), e.y + U.rand(-40, 40), { delay: 0.5 });
          FX.text(e.x, e.y, 60, '召集！', '#ffb0b0', 14);
        }
      }
    }
    // 互相推开
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead || a.boss || a.st === 'spawn' || a.def.ai === 'turret') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead || b.boss || b.st === 'spawn' || b.def.ai === 'turret') continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d < m && d > 0.01) {
          const o = ((m - d) / d) * 0.5;
          W.move(room, a, -dx * o, -dy * o, a.mode); W.move(room, b, dx * o, dy * o, b.mode);
        }
      }
    }
    for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
  };
})();
