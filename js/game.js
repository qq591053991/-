'use strict';
/* 凡人问道 —— 流程：主循环、单局管理、房间推进、奖励与成长 */
(function () {
  const G = window.G, U = G.U, W = G.World, E = G.Ent, FX = G.FX, R = G.Render, Au = G.Audio, T = G.TILE;
  const SAVE_KEY = 'fanren_wendao_meta_v1';

  const Game = (G.Game = {
    state: 'menu', meta: null, chapter: 0, floor: null, room: null, player: null,
    projs: [], haz: [], allies: [], pets: [], ghosts: [], barks: [], timers: [],
    shakeAmt: 0, hurtFlash: 0, flash: 0, fade: 0, slowT: 0, god: false, stats: null, last: 0, combo: 0, comboT: 0,

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
      this.timers.length = 0; this.slowT = 0; this.combo = 0; this.comboT = 0; this.transit = null;
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
      this.projs.length = 0; this.haz.length = 0; this.allies.length = 0; this.ghosts.length = 0; this.barks.length = 0; this.target = null; if (this.guide) this.guide.on = false;
      FX.clear();
      const pos = fromDir ? W.entryPos(room, fromDir) : { x: (room.w / 2) * T, y: (room.h / 2 + 1.5) * T };
      p.x = pos.x; p.y = pos.y; p.dashing = 0; p.formT = 0;
      E.resetPets(); p.dingReady = true;
      if (!room.cleared) {
        room.locked = true;
        // 阵法：每进一处险地，先在脚下布一座颠倒五行阵
        if (p.craft.zhen) { E.zone('wuxing', p.x, p.y, 150, 4 + p.craft.zhen * 2, { dmg: 5 * p.dmgMul, c: '232,208,138' }); FX.array(p.x, p.y, 30, 165, '232,208,138', 0.5, 2); }
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
    /* 战斗留痕：敌人倒下的地方留一摊墨渍，离开房间之前不会消失。kind：0 血（暗绛）/ 1 鬼物的墨 / 2 傀儡与晶石的碎屑 */
    stain(x, y, r, kind) {
      const room = this.room, L = room.stains || (room.stains = []);
      if (W.solid(room, Math.floor(x / T), Math.floor(y / T), 2)) return;
      L.push({ x, y, r, kind, rot: U.rand(Math.PI * 2), t: this.stats.time, v: L.length % 3 });
      if (L.length > 70) L.shift();
    },
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
        FX.ring(p.x, p.y, 10, 120, '255,230,150', 0.5, 5); FX.petals(p.x, p.y, 8, 16, '255,230,150', { s1: 120, g: -40 }); FX.ribbon(p, '255,230,150', 1.0, 32);
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
        if (r.req && !r.req(p)) return false;                                        // 有前置条件的（大庚剑阵要先炼成青竹蜂云剑）
        if (r.kind === 'pet' && p.pets.length >= p.petCap) return false;             // 灵兽袋满了
        return exact ? r.rar === minRar : r.rar >= minRar;
      });
      if (!pool.length) pool = Object.values(G.Relics).filter((r) => (p.relics[r.id] || 0) < (r.stack || 1) && !exclude.includes(r.id) && !(r.req && !r.req(p)) && !(r.kind === 'pet' && p.pets.length >= p.petCap));
      if (!pool.length) return 'zhuji';
      return U.weighted(pool, (r) => [0, 60, 30, 12][r.rar]).id;
    },
    giveRelic(id) {
      const p = this.player, r = G.Relics[id];
      p.relics[id] = (p.relics[id] || 0) + 1;
      if (p.relics[id] === 1) p.relicList.push(id);
      r.apply(p);
      if (r.kind === 'pet' && p.relics[id] === 1) { p.pets.push(id); E.resetPets(); }
      // 百脉炼宝诀：每件法宝 +3% 伤害
      const bm = p.flags.baimai ? 0.03 * p.relicList.filter((k) => G.Relics[k].kind === 'bao').length : 0;
      p.dmgMul += bm - p.bmB; p.bmB = bm;
      p.cdr = Math.min(0.6, p.cdr); p.armor = Math.min(0.6, p.armor);
      p.hp = Math.min(p.hp, p.maxHp);
      this.toast(r.kind === 'craft' ? `${r.name} · 第 ${p.relics[id]} 重` : `获得${G.KIND[r.kind]}【${r.name}】`);
      Au.sfx('pick'); G.UI.relicDirty = true;
    },
    // noNew：神通栏已满时不给新神通（坊市、奇遇这类没法弹出"舍弃哪一门"的地方用）
    randomSkill(exclude = [], noNew = false) {
      const p = this.player;
      const owned = p.skills.map((s) => s.id);
      let pool = [];
      if (p.skills.length < 3 || !noNew) pool = Object.keys(G.Skills).filter((k) => !owned.includes(k));
      for (const s of p.skills) if (s.lv < 3) { pool.push(s.id); if (p.skills.length >= 3) pool.push(s.id, s.id); } // 栏满之后，升阶出现得更多
      pool = pool.filter((k) => !exclude.includes(k));
      return pool.length ? U.pick(pool) : null;
    },
    giveSkill(id) {
      const p = this.player, s = p.skills.find((x) => x.id === id);
      if (s) { s.lv = Math.min(3, s.lv + 1); this.toast(`【${G.Skills[id].name}】升至第 ${s.lv} 重`); }
      else if (p.skills.length < 3) { p.skills.push({ id, lv: 1, cd: 0 }); this.toast(`习得神通【${G.Skills[id].name}】`); }
      else return this.replaceSkill(id);
      Au.sfx('pick'); G.UI.skillDirty = true;
    },
    // 神通栏已满：舍弃一门，换上新的；或者不换，折成灵石
    replaceSkill(id) {
      const p = this.player, nd = G.Skills[id];
      const cards = p.skills.map((s, i) => {
        const d = G.Skills[s.id];
        return { name: '舍弃 ' + d.name, glyph: d.glyph, sch: d.sch, color: d.color, cls: 'r1 skill', tag: `第 ${s.lv} 重 · [${'QER'[i]}]`, desc: d.desc(s.lv),
          pick: () => { p.skills[i] = { id, lv: 1, cd: 0 }; this.toast(`舍弃【${d.name}】，习得【${nd.name}】`); Au.sfx('pick'); G.UI.skillDirty = true; } };
      });
      cards.push({ name: '不换', glyph: '罢', cls: 'r1', tag: '保留现有神通', desc: `放弃【${nd.name}】，将玉简折价换成 25 块灵石。`, pick: () => this.addStones(25, true) });
      G.UI.choice({ title: `习得【${nd.name}】`, sub: '神通只能同修三门 —— 舍弃哪一门？', cards });
    },

    relicCard(id) {
      const r = G.Relics[id], have = this.player.relics[id] || 0;
      return { name: r.name, glyph: r.glyph, sch: r.sch, tag: G.KIND[r.kind] + ' · ' + ['', '凡品', '珍品', '至宝'][r.rar] + (r.kind === 'craft' ? ` · 第 ${have + 1} 重` : have ? ` · 已有 ${have}` : ''), desc: r.desc, cls: 'r' + r.rar, pick: () => this.giveRelic(id) };
    },
    skillCard(id) {
      const d = G.Skills[id], s = this.player.skills.find((x) => x.id === id), lv = s ? s.lv + 1 : 1;
      return { name: d.name, glyph: d.glyph, sch: d.sch, tag: s ? `神通 · 升至第 ${lv} 重` : '神通 · 新习得', desc: d.desc(lv) + `　耗法力 ${d.mp}，冷却 ${d.cd} 秒。`, cls: 'r2 skill', color: d.color, pick: () => this.giveSkill(id) };
    },

    openLootChoice(title, sub, minRar, done, sure) {
      const cards = [], usedR = [], usedS = [];
      for (let i = 0; i < 3; i++) {
        const sk = U.chance(i === 0 && this.player.skills.length < 2 ? 0.75 : 0.3) ? this.randomSkill(usedS) : null;
        if (sk) { usedS.push(sk); cards.push(this.skillCard(sk)); }
        else { const r = this.randomRelic(minRar, false, usedR); usedR.push(r); cards.push(this.relicCard(r)); }
      }
      // 炼成青竹蜂云剑之后，大庚剑阵的阵图会找上门来（sure：必出）
      const p = this.player;
      if (p.fy && !p.relics.dageng && !usedR.includes('dageng') && (sure || U.chance(0.4))) cards[0] = this.relicCard('dageng');
      G.UI.choice({ title, sub, cards, done });
    },

    openLevelChoice() {
      const p = this.player;
      const ups = U.shuffle(G.Upgrades.slice()).slice(0, 3);
      const cards = ups.map((u) => {
        const rar = U.weighted(G.RARITY, (r) => r.w), v = Math.round(u.v * rar.mul);
        return { name: u.name, glyph: u.glyph, tag: '感悟 · ' + rar.name, desc: u.desc(v), cls: rar.cls, pick: () => { u.apply(p, v); p.cdr = Math.min(0.6, p.cdr); p.armor = Math.min(0.6, p.armor); } };
      });
      // 主修功法尚未大成：有机会参悟下一层
      const M = G.Mains[this.mainId()], mlv = this.mainLv();
      if (M && mlv >= 1 && mlv < M.lv.length && U.chance(0.6)) {
        const L = M.lv[mlv];
        cards[U.randi(0, 2)] = { name: M.name, glyph: M.glyph, sch: M.sch, tag: `功法 · 第${G.CN_NUM[mlv + 1]}层【${L.name}】`, desc: L.desc, cls: 'r3', pick: () => this.gainMain() };
      }
      G.UI.choice({ title: '修为精进', sub: E.realmName(p) + ' —— 择一感悟', cards, done: () => { p.pendingLv--; } });
    },

    /* ---------------- 房间推进 ---------------- */
    onRoomCleared() {
      const room = this.room, p = this.player;
      room.cleared = true; room.locked = false;
      this.stats.rooms++;
      this.clearHostile = true;
      if (p.drops < 9) { const n = Math.min(9 - p.drops, p.flags.vial ? 2 : 1); p.drops += n; this.toast(n > 1 ? '掌天瓶吞吐月华，凝出两滴灵露' : '玉瓶里凝出一滴灵露'); }
      const n = U.randi(2, 3) + (room.type === 'elite' ? 3 : 0);
      for (let i = 0; i < n; i++) E.dropPickup('stone', p.x + U.rand(-60, 60), p.y + U.rand(-60, 60), Math.round(U.randi(2, 4) * (1 + room.chapter * 0.25)));
      if (p.craft.dan && p.potions < G.POTION_MAX && U.chance(0.1 * p.craft.dan)) { p.potions++; this.toast('炼丹术：就地开炉，炼成一枚丹药'); }
      if (room.type === 'elite') {
        let bx = (room.w / 2) * T, by = (room.h / 2) * T; // 场中若是台地的坡，宝匣挪到旁边的空地上
        if (room.tiles[Math.floor(by / T) * room.w + Math.floor(bx / T)] !== 0) { const q = W.randomFloorNear(room, bx, by, 150); bx = q.x; by = q.y; }
        room.interact.push({ kind: 'chest', x: bx, y: by, r: 46, label: '开启精英宝匣', elite: true });
        FX.ring(bx, by, 10, 90, '255,220,130', 0.5, 5);
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
          G.UI.breakthrough(b.title, typeof b.desc === 'function' ? b.desc(p) : b.desc, () => {
            const loot = () => this.openLootChoice('首领遗物', '择一而取', 2, () => {
              room.interact.push({ kind: 'portal', x: (room.w / 2) * T, y: (room.h / 2) * T, r: 50, label: '踏入传送阵 · 前往下一章' });
              this.toast('传送阵已开启'); Au.sfx('portal');
            }, true);
            if (p.realm >= 1 && !this.mainId()) this.chooseMain(loot); else loot(); // 筑基之后先择主修功法，再取遗物
          });
        });
      });
    },

    /* 主修功法：筑基时择一门（青元剑诀 / 墨氏毒经），之后一层层参悟 */
    mainId() { const p = this.player; return p.main || (p.du ? 'du' : p.qy || p.fy ? 'qy' : null); }, // 没记下选了哪门时，从层数反推
    mainLv() { const p = this.player, id = this.mainId(); return id === 'du' ? p.du : id === 'qy' ? p.qy : 0; },
    gainMain(quiet) {
      const p = this.player, id = this.mainId(), M = G.Mains[id]; if (!M) return;
      const L = M.lv[this.mainLv()]; if (!L) return;
      L.apply(p); if (id === 'du') p.du++; else p.qy++;
      if (!quiet) this.toast(`${M.name} · 第${G.CN_NUM[this.mainLv()]}层【${L.name}】`);
      Au.sfx('break');
    },
    gainQingyuan(quiet) { this.player.main = 'qy'; this.gainMain(quiet); },
    chooseMain(done) {
      const p = this.player;
      const cards = Object.keys(G.Mains).map((id) => { const M = G.Mains[id]; return { name: M.name, glyph: M.glyph, sch: M.sch, cls: 'r3', tag: `主修功法 · 第一层【${M.lv[0].name}】`, desc: M.intro + '　第一层：' + M.lv[0].desc + '。', pick: () => { p.main = id; this.gainMain(true); G.UI.skillDirty = true; } }; });
      G.UI.choice({ title: '择一门主修功法', sub: '筑基已成 —— 一经选定，此生只修这一门', cards, done });
    },

    applyBreakthrough(i) {
      const p = this.player;
      if (i === 0) { p.maxHp += 25; p.dmgMul += 0.12; }
      if (i === 1) { p.realm = 1; p.realmLv = 1; p.maxHp += 40; p.maxMp += 30; p.dmgMul += 0.2; } // 筑基：主修功法随后由玩家自己选（chooseMain）
      if (i === 2) { // 结丹：炼成本命法宝——剑修是青竹蜂云剑，毒修是万毒幡
        p.realm = 2; p.realmLv = 1; p.maxHp += 50; p.maxMp += 40; p.dmgMul += 0.22; p.cdr = Math.min(0.6, p.cdr + 0.08);
        if (!p.main) { p.main = this.mainId() || 'qy'; if (!this.mainLv()) this.gainMain(true); }
        if (p.main === 'du') { if (!p.wd) { p.wd = 1; p.sp = 100; G.UI.skillDirty = true; } }
        else if (!p.fy) { p.fy = 1; p.sp = 100; p.flags.thunder = (p.flags.thunder || 0) + 1; G.UI.skillDirty = true; }
      }
      p.hp = p.maxHp; p.mp = p.maxMp; p.potions = Math.min(G.POTION_MAX, p.potions + 1);
      FX.ring(p.x, p.y, 10, 300, '255,230,150', 0.8, 8); FX.petals(p.x, p.y, 16, 50, '255,230,150', { s0: 60, s1: 320, l1: 2.0, g: -20 });
      for (let i = 0; i < 3; i++) FX.ribbon(p, i === 1 ? '255,255,235' : '255,230,150', 1.6, 30 + i * 12, 2.4, i * 2.1);
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

    /* 隐式的引导：没有小地图，没有箭头，也没有带路的角色。这里只算出"该往哪去"，
       画面上用环境来暗示 —— 一缕光点顺着小径往那边飘（金色是去路，红色是敌人），落花、萤火、飞雪也朝那边吹。
       目标依次是：躲在看不见处的残敌、还没惊动的埋伏（大图）、没开的宝匣 / 传送阵、通往没去过的地方的出口。到了跟前就停 */
    updateGuide(raw) {
      const room = this.room, p = this.player, g = this.guide || (this.guide = { x: p.x, y: p.y, on: false });
      let tx = null, ty = null, key = null, bd = 1e9;
      const pick = (x, y, k) => { const d = U.dist(p.x, p.y, x, y); if (d < bd) { bd = d; tx = x; ty = y; key = k; } };
      if (this.transit || p.dead) key = null;
      else if (room.locked) {
        const alive = room.enemies.filter((e) => !e.dead && e.st !== 'spawn' && !e.boss);
        if (alive.length) { // 还有敌人，但两秒多都没有一个在视线里（躲在树后、隔着林子）：带过去
          if (alive.some((e) => U.dist(p.x, p.y, e.x, e.y) < 470 && W.los(room, p.x, p.y, e.x, e.y, 1))) g.lostT = 0;
          else if ((g.lostT = (g.lostT || 0) + raw) > 2.2) for (const e of alive) pick(e.x, e.y, 'e');
        } else if (room.zones && room.waves && room.waveI < room.waves.length) for (const z of room.zones) if (!z.done) pick(z.x * T, z.y * T, 'z' + z.x);
      } else {
        for (const it of room.interact) if (!it.used && (it.kind === 'chest' || it.kind === 'portal' || it.kind === 'event')) pick(it.x, it.y + 30, 'i' + it.kind);
        if (key === null) for (const d in room.doors) if (!room.doors[d].to.visited) { const c = room.doors[d].cells[1]; pick((c[0] + 0.5) * T, (c[1] + 0.5) * T, 'd' + d); }
      }
      if (key === null || bd < (key[0] === 'z' ? 1.6 : key === 'e' ? 0.8 : 3) * T) { g.on = false; g.key = null; g.wx = (g.wx || 0) * 0.96; g.wy = (g.wy || 0) * 0.96; return; }
      g.foe = key === 'e' || key[0] === 'z'; // 那边是敌人：流光是红的 // 埋伏要带进空地里面才会惊动；出口和宝匣带到跟前就够了
      g.dT = (g.dT || 0) - raw;
      if (g.key !== key || g.room !== room || (key === 'e' && g.dT <= 0)) { g.key = key; g.room = room; g.D = W.distField(room, tx, ty); g.dT = 0.8; } // 敌人会动，追它时每隔一会儿重算一次路
      const D = g.D, w = room.w, h = room.h;
      let cx = U.clamp(Math.floor(p.x / T), 0, w - 1), cy = U.clamp(Math.floor(p.y / T), 0, h - 1);
      for (let s = 0; s < 5; s++) { // 顺着步数场往目标走五格
        let best = D[cy * w + cx], bx = cx, by = cy; if (best < 0) best = 1e9;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const d = D[ny * w + nx]; if (d >= 0 && d < best) { best = d; bx = nx; by = ny; } }
        if (bx === cx && by === cy) break; cx = bx; cy = by;
      }
      const gx = (cx + 0.5) * T, gy = (cy + 0.5) * T;
      if (!g.on) { g.on = true; g.x = p.x; g.y = p.y; g._tr = null; g.px = undefined; } // 刚现身：拖尾从头算起
      const k = Math.min(1, raw * 3.4); g.x += (gx - g.x) * k; g.y += (gy - g.y) * k;
      // 风向：从主角指向前方五格处，慢慢转过去
      const wl = Math.hypot(gx - p.x, gy - p.y) || 1, wk = Math.min(1, raw * 1.5);
      g.wx = (g.wx || 0) + ((gx - p.x) / wl - (g.wx || 0)) * wk; g.wy = (g.wy || 0) + ((gy - p.y) / wl - (g.wy || 0)) * wk;
      // 流光：十几个光点从主角身边出发，各自顺着步数场往目标飘一段，淡去后回到主角身边重来
      const M = g.motes || (g.motes = Array.from({ length: 16 }, () => ({ life: 0 })));
      for (const m of M) {
        m.life -= raw;
        const tx2 = Math.floor(m.x / T), ty2 = Math.floor(m.y / T), here = m.life > 0 && tx2 >= 0 && ty2 >= 0 && tx2 < w && ty2 < h ? D[ty2 * w + tx2] : -1;
        if (here < 0) { const a = U.rand(Math.PI * 2), r = U.rand(14, 70); m.x = p.x + Math.cos(a) * r; m.y = p.y + Math.sin(a) * r; m.life = m.max = U.rand(1.5, 2.6); m.ph = U.rand(6.3); m.sp = U.rand(150, 230); continue; }
        let best = here, bx2 = tx2, by2 = ty2;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = tx2 + dx, ny = ty2 + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const d = D[ny * w + nx]; if (d >= 0 && d < best && (!dx || !dy || (D[ty2 * w + nx] >= 0 && D[ny * w + tx2] >= 0))) { best = d; bx2 = nx; by2 = ny; } }
        const ax = (bx2 + 0.5) * T - m.x, ay = (by2 + 0.5) * T - m.y, al = Math.hypot(ax, ay) || 1, wob = Math.sin(m.life * 6 + m.ph) * 0.5;
        m.x += ((ax / al) - (ay / al) * wob) * m.sp * raw; m.y += ((ay / al) + (ax / al) * wob) * m.sp * raw;
        if (here === 0) m.life = Math.min(m.life, 0.2);
      }
    },

    /* 换图的过渡：沿着出口的方向走出去（上桥 / 进洞 / 出门），画面渐暗；到了下一张图，从对面的入口走进来。
       两张图的出入口是成对的 —— 从东边的桥离开，就从下一张图西边的桥上来 */
    stepTransit(raw) {
      const tr = this.transit, p = this.player, o = W.DIRS[tr.d];
      tr.t += raw; p.t += raw; p.moving = true; p.face = Math.atan2(o[1], o[0]);
      p.x += o[0] * 250 * raw; p.y += o[1] * 250 * raw;
      if (tr.ph === 0) {
        this.fade = Math.min(1, tr.t / 0.4);
        if (tr.t >= 0.4) {
          this.enterRoom(tr.to, W.OPP[tr.d]);
          const c = this.room.doors[W.OPP[tr.d]].cells[1]; // 落在入口外侧（桥上 / 洞里），再往里走
          p.x = (c[0] + 0.5 - o[0] * 1.5) * T; p.y = (c[1] + 0.5 - o[1] * 1.5) * T;
          tr.ph = 1; tr.t = 0; R.updateCam(0, true);
        }
      } else if (tr.t >= 0.56) { this.transit = null; p.moving = false; }
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
        FX.petals(it.x, it.y, 14, 22, '255,220,130', { s0: 40, s1: 200, g: -10 });
        this.openLootChoice(it.elite ? '精英宝匣' : '机缘', '大道五十，天衍四九 —— 择其一', it.elite ? 2 : 1);
      } else if (it.kind === 'shop') {
        if (!it.items) {
          const ex = [];
          const mkRelic = (minRar) => { const id = this.randomRelic(minRar, false, ex); ex.push(id); const r = G.Relics[id]; return { type: 'relic', id, name: r.name, kind: G.KIND[r.kind], glyph: r.glyph, desc: r.desc, cls: 'r' + r.rar, price: Math.round([0, 55, 85, 130][r.rar] * pm) }; };
          it.items = [
            { type: 'potion', name: '黄龙丹', glyph: '丹', desc: `丹药 +1（上限 ${G.POTION_MAX}）。服用回复 38% 气血。`, cls: 'r1', price: Math.round(26 * pm), repeat: 2 },
            { type: 'heal', name: '疗伤灵茶', glyph: '茶', desc: '立刻回复 50% 气血。', cls: 'r1', price: Math.round(18 * pm), repeat: 1 },
            mkRelic(1), mkRelic(1), mkRelic(2),
          ];
          const sk = this.randomSkill([], true);
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
      if (item.type === 'relic' && G.Relics[item.id].kind === 'pet' && p.pets.length >= p.petCap) { Au.sfx('deny'); this.toast('灵兽袋已满'); return false; }
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
        if (this.transit) this.stepTransit(raw); else E.updatePlayer(dt);
        this.updateGuide(raw);
      } else this.target = null;
      E.updateEnemies(dt);
      E.updateProjs(dt);
      E.updateHaz(dt);
      FX.update(dt);
      for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].life -= dt; if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1); }
      for (let i = this.barks.length - 1; i >= 0; i--) { this.barks[i].life -= dt; if (this.barks[i].life <= 0 || this.barks[i].e.dead) this.barks.splice(i, 1); }
      this.shakeAmt *= Math.max(0, 1 - 9 * raw);
      if (this.comboT > 0) { this.comboT -= raw; if (this.comboT <= 0) this.combo = 0; }
      if (this.hurtFlash > 0) this.hurtFlash -= raw;
      if (this.flash > 0) this.flash -= raw;
      R.updateCam(raw);
      if (this.state !== 'play' || this.room !== room) return;

      // 波次与清场
      if (room.locked && room.type !== 'boss') {
        if (room.enemies.length === 0) {
          if (room.waveI < room.waves.length) {
            if (room.zones) { // 大图：敌人按空地埋伏，走进一片还没惊动过的空地，才引出下一波
              let z = room.zones.find((q) => !q.done && Math.abs(p.x / T - q.x) < q.rx + 0.6 && Math.abs(p.y / T - q.y) < q.ry + 0.6);
              if (!z && room.zones.every((q) => q.done)) z = room.zones[0];
              if (z) { room.waveT -= dt; if (room.waveT <= 0) { z.done = true; E.spawnWave(room, z); room.waveT = 0.7; } }
            } else { room.waveT -= dt; if (room.waveT <= 0) { E.spawnWave(room); room.waveT = 0.7; } }
          } else this.onRoomCleared();
        }
      }
      // 待处理的感悟
      if (!room.locked && p.pendingLv > 0 && !p.dead) { this.openLevelChoice(); return; }

      // 过门（正在过渡时不检测：进来时会踩过入口那几格）
      if (!room.locked && !this.transit) {
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        if (tx >= 0 && ty >= 0 && tx < room.w && ty < room.h && room.tiles[ty * room.w + tx] === 4) {
          for (const d in room.doors) {
            if (room.doors[d].cells.some(([x, y]) => x === tx && y === ty)) { this.transit = { d, to: room.doors[d].to, ph: 0, t: 0 }; return; }
          }
        }
      }
      // 交互
      const it = this.transit ? null : this.nearInteract();
      G.UI.prompt(it ? it.label : null);
      if (it && (I.hit('KeyF') || I.hit('act'))) this.interact(it);
    },

    /* 调试 / 自动化测试用 */
    debugKillAll() { for (const e of this.room.enemies.slice()) { e.st = 'idle'; e.untarget = false; e.invT = 0; E.dmgEnemy(e, 1e7, { noCrit: true }); } },
  });

  window.addEventListener('load', () => Game.init());
})();
