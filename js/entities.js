'use strict';
/* 凡人问道 —— 实体：特效、伤害结算、玩家、飞行道具、地面招式、神通 */
(function () {
  const G = window.G, U = G.U, W = G.World, T = G.TILE, TAU = G.TAU;
  const E = (G.Ent = {});
  const Au = G.Audio;

  /* ============================ 特效 ============================ */
  const FX = (G.FX = {
    parts: [], texts: [],
    clear() { this.parts.length = 0; this.texts.length = 0; },
    p(x, y, z, o) {
      if (this.parts.length > 900) return;
      this.parts.push({ kind: o.kind || 'dot', x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0,
        life: o.life || 0.5, max: o.life || 0.5, size: o.size || 3, c: o.c || '255,255,255', add: o.add !== false, drag: o.drag || 0, a: o.a || 1 });
    },
    burst(x, y, z, n, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(TAU), s = U.rand(o.s0 || 40, o.s1 || 170);
        this.p(x, y, z, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(o.vz0 || 0, o.vz1 === undefined ? 140 : o.vz1),
          g: o.g === undefined ? 320 : o.g, life: U.rand(o.l0 || 0.25, o.l1 || 0.6), size: U.rand(o.z0 || 2, o.z1 || 4.5),
          c: o.c, add: o.add, kind: o.kind, drag: o.drag });
      }
    },
    ring(x, y, r0, r1, c, life = 0.35, w = 3) {
      this.parts.push({ kind: 'ring', x, y, z: 0, r0, r1, life, max: life, c, w, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    slash(x, y, ang, r, c, arc = 1.3) {
      this.parts.push({ kind: 'slash', x, y, z: 16, ang, r, arc, life: 0.18, max: 0.18, c, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 闪电：主干 + 分叉。天雷（自上而下）落点带一圈金光与火花
    bolt(x1, y1, z1, x2, y2, z2, c, w = 3) {
      const pts = [], n = 8, len = Math.hypot(x2 - x1, y2 - y1, z2 - z1), jit = Math.min(22, 6 + len * 0.05);
      for (let i = 0; i <= n; i++) {
        const t = i / n, k = i === 0 || i === n ? 0 : 1;
        pts.push([U.lerp(x1, x2, t) + U.rand(-jit, jit) * k, U.lerp(y1, y2, t) + U.rand(-jit, jit) * 0.6 * k, U.lerp(z1, z2, t) + U.rand(-jit, jit) * 0.7 * k]);
      }
      const br = [];
      for (let b = 0; b < (len > 120 ? 2 : 1); b++) { // 分叉
        const o = pts[U.randi(2, n - 2)], a = U.rand(TAU), l = U.rand(18, 46), seg = [o];
        for (let q = 1; q <= 3; q++) seg.push([o[0] + Math.cos(a) * l * q * 0.4 + U.rand(-6, 6), o[1] + Math.sin(a) * l * q * 0.4 + U.rand(-6, 6), o[2] - q * U.rand(4, 14)]);
        br.push(seg);
      }
      this.parts.push({ kind: 'bolt', pts, br, life: 0.22, max: 0.22, c, w, add: true, x: x2, y: y2, z: z2, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
      if (z1 > 200) { this.ring(x2, y2, 4, 52, c, 0.28, 4); this.burst(x2, y2, 8, 9, { c, s0: 60, s1: 230, l0: 0.15, l1: 0.38, z0: 2, z1: 3.5 }); this.boom(x2, y2, 44, c, { smoke: false, zap: true }); } // 雷落下来不起火：一闪、几道电芒、地上一片焦裂
    },
    // 阵图：贴地旋转的法阵，r0 → r1
    array(x, y, r0, r1, c, life = 0.6, spin = 1.5) {
      this.parts.push({ kind: 'array', x, y, z: 0, r0, r1, c, spin, rot: U.rand(TAU), life, max: life, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 风雷翅的光翼，跟随玩家
    wings(life = 0.5) {
      this.parts.push({ kind: 'wings', x: 0, y: 0, z: 0, life, max: life, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 花瓣：柔性法术（疗伤、迷魂、突破）用的流光花瓣，飘而不炸
    petals(x, y, z, n, c, o = {}) {
      for (let i = 0; i < n && this.parts.length < 900; i++) {
        const a = U.rand(TAU), s = U.rand(o.s0 || 20, o.s1 || 110), life = U.rand(o.l0 || 0.7, o.l1 || 1.5);
        this.parts.push({ kind: 'petal', x: x + Math.cos(a) * (o.r || 6), y: y + Math.sin(a) * (o.r || 6), z: z + U.rand(0, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(o.vz0 === undefined ? 30 : o.vz0, o.vz1 === undefined ? 120 : o.vz1),
          g: o.g === undefined ? 60 : o.g, drag: 1.6, life, max: life, size: U.rand(3.5, 6.5), c, rot: U.rand(TAU), spin: U.rand(-5, 5), add: true });
      }
    },
    // 绸带：绕着某个人盘旋上升的一道流光
    ribbon(who, c, life = 0.9, r = 34, turns = 1.6, a0 = U.rand(TAU)) {
      this.parts.push({ kind: 'ribbon', who, x: who.x, y: who.y, z: 0, c, r, turns, a0, life, max: life, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 爆炸：一团火、几缕烟、一圈冲击波，地上留一片焦裂（由写实画风的贴图粒子来画；青绿画风下只有原来那圈环与火星）
    boom(x, y, r, c, o = {}) {
      if (this.parts.length > 860) return;
      this.parts.push({ kind: 'boom', x, y, z: o.z || 0, r, c, foe: !!o.foe, smoke: o.smoke !== false, zap: !!o.zap, seed: Math.random() * 100, life: 0.55, max: 0.55, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
      if (o.scorch !== false && r >= 36) this.parts.push({ kind: 'scorch', x, y, z: 0, r: r * 0.95, c, foe: !!o.foe, seed: Math.random() * 6.28, life: 2.6, max: 2.6, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 命中的火花：一闪而过的星芒
    spark(x, y, z, c, size = 24) {
      if (this.parts.length > 860) return;
      this.parts.push({ kind: 'spark', x, y, z, size, c, rot: Math.random() * 6.28, life: 0.13, max: 0.13, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    // 剑丝：一道转瞬即逝的直线
    thread(x1, y1, x2, y2, c, life = 0.24) {
      if (this.parts.length > 900) return;
      this.parts.push({ kind: 'thread', x1, y1, x2, y2, x: x1, y: y1, z: 0, c, life, max: life, add: true, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 });
    },
    text(x, y, z, str, c = '#fff', size = 14) {
      if (this.texts.length > 60) this.texts.shift();
      this.texts.push({ x: x + U.rand(-8, 8), y, z, str: String(str), c, size, life: 0.75, max: 0.75, vx: U.rand(-18, 18), vz: 70 });
    },
    update(dt) {
      const P = this.parts;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
        if (p.kind === 'petal') { // 花瓣：减速、飘落，落地即止
          p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= p.g * dt; p.rot += p.spin * dt;
          const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; continue;
        }
        if (p.kind !== 'dot') continue;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.6; p.vy *= 0.6; }
      }
      const X = this.texts;
      for (let i = X.length - 1; i >= 0; i--) {
        const t = X[i]; t.life -= dt;
        if (t.life <= 0) { X.splice(i, 1); continue; }
        t.x += t.vx * dt; t.z += t.vz * dt; t.vz -= 90 * dt;
      }
    },
  });

  /* ============================ 玩家 ============================ */
  E.makePlayer = function (meta) {
    const p = {
      x: 0, y: 0, z: 0, r: 13, face: 0, t: 0, moving: false,
      maxHp: 100 + meta.body * 12, hp: 0, maxMp: 100, mp: 100, mpRegen: 9, hpRegen: 0,
      dmgMul: 1 + meta.root * 0.05, swordMul: 1, spellMul: 1, swordDmg: 10, atkSpd: 3.2, crit: 0.05, critMul: 1.8,
      speed: 235, cdr: 0, swords: 1, pierce: 0, rangeMul: 1,
      dashMax: 1, dashN: 1, dashCd: 1.4, dashT: 0, dashing: 0, dashDx: 1, dashDy: 0,
      armor: 0, xpMul: 1 + meta.wit * 0.08, stoneMul: 1, invDur: 0.6, inv: 0, flash: 0,
      flags: {}, relics: {}, relicList: [],
      skills: [{ id: 'fireball', lv: 1, cd: 0 }],
      stones: meta.luck * 30, potions: 1 + meta.bag, drops: meta.vial,
      level: 1, xp: 0, xpNeed: 40, realm: 0, realmLv: 1, pendingLv: 0,
      atkT: 0, atkAnim: 0, shield: 0, shieldT: 0, shieldMax: 0, autoShieldT: 0,
      qy: 0, fy: 0, sp: 0, // 青元剑诀层数 / 是否炼成青竹蜂云剑 / 剑意
      formT: 0, formN: 0, formLv: 1, formTick: 0, potionCd: 0,
      // 流派增伤 / 法宝 / 灵宠 / 技艺
      schMul: {}, baoMul: 1, baoCd: 1, petMul: 1, kuiMul: 1, potionMul: 1, craft: {}, pets: [], petCap: 3, autoT: {},
      main: null, du: 0, wd: 0, dy: 0, ky: 0, kuiT: 0, psn: 0, psnMul: 1, psnCap: 6, psnVuln: 0, // 主修功法；墨氏毒经的层数、本命万毒幡；毒
      dageng: 0, lin: 0, linT: 0, apeT: 0, apeB: 0, wardT: 0, fanT: 0, bowlN: 0, bowlT: 0, fuT: 6, auraT: 0, bmB: 0,
      look: { robe: '#3f8f86', trim: '#d9f2e6', skin: '#f2d2b0', hat: 'player', backSword: true, weapon: 'none' },
    };
    p.hp = p.maxHp;
    return p;
  };

  E.realmName = function (p) {
    if (p.realm === 0) return `炼气期 ${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'][Math.min(12, p.realmLv - 1)]}层`;
    return G.REALMS[p.realm] + ' · ' + ['初期', '初期', '中期', '中期', '后期', '后期', '大圆满'][Math.min(6, p.realmLv - 1)];
  };

  E.hurtPlayer = function (d, sx, sy) {
    const Gm = G.Game, p = Gm.player;
    if (p.dead || p.inv > 0 || p.dashing > 0 || Gm.god || Gm.transit) return false; // 换图途中不受伤
    if (p.flags.autoShield && p.autoShieldT <= 0) {
      p.autoShieldT = 12; p.inv = 0.4;
      FX.ring(p.x, p.y, 10, 60, '200,220,255', 0.3, 4); FX.text(p.x, p.y, 50, '飞天盾', '#c9d4e8', 14); Au.sfx('block');
      return false;
    }
    d *= 1 - Math.min(0.7, p.armor + (p.apeT > 0 ? 0.3 : 0));
    if (p.wardT > 0) d *= 0.75; // 身在颠倒五行阵中
    if (p.lin > 0) {            // 皇鳞甲的鳞光
      const a = Math.min(p.lin, d); p.lin -= a; d -= a; p.linT = 0;
      FX.burst(p.x, p.y, 20, 6, { c: '255,215,120', s1: 120 });
      if (d <= 0.5) { p.inv = 0.2; Au.sfx('block'); return false; }
    }
    if (p.shield > 0) {
      const a = Math.min(p.shield, d); p.shield -= a; d -= a;
      Au.sfx('block'); FX.burst(p.x, p.y, 20, 6, { c: '200,220,255', s1: 120 });
      if (p.shield <= 0) E.shieldBurst(p);
      if (d <= 0.5) { p.inv = 0.2; return false; }
    }
    d = Math.max(1, Math.round(d));
    p.hp -= d; p.inv = p.invDur; p.flash = 0.18; Gm.combo = 0; Gm.comboT = 0;
    Gm.stats.taken += d;
    Gm.shake(7); Gm.hurtFlash = 0.35;
    FX.text(p.x, p.y, 52, '-' + d, '#ff5a5a', 17);
    FX.burst(p.x, p.y, 20, 8, { c: '255,80,80', s1: 150, add: false });
    Au.sfx('hurt');
    if (p.flags.fansheng && !(p.fanT > 0)) { // 梵圣真魔功：法相反震
      p.fanT = 1; FX.ring(p.x, p.y, 16, 140, '224,184,120', 0.35, 6);
      for (const e of Gm.room.enemies) {
        if (e.dead || e.untarget || e.st === 'spawn' || U.dist(p.x, p.y, e.x, e.y) > 135 + e.r) continue;
        const a = U.ang(p.x, p.y, e.x, e.y);
        E.dmgEnemy(e, 20 * p.dmgMul, { kx: Math.cos(a) * 460, ky: Math.sin(a) * 460, noCrit: true, c: '#e0b878' });
      }
    }
    if (p.hp <= 0) {
      if (p.flags.ding && p.dingReady) {
        p.dingReady = false; p.hp = Math.round(p.maxHp * 0.25); p.inv = 2.5;
        FX.ring(p.x, p.y, 10, 200, '255,225,150', 0.6, 7); FX.burst(p.x, p.y, 20, 36, { c: '255,225,150', s1: 260 });
        FX.text(p.x, p.y, 66, '虚天鼎', '#ffe6a0', 18); Gm.toast('虚天鼎嗡鸣一声，将你罩入鼎中'); Au.sfx('block'); Au.sfx('break');
      } else if (p.flags.revive > 0) {
        p.flags.revive--; p.hp = p.maxHp; p.mp = p.maxMp; p.inv = 2;
        FX.ring(p.x, p.y, 10, 220, '160,255,200', 0.6, 6); FX.burst(p.x, p.y, 20, 40, { c: '160,255,200', s1: 260 });
        Gm.toast('万年灵乳化开，气血尽复！'); Au.sfx('break');
        for (const e of Gm.room.enemies) if (!e.boss) { const a = U.ang(p.x, p.y, e.x, e.y); e.kx += Math.cos(a) * 500; e.ky += Math.sin(a) * 500; }
      } else if (p.flags.huiyang > 0) {
        p.flags.huiyang--; p.hp = Math.round(p.maxHp * 0.5); p.inv = 2;
        FX.ring(p.x, p.y, 10, 200, '255,200,140', 0.6, 6); FX.burst(p.x, p.y, 20, 30, { c: '255,200,140', s1: 240 });
        Gm.toast('回阳水化开，一线生机重续'); Au.sfx('break');
      } else { p.hp = 0; p.dead = true; Gm.onPlayerDead(); }
    }
    return true;
  };

  E.shieldBurst = function (p) {
    const Gm = G.Game;
    p.shield = 0; p.shieldT = 0;
    FX.ring(p.x, p.y, 20, 150, '200,220,255', 0.35, 5); Au.sfx('boom');
    for (const e of Gm.room.enemies) {
      if (e.dead || U.dist(p.x, p.y, e.x, e.y) > 150) continue;
      const a = U.ang(p.x, p.y, e.x, e.y);
      E.dmgEnemy(e, 14 * p.spellMul * p.dmgMul, { kx: Math.cos(a) * 420, ky: Math.sin(a) * 420, noCrit: true });
    }
  };

  /* ============================ 伤害结算 ============================ */
  E.dmgEnemy = function (e, raw, o = {}) {
    const Gm = G.Game, p = Gm.player;
    if (e.dead || e.st === 'spawn' || e.untarget) return 0;
    if (e.invT > 0) { FX.text(e.x, e.y, e.r * 2 + 14, '免疫', '#c9c9c9', 12); return 0; }
    let d = raw, crit = false;
    if (!o.noCrit && ((p.flags.firstCrit && !e.wasHit) || Math.random() < p.crit)) { crit = true; d *= p.critMul; }
    e.wasHit = true;
    if (p.flags.bossBane && (e.elite || e.boss)) d *= 1.2;
    if (p.flags.evilBane && e.def.evil) d *= 1.4;
    if (p.flags.rage && p.hp < p.maxHp * 0.4) d *= 1.4;
    if (o.evilMul && e.def.evil) d *= o.evilMul;
    if (e.psn > 0 && p.psnVuln && !o.dot) d *= 1 + p.psnVuln;
    d = Math.max(1, Math.round(d));
    e.hp -= d; e.flash = 0.1;
    Gm.stats.dmg += d;
    Gm.combo = (Gm.comboT > 0 ? Gm.combo : 0) + 1; Gm.comboT = 2.4;
    FX.text(e.x, e.y, e.r * 2 + 14, crit ? d + '!' : d, crit ? '#ffd24a' : o.c || '#ffffff', crit ? 19 : o.dot ? 11 : 13);
    if (!o.dot && !(e.spT > p.t)) { e.spT = p.t + 0.07; FX.spark(e.x + U.rand(-e.r, e.r) * 0.5, e.y + U.rand(-e.r, e.r) * 0.4, e.r + 8 + U.rand(10), crit ? '255,214,90' : '255,246,220', crit ? 40 : 26); } // 命中的星芒（同一个敌人不连着闪）
    if ((o.kx || o.ky) && !e.boss) { const m = e.def.ai === 'tank' || e.def.ai === 'turret' ? 0.2 : 1; e.kx += (o.kx || 0) * m; e.ky += (o.ky || 0) * m; }
    if (!o.dot) Au.sfx(crit ? 'crit' : 'hit');
    if (e.hp <= 0) E.killEnemy(e);
    return d;
  };

  /* 毒：一层层叠上去，每层每秒 3 点伤害（在 enemies.js 里结算），持续 4 秒，再中毒则续上 */
  const PSN_C = '154,200,50';
  E.poison = function (e, n) {
    const p = G.Game.player;
    if (!n || e.dead || e.st === 'spawn' || e.untarget) return;
    e.psn = Math.min(p.psnCap, (e.psn || 0) + n); e.psnT = 4;
    if (p.flags.psnRoot && e.psn >= p.psnCap && !(e.rootCd > 0) && !e.boss) { e.stunT = Math.max(e.stunT, 1.2); e.rootCd = 8; FX.ring(e.x, e.y, 6, e.r + 22, PSN_C, 0.3, 3); FX.text(e.x, e.y, e.r * 2 + 26, '缠', '#d2f08a', 14); }
  };

  E.killEnemy = function (e) {
    const Gm = G.Game, p = Gm.player, room = Gm.room;
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    Gm.stats.kills++;
    const col = e.def.look && (e.def.look.body || e.def.look.robe || e.def.look.fur || e.def.look.petal) || '#ffffff';
    const rgb = hexRgb(col);
    FX.burst(e.x, e.y, e.r, e.boss ? 80 : 14, { c: rgb, s1: e.boss ? 380 : 190, add: false, z1: 6 });
    FX.burst(e.x, e.y, e.r, e.boss ? 50 : 8, { c: '255,240,200', s1: 220 });
    FX.ring(e.x, e.y, 6, e.boss ? 260 : 50, '255,240,200', 0.35); FX.spark(e.x, e.y, e.r + 6, '255,240,200', e.boss ? 150 : 52);
    Gm.stain(e.x, e.y, e.boss ? 70 : e.elite ? 40 : 22 + e.r * 0.5, e.def.fly || e.def.draw === 'ghost' || e.def.draw === 'skull' || e.def.draw === 'flame' ? 1 : e.def.draw === 'puppet' || e.def.draw === 'crystal' ? 2 : 0);
    Au.sfx('kill');
    if (!e.def.minion || e.boss) {
      const ch = room.chapter;
      Gm.gainXp((e.def.xp || 0) * (e.elite ? 3 : 1) * (e.boss ? 1 : 1 + ch * 0.25));
      const n = e.boss ? 12 : e.elite ? 4 : U.chance(0.45) ? 1 : 0;
      for (let i = 0; i < n; i++) E.dropPickup('stone', e.x, e.y, Math.round(U.randi(2, 4) * (1 + ch * 0.25) * (e.boss ? 3 : 1)));
      if (!e.boss && U.chance(e.elite ? 0.5 : 0.035)) E.dropPickup('potion', e.x, e.y, 1);
    }
    if (p.fy || p.wd || p.ky) p.sp = Math.min(100, p.sp + G.Fengyun.perKill);
    if (e.psn > 0) {
      if (p.flags.psnBurst) { // 尸毒相传
        const n = Math.ceil(e.psn / 2);
        for (const o of room.enemies) if (o !== e && !o.dead && U.dist(e.x, e.y, o.x, o.y) < 130 + o.r) E.poison(o, n);
        FX.ring(e.x, e.y, 8, 130, PSN_C, 0.35, 5); FX.burst(e.x, e.y, 14, 14, { c: PSN_C, s1: 200, l1: 0.5 });
      }
      if (p.flags.psnFeed) { p.hp = Math.min(p.maxHp, p.hp + 2); p.mp = Math.min(p.maxMp, p.mp + 4); }
    }
    if (p.flags.leech) p.hp = Math.min(p.maxHp, p.hp + p.flags.leech);
    if (p.flags.xuanyin) { p.hp = Math.min(p.maxHp, p.hp + 3); p.mp = Math.min(p.maxMp, p.mp + 4); }
    if (p.flags.evilBane && e.def.evil) p.mp = Math.min(p.maxMp, p.mp + 6);
    if (p.flags.beetle && U.chance(0.4)) E.spawnBeetle(e.x, e.y, 1);
    if (e.affix === 'burst') for (let i = 0; i < 10; i++) E.shootE(e.x, e.y, (i / 10) * TAU, 170, { dmg: e.dmg * 0.7, c: '255,150,60' });
    if (e.boss) Gm.onBossDead(e);
  };

  function hexRgb(h) {
    if (!h || h[0] !== '#') return '255,255,255';
    return parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16);
  }
  E.hexRgb = hexRgb;

  E.dropPickup = function (kind, x, y, val) {
    const a = U.rand(TAU), s = U.rand(60, 170);
    G.Game.room.pickups.push({ kind, x, y, z: 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(120, 220), val, t: 0 });
  };

  /* ============================ 飞行道具 ============================ */
  E.shootP = function (x, y, ang, o) {
    const pr = Object.assign({ x, y, z: 18, vx: Math.cos(ang) * o.spd, vy: Math.sin(ang) * o.spd, r: 8, from: 0, pierce: 0,
      t: 0, hit: new Set(), ang }, o);
    pr.max = pr.life;
    G.Game.projs.push(pr); return pr;
  };
  E.shootE = function (x, y, ang, spd, o = {}) {
    const pr = Object.assign({ x, y, z: 16, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 7, from: 1, kind: 'orb',
      c: '255,90,90', life: 6, t: 0, spd, ang }, o);
    pr.max = pr.life;
    if (G.Game.projs.length < 700) G.Game.projs.push(pr);
    return pr;
  };

  function swordDamage(p) { return p.swordDmg * p.swordMul * p.dmgMul; }

  function fireSwords(p, ax, ay) {
    const base = U.ang(p.x, p.y, ax, ay), n = p.swords;
    const spd = 760 * (0.8 + 0.2 * p.rangeMul), life = (470 * p.rangeMul) / spd;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.13;
      E.shootP(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a, { kind: 'sword', spd, life, dmg: swordDamage(p), pierce: p.pierce, sword: true, r: 9, style: p.fy ? 2 : p.qy ? 1 : 0, c: p.fy ? '170,255,110' : p.qy ? '110,255,170' : '150,255,220' });
    }
    p.atkAnim = 1; Au.sfx('sword');
  }

  function swordHit(e, pr) {
    const Gm = G.Game, p = Gm.player;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    E.dmgEnemy(e, pr.dmg, { kx: (pr.vx / sp) * 90, ky: (pr.vy / sp) * 90 });
    FX.burst(pr.x, pr.y, pr.z, 4, { c: pr.c, s1: 130, l1: 0.3 });
    if (pr.mini) return;
    if (p.flags.iceflame && !e.dead) { e.slowT = Math.max(e.slowT, 1.6); e.burnT = Math.max(e.burnT, 2.4); }
    if (!e.dead) { if (p.psn) E.poison(e, p.psn); if (p.flags.qidu && U.chance(0.3)) E.poison(e, p.flags.qidu); } // 淬毒的飞剑
    if (p.fy || p.wd || p.ky) p.sp = Math.min(100, p.sp + G.Fengyun.perHit);
    if (p.flags.thunder && U.chance(0.06 + 0.14 * p.flags.thunder)) E.chainThunder(e, pr.dmg * 0.7, 3);
    if (p.flags.split && !pr.back) {
      const a = Math.atan2(pr.vy, pr.vx);
      for (const d of [-1, 1]) {
        const m = E.shootP(pr.x, pr.y, a + d * 1.0, { kind: 'sword', spd: 620, life: 0.32, dmg: pr.dmg * 0.4, mini: true, sword: true, r: 6, c: '255,220,130' });
        m.hit.add(e);
      }
    }
  }

  E.chainThunder = function (e0, dmg, jumps) {
    const Gm = G.Game; const seen = new Set([e0]); let cur = e0;
    FX.bolt(cur.x, cur.y, 320, cur.x, cur.y, 10, '255,235,130', 3.5);
    E.dmgEnemy(cur, dmg, { c: '#ffe36a', evilMul: 1.6, noCrit: true });
    Au.sfx('thunder');
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = 190;
      for (const e of Gm.room.enemies) {
        if (e.dead || seen.has(e) || e.untarget || e.st === 'spawn') continue;
        const d = U.dist(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      FX.bolt(cur.x, cur.y, 16, best.x, best.y, 16, '255,235,130', 2.5);
      seen.add(best); cur = best;
      E.dmgEnemy(cur, dmg, { c: '#ffe36a', evilMul: 1.6, noCrit: true });
      cur.stunT = Math.max(cur.stunT, 0.25);
    }
  };

  E.spawnBeetle = function (x, y, lv) {
    const p = G.Game.player, a = U.rand(TAU);
    E.shootP(x, y, a, { kind: 'beetle', swarm: true, spd: 250, life: 7, dmg: 7 * (1 + 0.25 * (lv - 1)) * p.spellMul * p.dmgMul, bites: 4, cool: 0.2, homing: 9, r: 7, z: 14, c: '255,210,80', ghost: true });
  };

  /* 青竹蜂云剑 · 蜂云剑阵：七十二口飞剑倾巢而出，自行追击 */
  E.castUlt = function () {
    const Gm = G.Game, p = Gm.player, F = G.Fengyun;
    const has = p.fy || p.wd || p.ky;
    if (!has || p.sp < 100 || p.dead) { if (has && !(p.noMpT > 0)) { FX.text(p.x, p.y, 58, p.wd ? '毒煞未满' : p.ky ? '神识未满' : '剑意未满', '#b8ff8a', 13); Au.sfx('deny'); p.noMpT = 0.6; } return false; }
    p.sp = 0;
    if (p.wd) return E.castWandu();
    if (p.ky) return E.castKui();
    if (p.dageng) return E.castDageng();
    const dmg = swordDamage(p) * F.dmgMul;
    for (let i = 0; i < F.swords; i++) {
      const ring = i % 3, a = (i / F.swords) * TAU * 3 + ring * 0.7; // 三圈，逐圈错开
      const spd = 300 + ring * 70 + U.rand(-20, 20);
      const pr = E.shootP(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a + 1.05, { kind: 'fy', swarm: true, fy: true, spd, life: F.life + U.rand(-0.6, 0.6), dmg, bites: F.bites,
        cool: 0.3 + ring * 0.12 + (i / F.swords) * 0.3, homing: 0, homeAt: 0.3 + ring * 0.12, homeK: 7.5, r: 7, z: 18 + ring * 10, c: '170,255,110', ghost: true });
      pr.ang = a;
    }
    FX.array(p.x, p.y, 30, 250, '170,255,110', 1.1, 2.4); FX.array(p.x, p.y, 20, 130, '255,235,130', 0.8, -3.2);
    FX.ring(p.x, p.y, 10, 250, '170,255,110', 0.5, 6);
    FX.burst(p.x, p.y, 24, 46, { c: '200,255,140', s1: 340, l1: 0.7 }); FX.burst(p.x, p.y, 24, 16, { c: '255,235,130', s1: 260, l1: 0.5 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; FX.bolt(p.x, p.y, 40, p.x + Math.cos(a) * 120, p.y + Math.sin(a) * 120, 14, '255,235,130', 2.5); }
    FX.text(p.x, p.y, 70, '蜂云剑阵', '#d8ffb0', 22);
    Gm.shake(8); Gm.flash = 0.14; Au.sfx('bigsword'); Au.sfx('thunder');
    Gm.stats.casts++; p.atkAnim = 1;
    return true;
  };

  E.explode = function (x, y, r, dmg, c, opts = {}) {
    const Gm = G.Game;
    FX.ring(x, y, 10, r, c, 0.3, 5); FX.boom(x, y, r, c);
    FX.burst(x, y, 10, 18, { c, s1: r * 3, l1: 0.5, z1: 6 });
    FX.burst(x, y, 10, 8, { c: '60,50,50', s1: r * 1.5, add: false, z1: 8, l1: 0.8, g: -40 });
    if (opts.shake) Gm.shake(opts.shake); Au.sfx('boom');
    for (const e of Gm.room.enemies) {
      if (e.dead || U.dist(x, y, e.x, e.y) > r + e.r) continue;
      const a = U.ang(x, y, e.x, e.y);
      E.dmgEnemy(e, dmg, { kx: Math.cos(a) * 200, ky: Math.sin(a) * 200, c: opts.tc });
      if (opts.burn && !e.dead) e.burnT = Math.max(e.burnT, 3);
      if (opts.stun && !e.dead && !e.boss) e.stunT = Math.max(e.stunT, opts.stun);
    }
  };

  E.updateProjs = function (dt) {
    const Gm = G.Game, room = Gm.room, p = Gm.player, P = Gm.projs;
    const bowl = p.flags.bowl && p.bowlN > 0 ? E.bowlPos(p) : null; // 混元钵：收走碰到的敌方弹幕
    for (let i = P.length - 1; i >= 0; i--) {
      const pr = P[i];
      pr.t += dt; pr.life -= dt;
      let dead = false;
      if (pr.cool > 0) pr.cool -= dt;
      if (pr.homeAt !== undefined && pr.t >= pr.homeAt) { pr.homing = pr.homeK; pr.homeAt = undefined; }
      // 追踪
      if (pr.homing) {
        let tx, ty, ok = false;
        if (pr.from === 1) { tx = p.x; ty = p.y; ok = true; }
        else {
          if (!pr.tgt || pr.tgt.dead || pr.tgt.untarget) { pr.tgt = E.nearestEnemy(pr.x, pr.y, 600); }
          if (pr.tgt) { tx = pr.tgt.x; ty = pr.tgt.y; ok = true; }
          else if (pr.swarm) { const rr = pr.fy ? 70 + (i % 5) * 9 : 50; tx = p.x + Math.cos(pr.t * 3 + i) * rr; ty = p.y + Math.sin(pr.t * 3 + i) * rr; ok = true; }
        }
        if (ok) {
          const sp = Math.hypot(pr.vx, pr.vy) || 1, cur = Math.atan2(pr.vy, pr.vx);
          const want = Math.atan2(ty - pr.y, tx - pr.x);
          const na = cur + U.clamp(U.angDiff(cur, want), -pr.homing * dt, pr.homing * dt);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      if (pr.accel) { const k = 1 + pr.accel * dt; pr.vx *= k; pr.vy *= k; }
      if (pr.wave) { // 蛇形
        const sp = Math.hypot(pr.vx, pr.vy) || 1, nx = -pr.vy / sp, ny = pr.vx / sp, w = Math.cos(pr.t * pr.wave) * pr.waveAmp;
        pr.x += nx * w * dt; pr.y += ny * w * dt;
      }
      // 元磁神光：靠近的敌方弹幕减速
      const mk = pr.from === 1 && p.flags.yuanci && U.dist2(pr.x, pr.y, p.x, p.y) < 150 * 150 ? 0.6 : 1;
      pr.x += pr.vx * dt * mk; pr.y += pr.vy * dt * mk;

      // 回旋（金蚨子母刃的飞剑，以及乌龙夺这类去而复返的法宝）
      const canRet = pr.ret || (pr.sword && !pr.mini && p.flags.boomerang);
      if (canRet && pr.life <= 0 && !pr.back) {
        pr.back = true; pr.life = pr.max * 1.4; pr.hit.clear(); pr.ghost = true;
      }
      if (pr.back) {
        const a = U.ang(pr.x, pr.y, p.x, p.y), sp = 820;
        pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
        if (U.dist2(pr.x, pr.y, p.x, p.y) < 400) dead = true;
      }

      // 撞墙
      if (!pr.ghost && W.solid(room, Math.floor(pr.x / T), Math.floor(pr.y / T), 3)) {
        if (canRet && !pr.back) { pr.back = true; pr.life = pr.max * 1.4; pr.hit.clear(); pr.ghost = true; pr.x -= pr.vx * dt; pr.y -= pr.vy * dt; }
        else { dead = true; FX.burst(pr.x, pr.y, pr.z, 3, { c: pr.c, s1: 90, l1: 0.25 }); }
      }
      if (pr.x < -60 || pr.y < -60 || pr.x > room.w * T + 60 || pr.y > room.h * T + 60) dead = true;

      // 命中
      if (!dead && pr.from === 0 && !(pr.cool > 0)) {
        for (const e of room.enemies) {
          if (e.dead || e.st === 'spawn' || e.untarget || pr.hit.has(e)) continue;
          let hitIt = false;
          if (e.segs) { for (let k = 0; k < e.segs.length; k += 2) { const s = e.segs[k]; if (U.dist2(pr.x, pr.y, s.x, s.y) < (s.r + pr.r) * (s.r + pr.r)) { hitIt = true; break; } } }
          else { const rr = e.r + pr.r; hitIt = U.dist2(pr.x, pr.y, e.x, e.y) < rr * rr; }
          if (!hitIt) continue;
          pr.hit.add(e);
          if (pr.sword) swordHit(e, pr);
          else if (pr.swarm) {
            E.dmgEnemy(e, pr.dmg, { noCrit: true, c: pr.fy ? '#c8ff8a' : '#ffd24a' });
            if (pr.fy) { FX.burst(pr.x, pr.y, pr.z, 3, { c: '255,235,130', s1: 110, l1: 0.25 }); if (!e.dead && U.chance(G.Fengyun.thunder)) E.chainThunder(e, pr.dmg * 1.2, 1); }
            pr.bites--; pr.cool = pr.biteCd || (pr.fy ? 0.32 : 0.4); pr.hit.clear(); pr.tgt = null;
            const a = U.rand(TAU), sp = pr.fy ? 380 : 250; pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
            if (pr.bites <= 0) dead = true;
          } else if (pr.kind === 'fire') { dead = true; }
          else {
            const sp = Math.hypot(pr.vx, pr.vy) || 1;
            const kb = pr.kb === undefined ? 70 : pr.kb;
            E.dmgEnemy(e, pr.dmg, { kx: (pr.vx / sp) * kb, ky: (pr.vy / sp) * kb, c: pr.tc });
            if (pr.slow && !e.dead) e.slowT = Math.max(e.slowT, pr.slow);
            if (pr.burn && !e.dead) e.burnT = Math.max(e.burnT, pr.burn);
            if (pr.psn && !e.dead) E.poison(e, pr.psn);
            if (pr.leech) p.hp = Math.min(p.maxHp, p.hp + pr.leech);
            FX.burst(pr.x, pr.y, pr.z, 4, { c: pr.c, s1: 120, l1: 0.3 });
          }
          if (!pr.swarm) { if (pr.pierce > 0) pr.pierce--; else if (!pr.back) dead = true; }
          if (dead) break;
        }
      } else if (!dead && pr.from === 1) {
        const rr = p.r * 0.72 + pr.r;
        if (bowl && p.bowlN > 0 && U.dist2(pr.x, pr.y, bowl.x, bowl.y) < (26 + pr.r) * (26 + pr.r)) {
          dead = true; p.bowlN--; FX.burst(pr.x, pr.y, pr.z, 4, { c: '224,180,106', s1: 90, l1: 0.25 });
          if (p.bowlN <= 0) FX.text(p.x, p.y, 58, '钵满', '#e0b46a', 12);
        } else if (U.dist2(pr.x, pr.y, p.x, p.y) < rr * rr) {
          if (E.hurtPlayer(pr.dmg, pr.x, pr.y)) dead = true;
          else if (p.dashing <= 0 && p.inv <= 0) dead = true;
        }
      }
      if (pr.life <= 0 && !pr.back) dead = true;
      if (dead) {
        if (pr.kind === 'fire' && pr.from === 0) E.explode(pr.x, pr.y, pr.boomR, pr.dmg, '255,150,60', { burn: true });
        if (pr.onEnd) pr.onEnd(pr);
        P[i] = P[P.length - 1]; P.pop();
      } else if (pr.trail && Math.random() < pr.trail * dt * 60) {
        FX.p(pr.x, pr.y, pr.z, { c: pr.c, life: 0.3, size: U.rand(2, 4), vz: 20, vx: U.rand(-20, 20), vy: U.rand(-20, 20) });
      }
    }
  };

  E.nearestEnemy = function (x, y, maxD = 1e9, needLos) {
    const room = G.Game.room; let best = null, bd = maxD;
    for (const e of room.enemies) {
      if (e.dead || e.st === 'spawn' || e.untarget) continue;
      const d = U.dist(x, y, e.x, e.y);
      if (d < bd && (!needLos || W.los(room, x, y, e.x, e.y))) { bd = d; best = e; }
    }
    return best;
  };

  /* ============================ 地面招式 / 预警 ============================ */
  E.hazCircle = function (x, y, r, delay, dmg, o = {}) {
    const h = Object.assign({ type: 'circle', x, y, r, delay, dmg, t: 0, from: 1, c: '255,70,70' }, o);
    G.Game.haz.push(h); return h;
  };
  E.hazLine = function (x1, y1, x2, y2, w, delay, dmg, o = {}) {
    const h = Object.assign({ type: 'line', x1, y1, x2, y2, w, delay, dmg, t: 0, stay: 0.15, from: 1, c: '255,70,70' }, o);
    G.Game.haz.push(h); return h;
  };
  E.hazPuddle = function (x, y, r, life, dps, o = {}) {
    const h = Object.assign({ type: 'puddle', x, y, r, life, max: life, dps, t: 0, tick: 0, from: 1, c: '120,200,80' }, o);
    G.Game.haz.push(h); return h;
  };
  E.hazLob = function (sx, sy, tx, ty, dur, r, dmg, o = {}) {
    const h = Object.assign({ type: 'lob', sx, sy, x: tx, y: ty, dur, r, dmg, t: 0, from: 1, c: '150,220,80' }, o);
    G.Game.haz.push(h); return h;
  };
  E.hazBeam = function (owner, ang, len, w, delay, life, dmg, rot, o = {}) {
    const h = Object.assign({ type: 'beam', owner, ang, len, w, delay, life, dmg, rot, t: 0, from: 1, c: '255,60,80' }, o);
    G.Game.haz.push(h); return h;
  };

  E.updateHaz = function (dt) {
    const Gm = G.Game, p = Gm.player, room = Gm.room, H = Gm.haz;
    for (let i = H.length - 1; i >= 0; i--) {
      const h = H[i]; h.t += dt;
      let done = false;
      if (h.type === 'circle') {
        if (h.follow) { if (h.follow.dead) { H[i] = H[H.length - 1]; H.pop(); continue; } if (h.t < h.delay) { h.x = h.follow.x; h.y = h.follow.y; } }
        if (h.track && h.t < h.delay - (h.lockT || 0.35)) { h.x = U.lerp(h.x, p.x, Math.min(1, dt * h.track)); h.y = U.lerp(h.y, p.y, Math.min(1, dt * h.track)); }
        if (h.pull && h.from === 0) { // 元磁之力：把周围的敌人吸向落点
          for (const e of room.enemies) {
            if (e.dead || e.boss || e.untarget || e.st === 'spawn') continue;
            const d = U.dist(h.x, h.y, e.x, e.y);
            if (d < h.pull && d > 12) { const a = U.ang(e.x, e.y, h.x, h.y), sp = Math.min(d, 260 * dt); W.move(room, e, Math.cos(a) * sp, Math.sin(a) * sp, e.mode); }
          }
        }
        if (h.t >= h.delay) {
          done = true;
          if (h.from === 1) {
            if (U.dist(h.x, h.y, p.x, p.y) < h.r + p.r * 0.5) E.hurtPlayer(h.dmg, h.x, h.y);
            FX.ring(h.x, h.y, h.r * 0.3, h.r, h.c, 0.3, 5); FX.boom(h.x, h.y, h.r, h.c, { foe: true });
            FX.burst(h.x, h.y, 6, 14, { c: h.c, s1: h.r * 2.6, l1: 0.45 });
            if (h.sfx !== false) Au.sfx('boom');
            if (h.r >= 90) Gm.shake(4);
          } else {
            E.explode(h.x, h.y, h.r, h.dmg, h.c, { shake: h.shake || 0, stun: h.stun, tc: h.tc });
            if (h.kind === 'giant') FX.array(h.x, h.y, h.r * 0.4, h.r * 1.25, h.c, 0.5, 2);
          }
          if (h.onBoom) h.onBoom(h);
        }
      } else if (h.type === 'line') {
        if (h.visual) { if (h.t >= h.delay) done = true; }
        else if (h.t >= h.delay) {
          if (!h.fired) {
            h.fired = true; if (h.sfx !== false) Au.sfx(h.from === 0 ? 'bigsword' : 'fire');
            if (h.from === 0) { // 我方的线：出手的一瞬结算一次
              const a = Math.atan2(h.y2 - h.y1, h.x2 - h.x1);
              for (const e of room.enemies) {
                if (e.dead || e.untarget || e.st === 'spawn') continue;
                if (U.segDist(e.x, e.y, h.x1, h.y1, h.x2, h.y2) < h.w / 2 + e.r) E.dmgEnemy(e, h.dmg, { kx: Math.cos(a) * 120, ky: Math.sin(a) * 120, c: h.tc });
              }
              if (h.shake) Gm.shake(h.shake);
            }
          }
          if (h.from === 1 && U.segDist(p.x, p.y, h.x1, h.y1, h.x2, h.y2) < h.w / 2 + p.r * 0.4) E.hurtPlayer(h.dmg, p.x, p.y);
          if (Math.random() < 0.6) { const t = Math.random(); FX.p(U.lerp(h.x1, h.x2, t), U.lerp(h.y1, h.y2, t), 2, { c: h.c, vz: U.rand(60, 160), life: 0.4, size: U.rand(3, 6) }); }
          if (h.t >= h.delay + h.stay) done = true;
        }
      } else if (h.type === 'beam') {
        if (!h.owner || h.owner.dead) done = true;
        else {
          if (h.t >= h.delay) {
            h.ang += h.rot * dt;
            const x2 = h.owner.x + Math.cos(h.ang) * h.len, y2 = h.owner.y + Math.sin(h.ang) * h.len;
            if (U.segDist(p.x, p.y, h.owner.x, h.owner.y, x2, y2) < h.w / 2 + p.r * 0.4) E.hurtPlayer(h.dmg, p.x, p.y);
          }
          if (h.t >= h.delay + h.life) done = true;
        }
      } else if (h.type === 'puddle') {
        h.life -= dt; h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.4;
          if (h.from === 1) { if (h.t > 0.3 && U.dist(h.x, h.y, p.x, p.y) < h.r) E.hurtPlayer(h.dps * 0.4 + 2, h.x, h.y); }
          else for (const e of room.enemies) { if (!e.dead && U.dist(h.x, h.y, e.x, e.y) < h.r + e.r) { e.slowT = Math.max(e.slowT, 0.6); if (h.psn) E.poison(e, h.psn); if (h.dps) E.dmgEnemy(e, h.dps * 0.4, { noCrit: true }); } }
        }
        if (h.life <= 0) done = true;
      } else if (h.type === 'zone') { // 我方的阵：持续一段时间，逻辑在 arsenal.js 的 E.ZONE 里
        h.life -= dt; h.tick -= dt;
        E.ZONE[h.kind](h, dt, p, room);
        if (h.life <= 0) { done = true; if (h.onEnd) h.onEnd(h); }
      } else if (h.type === 'lob') {
        if (h.t >= h.dur) {
          done = true;
          if (U.dist(h.x, h.y, p.x, p.y) < h.r + p.r * 0.5) E.hurtPlayer(h.dmg, h.x, h.y);
          FX.ring(h.x, h.y, 8, h.r, h.c, 0.3, 4); FX.burst(h.x, h.y, 4, 10, { c: h.c, s1: 140 }); FX.boom(h.x, h.y, h.r, h.c, { foe: true });
          Au.sfx('hit');
          if (h.puddle) E.hazPuddle(h.x, h.y, h.r, h.puddle, h.dmg * 0.8, { c: h.c });
        }
      }
      if (done) { H[i] = H[H.length - 1]; H.pop(); }
    }
  };

  /* ============================ 神通施放 ============================ */
  const SK = {
    fireball(p, ax, ay, lv) {
      const a = U.ang(p.x, p.y, ax, ay);
      E.shootP(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, { kind: 'fire', spd: 520, life: 0.95, dmg: 30 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, boomR: 72 + lv * 6, r: 10, c: '255,150,60', trail: 0.7 });
      Au.sfx('fire');
    },
    ice(p, ax, ay, lv) {
      const a = U.ang(p.x, p.y, ax, ay), n = 4 + lv;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.13;
        E.shootP(p.x, p.y, aa, { kind: 'ice', spd: 560, life: 0.75, dmg: 13 * (1 + 0.3 * (lv - 1)) * p.spellMul * p.dmgMul, pierce: 2, slow: 2.2, r: 8, c: '150,220,255', tc: '#9fe0ff' });
      }
      Au.sfx('ice');
    },
    formation(p, ax, ay, lv) { p.formT = 6; p.formN = 4 + lv * 2; p.formLv = lv; p.formTick = 0; Au.sfx('bigsword'); FX.ring(p.x, p.y, 10, 96, '110,255,200', 0.3); FX.array(p.x, p.y, 20, 110, '110,255,200', 0.5, 3); },
    thunder(p, ax, ay, lv) {
      const Gm = G.Game, list = [];
      for (const e of Gm.room.enemies) { if (e.dead || e.untarget || e.st === 'spawn') continue; const d = U.dist(ax, ay, e.x, e.y); if (d < 300) list.push([d, e]); }
      list.sort((a, b) => a[0] - b[0]);
      const n = Math.min(3 + lv, list.length);
      const dmg = 34 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul;
      if (!n) { FX.bolt(ax, ay, 320, ax, ay, 0, '255,235,130', 3.5); FX.ring(ax, ay, 6, 50, '255,235,130', 0.25); }
      for (let i = 0; i < n; i++) {
        const e = list[i][1];
        FX.bolt(e.x + U.rand(-30, 30), e.y, 340, e.x, e.y, 6, '255,235,130', 4);
        FX.ring(e.x, e.y, 6, 46, '255,235,130', 0.25);
        E.dmgEnemy(e, dmg, { c: '#ffe36a', evilMul: 1.6 });
        if (!e.dead && !e.boss) e.stunT = Math.max(e.stunT, 0.7);
      }
      Gm.shake(2); Au.sfx('thunder');
    },
    giant(p, ax, ay, lv) {
      E.hazCircle(ax, ay, 92 + lv * 6, 0.55, 95 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul, { from: 0, kind: 'giant', c: '110,255,200', shake: 5 });
      Au.sfx('bigsword');
    },
    beetles(p, ax, ay, lv) { for (let i = 0; i < 5 + lv * 2; i++) E.spawnBeetle(p.x + U.rand(-10, 10), p.y + U.rand(-10, 10), lv); Au.sfx('bugs'); },
    shield(p, ax, ay, lv) { p.shield = p.shieldMax = 35 + lv * 20; p.shieldT = 5; Au.sfx('shield'); FX.ring(p.x, p.y, 40, 14, '200,220,255', 0.3); },
    puppet(p, ax, ay, lv) {
      const Gm = G.Game; let x = p.x + U.rand(-40, 40), y = p.y + U.rand(-40, 40);
      if (W.blocked(Gm.room, x, y, 12, 1)) { x = p.x; y = p.y; }
      Gm.allies.push({ x, y, r: 12, life: 10 + lv * 2 + (p.craft.kui || 0) * 3, t: 0, atkT: 0.3, lv, face: 0 });
      FX.ring(x, y, 4, 50, '224,180,106', 0.3); Au.sfx('spawn');
    },
    blink(p, ax, ay, lv) {
      const Gm = G.Game, room = Gm.room;
      const a = U.ang(p.x, p.y, ax, ay), want = Math.min(280, U.dist(p.x, p.y, ax, ay));
      const sx = p.x, sy = p.y; let tx = sx, ty = sy;
      for (let d = want; d > 0; d -= 12) {
        const x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d;
        if (!W.blocked(room, x, y, p.r * 0.8, 0) && room.tiles[Math.floor(y / T) * room.w + Math.floor(x / T)] !== 4) { tx = x; ty = y; break; }
      }
      const dmg = 26 * (1 + 0.35 * (lv - 1)) * p.spellMul * p.dmgMul;
      for (const e of room.enemies) {
        if (e.dead || e.untarget || e.st === 'spawn') continue;
        if (U.segDist(e.x, e.y, sx, sy, tx, ty) < 44 + e.r) { E.dmgEnemy(e, dmg, { c: '#c9b0ff', evilMul: 1.6 }); if (!e.dead && !e.boss) e.stunT = Math.max(e.stunT, 0.4); }
      }
      FX.bolt(sx, sy, 20, tx, ty, 20, '255,235,130', 5); FX.bolt(sx, sy, 26, tx, ty, 14, '190,205,255', 3);
      FX.wings(0.55); FX.ring(tx, ty, 8, 70, '190,205,255', 0.3, 4);
      FX.burst(sx, sy, 20, 10, { c: '190,205,255' }); FX.burst(tx, ty, 20, 14, { c: '255,235,130' });
      p.x = tx; p.y = ty; p.inv = Math.max(p.inv, 0.35);
      Au.sfx('thunder');
    },
  };

  const SK_LEAD = { fireball: [520, 0], ice: [560, 0], giant: [0, 0.5], xuezuan: [760, 0], tulao: [0, 0.1] }; // [飞行速度, 落地延迟]，供自动瞄准算提前量
  E.SK = SK; // arsenal.js 往里补充新神通
  E.swordDamage = swordDamage;
  E.bowlPos = (p) => ({ x: p.x + Math.cos(p.t * 2.6) * 46, y: p.y + Math.sin(p.t * 2.6) * 46 });

  E.castSkill = function (slot) {
    const Gm = G.Game, p = Gm.player, s = p.skills[slot];
    if (!s || s.cd > 0) return false;
    const def = G.Skills[s.id];
    if (p.mp < def.mp) { if (!p.noMpT || p.noMpT <= 0) { FX.text(p.x, p.y, 54, '法力不足', '#7ab8ff', 13); Au.sfx('deny'); p.noMpT = 0.6; } return false; }
    p.mp -= def.mp;
    s.cd = s.max = def.cd * Math.max(0.35, 1 - p.cdr);
    const lead = SK_LEAD[s.id] || [0, 0];
    let aim = Gm.aim(lead[0], lead[1]);
    if (s.id === 'blink' && !Gm.isManualNow()) { // 自动瞄准下，风雷翅朝移动方向闪（没在移动才闪向目标）
      const mv = G.Input.moveVec();
      if (mv.l > 0.2) aim = { x: p.x + mv.x * 280, y: p.y + mv.y * 280 };
      else if (Gm.target) { // 站定时：穿过目标，落在它身后，而不是停在它脚下
        const d = U.dist(p.x, p.y, aim.x, aim.y) || 1;
        aim = { x: aim.x + ((aim.x - p.x) / d) * 90, y: aim.y + ((aim.y - p.y) / d) * 90 };
      }
    }
    const sv = p.spellMul; p.spellMul *= 1 + (p.schMul[def.sch] || 0); // 流派增伤只在这一次施放里生效
    SK[s.id](p, aim.x, aim.y, s.lv);
    p.spellMul = sv;
    p.atkAnim = 1; Gm.stats.casts++;
    return true;
  };

  /* ============================ 玩家每帧 ============================ */
  E.updatePlayer = function (dt) {
    const Gm = G.Game, p = Gm.player, room = Gm.room, I = G.Input;
    p.t += dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.atkT > 0) p.atkT -= dt;
    if (p.atkAnim > 0) p.atkAnim = Math.max(0, p.atkAnim - dt * 5);
    if (p.noMpT > 0) p.noMpT -= dt;
    if (p.potionCd > 0) p.potionCd -= dt;
    if (p.autoShieldT > 0) p.autoShieldT -= dt;
    if (p.fanT > 0) p.fanT -= dt;
    if (p.wardT > 0) p.wardT -= dt;
    if (p.apeT > 0) { p.apeT -= dt; if (p.apeT <= 0) { p.dmgMul -= p.apeB; p.apeB = 0; FX.ring(p.x, p.y, 60, 10, '224,184,120', 0.3); } }
    for (const s of p.skills) if (s.cd > 0) s.cd -= dt;
    if (p.dashN < p.dashMax) { p.dashT -= dt; if (p.dashT <= 0) { p.dashN++; p.dashT = p.dashCd; } }

    const mv = I.moveVec();
    const manual = Gm.isManualNow();
    const aim = Gm.aim(760 * (0.8 + 0.2 * p.rangeMul));
    if (manual || Gm.target) p.face = U.ang(p.x, p.y, aim.x, aim.y); // 手动：朝鼠标；自动：朝目标
    else if (mv.l > 0.1) p.face = Math.atan2(mv.y, mv.x);            // 没有目标：朝移动方向

    // 遁术（罗烟步）
    if (p.dashing <= 0 && p.dashN > 0 && (I.hit('Space') || I.hit('ShiftLeft') || I.hit('dash'))) {
      let dx = mv.x, dy = mv.y;
      if (mv.l < 0.1) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
      const l = Math.hypot(dx, dy) || 1;
      p.dashDx = dx / l; p.dashDy = dy / l; p.dashing = 0.19;
      if (p.dashN === p.dashMax) p.dashT = p.dashCd;
      p.dashN--;
      Au.sfx('dash');
      FX.ring(p.x, p.y, 6, 40, '190,255,235', 0.25);
      if (p.flags.web) E.hazPuddle(p.x, p.y, 78, 4, 0, { from: 0, c: '230,230,240', kind: 'web' });
      if (p.flags.psnDash) E.hazPuddle(p.x, p.y, 84, 4, 0, { from: 0, c: '154,200,50', psn: 1 }); // 腐骨毒砂
    }
    if (p.dashing > 0) {
      p.dashing -= dt;
      W.move(room, p, p.dashDx * 900 * dt, p.dashDy * 900 * dt, 0);
      p.moving = true;
      if (Math.random() < 0.9) FX.p(p.x, p.y, U.rand(6, 34), { c: '170,255,225', life: 0.28, size: U.rand(3, 6), vx: U.rand(-20, 20), vy: U.rand(-20, 20) });
      Gm.ghosts.push({ x: p.x, y: p.y, face: p.face, t: p.t, life: 0.22 });
    } else {
      // 脱战疾行：场上没有活着的敌人时（清完一片空地赶往下一片、清场后找出口），脚下生风
      p.calmT = room.enemies.some((e) => !e.dead) ? 0 : (p.calmT || 0) + dt;
      const swift = p.calmT > 0.7 && !Gm.transit;
      const sp = p.speed * (p.atkT > 0 ? 0.88 : 1) * (swift ? 1.45 : 1);
      if (mv.l > 0.05) {
        W.move(room, p, mv.x * sp * dt, mv.y * sp * dt, 0); p.moving = true;
        if (swift && Math.random() < 0.5) FX.p(p.x - mv.x * 10 + U.rand(-8, 8), p.y - mv.y * 10 + U.rand(-8, 8), U.rand(4, 26), { c: '190,255,235', life: 0.3, size: U.rand(2, 4), vx: -mv.x * 60, vy: -mv.y * 60 });
      } else p.moving = false;
    }

    // 回复
    let reg = p.mpRegen;
    if (p.flags.focus && !p.moving) reg *= 3;
    p.mp = Math.min(p.maxMp, p.mp + reg * dt);
    if (p.hpRegen) p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * dt);

    // 御剑
    // 手动：按住鼠标 / J 出剑；自动：射程内有目标就持续出剑
    const wantAtk = I.mouse.down || I.held('KeyJ') || I.held('atk') || (Gm.isAuto() && Gm.targetInRange);
    if (wantAtk && p.atkT <= 0 && p.dashing <= 0) {
      fireSwords(p, aim.x, aim.y);
      p.atkT = 1 / (p.atkSpd * (1 + (p.flags.bloodHaste ? 0.6 * (1 - p.hp / p.maxHp) : 0))); // 血灵大法：气血越低出手越快
    }

    // 神通
    if (I.hit('KeyQ') || I.hit('Mouse2') || I.hit('skill0')) E.castSkill(0);
    if (I.hit('KeyE') || I.hit('skill1')) E.castSkill(1);
    if (I.hit('KeyR') || I.hit('skill2')) E.castSkill(2);
    if (I.hit('KeyV') || I.hit('ult')) E.castUlt();

    // 丹药
    if ((I.hit('KeyC') || I.hit('KeyG') || I.hit('potion')) && p.potionCd <= 0) {
      if (p.potions > 0 && p.hp < p.maxHp) {
        p.potions--; p.potionCd = 0.8;
        const heal = Math.round(p.maxHp * 0.38 * p.potionMul); p.hp = Math.min(p.maxHp, p.hp + heal);
        FX.text(p.x, p.y, 54, '+' + heal, '#7dffb0', 17); FX.petals(p.x, p.y, 8, 16, '150,255,190', { s1: 80, g: -30 }); FX.ribbon(p, '125,255,176', 1.0, 30);
        Au.sfx('heal');
      } else { Au.sfx('deny'); p.potionCd = 0.3; }
    }

    // 青元剑阵
    if (p.formT > 0) {
      p.formT -= dt; p.formTick -= dt;
      if (p.formTick <= 0) {
        p.formTick = 0.22;
        const dmg = 8 * (1 + 0.3 * (p.formLv - 1)) * p.spellMul * p.dmgMul * (0.7 + p.formN * 0.06);
        for (const e of room.enemies) {
          if (e.dead || e.untarget || e.st === 'spawn') continue;
          let d = U.dist(p.x, p.y, e.x, e.y);
          if (e.segs) for (const s of e.segs) d = Math.min(d, U.dist(p.x, p.y, s.x, s.y));
          if (d < 86 + e.r) { const a = U.ang(p.x, p.y, e.x, e.y); E.dmgEnemy(e, dmg, { kx: Math.cos(a) * 60, ky: Math.sin(a) * 60, c: '#8affd0' }); }
        }
      }
    }
    // 玄铁盾
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0 && p.shield > 0) E.shieldBurst(p); }

    // 傀儡
    for (let i = Gm.allies.length - 1; i >= 0; i--) {
      const a = Gm.allies[i]; a.t += dt; a.life -= dt; a.atkT -= dt;
      if (a.life <= 0) { FX.burst(a.x, a.y, 14, 10, { c: '224,180,106', add: false }); Gm.allies.splice(i, 1); continue; }
      if (a.atkT <= 0) {
        const e = E.nearestEnemy(a.x, a.y, 440, true);
        if (e) {
          a.face = U.ang(a.x, a.y, e.x, e.y); a.atkT = 0.42; a.atk = 1;
          E.shootP(a.x, a.y, a.face, { kind: 'bolt', spd: 640, life: 0.8, dmg: 9 * (1 + 0.3 * (a.lv - 1)) * p.spellMul * p.dmgMul * p.kuiMul, r: 7, z: 24, c: '255,190,90', tc: '#ffd28a' });
          Au.sfx('shoot');
        } else a.atkT = 0.2;
      }
      if (a.atk > 0) a.atk -= dt * 4;
    }

    // 自动祭出的法宝、灵宠灵虫、技艺
    E.updateArsenal(dt);

    // 拾取
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const k = room.pickups[i]; k.t += dt;
      k.vz -= 600 * dt; k.z += k.vz * dt;
      if (k.z < 0) { k.z = 0; k.vz *= -0.35; k.vx *= 0.5; k.vy *= 0.5; }
      const d = U.dist(k.x, k.y, p.x, p.y);
      const mag = !room.locked || d < 110;
      if (k.t > 0.35 && mag) { const a = U.ang(k.x, k.y, p.x, p.y), s = Math.min(900, 300 + k.t * 500); k.vx = Math.cos(a) * s; k.vy = Math.sin(a) * s; }
      const ox = k.x, oy = k.y;
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (W.solid(room, Math.floor(k.x / T), Math.floor(k.y / T), 2) && !(k.t > 0.35 && mag)) { k.x = ox; k.y = oy; k.vx *= -0.5; k.vy *= -0.5; }
      if (d < 22 && k.t > 0.3) {
        if (k.kind === 'stone') { Gm.addStones(k.val); Au.sfx('coin'); }
        else if (k.kind === 'potion') { if (p.potions < G.POTION_MAX) { p.potions++; Gm.toast('拾得丹药 ×1'); } else { Gm.addStones(12, true); } Au.sfx('pickup'); }
        room.pickups.splice(i, 1);
      }
    }
  };
})();
