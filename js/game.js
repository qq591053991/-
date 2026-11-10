'use strict';
/* 凡人问道 —— 流程：主循环、单局管理、房间推进、奖励与成长 */
(function () {
  const G = window.G, U = G.U, W = G.World, E = G.Ent, FX = G.FX, R = G.Render, Au = G.Audio, T = G.TILE;
  const SAVE_KEY = 'fanren_wendao_meta_v1';

  const Game = (G.Game = {
    state: 'menu', meta: null, chapter: 0, floor: null, room: null, player: null,
    projs: [], haz: [], allies: [], ghosts: [], barks: [], timers: [],
    shakeAmt: 0, hurtFlash: 0, flash: 0, fade: 0, slowT: 0, god: false, stats: null, last: 0,

    /* ---------------- 存档（仅局外成长） ---------------- */
    loadMeta() {
      const def = { dao: 0, up: {}, best: 0, runs: 0, wins: 0, autoAim: true };
      try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) Object.assign(def, s); } catch (e) { /* 无存档权限时忽略 */ }
      for (const m of G.Meta) if (!def.up[m.id]) def.up[m.id] = 0;
      this.meta = def;
    },
    saveMeta() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.meta)); } catch (e) { /* 忽略 */ } },

    init() {
      const cv = document.getElementById('game');
      G.Input.init(cv);
      R.init(cv);
      this.loadMeta();
      G.UI.init();
      document.body.classList.toggle('autoaim', this.isAuto());
      G.UI.showMenu();
      G.Assets.load(() => G.UI.assetsReady());
      Au.music('menu');
      this.last = performance.now();
      const loop = (ts) => { this.frame(ts); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },

    frame(ts) {
      const raw = Math.min(0.05, Math.max(0.001, (ts - this.last) / 1000)); this.last = ts;
      if (this.fade > 0) this.fade = Math.max(0, this.fade - raw * 2.8);
      if (this.state === 'menu') R.drawMenu(raw);
      else {
        this.update(raw);
        R.drawWorld(G.UI.blocking ? 0.0001 : raw);
        G.UI.updateHUD(raw);
      }
      G.Input.endFrame();
    },

    /* ---------------- 开局 ---------------- */
    startRun() {
      Au.init();
      const m = this.meta.up;
      this.player = E.makePlayer({ body: m.body, root: m.root, wit: m.wit, bag: m.bag, luck: m.luck, vial: m.vial });
      this.stats = { kills: 0, dmg: 0, taken: 0, casts: 0, rooms: 0, time: 0, bosses: 0 };
      this.meta.runs++; this.saveMeta();
      this.timers.length = 0; this.slowT = 0;
      G.UI.hideMenu();
      G.UI.story(G.Story.intro, () => this.enterChapter(0));
    },

    enterChapter(i) {
      const ch = G.Chapters[i];
      this.chapter = i;
      this.floor = W.genFloor(i);
      this.state = 'play';
      this.player.dead = false;
      Au.music(ch.music);
      this.enterRoom(this.floor.start, null);
      G.UI.showHUD(true);
      G.UI.story([{ title: ch.title, sub: ch.name, text: ch.card }], () => { G.UI.titleCard(ch.name, ch.title); this.fade = 1; });
    },

    enterRoom(room, fromDir) {
      const p = this.player;
      W.buildRoom(room);
      this.room = room; room.visited = true;
      for (const d in room.links) room.links[d].seen = true;
      this.projs.length = 0; this.haz.length = 0; this.allies.length = 0; this.ghosts.length = 0; this.barks.length = 0; this.target = null;
      FX.clear();
      const pos = fromDir ? W.entryPos(room, fromDir) : { x: (room.w / 2) * T, y: (room.h / 2 + 1.5) * T };
      p.x = pos.x; p.y = pos.y; p.dashing = 0; p.formT = 0;
      if (!room.cleared) {
        room.locked = true;
        if (room.type === 'boss') this.startBoss(room);
        else { if (!room.waves) E.makeWaves(room); room.waveI = 0; room.waveT = 0.5; }
      } else room.locked = false;
      R.updateCam(0, true);
      this.fade = 1;
      G.UI.mapDirty = true;
      Au.sfx('door');
    },

    startBoss(room) {
      const ch = G.Chapters[room.chapter];
      room.enemies.length = 0;
      const bx = (room.w / 2) * T, by = (room.h / 2 - 1) * T;
      const boss = E.spawnEnemy(ch.boss, bx, by, { delay: 1.0 });
      boss.st = 'intro'; boss.untarget = true; // 对话期间只站桩，不行动
      this.boss = boss;
      this.after(0.5, () => {
        G.UI.dialog(ch.bossIntro, () => {
          boss.st = 'idle'; boss.untarget = false; boss.pt = 0; boss.idleDur = 1.3; Au.music('boss'); Au.sfx('roar');
          this.shake(6); FX.ring(boss.x, boss.y, 10, 160, '255,120,120', 0.5, 5);
          G.UI.bossBar(boss);
        });
      });
    },

    /* ---------------- 工具 ---------------- */
    after(t, fn) { this.timers.push({ t, fn }); },
    shake(a) { this.shakeAmt = Math.min(16, Math.max(this.shakeAmt, a)); },
    toast(m) { G.UI.toast(m); },
    say(e, text) { this.barks.push({ e, text, life: 2.2 }); },
    /* ---------------- 瞄准 ----------------
       自动瞄准（默认）：锁定最近且有射击视线的敌人；按住鼠标左键可临时改为手动瞄准。
       手动瞄准：始终指向鼠标位置。触屏下始终自动。 */
    isAuto() { return G.Input.touchMode || this.meta.autoAim !== false; },
    isManualNow() { const I = G.Input; return !I.touchMode && (!this.isAuto() || I.mouse.down); },

    // 每帧选定自动瞄准的目标；对当前目标有一点粘性，避免在两个等距敌人间来回跳
    updateTarget() {
      const p = this.player, room = this.room, range = 500 * p.rangeMul;
      let best = null, bs = 1e9, bd = 0, blos = false;
      for (const e of room.enemies) {
        if (e.dead || e.st === 'spawn' || e.st === 'intro' || e.untarget) continue;
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > range * 1.3) continue;
        const los = W.los(room, p.x, p.y, e.x, e.y);
        const score = d + (los ? 0 : 420) - (e === this.target ? 60 : 0);
        if (score < bs) { bs = score; best = e; bd = d; blos = los; }
      }
      this.target = best;
      this.targetLos = blos;
      this.targetInRange = !!best && bd <= range && blos; // 射程内且没被障碍挡住才自动出剑
    },

    // spd：飞行道具速度（用于提前量）；delay：招式落地延迟（秒）
    aim(spd, delay) {
      const I = G.Input, p = this.player;
      if (this.isManualNow()) return R.toWorld(I.mouse.x, I.mouse.y);
      const e = this.target;
      if (e) {
        const d = U.dist(p.x, p.y, e.x, e.y);
        const lead = Math.min(0.55, (spd ? d / spd : 0) * 0.9 + (delay || 0));
        return { x: e.x + (e.vx || 0) * lead, y: e.y + (e.vy || 0) * lead };
      }
      return { x: p.x + Math.cos(p.face) * 220, y: p.y + Math.sin(p.face) * 220 };
    },

    setAutoAim(on) {
      this.meta.autoAim = !!on; this.saveMeta();
      document.body.classList.toggle('autoaim', this.isAuto());
    },

    addStones(n, show) {
      const p = this.player; n = Math.round(n * p.stoneMul);
      p.stones += n;
      if (show) this.toast(`灵石 +${n}`);
    },

    gainXp(n, silent) {
      const p = this.player;
      if (!(n > 0)) return;
      p.xp += n * (silent ? 1 : p.xpMul);
      while (p.xp >= p.xpNeed) {
        p.xp -= p.xpNeed; p.level++; p.realmLv++; p.xpNeed = 26 + p.level * 14; p.pendingLv++;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08);
        FX.ring(p.x, p.y, 10, 120, '255,230,150', 0.5, 5); FX.burst(p.x, p.y, 10, 24, { c: '255,230,150', s1: 160, g: -100, vz1: 80, l1: 0.9 });
        FX.text(p.x, p.y, 62, '修为精进', '#ffe6a0', 16);
        Au.sfx('levelup');
      }
    },

    /* ---------------- 法宝 / 神通 ---------------- */
    randomRelic(minRar = 1, exact = false, exclude = []) {
      const p = this.player;
      let pool = Object.values(G.Relics).filter((r) => {
        const have = p.relics[r.id] || 0;
        if (exclude.includes(r.id)) return false;
        if (have >= (r.stack || 1)) return false;
        return exact ? r.rar === minRar : r.rar >= minRar;
      });
      if (!pool.length) pool = Object.values(G.Relics).filter((r) => (p.relics[r.id] || 0) < (r.stack || 1) && !exclude.includes(r.id));
      if (!pool.length) return 'zhuji';
      return U.weighted(pool, (r) => [0, 60, 30, 12][r.rar]).id;
    },
    giveRelic(id) {
      const p = this.player, r = G.Relics[id];
      p.relics[id] = (p.relics[id] || 0) + 1;
      if (p.relics[id] === 1) p.relicList.push(id);
      r.apply(p);
      p.hp = Math.min(p.hp, p.maxHp);
      this.toast(`获得法宝【${r.name}】`);
      Au.sfx('pick'); G.UI.relicDirty = true;
    },
    randomSkill(exclude = []) {
      const p = this.player;
      const owned = p.skills.map((s) => s.id);
      let pool = [];
      if (p.skills.length < 3) pool = Object.keys(G.Skills).filter((k) => !owned.includes(k));
      for (const s of p.skills) if (s.lv < 3) pool.push(s.id);
      pool = pool.filter((k) => !exclude.includes(k));
      return pool.length ? U.pick(pool) : null;
    },
    giveSkill(id) {
      const p = this.player, s = p.skills.find((x) => x.id === id);
      if (s) { s.lv = Math.min(3, s.lv + 1); this.toast(`【${G.Skills[id].name}】升至第 ${s.lv} 重`); }
      else if (p.skills.length < 3) { p.skills.push({ id, lv: 1, cd: 0 }); this.toast(`习得神通【${G.Skills[id].name}】`); }
      Au.sfx('pick'); G.UI.skillDirty = true;
    },

    relicCard(id) {
      const r = G.Relics[id], have = this.player.relics[id] || 0;
      return { name: r.name, glyph: r.glyph, tag: ['', '法宝 · 凡品', '法宝 · 珍品', '法宝 · 至宝'][r.rar] + (have ? ` · 已有 ${have}` : ''), desc: r.desc, cls: 'r' + r.rar, pick: () => this.giveRelic(id) };
    },
    skillCard(id) {
      const d = G.Skills[id], s = this.player.skills.find((x) => x.id === id), lv = s ? s.lv + 1 : 1;
      return { name: d.name, glyph: d.glyph, tag: s ? `神通 · 升至第 ${lv} 重` : '神通 · 新习得', desc: d.desc(lv) + `　耗法力 ${d.mp}，冷却 ${d.cd} 秒。`, cls: 'r2 skill', color: d.color, pick: () => this.giveSkill(id) };
    },

    openLootChoice(title, sub, minRar, done) {
      const cards = [], usedR = [], usedS = [];
      for (let i = 0; i < 3; i++) {
        const sk = U.chance(i === 0 && this.player.skills.length < 2 ? 0.75 : 0.3) ? this.randomSkill(usedS) : null;
        if (sk) { usedS.push(sk); cards.push(this.skillCard(sk)); }
        else { const r = this.randomRelic(minRar, false, usedR); usedR.push(r); cards.push(this.relicCard(r)); }
      }
      G.UI.choice({ title, sub, cards, done });
    },

    openLevelChoice() {
      const p = this.player;
      const ups = U.shuffle(G.Upgrades.slice()).slice(0, 3);
      const cards = ups.map((u) => {
        const rar = U.weighted(G.RARITY, (r) => r.w), v = Math.round(u.v * rar.mul);
        return { name: u.name, glyph: u.glyph, tag: '感悟 · ' + rar.name, desc: u.desc(v), cls: rar.cls, pick: () => { u.apply(p, v); p.cdr = Math.min(0.6, p.cdr); p.armor = Math.min(0.6, p.armor); } };
      });
      // 已修炼青元剑诀且未大成：有机会参悟下一层
      if (p.qy >= 1 && p.qy < G.Qingyuan.length && U.chance(0.6)) {
        const L = G.Qingyuan[p.qy];
        cards[U.randi(0, 2)] = { name: '青元剑诀', glyph: '元', tag: `功法 · 第${G.CN_NUM[p.qy + 1]}层【${L.name}】`, desc: L.desc, cls: 'r3', pick: () => this.gainQingyuan() };
      }
      G.UI.choice({ title: '修为精进', sub: E.realmName(p) + ' —— 择一感悟', cards, done: () => { p.pendingLv--; } });
    },

    /* ---------------- 房间推进 ---------------- */
    onRoomCleared() {
      const room = this.room, p = this.player;
      room.cleared = true; room.locked = false;
      this.stats.rooms++;
      this.clearHostile = true;
      if (p.drops < 9) { p.drops++; this.toast('掌天瓶凝出一滴绿液'); }
      const n = U.randi(2, 3) + (room.type === 'elite' ? 3 : 0);
      for (let i = 0; i < n; i++) E.dropPickup('stone', p.x + U.rand(-60, 60), p.y + U.rand(-60, 60), Math.round(U.randi(2, 4) * (1 + room.chapter * 0.25)));
      if (room.type === 'elite') {
        room.interact.push({ kind: 'chest', x: (room.w / 2) * T, y: (room.h / 2) * T, r: 46, label: '开启精英宝匣', elite: true });
        FX.ring((room.w / 2) * T, (room.h / 2) * T, 10, 90, '255,220,130', 0.5, 5);
      }
      Au.sfx('door'); G.UI.mapDirty = true;
    },

    onBossDead(e) {
      const room = this.room, ch = G.Chapters[room.chapter], p = this.player;
      this.stats.bosses++;
      for (const o of room.enemies) if (o !== e && !o.dead) { o.dead = true; FX.burst(o.x, o.y, 10, 10, { c: '255,240,200' }); }
      this.clearHostile = true; // 延迟到下一帧清理，避免在遍历弹幕时改动数组
      this.slowT = 1.6; this.shake(16); this.flash = 0.3;
      room.cleared = true; room.locked = false; this.stats.rooms++;
      G.UI.bossBar(null);
      Au.music(ch.music); Au.sfx('boom');
      p.inv = 4;
      const last = room.chapter === G.Chapters.length - 1;
      this.after(2.2, () => {
        if (last) return this.victory();
        G.UI.story([ch.bossOutro], () => {
          const b = ch.breakthrough;
          this.applyBreakthrough(room.chapter);
          Au.sfx('break');
          G.UI.breakthrough(b.title, b.desc, () => {
            this.openLootChoice('首领遗物', '择一而取', 2, () => {
              room.interact.push({ kind: 'portal', x: (room.w / 2) * T, y: (room.h / 2) * T, r: 50, label: '踏入传送阵 · 前往下一章' });
              this.toast('传送阵已开启'); Au.sfx('portal');
            });
          });
        });
      });
    },

    gainQingyuan(quiet) {
      const p = this.player, L = G.Qingyuan[p.qy];
      if (!L) return;
      L.apply(p); p.qy++;
      if (!quiet) this.toast(`青元剑诀 · 第${G.CN_NUM[p.qy]}层【${L.name}】`);
      Au.sfx('break');
    },

    applyBreakthrough(i) {
      const p = this.player;
      if (i === 0) { p.maxHp += 25; p.dmgMul += 0.12; }
      if (i === 1) { p.realm = 1; p.realmLv = 1; p.maxHp += 40; p.maxMp += 30; p.dmgMul += 0.2; if (p.qy === 0) this.gainQingyuan(true); }
      if (i === 2) { // 结丹：炼成本命法宝青竹蜂云剑
        p.realm = 2; p.realmLv = 1; p.maxHp += 50; p.maxMp += 40; p.dmgMul += 0.22; p.cdr = Math.min(0.6, p.cdr + 0.08);
        if (!p.fy) { p.fy = 1; p.sp = 100; p.flags.thunder = (p.flags.thunder || 0) + 1; G.UI.skillDirty = true; }
      }
      p.hp = p.maxHp; p.mp = p.maxMp; p.potions = Math.min(G.POTION_MAX, p.potions + 1);
      FX.ring(p.x, p.y, 10, 300, '255,230,150', 0.8, 8); FX.burst(p.x, p.y, 20, 60, { c: '255,230,150', s1: 300, g: -60, l1: 1.2 });
    },

    daoGain(win) {
      const s = this.stats;
      return Math.round(s.rooms * 1 + s.bosses * 8 + this.chapter * 3 + (win ? 30 : 0));
    },

    onPlayerDead() {
      const p = this.player;
      this.state = 'dead'; this.slowT = 1.5;
      FX.burst(p.x, p.y, 20, 50, { c: '140,255,220', s1: 260, l1: 1 }); FX.ring(p.x, p.y, 10, 200, '140,255,220', 0.7, 6);
      this.shake(14); Au.sfx('death'); Au.music(null);
      G.UI.bossBar(null);
      const gain = this.daoGain(false);
      this.meta.dao += gain; this.meta.best = Math.max(this.meta.best, this.chapter + 1); this.saveMeta();
      setTimeout(() => G.UI.endScreen(false, gain), 1500);
    },

    victory() {
      const p = this.player;
      p.realm = 3; p.realmLv = 1; p.inv = 999;
      this.state = 'won';
      const gain = this.daoGain(true);
      this.meta.dao += gain; this.meta.best = 5; this.meta.wins++; this.saveMeta();
      Au.sfx('break'); Au.music('menu');
      G.UI.story(G.Story.ending, () => G.UI.endScreen(true, gain));
    },

    toMenu() {
      this.state = 'menu'; this.room = null; this.floor = null;
      G.UI.showHUD(false); G.UI.bossBar(null);
      G.UI.showMenu(); Au.music('menu'); this.fade = 1;
    },

    nextChapter() {
      this.fade = 1;
      if (this.chapter + 1 < G.Chapters.length) this.enterChapter(this.chapter + 1);
    },

    /* ---------------- 交互 ---------------- */
    nearInteract() {
      const p = this.player, room = this.room; let best = null, bd = 1e9;
      if (room.locked) return null;
      for (const it of room.interact) {
        if (it.used) continue;
        const d = U.dist(p.x, p.y, it.x, it.y);
        if (d < it.r + 18 && d < bd) { bd = d; best = it; }
      }
      return best;
    },

    interact(it) {
      const p = this.player, ch = this.chapter, pm = 1 + ch * 0.5;
      Au.sfx('ui');
      if (it.kind === 'chest') {
        it.used = true; Au.sfx('pickup');
        FX.burst(it.x, it.y, 14, 24, { c: '255,220,130', s1: 180, g: -40 });
        this.openLootChoice(it.elite ? '精英宝匣' : '机缘', '大道五十，天衍四九 —— 择其一', it.elite ? 2 : 1);
      } else if (it.kind === 'shop') {
        if (!it.items) {
          const ex = [];
          const mkRelic = (minRar) => { const id = this.randomRelic(minRar, false, ex); ex.push(id); const r = G.Relics[id]; return { type: 'relic', id, name: r.name, glyph: r.glyph, desc: r.desc, cls: 'r' + r.rar, price: Math.round([0, 55, 85, 130][r.rar] * pm) }; };
          it.items = [
            { type: 'potion', name: '黄龙丹', glyph: '丹', desc: `丹药 +1（上限 ${G.POTION_MAX}）。服用回复 38% 气血。`, cls: 'r1', price: Math.round(26 * pm), repeat: 2 },
            { type: 'heal', name: '疗伤灵茶', glyph: '茶', desc: '立刻回复 50% 气血。', cls: 'r1', price: Math.round(18 * pm), repeat: 1 },
            mkRelic(1), mkRelic(1), mkRelic(2),
          ];
          const sk = this.randomSkill();
          if (sk) { const d = G.Skills[sk], s = p.skills.find((x) => x.id === sk); it.items.push({ type: 'skill', id: sk, name: d.name + (s ? ' · 升阶' : ''), glyph: d.glyph, desc: d.desc(s ? s.lv + 1 : 1), cls: 'r2', price: Math.round(70 * pm) }); }
        }
        G.UI.shop(it.items);
      } else if (it.kind === 'garden') {
        if (!it.herbs) it.herbs = U.shuffle(G.Herbs.slice()).slice(0, 3).map((h) => ({ h, sold: false }));
        G.UI.garden(it);
      } else if (it.kind === 'event') {
        it.used = true;
        G.UI.event(U.pick(G.Events));
      } else if (it.kind === 'portal') {
        it.used = true; Au.sfx('portal');
        this.nextChapter();
      }
    },

    buy(item) {
      const p = this.player;
      if (item.sold || p.stones < item.price) { Au.sfx('deny'); return false; }
      if (item.type === 'potion' && p.potions >= G.POTION_MAX) { Au.sfx('deny'); this.toast('丹药已达携带上限'); return false; }
      p.stones -= item.price;
      if (item.type === 'potion') p.potions++;
      else if (item.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
      else if (item.type === 'relic') this.giveRelic(item.id);
      else if (item.type === 'skill') this.giveSkill(item.id);
      if (item.repeat) { item.repeat--; if (item.repeat <= 0) item.sold = true; } else item.sold = true;
      Au.sfx('coin');
      return true;
    },

    /* ---------------- 每帧 ---------------- */
    update(raw) {
      if (G.UI.blocking) return;
      const I = G.Input;
      if (this.state === 'play' && (I.hit('Escape') || I.hit('KeyP') || I.hit('pause'))) { G.UI.pause(); return; }
      if (I.hit('KeyM')) this.toast(Au.toggleMute() ? '已静音' : '声音已开启');
      let dt = raw;
      if (this.slowT > 0) { this.slowT -= raw; dt *= 0.28; }
      const p = this.player, room = this.room;
      if (this.clearHostile) {
        this.clearHostile = false;
        this.projs = this.projs.filter((x) => x && x.from === 0);
        this.haz = this.haz.filter((x) => x && x.from === 0);
      }

      for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= raw; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); if (G.UI.blocking) return; } }

      if (this.state === 'play') {
        this.stats.time += raw;
        this.updateTarget();
        E.updatePlayer(dt);
      } else this.target = null;
      E.updateEnemies(dt);
      E.updateProjs(dt);
      E.updateHaz(dt);
      FX.update(dt);
      for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].life -= dt; if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1); }
      for (let i = this.barks.length - 1; i >= 0; i--) { this.barks[i].life -= dt; if (this.barks[i].life <= 0 || this.barks[i].e.dead) this.barks.splice(i, 1); }
      this.shakeAmt *= Math.max(0, 1 - 9 * raw);
      if (this.hurtFlash > 0) this.hurtFlash -= raw;
      if (this.flash > 0) this.flash -= raw;
      R.updateCam(raw);
      if (this.state !== 'play' || this.room !== room) return;

      // 波次与清场
      if (room.locked && room.type !== 'boss') {
        if (room.enemies.length === 0) {
          if (room.waveI < room.waves.length) { room.waveT -= dt; if (room.waveT <= 0) { E.spawnWave(room); room.waveT = 0.7; } }
          else this.onRoomCleared();
        }
      }
      // 待处理的感悟
      if (!room.locked && p.pendingLv > 0 && !p.dead) { this.openLevelChoice(); return; }

      // 过门
      if (!room.locked) {
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        if (tx >= 0 && ty >= 0 && tx < room.w && ty < room.h && room.tiles[ty * room.w + tx] === 4) {
          for (const d in room.doors) {
            if (room.doors[d].cells.some(([x, y]) => x === tx && y === ty)) { this.enterRoom(room.doors[d].to, W.OPP[d]); return; }
          }
        }
      }
      // 交互
      const it = this.nearInteract();
      G.UI.prompt(it ? it.label : null);
      if (it && (I.hit('KeyF') || I.hit('act'))) this.interact(it);
    },

    /* 调试 / 自动化测试用 */
    debugKillAll() { for (const e of this.room.enemies.slice()) { e.st = 'idle'; e.untarget = false; e.invT = 0; E.dmgEnemy(e, 1e7, { noCrit: true }); } },
  });

  window.addEventListener('load', () => Game.init());
})();
