'use strict';
/* 凡人问道 —— 法宝、灵宠与阵法：
   大庚剑阵、自动祭出的法宝、常驻身侧的灵宠灵虫、技艺带来的被动，以及后补的几门神通。 */
(function () {
  const G = window.G, U = G.U, W = G.World, T = G.TILE, TAU = G.TAU;
  const E = G.Ent, FX = G.FX, Au = G.Audio, SK = E.SK;

  const alive = (e) => !e.dead && e.st !== 'spawn' && e.st !== 'intro' && !e.untarget;
  const schK = (p, sch) => 1 + (p.schMul[sch] || 0);
  function inRange(x, y, r, fn) { for (const e of G.Game.room.enemies) if (alive(e) && U.dist(x, y, e.x, e.y) < r + e.r) fn(e); }
  const hold = (e, t) => { if (e.boss) e.slowT = Math.max(e.slowT, t); else e.stunT = Math.max(e.stunT, t); }; // 首领只会被迟滞，不会被定住

  /* ============================ 阵 ============================ */
  E.zone = function (kind, x, y, r, life, o = {}) {
    const h = Object.assign({ type: 'zone', kind, x, y, r, life, max: life, t: 0, tick: 0, from: 0, c: '255,255,255' }, o);
    G.Game.haz.push(h); return h;
  };

  E.ZONE = {
    /* 大庚剑阵：七十二口青竹蜂云剑环立成阵。入阵者出不去，剑丝往复绞杀，不时落下辟邪神雷 */
    dageng(h, dt, p, room) {
      for (const e of room.enemies) {
        if (!alive(e)) continue;
        const d = U.dist(h.x, h.y, e.x, e.y);
        if (d < h.r - 4) h.in.add(e);
        if (!h.in.has(e)) continue;
        e.slowT = Math.max(e.slowT, 0.3);
        const lim = h.r - Math.min(e.r, 20);
        if (!e.boss && !e.segs && d > lim) { const a = U.ang(h.x, h.y, e.x, e.y); e.x = h.x + Math.cos(a) * lim; e.y = h.y + Math.sin(a) * lim; e.kx = e.ky = 0; }
      }
      if (h.tick <= 0) {
        h.tick = 0.25; let n = 0;
        for (const e of h.in) {
          if (!alive(e)) { h.in.delete(e); continue; }
          if (n++ < 8) { // 剑丝：自阵边一口飞剑射出，穿过敌人，落到对面
            const a = U.rand(TAU), sx = h.x + Math.cos(a) * h.r, sy = h.y + Math.sin(a) * h.r, dl = U.dist(sx, sy, e.x, e.y) || 1, dx = (e.x - sx) / dl, dy = (e.y - sy) / dl;
            const L = Math.max(dl, 2 * ((h.x - sx) * dx + (h.y - sy) * dy));
            FX.thread(sx, sy, sx + dx * L, sy + dy * L, '200,255,150');
          }
          E.dmgEnemy(e, h.dmg, { noCrit: true, c: '#c8ff8a' });
        }
        for (let i = 0; i < 2; i++) { const a = U.rand(TAU), b = a + U.rand(1.6, 4.6); FX.thread(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r, h.x + Math.cos(b) * h.r, h.y + Math.sin(b) * h.r, '170,255,110', 0.3); }
        if (n) Au.sfx('sword');
      }
      h.thT -= dt;
      if (h.thT <= 0) {
        h.thT = 0.9;
        const list = [...h.in].filter(alive);
        if (list.length) E.chainThunder(U.pick(list), h.dmg * 1.6, 2);
      }
    },
    /* 颠倒五行阵：阵中敌人迟滞，自己减伤 */
    wuxing(h, dt, p) {
      if (U.dist(h.x, h.y, p.x, p.y) < h.r) p.wardT = 0.15;
      inRange(h.x, h.y, h.r, (e) => { e.slowT = Math.max(e.slowT, 0.4); });
      if (h.tick <= 0) { h.tick = 0.5; if (h.dmg) inRange(h.x, h.y, h.r, (e) => E.dmgEnemy(e, h.dmg, { noCrit: true, c: '#e8d08a' })); }
    },
    tulao() {}, // 土牢：定身在施放时已经结算，这里只留着石柱
  };

  E.castDageng = function () {
    const Gm = G.Game, p = Gm.player;
    let a = Gm.aim(0, 0.2);
    if (!Gm.target && !Gm.isManualNow()) a = { x: p.x, y: p.y };
    const d = U.dist(p.x, p.y, a.x, a.y);
    if (d > 330) a = { x: p.x + ((a.x - p.x) / d) * 330, y: p.y + ((a.y - p.y) / d) * 330 };
    const r = 205;
    E.zone('dageng', a.x, a.y, r, 7, { dmg: E.swordDamage(p) * 2.2, c: '170,255,110', in: new Set(), thT: 0.7,
      onEnd(h) { // 收阵：辟邪神雷
        FX.array(h.x, h.y, h.r, 30, '255,235,130', 0.6, -6); FX.ring(h.x, h.y, h.r, 12, '170,255,110', 0.45, 6);
        for (const e of h.in) {
          if (!alive(e)) continue;
          FX.bolt(e.x + U.rand(-30, 30), e.y, 360, e.x, e.y, 6, '255,235,130', 4.5);
          E.dmgEnemy(e, h.dmg * 9, { c: '#ffe36a', evilMul: 1.6 });
          if (!e.dead && !e.boss) e.stunT = Math.max(e.stunT, 0.8);
        }
        FX.bolt(h.x, h.y, 420, h.x, h.y, 0, '255,235,130', 7);
        FX.text(h.x, h.y, 80, '辟邪神雷', '#ffe36a', 20);
        Gm.shake(10); Gm.flash = 0.16; Au.sfx('thunder'); Au.sfx('boom');
      } });
    FX.array(a.x, a.y, 40, r * 1.15, '170,255,110', 0.9, 2.4);
    FX.ring(a.x, a.y, 20, r, '170,255,110', 0.5, 6); FX.ring(p.x, p.y, 10, 120, '200,255,140', 0.35, 4);
    FX.burst(p.x, p.y, 24, 40, { c: '200,255,140', s1: 340, l1: 0.7 });
    for (let k = 0; k < 8; k++) { const q = (k / 8) * TAU; FX.thread(p.x, p.y, a.x + Math.cos(q) * r, a.y + Math.sin(q) * r, '200,255,150', 0.45); }
    FX.text(p.x, p.y, 72, '大庚剑阵', '#d8ffb0', 24);
    Gm.shake(9); Gm.flash = 0.14; Au.sfx('bigsword'); Au.sfx('thunder');
    Gm.stats.casts++; p.atkAnim = 1;
    return true;
  };

  /* ============================ 后补的神通 ============================ */
  SK.wuxing = function (p, ax, ay, lv) {
    E.zone('wuxing', p.x, p.y, 150, 6 + lv * 2, { dmg: 5 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, c: '232,208,138' });
    FX.array(p.x, p.y, 30, 165, '232,208,138', 0.5, 2); FX.ring(p.x, p.y, 10, 150, '232,208,138', 0.35, 4); Au.sfx('shield');
  };
  SK.tulao = function (p, ax, ay, lv) {
    const dur = 1.6 + lv * 0.4, r = 92;
    E.zone('tulao', ax, ay, r, dur, { c: '208,168,88' });
    inRange(ax, ay, r, (e) => { E.dmgEnemy(e, 22 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, { c: '#e0c080' }); if (!e.dead) hold(e, dur); });
    FX.ring(ax, ay, r, 20, '208,168,88', 0.3, 5);
    FX.burst(ax, ay, 4, 18, { c: '150,120,80', s1: 220, add: false, z1: 8, l1: 0.7 });
    G.Game.shake(3); Au.sfx('boom');
  };
  SK.xueying = function (p, ax, ay, lv) {
    const Gm = G.Game, room = Gm.room, mv = G.Input.moveVec();
    let a; // 手动瞄准：朝鼠标；自动：朝移动方向，站定时背向目标远遁
    if (Gm.isManualNow()) a = U.ang(p.x, p.y, ax, ay);
    else if (mv.l > 0.2) a = Math.atan2(mv.y, mv.x);
    else if (Gm.target) a = U.ang(Gm.target.x, Gm.target.y, p.x, p.y);
    else a = p.face;
    p.hp -= Math.max(0, Math.min(p.hp - 1, Math.round(p.maxHp * 0.08)));
    const sx = p.x, sy = p.y; let tx = sx, ty = sy;
    for (let d = 300; d > 0; d -= 12) {
      const x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d;
      if (!W.blocked(room, x, y, p.r * 0.8, 0) && room.tiles[Math.floor(y / T) * room.w + Math.floor(x / T)] !== 4) { tx = x; ty = y; break; }
    }
    E.hazCircle(sx, sy, 100, 0.45, 60 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, { from: 0, kind: 'xueying', c: '232,48,90', tc: '#ff7a94' });
    FX.thread(sx, sy, tx, ty, '232,48,90', 0.4);
    FX.burst(sx, sy, 20, 18, { c: '232,48,90', s1: 200 }); FX.burst(tx, ty, 20, 12, { c: '255,120,150', s1: 160 });
    p.x = tx; p.y = ty; p.inv = Math.max(p.inv, 0.4);
    Au.sfx('dash');
  };
  SK.xuezuan = function (p, ax, ay, lv) {
    const a = U.ang(p.x, p.y, ax, ay);
    E.shootP(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a, { kind: 'drill', spd: 760, life: 0.72, dmg: 42 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, pierce: 99, leech: 2, r: 10, c: '255,90,122', tc: '#ff8aa0' });
    FX.ring(p.x, p.y, 8, 46, '232,48,90', 0.25); Au.sfx('sword');
  };
  SK.jingzhe = function (p, ax, ay, lv) {
    if (p.apeT > 0) p.dmgMul -= p.apeB;
    p.apeB = 0.4 + lv * 0.2; p.dmgMul += p.apeB; p.apeT = 6 + lv * 2;
    FX.ring(p.x, p.y, 10, 150, '224,184,120', 0.45, 7); FX.burst(p.x, p.y, 20, 30, { c: '224,184,120', s1: 280, l1: 0.7 });
    FX.text(p.x, p.y, 78, '山岳巨猿', '#e0b878', 20);
    inRange(p.x, p.y, 130, (e) => { const q = U.ang(p.x, p.y, e.x, e.y); E.dmgEnemy(e, 12 * p.dmgMul, { kx: Math.cos(q) * 380, ky: Math.sin(q) * 380, noCrit: true, c: '#e0b878' }); });
    G.Game.shake(6); Au.sfx('roar');
  };

  /* ============================ 自动祭出的法宝 ============================
     每件法宝按自己的间隔自行出手。a：目标的预判位置；k：伤害倍率（炼器术 × 总增伤 × 流派增伤） */
  const aimAng = (p, a) => U.ang(p.x, p.y, a.x, a.y);
  const BAO = (E.BAO = {
    jinguang(p, a, k) { E.hazCircle(a.x, a.y, 70, 0.5, 60 * k, { from: 0, kind: 'brick', c: '255,210,90', stun: 0.6, shake: 3 }); },
    wulong(p, a, k) {
      const g = aimAng(p, a);
      for (const d of [-0.16, 0.16]) E.shootP(p.x, p.y, g + d, { kind: 'hook', spd: 600, life: 0.5, dmg: 18 * k, pierce: 99, ret: true, r: 10, c: '170,180,215', spin: 1 });
      Au.sfx('sword');
    },
    qingjiao(p, a, k) {
      E.shootP(p.x, p.y, aimAng(p, a), { kind: 'jiao', spd: 540, life: 0.95, dmg: 45 * k, pierce: 99, ghost: true, kb: 320, r: 22, z: 22, c: '120,220,255', tc: '#9fe0ff' });
      FX.ring(p.x, p.y, 8, 60, '120,220,255', 0.3, 4); Au.sfx('roar');
    },
    tianleizi(p, a, k) {
      E.hazCircle(a.x, a.y, 84, 0.45, 70 * k, { from: 0, kind: 'leizi', sx: p.x, sy: p.y, c: '255,235,130', tc: '#ffe36a', stun: 0.6, shake: 3,
        onBoom(h) { for (let i = 0; i < 4; i++) { const q = U.rand(TAU); FX.bolt(h.x, h.y, 30, h.x + Math.cos(q) * 80, h.y + Math.sin(q) * 80, 6, '255,235,130', 2.5); } Au.sfx('thunder'); } });
    },
    sanyan(p, a, k) {
      const g = aimAng(p, a), C = ['255,96,60', '255,205,90', '110,160,255']; // 赤、金、蓝三色灵焰
      for (let i = 0; i < 12; i++) {
        const q = g + (i / 11 - 0.5) * 1.15;
        E.shootP(p.x + Math.cos(q) * 14, p.y + Math.sin(q) * 14, q, { kind: 'flame', spd: U.rand(380, 470), life: 0.62, dmg: 14 * k, pierce: 99, burn: 3, kb: 30, r: 11, c: C[i % 3] });
      }
      FX.slash(p.x, p.y, g, 64, '255,160,70', 1.3); Au.sfx('fire');
    },
    baling(p, a, k) {
      for (let i = 0; i < 8; i++) E.shootP(p.x, p.y, (i / 8) * TAU + p.t, { kind: 'spirit', spd: 470, life: 0.85, dmg: 35 * k, pierce: 99, ghost: true, homing: 1.2, r: 12, c: '200,235,255' });
      FX.ring(p.x, p.y, 10, 96, '200,235,255', 0.3, 4); Au.sfx('roar');
    },
    guiluo(p, a, k) {
      for (let i = 0; i < 5; i++) E.shootP(p.x, p.y, U.rand(TAU), { kind: 'skullp', spd: 300, life: 3.2, dmg: 20 * k, homing: 6, ghost: true, r: 9, z: 22, c: '154,120,255', tc: '#c9b0ff' });
      FX.ring(p.x, p.y, 8, 70, '154,120,255', 0.35, 4); Au.sfx('spawn');
    },
    xuemojian(p, a, k) {
      const g = aimAng(p, a); let n = 0;
      FX.slash(p.x, p.y, g, 150, '232,48,90', 1.9); FX.slash(p.x, p.y, g, 118, '255,120,150', 1.6);
      for (const e of G.Game.room.enemies) {
        if (!alive(e) || U.dist(p.x, p.y, e.x, e.y) > 160 + e.r || Math.abs(U.angDiff(g, U.ang(p.x, p.y, e.x, e.y))) > 0.95) continue;
        E.dmgEnemy(e, 30 * k, { kx: Math.cos(g) * 110, ky: Math.sin(g) * 110, c: '#ff7a94' }); n++;
      }
      if (n) p.hp = Math.min(p.maxHp, p.hp + n);
      Au.sfx('sword');
    },
    yuancishan(p, a, k) { E.hazCircle(a.x, a.y, 112, 0.95, 90 * k, { from: 0, kind: 'hill', c: '208,168,88', pull: 250, stun: 0.5, shake: 7 }); },
    xuejing(p, a, k) {
      FX.ring(p.x, p.y, 20, 175, '150,220,255', 0.4, 6); FX.burst(p.x, p.y, 20, 30, { c: '200,240,255', s1: 320, l1: 0.5 });
      inRange(p.x, p.y, 170, (e) => { E.dmgEnemy(e, 30 * k, { c: '#9fe0ff', noCrit: true }); if (!e.dead) { hold(e, 1.2); e.slowT = Math.max(e.slowT, 2.4); } });
      Au.sfx('ice');
    },
    heifeng(p, a, k) {
      const q = U.rand(TAU), L = 230;
      E.hazLine(a.x - Math.cos(q) * L, a.y - Math.sin(q) * L, a.x + Math.cos(q) * L, a.y + Math.sin(q) * L, 56, 0.35, 110 * k, { from: 0, kind: 'rift', c: '150,110,255', tc: '#c9b0ff', stay: 0.25 });
    },
    xuantian(p, a, k) {
      const g = aimAng(p, a), L = 900;
      E.hazLine(p.x, p.y, p.x + Math.cos(g) * L, p.y + Math.sin(g) * L, 110, 0.3, 150 * k, { from: 0, kind: 'xuantian', c: '255,240,190', tc: '#fff0be', stay: 0.3, shake: 6 });
    },
  });
  const BAO_RANGE = { xuejing: 165, xuemojian: 165 };                                     // 贴身才出手的
  const BAO_LEAD = { jinguang: 0.42, tianleizi: 0.38, yuancishan: 0.3, heifeng: 0.3 };     // 落地有延迟的，按延迟预判

  function updateAutos(dt, Gm, p) {
    const tgt = Gm.target;
    for (const id of p.relicList) {
      const def = G.Relics[id]; if (!def.auto) continue;
      let t = (p.autoT[id] === undefined ? 1 + Math.random() * 2.5 : p.autoT[id]) - dt;
      if (t <= 0) {
        const rng = BAO_RANGE[id] || 520;
        let e = tgt && U.dist(p.x, p.y, tgt.x, tgt.y) < rng + tgt.r ? tgt : null;
        if (!e && BAO_RANGE[id]) e = E.nearestEnemy(p.x, p.y, rng);
        if (e) {
          const lead = BAO_LEAD[id] !== undefined ? BAO_LEAD[id] : Math.min(0.5, U.dist(p.x, p.y, e.x, e.y) / 540);
          BAO[id](p, { x: e.x + (e.vx || 0) * lead, y: e.y + (e.vy || 0) * lead }, p.baoMul * p.dmgMul * schK(p, def.sch), e);
          FX.text(p.x, p.y, 62, def.name, G.Schools[def.sch].color, 12);
          t = def.auto * p.baoCd;
        } else t = 0;
      }
      p.autoT[id] = t;
    }
  }

  /* ============================ 灵宠灵虫 ============================
     常驻身侧，不会受伤。act：冷却转好且射程内有敌人时出手；tick：需要自己走位的（扑击、近战）返回 true 表示这一帧不跟随 */
  const PET = (E.PET = {
    zhizhu: { cd: 5, range: 400, act(pt, e, p, k) {
      E.shootP(pt.x, pt.y, U.ang(pt.x, pt.y, e.x, e.y), { kind: 'webshot', spd: 520, life: Math.min(0.9, U.dist(pt.x, pt.y, e.x, e.y) / 520 + 0.05), dmg: 8 * k, r: 9, z: 16, ghost: true, c: '235,235,245',
        onEnd: (pr) => E.hazPuddle(pr.x, pr.y, 78, 4, 9 * k, { from: 0, c: '230,230,240', kind: 'web' }) });
    } },
    tihun: { cd: 6, range: 250, act(pt, e, p, k) {
      FX.ring(pt.x, pt.y, 10, 240, '154,120,255', 0.45, 5); FX.text(pt.x, pt.y, 50, '啼——', '#c9b0ff', 16); Au.sfx('roar');
      inRange(pt.x, pt.y, 240, (q) => {
        if (!q.def.evil) { q.slowT = Math.max(q.slowT, 1.2); return; }
        if (!q.boss && !q.elite && q.hp < q.maxHp * 0.25) { // 吞噬
          FX.thread(q.x, q.y, pt.x, pt.y, '154,120,255', 0.35); E.dmgEnemy(q, q.hp + 1, { noCrit: true, c: '#c9b0ff' }); p.hp = Math.min(p.maxHp, p.hp + 3); return;
        }
        E.dmgEnemy(q, 30 * k, { noCrit: true, c: '#c9b0ff' }); if (!q.dead) hold(q, 1.2);
      });
    } },
    shuangwu: { cd: 3.6, range: 400, z: 26, act(pt, e, p, k) {
      const a = U.ang(pt.x, pt.y, e.x, e.y);
      for (let i = -2; i <= 2; i++) E.shootP(pt.x, pt.y, a + i * 0.14, { kind: 'ice', spd: 540, life: 0.75, dmg: 8 * k, pierce: 1, slow: 2, r: 7, z: 20, c: '150,220,255', tc: '#9fe0ff' });
      Au.sfx('ice');
    } },
    yinyue: { cd: 10, range: 250, act(pt) {
      FX.ring(pt.x, pt.y, 10, 250, '255,200,235', 0.5, 5); FX.petals(pt.x, pt.y, 14, 34, '255,200,235', { s0: 120, s1: 330, l1: 1.3 }); FX.ribbon(pt, '255,200,235', 1.0, 26, 2.2);
      FX.text(pt.x, pt.y, 50, '迷魂', '#ffd0f0', 15);
      inRange(pt.x, pt.y, 250, (q) => hold(q, 1.6));
      Au.sfx('shield');
    } },
    tujia: { cd: 6, range: 440, act(pt, e, p, k) {
      pt.hide = 0.7; // 钻进地里，从敌人脚下出来
      E.hazCircle(e.x, e.y, 62, 0.6, 40 * k, { from: 0, kind: 'burrow', c: '208,168,88', tc: '#e0c080', stun: 0.9,
        onBoom(h) { pt.x = h.x; pt.y = h.y; pt.hide = 0; FX.burst(h.x, h.y, 6, 16, { c: '150,120,80', s1: 200, add: false, z1: 8, l1: 0.7 }); } });
    } },
    baolin: { cd: 4.5, range: 460, los: true,
      act(pt, e, p, k) {
        const a = U.ang(pt.x, pt.y, e.x, e.y);
        pt.st = 'dash'; pt.dx = Math.cos(a); pt.dy = Math.sin(a); pt.left = U.dist(pt.x, pt.y, e.x, e.y) + 90; pt.hit = new Set(); pt.k = k; Au.sfx('dash');
      },
      tick(pt, dt, p, k, room) {
        if (pt.st !== 'dash') return false;
        const step = Math.min(pt.left, 950 * dt);
        pt.x += pt.dx * step; pt.y += pt.dy * step; pt.left -= step; pt.moving = pt.charge = true; pt.face = Math.atan2(pt.dy, pt.dx);
        FX.p(pt.x, pt.y, U.rand(6, 26), { c: '255,235,130', life: 0.25, size: U.rand(2, 5), vx: U.rand(-30, 30), vy: U.rand(-30, 30) });
        inRange(pt.x, pt.y, 30, (q) => {
          if (pt.hit.has(q)) return; pt.hit.add(q);
          E.dmgEnemy(q, 34 * pt.k, { kx: pt.dx * 260, ky: pt.dy * 260, c: '#ffe36a', evilMul: 1.6 });
          FX.burst(q.x, q.y, 16, 6, { c: '255,235,130', s1: 150, l1: 0.3 });
        });
        if (pt.left <= 0 || W.solid(room, Math.floor(pt.x / T), Math.floor(pt.y / T), 3)) { pt.st = 'follow'; pt.charge = false; }
        return true;
      } },
    quhun: { cd: 0.9, range: 0, tick(pt, dt, p, k) { // 近身缠斗，不离主人太远
      const e = E.nearestEnemy(p.x, p.y, 380);
      if (!e) return false;
      const d = U.dist(pt.x, pt.y, e.x, e.y), a = U.ang(pt.x, pt.y, e.x, e.y);
      pt.face = a;
      if (d > 40 + e.r) { const s = Math.min(d, 215 * dt); pt.x += Math.cos(a) * s; pt.y += Math.sin(a) * s; pt.moving = true; }
      else {
        pt.moving = false;
        if (pt.cd <= 0) {
          pt.cd = 0.9; pt.atk = 1;
          E.dmgEnemy(e, 22 * k, { kx: Math.cos(a) * 200, ky: Math.sin(a) * 200, c: '#d8dce6' });
          FX.slash(pt.x, pt.y, a, 46, '220,224,235', 1.4); Au.sfx('hit');
        }
      }
      return true;
    } },
    renxing: { cd: 0.55, range: 460, los: true, act(pt, e, p, k) {
      E.shootP(pt.x, pt.y, U.ang(pt.x, pt.y, e.x, e.y), { kind: 'bolt', spd: 680, life: 0.8, dmg: 10 * k * p.kuiMul, pierce: 2, r: 7, z: 24, c: '255,190,90', tc: '#ffd28a' });
      Au.sfx('shoot');
    } },
  });

  /* 进房间 / 新得灵宠时：让灵宠回到身边 */
  E.resetPets = function () {
    const Gm = G.Game, p = Gm.player, list = p.pets.filter((id) => PET[id]);
    Gm.pets = list.map((id, i) => {
      const a = (i / Math.max(1, list.length)) * TAU;
      return { id, x: p.x + Math.cos(a) * 40, y: p.y + Math.sin(a) * 40, z: PET[id].z || 0, face: p.face, t: U.rand(9), cd: 1 + i * 0.6, slot: i, n: list.length, moving: false, atk: 0, st: 'follow', hide: 0 };
    });
  };

  function petBeetle(p, k) { // 噬金虫：常驻的虫群，没有目标时绕着主人飞
    E.shootP(p.x + U.rand(-16, 16), p.y + U.rand(-16, 16), U.rand(TAU), { kind: 'beetle', swarm: true, pet: true, spd: 270, life: 1e9, dmg: 4.5 * k, bites: Infinity, biteCd: 0.85, cool: 0.3, homing: 9, r: 7, z: 14, c: '255,210,80', ghost: true });
  }

  function updatePets(dt, Gm, p, room) {
    if (p.relics.chongluan) {
      p.bugT = (p.bugT || 0) - dt;
      if (p.bugT <= 0) {
        p.bugT = 0.4;
        let n = 0; for (const pr of Gm.projs) if (pr.pet) n++;
        if (n < 4 + (p.craft.chong || 0) * 2) petBeetle(p, p.petMul * p.dmgMul * schK(p, 'bug'));
      }
    }
    for (const pt of Gm.pets) {
      const D = PET[pt.id], k = p.petMul * p.dmgMul * schK(p, G.Relics[pt.id].sch);
      pt.t += dt; pt.cd -= dt;
      if (pt.atk > 0) pt.atk = Math.max(0, pt.atk - dt * 3);
      if (pt.hide > 0) pt.hide -= dt;
      if (D.tick && D.tick(pt, dt, p, k, room)) continue;
      // 跟在主人身后，各占一个位置
      const a = p.face + Math.PI + (pt.slot - (pt.n - 1) / 2) * 0.85, fx = p.x + Math.cos(a) * 60, fy = p.y + Math.sin(a) * 60;
      const d = U.dist(pt.x, pt.y, fx, fy);
      if (d > 560) { pt.x = fx; pt.y = fy; }
      else if (d > 8) { const s = Math.min(d, Math.min(340, d * 5) * dt), q = U.ang(pt.x, pt.y, fx, fy); pt.x += Math.cos(q) * s; pt.y += Math.sin(q) * s; if (d > 16) pt.face = q; }
      pt.moving = d > 16;
      pt.x = U.clamp(pt.x, T * 1.3, (room.w - 1.3) * T); pt.y = U.clamp(pt.y, T * 1.3, (room.h - 1.3) * T);
      if (D.act && pt.cd <= 0 && !(pt.hide > 0)) {
        const e = E.nearestEnemy(pt.x, pt.y, D.range, D.los);
        if (e) { pt.face = U.ang(pt.x, pt.y, e.x, e.y); pt.atk = 1; D.act(pt, e, p, k); pt.cd = D.cd; }
        else pt.cd = 0.3;
      }
    }
  }

  /* ============================ 每帧 ============================ */
  E.updateArsenal = function (dt) {
    const Gm = G.Game, p = Gm.player, room = Gm.room;
    if (p.dead) return;
    updateAutos(dt, Gm, p);
    // 混元钵：收满之后歇十息
    if (p.flags.bowl && p.bowlN < 12) { p.bowlT += dt; if (p.bowlT >= 10) { p.bowlT = 0; p.bowlN = 12; } }
    // 皇鳞甲：鳞光重凝
    if (p.flags.huanglin && p.lin < 20) { p.linT += dt; if (p.linT >= 8) { p.linT = 0; p.lin = 20; } }
    // 紫罗极火：环身寒焰
    if (p.flags.ziluo) {
      p.auraT -= dt;
      if (p.auraT <= 0) {
        p.auraT = 0.5; const k = p.baoMul * p.dmgMul * schK(p, 'fire');
        inRange(p.x, p.y, 112, (e) => { E.dmgEnemy(e, 7 * k, { noCrit: true, c: '#c9a0ff' }); if (!e.dead) e.slowT = Math.max(e.slowT, 0.7); });
      }
    }
    // 制符术：自动打出符箓
    if (p.craft.fu) {
      p.fuT -= dt;
      if (p.fuT <= 0) {
        if (Gm.targetInRange) {
          const a = Gm.aim(540);
          (U.chance(0.5) ? SK.fireball : SK.ice)(p, a.x, a.y, p.craft.fu);
          FX.text(p.x, p.y, 62, '符箓', '#ffb070', 12);
          p.fuT = 14 - p.craft.fu * 2;
        } else p.fuT = 0;
      }
    }
    updatePets(dt, Gm, p, room);
  };
})();
