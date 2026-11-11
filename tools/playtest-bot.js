/* 试玩机器人：不开无敌，自动打完整局，用来回归和看平衡。只跑逻辑、不渲染，一局一分多钟。
   它不是游戏的一部分，只是开发用的工具；需要 Node 和 Playwright（npm i playwright）。

   用法：
     1. 在仓库根目录起一个静态服务器：python3 -m http.server 8765
     2. node tools/playtest-bot.js <局数> <加速倍数> <起始章节>
        例：node tools/playtest-bot.js 5 40 0
     环境变量：
       MAIN=qy|du|dy   筑基时选哪门主修功法（默认选第一张卡：青元剑诀）
       BASE=http://…   游戏的地址（默认 http://127.0.0.1:8765）
       PREFER=main     升层时优先参悟主修功法（默认总是点第一张卡）

   输出：每间房一行（章节、房型、+T 有台地、+B 大图、用时、气血变化……），每局结束一行汇总，
   以 @@ 开头的一行是便于脚本统计的 JSON。打不完的局会打印 STUCK / DIAG 供排查。

   机器人的打法很朴素：完全依赖自动瞄准，垂直于弹道闪避，离预警圈远一点；清场后直接"传送"去下一间房。
   所以它的通关率只能横向比较（改动前后、三门功法之间），不能当成真人的难度。 */
