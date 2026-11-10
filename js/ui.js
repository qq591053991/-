'use strict';
/* 凡人问道 —— 界面：菜单、HUD、抉择卡、坊市、药园、奇遇、对白、结算 */
(function () {
  const G = window.G, U = G.U, E = G.Ent, Au = G.Audio;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const ROMAN = ['', '一', '二', '三'], PIP = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];

  const UI = (G.UI = {
    blocking: false, onKey: null, mapDirty: true, skillDirty: true, relicDirty: true, mapT: 0, cache: {}, bossRef: null,

    init() {
      this.ov = $('overlay');
      window.addEventListener('keydown', (e) => {
        if (this.blocking && this.onKey) { this.onKey(e.code); e.preventDefault(); }
      });
      $('btn-start').onclick = () => { if (!G.Assets.settled) return; Au.init(); Au.sfx('pick'); G.Game.startRun(); };
      $('btn-start').disabled = true; $('btn-start').textContent = '载入中…';
      $('btn-meta').onclick = () => { Au.init(); Au.sfx('ui'); this.metaPanel(); };
      $('btn-help').onclick = () => { Au.init(); Au.sfx('ui'); this.help(); };
      // 触屏按钮
      const bind = (el, name) => {
        const down = (e) => { G.Input.btn[name] = true; G.Input.btnPressed[name] = true; e.preventDefault(); e.stopPropagation(); };
        const up = (e) => { G.Input.btn[name] = false; e.preventDefault(); };
        el.addEventListener('touchstart', (e) => { if (!G.Input.touchMode) G.Input.setTouchMode(true); down(e); }, { passive: false });
        el.addEventListener('touchend', up, { passive: false });
        el.addEventListener('touchcancel', up, { passive: false });
        el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
      };
      bind($('t-dash'), 'dash'); bind($('t-potion'), 'potion'); bind($('t-act'), 'act'); bind($('t-pause'), 'pause');
      document.querySelectorAll('#skills .slot[data-i]').forEach((el) => bind(el, 'skill' + el.dataset.i));
      bind($('ult'), 'ult');
    },

    assetsReady() {
      const b = $('btn-start'); b.disabled = false; b.textContent = '踏入仙途';
      if (G.Assets.failed) this.toast('社区模型未能加载，已改用内置模型');
    },

    /* ---------------- 通用弹层 ---------------- */
    open(html, cls) {
      this.ov.innerHTML = html; this.ov.className = 'show ' + (cls || '');
      this.blocking = true; this.onKey = null;
      G.Input.keys = {}; G.Input.mouse.down = false; G.Input.stick.active = false;
    },
    close() {
      this.ov.className = ''; this.ov.innerHTML = '';
      this.blocking = false; this.onKey = null;
      G.Input.pressed = {}; G.Input.btnPressed = {}; G.Input.keys = {}; G.Input.mouse.down = false;
    },

    /* ---------------- 菜单 ---------------- */
    showMenu() {
      const m = G.Game.meta;
      $('menu').className = 'show';
      $('menu-info').textContent = m.runs ? `道心 ${m.dao}　·　已历 ${m.runs} 世${m.wins ? `　·　证道 ${m.wins} 次` : m.best ? `　·　最远至「${G.Chapters[Math.min(3, m.best - 1)].name}」` : ''}` : '';
      $('menu-tip').textContent = '· ' + U.pick(G.Tips) + ' ·';
    },
    hideMenu() { $('menu').className = ''; },
    showHUD(on) { $('hud').className = on ? 'show' : ''; this.cache = {}; this.mapDirty = this.skillDirty = this.relicDirty = true; },

    help() {
      this.open(`<div class="panel help">
        <h2>修行须知</h2>
        <div class="cols">
          <div><h3>键鼠</h3>
            <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</p>
            <p>飞剑<b>自动瞄准</b>最近的敌人并出剑</p>
            <p><kbd>鼠标左键</kbd> 按住可改为手动瞄准（朝鼠标出剑）</p>
            <p><kbd>空格</kbd> 罗烟步 · 无敌闪避</p>
            <p><kbd>Q</kbd>/<kbd>右键</kbd>　<kbd>E</kbd>　<kbd>R</kbd> 施展神通</p>
            <p><kbd>V</kbd> 本命法宝 · 蜂云剑阵 / 大庚剑阵（结丹后）</p>
            <p><kbd>C</kbd> 服用丹药　<kbd>F</kbd> 交互</p>
            <p><kbd>Esc</kbd> 暂停/查看　<kbd>M</kbd> 静音</p>
          </div>
          <div><h3>触屏</h3>
            <p>左半屏拖动：移动</p>
            <p>飞剑自动锁定最近的敌人</p>
            <p>右下按钮：遁术、神通、丹药</p>
            <h3>要诀</h3>
            <p>清空房间可得一滴<b>灵露</b>，在<b>药园</b>催熟灵药。</p>
            <p>红圈红线是招式预警；遁术可穿越一切。</p>
            <p><b>法宝</b>自行祭出，<b>灵宠</b>常驻身侧（灵兽袋至多三只）。</p>
            <p>陨落后获得<b>道心</b>，在洞府永久强化。</p>
          </div>
        </div>
        <button class="btn" id="x-close">知晓了</button></div>`, 'dim');
      $('x-close').onclick = () => { Au.sfx('ui'); this.close(); };
      this.onKey = (k) => { if (k === 'Escape' || k === 'Enter' || k === 'Space') this.close(); };
    },

    metaPanel() {
      const Gm = G.Game, m = Gm.meta;
      const rows = G.Meta.map((d) => {
        const lv = m.up[d.id], maxed = lv >= d.max, cost = d.cost(lv);
        const pips = Array.from({ length: d.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        return `<div class="row"><span class="glyph r2">${d.glyph}</span><div class="info"><b>${d.name}</b><span class="pips">${pips}</span><em>${lv ? d.desc(lv) : '尚未修习'}${maxed ? '' : ' → ' + d.desc(lv + 1)}</em></div>
          <button class="btn sm" data-id="${d.id}" ${maxed || m.dao < cost ? 'disabled' : ''}>${maxed ? '圆满' : '道心 ' + cost}</button></div>`;
      }).join('');
      this.open(`<div class="panel meta"><h2>洞府 · 轮回感悟</h2><p class="sub">每一世的陨落都不会白费。以道心淬炼根基，永久生效。</p>
        <div class="dao">道心 <b>${m.dao}</b></div><div class="list">${rows}</div><button class="btn" id="x-close">离开洞府</button></div>`, 'dim');
      this.ov.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = () => {
        const d = G.Meta.find((x) => x.id === b.dataset.id), lv = m.up[d.id], cost = d.cost(lv);
        if (lv < d.max && m.dao >= cost) { m.dao -= cost; m.up[d.id]++; Gm.saveMeta(); Au.sfx('levelup'); this.metaPanel(); }
      }));
      $('x-close').onclick = () => { Au.sfx('ui'); this.close(); this.showMenu(); };
      this.onKey = (k) => { if (k === 'Escape') { this.close(); this.showMenu(); } };
    },

    /* ---------------- 叙事 ---------------- */
    story(pages, done) {
      let i = 0;
      const show = () => {
        const pg = pages[i], o = typeof pg === 'string' ? { text: pg } : pg;
        this.open(`<div class="story">${o.title ? `<h1>${esc(o.title)}</h1>` : ''}${o.sub ? `<h4>—— ${esc(o.sub)} ——</h4>` : ''}
          <p>${esc(o.text).replace(/\n/g, '<br>')}</p><span class="hint">点击或按空格继续</span></div>`, 'black');
        const next = () => { Au.sfx('ui'); i++; if (i < pages.length) show(); else { this.close(); done && done(); } };
        let ready = false; setTimeout(() => (ready = true), 250);
        this.ov.onclick = () => { if (ready) { this.ov.onclick = null; next(); } };
        this.onKey = (k) => { if (ready && (k === 'Space' || k === 'Enter' || k === 'Escape')) { this.ov.onclick = null; next(); } };
      };
      show();
    },

    dialog(lines, done) {
      let i = 0;
      const show = () => {
        const [who, text] = lines[i];
        this.open(`<div class="dialog"><b class="${who === '你' ? 'me' : who === '旁白' ? 'nar' : 'foe'}">${who === '旁白' ? '' : esc(who)}</b><p>${esc(text)}</p><span class="hint">▼</span></div>`, 'clear');
        const next = () => { Au.sfx('ui'); i++; if (i < lines.length) show(); else { this.close(); done && done(); } };
        let ready = false; setTimeout(() => (ready = true), 200);
        this.ov.onclick = () => { if (ready) { this.ov.onclick = null; next(); } };
        this.onKey = (k) => { if (ready && (k === 'Space' || k === 'Enter' || k === 'Escape' || k === 'KeyF')) { this.ov.onclick = null; next(); } };
      };
      show();
    },

    titleCard(big, small) {
      const el = $('title-card');
      el.innerHTML = `<em>${esc(small)}</em><b>${esc(big)}</b>`;
      el.className = ''; void el.offsetWidth; el.className = 'show';
    },

    toast(msg) {
      const box = $('toasts'), el = document.createElement('div');
      el.textContent = msg; box.appendChild(el);
      while (box.children.length > 4) box.removeChild(box.firstChild);
      setTimeout(() => el.classList.add('out'), 2200);
      setTimeout(() => el.remove(), 2800);
    },

    /* ---------------- 三选一 ---------------- */
    choice(o) {
      const cards = o.cards.map((c, i) => `<button class="card ${c.cls || ''}" data-i="${i}">
        <span class="glyph" ${c.color ? `style="color:${c.color};border-color:${c.color}"` : ''}>${c.glyph}</span>
        <b>${esc(c.name)}</b><em>${esc(c.tag || '')}</em><p>${esc(c.desc)}</p><span class="num">${i + 1}</span>${c.sch && c.sch !== 'misc' ? `<span class="sch" style="color:${G.Schools[c.sch].color};border-color:${G.Schools[c.sch].color}">${G.Schools[c.sch].name}</span>` : ''}</button>`).join('');
      this.open(`<div class="choice"><h2>${esc(o.title)}</h2><p class="sub">${esc(o.sub || '')}</p><div class="cards">${cards}</div></div>`, 'dim');
      let ready = false; setTimeout(() => (ready = true), 350);
      const pick = (i) => {
        if (!ready || !o.cards[i]) return;
        this.close(); o.cards[i].pick(); o.done && o.done();
      };
      this.ov.querySelectorAll('.card').forEach((b) => (b.onclick = () => pick(+b.dataset.i)));
      this.onKey = (k) => { const m = /^(Digit|Numpad)([1-4])$/.exec(k); if (m) pick(+m[2] - 1); };
    },

    breakthrough(title, desc, done) {
      this.open(`<div class="break"><div class="halo"></div><h1>${esc(title)}</h1><p>${esc(desc).replace(/\n/g, '<br>').replace(/【(.+?)】/g, '<b>【$1】</b>')}</p><button class="btn" id="x-close">继续</button></div>`, 'dim');
      const fin = () => { this.close(); done && done(); };
      $('x-close').onclick = fin;
      let ready = false; setTimeout(() => (ready = true), 500);
      this.onKey = (k) => { if (ready && (k === 'Space' || k === 'Enter')) fin(); };
    },

    /* ---------------- 坊市 / 药园 / 奇遇 ---------------- */
    shop(items) {
      const Gm = G.Game, p = Gm.player;
      const draw = () => {
        const rows = items.map((it, i) => `<div class="row ${it.sold ? 'sold' : ''}"><span class="glyph ${it.cls}">${it.glyph}</span>
          <div class="info"><b>${esc(it.name)}${it.kind ? ` <small>${it.kind}</small>` : ''}${it.repeat > 1 ? ` <small>余 ${it.repeat}</small>` : ''}</b><em>${esc(it.desc)}</em></div>
          <button class="btn sm" data-i="${i}" ${it.sold || p.stones < it.price || (it.type === 'potion' && p.potions >= G.POTION_MAX) ? 'disabled' : ''}>${it.sold ? '售罄' : it.type === 'potion' && p.potions >= G.POTION_MAX ? '已满' : '◆ ' + it.price}</button></div>`).join('');
        this.open(`<div class="panel shop"><h2>坊市</h2><p class="sub">“道友随便看看，童叟无欺。”</p><div class="dao">灵石 <b>◆ ${p.stones}</b></div>
          <div class="list">${rows}</div><button class="btn" id="x-close">离开</button></div>`, 'dim');
        this.ov.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => { Gm.buy(items[+b.dataset.i]); draw(); }));
        $('x-close').onclick = () => { Au.sfx('ui'); this.close(); };
        this.onKey = (k) => { if (k === 'Escape' || k === 'KeyF') this.close(); };
      };
      draw();
    },

    garden(it) {
      const Gm = G.Game, p = Gm.player;
      const cost = (x) => Math.max(1, x.h.cost - (p.flags.vial ? 1 : 0)); // 掌天瓶：少费一滴
      const draw = () => {
        const rows = it.herbs.map((x, i) => `<div class="row ${x.sold ? 'sold' : ''}"><span class="glyph r2 herb">${x.h.glyph}</span>
          <div class="info"><b>${esc(x.h.name)}</b><em>${esc(x.h.desc)}</em></div>
          <button class="btn sm green" data-i="${i}" ${x.sold || p.drops < cost(x) ? 'disabled' : ''}>${x.sold ? '已采' : '灵露 ' + cost(x)}</button></div>`).join('');
        this.open(`<div class="panel shop"><h2>药园</h2><p class="sub">取出玉瓶，滴下灵露——灵药转瞬便是百年药龄。</p><div class="dao green">灵露 <b>${p.drops}</b> 滴</div>
          <div class="list">${rows}</div><button class="btn" id="x-close">离开</button></div>`, 'dim');
        this.ov.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => {
          const x = it.herbs[+b.dataset.i];
          if (x.sold || p.drops < cost(x)) { Au.sfx('deny'); return; }
          p.drops -= cost(x); x.sold = true; x.h.run(p); p.hp = Math.min(p.hp, p.maxHp);
          Au.sfx('heal'); Gm.toast(`催熟并服用了【${x.h.name}】`);
          if (it.herbs.every((h) => h.sold)) it.used = true;
          draw();
        }));
        $('x-close').onclick = () => { Au.sfx('ui'); this.close(); };
        this.onKey = (k) => { if (k === 'Escape' || k === 'KeyF') this.close(); };
      };
      draw();
    },

    event(ev) {
      const Gm = G.Game, p = Gm.player;
      const opts = ev.options.map((o, i) => `<button class="opt" data-i="${i}" ${o.can && !o.can(p) ? 'disabled' : ''}><b>${esc(o.label)}</b><em>${esc(o.hint || '')}</em></button>`).join('');
      this.open(`<div class="panel event"><span class="glyph r3 big">${ev.glyph}</span><h2>${esc(ev.title)}</h2><p class="text">${esc(ev.text)}</p><div class="opts">${opts}</div></div>`, 'dim');
      this.ov.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
        const res = ev.options[+b.dataset.i].run(Gm, p);
        p.hp = Math.min(p.hp, p.maxHp);
        Au.sfx('pick');
        this.open(`<div class="panel event"><span class="glyph r3 big">${ev.glyph}</span><h2>${esc(ev.title)}</h2><p class="text">${esc(res)}</p><button class="btn" id="x-close">继续</button></div>`, 'dim');
        $('x-close').onclick = () => { Au.sfx('ui'); this.close(); };
        this.onKey = (k) => { if (k === 'Space' || k === 'Enter' || k === 'Escape') this.close(); };
      }));
    },

    /* ---------------- 暂停 / 结算 ---------------- */
    statLine(p) {
      return [
        ['境界', E.realmName(p)], ['气血', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['法力', `${Math.floor(p.mp)} / ${p.maxMp}`],
        ['飞剑伤害', Math.round(p.swordDmg * p.swordMul * p.dmgMul)], ['飞剑数量', p.swords], ['攻速', (p.atkSpd).toFixed(1) + ' /秒'],
        ['暴击', Math.round(p.crit * 100) + '%'], ['暴伤', Math.round(p.critMul * 100) + '%'], ['神通增伤', '+' + Math.round((p.spellMul * p.dmgMul - 1) * 100) + '%'],
        ['冷却缩减', Math.round(p.cdr * 100) + '%'], ['减伤', Math.round(p.armor * 100) + '%'], ['移速', Math.round(p.speed)],
        ['法宝增伤', '+' + Math.round((p.baoMul * p.dmgMul - 1) * 100) + '%'], ['灵宠增伤', '+' + Math.round((p.petMul * p.dmgMul - 1) * 100) + '%'], ['灵兽袋', `${p.pets.length} / ${p.petCap}`],
      ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    },

    pause() {
      const Gm = G.Game, p = Gm.player;
      const skills = p.skills.map((s, i) => { const d = G.Skills[s.id]; return `<div class="row"><span class="glyph" style="color:${d.color};border-color:${d.color}">${d.glyph}</span><div class="info"><b>${d.name} · 第${ROMAN[s.lv]}重 <small>[${'QER'[i]}]</small></b><em>${esc(d.desc(s.lv))}</em></div></div>`; }).join('');
      const arts = `<div class="row"><span class="glyph r3">${p.qy ? '元' : '春'}</span><div class="info"><b>${p.qy ? '青元剑诀 · 第' + G.CN_NUM[p.qy] + '层' : '长春功'}</b><em>${p.qy ? G.Qingyuan.slice(0, p.qy).map((x) => x.desc).join('；') : '炼气期功法。筑基之后方可修炼青元剑诀。'}</em></div></div>` +
        `<div class="row ${p.fy ? '' : 'sold'}"><span class="glyph r3">蜂</span><div class="info"><b>青竹蜂云剑 ${p.fy ? '<small>[V] 剑意 ' + Math.floor(p.sp) + '/100</small>' : '<small>未炼成</small>'}</b><em>${p.fy ? '本命法宝。飞剑命中有几率引动辟邪神雷；命中积攒剑意，满后施展' + (p.dageng ? '「大庚剑阵」：七十二口飞剑环立成阵，困敌绞杀，收阵时降下辟邪神雷。' : '「蜂云剑阵」，七十二口飞剑齐出。') : '结丹之后，以万年天雷竹炼成的本命法宝。'}</em></div></div>`;
      const row = (id) => { const r = G.Relics[id], n = p.relics[id]; return `<div class="row"><span class="glyph r${r.rar}">${r.glyph}</span><div class="info"><b>${r.name}${r.kind === 'craft' ? ' · 第' + G.CN_NUM[n] + '重' : n > 1 ? ' ×' + n : ''}${r.auto ? ' <small>自动祭出</small>' : ''}</b><em>${esc(r.desc)}</em></div></div>`; };
      const relics = Object.keys(G.KIND).map((k) => { const ids = p.relicList.filter((id) => G.Relics[id].kind === k); return ids.length ? `<h4>${G.KIND[k]}${k === 'pet' ? ` <small>${p.pets.length} / ${p.petCap}</small>` : ''}</h4>` + ids.map(row).join('') : ''; }).join('') || '<p class="sub">身无长物。</p>';
      this.open(`<div class="panel pause"><h2>${G.Chapters[Gm.chapter].title}</h2>
        <div class="cols"><div><h3>修为</h3><div class="stats">${this.statLine(p)}</div><h3>行囊 <small>${p.relicList.length} 件</small></h3><div class="list scroll bag">${relics}</div></div>
        <div><h3>主修 · 本命法宝</h3><div class="list">${arts}</div><h3>神通</h3><div class="list">${skills}</div></div></div>
        <div class="btns"><button class="btn" id="x-close">继续修行</button><button class="btn ghost" id="x-aim">瞄准：${Gm.meta.autoAim !== false ? '自动' : '手动'}</button><button class="btn ghost" id="x-mute">${Au.muted ? '开启声音' : '静音'}</button><button class="btn ghost" id="x-quit">放弃此世</button></div></div>`, 'dim');
      $('x-close').onclick = () => { Au.sfx('ui'); this.close(); };
      $('x-mute').onclick = () => { Au.toggleMute(); this.pause(); };
      $('x-aim').onclick = () => { Au.sfx('ui'); Gm.setAutoAim(Gm.meta.autoAim === false); this.pause(); };
      $('x-quit').onclick = () => { this.close(); Gm.player.hp = 0; Gm.player.dead = true; Gm.onPlayerDead(); };
      this.onKey = (k) => { if (k === 'Escape' || k === 'KeyP') this.close(); };
    },

    endScreen(win, gain) {
      const Gm = G.Game, s = Gm.stats, p = Gm.player;
      const rel = p.relicList.map((id) => `<span class="glyph r${G.Relics[id].rar}" title="${G.Relics[id].name}">${G.Relics[id].glyph}</span>`).join('');
      this.open(`<div class="panel end ${win ? 'win' : ''}"><h1>${win ? '证道元婴' : '道消身陨'}</h1>
        <p class="sub">${win ? '凡人之躯，终得长生一线。' : `止步于「${G.Chapters[Gm.chapter].name}」。修仙之路，本就九死一生。`}</p>
        <div class="stats">
          <div><span>境界</span><b>${E.realmName(p)}</b></div><div><span>历时</span><b>${U.fmtTime(s.time)}</b></div>
          <div><span>斩敌</span><b>${s.kills}</b></div><div><span>首领</span><b>${s.bosses}</b></div>
          <div><span>清空房间</span><b>${s.rooms}</b></div><div><span>造成伤害</span><b>${s.dmg}</b></div>
        </div>
        <div class="relicrow">${rel}</div>
        <div class="dao">道心 <b>+${gain}</b></div>
        <div class="btns"><button class="btn" id="x-again">再入轮回</button><button class="btn ghost" id="x-menu">返回</button></div></div>`, 'dim');
      $('x-again').onclick = () => { this.close(); Gm.toMenu(); Gm.startRun(); };
      $('x-menu').onclick = () => { this.close(); Gm.toMenu(); };
    },

    /* ---------------- HUD ---------------- */
    bossBar(e) {
      this.bossRef = e;
      const el = $('boss');
      if (e) { $('boss-name').innerHTML = `<b>${e.def.name}</b><em>${e.def.title}</em>`; el.className = 'show'; }
      else el.className = '';
    },
    prompt(label) {
      if (this.cache.prompt === label) return;
      this.cache.prompt = label;
      const el = $('prompt');
      if (label) { el.innerHTML = `<kbd>F</kbd> ${esc(label)}`; el.className = 'show'; } else el.className = '';
      $('t-act').className = 'tbtn' + (label ? ' show' : '');
    },
    set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; $(id).textContent = v; } },
    width(id, v) { v = Math.round(v * 1000) / 10; if (this.cache['w' + id] !== v) { this.cache['w' + id] = v; $(id).style.width = v + '%'; } },

    updateHUD(dt) {
      const Gm = G.Game, p = Gm.player; if (!p) return;
      this.set('realm', E.realmName(p));
      this.width('hp-fill', U.clamp(p.hp / p.maxHp, 0, 1)); this.set('hp-txt', `${Math.ceil(p.hp)} / ${p.maxHp}`);
      this.width('mp-fill', U.clamp(p.mp / p.maxMp, 0, 1)); this.set('mp-txt', `${Math.floor(p.mp)} / ${p.maxMp}`);
      this.width('xp-fill', U.clamp(p.xp / p.xpNeed, 0, 1));
      this.width('sh-fill', p.shield > 0 ? U.clamp(p.shield / p.maxHp, 0, 1) : 0);
      this.set('r-stone', p.stones); this.set('r-potion', p.potions); this.set('r-drop', p.drops);
      this.set('chap', `${G.Chapters[Gm.chapter].name} · ${{ start: '入口', combat: '险地', elite: '精英', boss: '首领', treasure: '机缘', shop: '坊市', garden: '药园', event: '奇遇' }[Gm.room.type]}`);
      // 遁术
      const dk = p.dashN + '/' + p.dashMax;
      if (this.cache.dash !== dk) { this.cache.dash = dk; $('dash-pips').innerHTML = Array.from({ length: p.dashMax }, (_, i) => `<i class="${i < p.dashN ? 'on' : ''}"></i>`).join(''); }
      // 神通栏
      if (this.skillDirty) {
        this.skillDirty = false;
        document.querySelectorAll('#skills .slot[data-i]').forEach((el) => {
          const s = p.skills[+el.dataset.i];
          if (s) { const d = G.Skills[s.id]; el.className = 'slot on'; el.style.setProperty('--c', d.color); el.querySelector('.g').textContent = d.glyph; el.querySelector('.lv').textContent = PIP[s.lv]; el.title = `${d.name}（第${ROMAN[s.lv]}重）\n${d.desc(s.lv)}\n法力 ${d.mp}`; }
          else { el.className = 'slot'; el.querySelector('.g').textContent = ''; el.querySelector('.lv').textContent = ''; el.title = '空 —— 可在机缘、坊市习得神通'; }
        });
      }
      document.querySelectorAll('#skills .slot[data-i]').forEach((el) => {
        const s = p.skills[+el.dataset.i]; if (!s) return;
        const k = s.cd > 0 ? Math.round((s.cd / s.max) * 100) : 0, key = 'cd' + el.dataset.i;
        if (this.cache[key] !== k) { this.cache[key] = k; el.querySelector('.cd').style.height = k + '%'; }
        const low = p.mp < G.Skills[s.id].mp, lk = 'lo' + el.dataset.i;
        if (this.cache[lk] !== low) { this.cache[lk] = low; el.classList.toggle('nomp', low); }
      });
      // 功法与本命法宝
      const gf = (p.qy ? `青元剑诀 · 第${G.CN_NUM[p.qy]}层` : '长春功') + (p.fy ? '|青竹蜂云剑' + (p.dageng ? ' · 大庚剑阵' : '') : '');
      if (this.cache.gf !== gf) { this.cache.gf = gf; const a = gf.split('|'); $('gongfa').innerHTML = '功法 · ' + a[0] + (a[1] ? '<br><b>本命 · ' + a[1] + '</b>' : ''); }
      const ue = $('ult'), uk = p.fy ? Math.floor(p.sp) + (p.dageng ? 1000 : 0) : -1;
      if (this.cache.ult !== uk) {
        this.cache.ult = uk; ue.querySelector('.g').textContent = p.dageng ? '庚' : '蜂';
        ue.classList.toggle('locked', !p.fy); ue.classList.toggle('full', p.fy && p.sp >= 100);
        ue.querySelector('.cd').style.height = p.fy ? 100 - Math.floor(p.sp) + '%' : '0%';
        ue.querySelector('.lv').textContent = p.fy ? (p.sp >= 100 ? '剑意满' : Math.floor(p.sp)) : '结丹';
        ue.title = !p.fy ? '本命法宝 —— 结丹之后方可炼成' : p.dageng ? '本命法宝【青竹蜂云剑】· 大庚剑阵\n剑意满 100 后按 V：在目标处布下大庚剑阵，困住阵中敌人，剑丝绞杀 7 秒，收阵时降下辟邪神雷。'
          : '本命法宝【青竹蜂云剑】\n飞剑命中积攒剑意，满 100 后按 V：七十二口飞剑倾巢而出，自行追击并引动辟邪神雷。';
      }
      // 法宝栏
      if (this.relicDirty) {
        this.relicDirty = false;
        $('relics').innerHTML = p.relicList.map((id) => { const r = G.Relics[id]; return `<span class="glyph r${r.rar}" title="${r.name}：${r.desc}">${r.glyph}${p.relics[id] > 1 ? `<small>${p.relics[id]}</small>` : ''}</span>`; }).join('');
      }
      // 连击数：五连以上才显示，每次增长跳一下
      const cb = Gm.comboT > 0 && Gm.combo >= 5 ? Gm.combo : 0;
      if (this.cache.combo !== cb) {
        const el = $('combo'), grew = cb > (this.cache.combo || 0);
        this.cache.combo = cb;
        if (cb) { el.firstChild.textContent = cb; el.className = 'show' + (cb >= 100 ? ' t3' : cb >= 30 ? ' t2' : ''); if (grew && !(this.comboPop > 0)) { this.comboPop = 0.09; el.firstChild.style.animation = 'none'; void el.firstChild.offsetWidth; el.firstChild.style.animation = ''; } }
        else el.className = '';
      }
      if (this.comboPop > 0) this.comboPop -= dt;
      // 首领血条
      const b = this.bossRef;
      if (b) { this.width('boss-fill', U.clamp(b.hp / b.maxHp, 0, 1)); $('boss').classList.toggle('p2', b.phase === 2); }
      // 小地图
      this.mapT -= dt;
      if (this.mapDirty || this.mapT <= 0) { this.mapDirty = false; this.mapT = 0.5; G.Render.drawMinimap($('minimap')); }
    },
  });
})();