const { chromium } = require('playwright');
(async () => {
  const runs = +(process.argv[2] || 1), turbo = +(process.argv[3] || 8);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (let run = 0; run < runs; run++) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
    await pg.goto((process.env.BASE || 'http://127.0.0.1:8765') + '/index.html');
    await pg.waitForFunction(() => window.G && G.Assets && G.Assets.settled, null, { timeout: 60000 });
    await pg.waitForTimeout(500);
    await pg.click('#btn-start');
    for (let i = 0; i < 16; i++) { await pg.waitForTimeout(450); if (await pg.evaluate(() => G.Game.state === 'play' && !G.UI.blocking)) break; await pg.keyboard.press('Space'); }
    await pg.waitForTimeout(400);
    const startCh = +(process.argv[4] || 0);
    if (startCh) { await pg.evaluate((c) => { const p = G.Game.player; p.dmgMul += 0.3 * c; p.maxHp += 50 * c; p.hp = p.maxHp; G.Game.enterChapter(c); }, startCh); await pg.waitForTimeout(300); await pg.keyboard.press('Space'); await pg.waitForTimeout(300); }
    await pg.evaluate((du) => { window.MAIN_DU = du; }, process.env.MAIN === 'du' ? 1 : process.env.MAIN === 'dy' ? 2 : 0);
    await pg.evaluate((v) => { window.PREFER_MAIN = v; }, process.env.PREFER === 'main');
    await pg.evaluate((turbo) => {
      const Gm = G.Game, I = G.Input, R = G.Render, U = G.U;
      window.LOG = []; window.roomT0 = 0;
      const done = new Set(); let settle = 0, lastRoom = null, hp0 = 0;
      function bot() {
        const p = Gm.player; if (Gm.state !== 'play' || G.UI.blocking) return;
        if (Gm.guide && Gm.guide.on && Gm.room.locked) { const gx = Gm.guide.x, gy = Gm.guide.y, rm = Gm.room; if (rm.tiles[Math.floor(gy / 48) * rm.w + Math.floor(gx / 48)] === 0) { p.x = gx; p.y = gy; } } /* 只落在地面格上：引导点是平滑过的视觉位置，会穿墙 */ /* 跟着灵蝶走：去埋伏点，或者去找躲起来的残敌 */
        const e = G.Ent.nearestEnemy(p.x, p.y);
        I.keys = {};
        if (!e) { I.mouse.down = false; const rm = Gm.room; if (rm.locked && rm.zones) { const z = rm.zones.find((q) => !q.done); if (z) { p.x = z.x * 48; p.y = z.y * 48; } } return; } /* 大图：没有敌人时走进下一片有埋伏的空地 */
        I.mouse.down = false; /* 不碰鼠标：完全依赖自动瞄准 */
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        let ax = 0, ay = 0, danger = 0;
        for (const pr of Gm.projs) if (pr.from === 1) {
          const dd = Math.hypot(pr.x - p.x, pr.y - p.y) || 1;
          if (dd < 130) { // 垂直于弹道方向闪避
            const sp = Math.hypot(pr.vx, pr.vy) || 1, nx = -pr.vy / sp, ny = pr.vx / sp;
            const side = (p.x - pr.x) * nx + (p.y - pr.y) * ny >= 0 ? 1 : -1, w = (130 - dd) / 130;
            ax += nx * side * w * 2.5; ay += ny * side * w * 2.5; if (dd < 46) danger++;
          }
        }
        for (const h of Gm.haz) if (h.from === 1) {
          if (h.type === 'circle' || h.type === 'lob' || h.type === 'puddle') { const dd = Math.hypot(h.x - p.x, h.y - p.y) || 1; if (dd < h.r + 36) { ax += ((p.x - h.x) / dd) * 4; ay += ((p.y - h.y) / dd) * 4; if (h.type !== 'puddle' && h.t > (h.delay || h.dur) - 0.25) danger++; } }
          else if (h.type === 'line') { const dd = U.segDist(p.x, p.y, h.x1, h.y1, h.x2, h.y2); if (dd < h.w / 2 + 34) { const lx = h.x2 - h.x1, ly = h.y2 - h.y1, l = Math.hypot(lx, ly) || 1, nx = -ly / l, ny = lx / l; const side = (p.x - h.x1) * nx + (p.y - h.y1) * ny >= 0 ? 1 : -1; ax += nx * side * 5; ay += ny * side * 5; } }
          else if (h.type === 'beam' && h.owner) { const x2 = h.owner.x + Math.cos(h.ang) * h.len, y2 = h.owner.y + Math.sin(h.ang) * h.len; const dd = U.segDist(p.x, p.y, h.owner.x, h.owner.y, x2, y2); if (dd < 90) { const nx = -Math.sin(h.ang), ny = Math.cos(h.ang); const side = Math.sign(h.rot || 1); ax += nx * side * 5; ay += ny * side * 5; } }
        }
        const want = e.boss ? 270 : 230;
        const los = G.World.los(Gm.room, p.x, p.y, e.x, e.y);
        if (!los) { ax += ((e.x - p.x) / d) * 2 + (-(e.y - p.y) / d) * 1.2; ay += ((e.y - p.y) / d) * 2 + ((e.x - p.x) / d) * 1.2; }
        else if (d < want - 40) { ax += ((p.x - e.x) / d) * 1.4; ay += ((p.y - e.y) / d) * 1.4; } else if (d > want + 90) { ax += (e.x - p.x) / d; ay += (e.y - p.y) / d; } else { ax += (-(e.y - p.y) / d) * 0.7; ay += ((e.x - p.x) / d) * 0.7; }
        const rw = Gm.room.w * 48, rh = Gm.room.h * 48;
        ax += ((rw / 2 - p.x) / rw) * 1.6; ay += ((rh / 2 - p.y) / rh) * 1.6;
        if (ax > 0.3) I.keys.KeyD = true; if (ax < -0.3) I.keys.KeyA = true; if (ay > 0.3) I.keys.KeyS = true; if (ay < -0.3) I.keys.KeyW = true;
        for (let i = 0; i < 3; i++) if (p.skills[i] && p.skills[i].cd <= 0 && Math.random() < 0.1) G.Ent.castSkill(i);
        if (p.hp < p.maxHp * 0.4 && p.potions > 0) I.pressed.KeyC = true;
        if (p.fy && p.sp >= 100) G.Ent.castUlt();
        if (danger && p.dashN > 0 && Math.random() < 0.5) I.pressed.Space = true;
      }
      setInterval(() => { for (let i = 0; i < turbo; i++) { bot(); try { Gm.update(1 / 60); } catch (e) { window.LOG.push('ERR ' + e.message + ' ' + e.stack); } I.pressed = {}; } }, 16);
      setInterval(() => {
        const p = Gm.player, room = Gm.room;
        if (Gm.state !== 'play') return;
        if (G.UI.blocking) {
          const h2 = document.querySelector('.choice h2'), pickDu = window.MAIN_DU && h2 && h2.textContent.includes('主修功法'); /* 可指定主修：du 毒经 / dy 大衍诀 */
          const mainCard = window.PREFER_MAIN && [...document.querySelectorAll('.card')].find((c) => /^功法 · 第/.test((c.querySelector('em') || {}).textContent || '')); /* 可让它优先参悟主修功法 */
          const el = mainCard || (pickDu && document.querySelectorAll('.card')[window.MAIN_DU]) || document.querySelector('.card, .opt:not([disabled]), .list button[data-i]:not([disabled])') || document.getElementById('x-close');
          if (el) el.click(); else document.getElementById('overlay').click();
          return;
        }
        if (room !== lastRoom) { lastRoom = room; window.roomT0 = Gm.stats.time; hp0 = p.hp; settle = 0; }
        if (room.locked || Gm.transit) return; /* 正在穿门过渡时什么都不做：这时再直接进别的房间，会把那间房标成去过却没真进去 */
        if (!room._logged && room.type !== 'start') { room._logged = true; window.LOG.push(`c${Gm.chapter} ${room.type}${room.hc ? '+T' : ''}${room.zones ? '+B' : ''} t=${(Gm.stats.time - window.roomT0).toFixed(0)}s hp ${Math.round(hp0)}→${Math.round(p.hp)}/${p.maxHp} lv${p.level} pot${p.potions} rel${p.relicList.length} qy${p.qy} fy${p.fy} dmgx${(p.swordDmg*p.swordMul*p.dmgMul*p.atkSpd*p.swords).toFixed(0)}`); }
        if (p.pendingLv > 0) return;
        if (room.pickups.length && settle++ < 12) return;
        const it = room.interact.find((i) => !i.used && !done.has(i));
        if (it) { if (it.kind === 'shop' || it.kind === 'garden') done.add(it); p.x = it.x; p.y = it.y + 34; I.pressed.KeyF = true; Gm.interact(it); return; }
        const rooms = Gm.floor.rooms.filter((r) => !r.visited && Object.values(r.links).some((o) => o.visited));
        if (!rooms.length) return;
        rooms.sort((a, b2) => (a.type === 'boss') - (b2.type === 'boss') || a.depth - b2.depth);
        const nx = rooms[0], d = Object.keys(nx.links).find((k) => nx.links[k].visited);
        Gm.enterRoom(nx, d);
      }, 120);
    }, turbo);
    await pg.evaluate(() => { G.Render.drawWorld = function () {}; G.Render.drawMenu = function () {}; }); // 只跑逻辑，不渲染：一局几十秒
    let last = '', seen = 0;
    const t0 = Date.now();
    for (let i = 0; i < 1200; i++) {
      await pg.waitForTimeout(250);
      const st = await pg.evaluate((seen) => ({ s: G.Game.state, ch: G.Game.chapter, t: G.Game.stats.time, lines: window.LOG.slice(seen), blocking: G.UI.blocking, room: G.Game.room && G.Game.room.type, n: G.Game.room ? G.Game.room.enemies.length : 0 }), seen);
      seen += st.lines.length;
      for (const l of st.lines) if (!/garden|shop|event|treasure/.test(l)) console.log(l);
      if (i % 400 === 399) console.log(`  [real ${((Date.now() - t0) / 1000).toFixed(0)}s game ${st.t.toFixed(0)}s ch${st.ch} ${st.room} enemies ${st.n} blocking ${st.blocking}]`);
      if (st.s === 'dead' || st.s === 'won') { last = st.s; break; }
      const stuck = await pg.evaluate(() => {
        const Gm = G.Game, room = Gm.room, p = Gm.player;
        if (!room.locked || Gm.stats.time - window.roomT0 < (room.type === 'boss' ? 240 : 90)) return null;
        return { room: room.type, w: room.w, h: room.h, waveI: room.waveI, waves: room.waves && room.waves.length, p: [Math.round(p.x), Math.round(p.y), Math.round(p.hp)],
          en: room.enemies.map((e) => ({ k: e.key, st: e.st, stT: +(e.stT || 0).toFixed(2), x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, tile: room.tiles[Math.floor(e.y / 48) * room.w + Math.floor(e.x / 48)], unt: !!e.untarget, dead: !!e.dead, cd: +(e.cd || 0).toFixed(2), alpha: e.alpha, inv: e.invT })) ,
          haz: Gm.haz.length, projs: Gm.projs.length, tiles: Array.from({ length: room.h }, (_, y) => Array.from(room.tiles.slice(y * room.w, (y + 1) * room.w)).join('')).join('\n') };
      });
      if (stuck) { console.log('STUCK', JSON.stringify(stuck, null, 0).replace(/\\n/g, '\n')); break; }
    }
    const res = await pg.evaluate(() => ({ log: window.LOG, stats: G.Game.stats, ch: G.Game.chapter, room: G.Game.room.type, state: G.Game.state, boss: G.Game.boss && !G.Game.boss.dead ? Math.round(G.Game.boss.hp) + '/' + G.Game.boss.maxHp : '', relics: G.Game.player.relicList.map(r => G.Relics[r].name), skills: G.Game.player.skills.map(s => G.Skills[s.id].name + s.lv) }));
    console.log(`=== run ${run}: ${res.state} at ch${res.ch} ${res.room} ${res.boss} time ${res.stats.time.toFixed(0)}s kills ${res.stats.kills} taken ${res.stats.taken}`);
    console.log('@@', JSON.stringify(await pg.evaluate(() => { const p = G.Game.player, Gm = G.Game; return { main: Gm.mainId(), mlv: Gm.mainLv(), state: Gm.state, ch: Gm.chapter, t: Math.round(Gm.stats.time), taken: Gm.stats.taken, lv: p.level, rel: p.relicList.length, pot: p.potions, hp: Math.round(p.hp), maxHp: p.maxHp }; })));
    console.log('relics:', res.relics.join(','), '| skills:', res.skills.join(','));
    if (res.state === 'play') console.log('DIAG', JSON.stringify(await pg.evaluate(() => { const Gm = G.Game, r = Gm.room, p = Gm.player; return { locked: r.locked, cleared: r.cleared, type: r.type, terrain: r.terrain, visited: r.visited, waveI: r.waveI, waves: r.waves && r.waves.length, zones: r.zones && r.zones.map((z) => !!z.done), en: r.enemies.map((e) => [e.key, e.st, !!e.dead]), pend: p.pendingLv, inter: r.interact.map((i) => [i.kind, !!i.used]), transit: !!Gm.transit, blocking: G.UI.blocking, pickups: r.pickups.length, unvis: Gm.floor.rooms.filter((x) => !x.visited).map((x) => [x.type, Object.values(x.links).some((o) => o.visited)]), pos: [Math.round(p.x), Math.round(p.y), r.tiles[Math.floor(p.y / 48) * r.w + Math.floor(p.x / 48)]], dead: p.dead, hc: !!r.hc, after: (Gm.timers || Gm.afters || []).length, boss: !!Gm.boss, clearHostile: !!Gm.clearHostile }; })));
    if (errs.length) console.log(errs.join('\n'));
    await pg.close();
  }
  await b.close();
})();
