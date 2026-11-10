'use strict';
/* 凡人问道 —— 渲染：2.5D 俯视投影、纵深排序、动态光照、粒子与氛围 */
(function () {
  const G = window.G, U = G.U, A = G.Art, T = G.TILE, YS = G.YS, TAU = G.TAU;
  const TH = T * YS;
  const R = (G.Render = {
    cv: null, ctx: null, scale: 1, dpr: 1, vw: 1280, vh: 640, cam: { x: 0, y: 0 }, t: 0,
    lightCv: null, lctx: null, motes: [], mists: [],
  });
  const FONT = '"STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif CJK SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif';
  R.FONT = FONT;

  /* ---------- 预渲染的光斑 ---------- */
  let lightSprite = null;
  const glowCache = {};
  function mkRadial(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  }
  function glow(rgb) {
    return glowCache[rgb] || (glowCache[rgb] = mkRadial(64, [[0, `rgba(${rgb},1)`], [0.35, `rgba(${rgb},0.45)`], [1, `rgba(${rgb},0)`]]));
  }
  let vignette = null;

  R.init = function (cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.lightCv = document.createElement('canvas'); this.lctx = this.lightCv.getContext('2d');
    lightSprite = mkRadial(128, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.75)'], [0.8, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]);
    vignette = mkRadial(256, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.62)']]);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    for (let i = 0; i < 46; i++) this.motes.push({ x: Math.random(), y: Math.random(), s: U.rand(0.6, 1.6), ph: U.rand(TAU), v: U.rand(0.5, 1.5) });
    for (let i = 0; i < 7; i++) this.mists.push({ x: Math.random(), y: Math.random(), r: U.rand(260, 520), v: U.rand(4, 14) * (i % 2 ? 1 : -1) });
  };

  R.resize = function () {
    const dpr = (this.dpr = Math.min(window.devicePixelRatio || 1, 2));
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    let s = this.cv.height / G.VIEW_H;
    if (this.cv.width / s < 820) s = this.cv.width / 820;
    this.scale = s; this.vw = this.cv.width / s; this.vh = this.cv.height / s;
    this.lightCv.width = Math.ceil(this.vw / 2); this.lightCv.height = Math.ceil(this.vh / 2);
  };

  R.toWorld = function (cx, cy) {
    const lx = (cx * this.dpr) / this.scale, ly = (cy * this.dpr) / this.scale;
    return { x: lx + this.cam.x, y: (ly + this.cam.y) / YS };
  };

  R.updateCam = function (dt, snap) {
    const Gm = G.Game, room = Gm.room, p = Gm.player, I = G.Input;
    const rw = room.w * T, rh = room.h * TH, vw = this.vw, vh = this.vh;
    let tx = p.x - vw / 2, ty = p.y * YS - vh / 2 - 24;
    if (!I.touchMode) {
      tx += ((I.mouse.x * this.dpr) / this.scale - vw / 2) * 0.1;
      ty += ((I.mouse.y * this.dpr) / this.scale - vh / 2) * 0.1;
    }
    const mx = 80, mt = 120, mb = 110;
    tx = rw + mx * 2 <= vw ? (rw - vw) / 2 : U.clamp(tx, -mx, rw - vw + mx);
    ty = rh + mt + mb <= vh ? (rh - vh) / 2 - 10 : U.clamp(ty, -mt, rh - vh + mb);
    if (snap) { this.cam.x = tx; this.cam.y = ty; }
    else { const k = 1 - Math.exp(-7 * dt); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; }
  };

  /* ============================ 主绘制 ============================ */
  const list = [];
  const lights = [], glows = [];
  const HGT = { human: 50, brute: 56, wolf: 32, bat: 22, toad: 30, centipede: 22, flower: 48, ghost: 50, skull: 22, crystal: 48, flame: 42, puppet: 50, jiao: 60 };

  function ellipse(ctx, x, y, r) { ctx.beginPath(); ctx.ellipse(x, y * YS, r, r * YS, 0, 0, TAU); }

  R.drawWorld = function (dt) {
    const Gm = G.Game, room = Gm.room, p = Gm.player, ctx = this.ctx, th = G.Themes[room.theme];
    const vw = this.vw, vh = this.vh, t = (this.t += dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = th.void; ctx.fillRect(0, 0, vw, vh);
    // 虚空云雾
    const mg = glow(th.mist);
    for (const m of this.mists) {
      m.x += (m.v * dt) / vw; if (m.x > 1.4) m.x = -0.4; if (m.x < -0.4) m.x = 1.4;
      ctx.globalAlpha = 0.13; ctx.drawImage(mg, m.x * vw - m.r, m.y * vh - m.r * 0.5, m.r * 2, m.r);
    }
    ctx.globalAlpha = 1;

    const sh = Gm.shakeAmt > 0.2 ? Gm.shakeAmt : 0;
    const cx = Math.round(this.cam.x + U.rand(-sh, sh)), cy = Math.round(this.cam.y + U.rand(-sh, sh));
    ctx.save(); ctx.translate(-cx, -cy);
    lights.length = 0; glows.length = 0;

    ctx.drawImage(room.cliffCv, 0, room.h * TH);
    ctx.drawImage(room.floorCv, 0, 0);
    drawWater(ctx, room, th, t);

    /* ---- 地面层：水洼、预警、阴影 ---- */
    for (const h of Gm.haz) drawHazGround(ctx, h, t);
    // 敌人出生法阵 / 精英光环 / 状态
    for (const e of room.enemies) {
      if (e.st === 'spawn') {
        const k = 1 - Math.min(1, e.stT / 0.8);
        ctx.strokeStyle = `rgba(255,90,90,${0.4 + k * 0.5})`; ctx.lineWidth = 2;
        ellipse(ctx, e.x, e.y, 10 + e.r * 1.4 * (1 - k * 0.3)); ctx.stroke();
        ctx.fillStyle = `rgba(255,60,60,${0.12 + k * 0.2})`; ellipse(ctx, e.x, e.y, e.r * 1.6 * k); ctx.fill();
        for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; ctx.fillStyle = 'rgba(255,150,150,0.8)'; ctx.fillRect(e.x + Math.cos(a) * e.r * 1.4 - 1.5, (e.y + Math.sin(a) * e.r * 1.4) * YS - 1.5, 3, 3); }
        continue;
      }
      if (e.elite) { ctx.strokeStyle = `rgba(255,200,80,${0.55 + Math.sin(t * 5) * 0.2})`; ctx.lineWidth = 2.5; ellipse(ctx, e.x, e.y, e.r * 1.5); ctx.stroke(); ctx.fillStyle = 'rgba(255,200,80,0.12)'; ctx.fill(); }
      if (e.slowT > 0) { ctx.strokeStyle = 'rgba(140,220,255,0.7)'; ctx.lineWidth = 2; ellipse(ctx, e.x, e.y, e.r * 1.2); ctx.stroke(); }
      // 影子
      if (e.segs) { for (let i = e.segs.length - 1; i >= 0; i--) { const s = e.segs[i]; ctx.fillStyle = `rgba(0,0,0,${0.3 * e.alpha})`; ctx.beginPath(); ctx.ellipse(s.x, s.y * YS, s.r * 0.95, s.r * 0.5, 0, 0, TAU); ctx.fill(); } }
      else { const k = 1 - Math.min(0.6, e.z / 70); ctx.fillStyle = `rgba(0,0,0,${0.34 * k * (e.alpha === undefined ? 1 : Math.max(0.3, e.alpha))})`; ctx.beginPath(); ctx.ellipse(e.x, e.y * YS, e.r * 0.95 * k * e.scale, e.r * 0.48 * k * e.scale, 0, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.ellipse(p.x, p.y * YS, 12, 6, 0, 0, TAU); ctx.fill();
    for (const a of Gm.allies) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(a.x, a.y * YS, 11, 5.5, 0, 0, TAU); ctx.fill(); }
    for (const k of room.pickups) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(k.x, k.y * YS, 5, 2.5, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const pr of Gm.projs) { ctx.beginPath(); ctx.ellipse(pr.x, pr.y * YS, pr.r * 0.8, pr.r * 0.4, 0, 0, TAU); ctx.fill(); }
    for (const it of room.interact) {
      if (it.kind === 'portal') { A.portal(ctx, it.x, it.y * YS, t, th.lamp); lights.push([it.x, it.y * YS - 20, 190, 1]); glows.push([it.x, it.y * YS - 20, 120, th.lamp, 0.35]); }
      else if (!it.used) { ctx.strokeStyle = `rgba(255,230,160,${0.25 + Math.sin(t * 3) * 0.12})`; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]); ellipse(ctx, it.x, it.y, it.r * 0.8); ctx.stroke(); ctx.setLineDash([]); }
    }

    /* ---- 纵深排序层 ---- */
    list.length = 0;
    for (const row of room.wallRows) list.push({ y: row.sortY, k: 0, o: row });
    for (const pp of room.props) list.push({ y: (pp.ty + 0.5) * T + 8, k: 1, o: pp });
    for (const d in room.doors) list.push({ y: doorSortY(room, d), k: 2, o: d });
    for (const e of room.enemies) if (e.st !== 'spawn' || e.stT < 0.25) list.push({ y: e.y, k: 3, o: e });
    list.push({ y: p.y, k: 4, o: p });
    for (const a of Gm.allies) list.push({ y: a.y, k: 5, o: a });
    for (const it of room.interact) if (it.kind !== 'portal') list.push({ y: it.y, k: 6, o: it });
    for (const k of room.pickups) list.push({ y: k.y, k: 7, o: k });
    for (const pr of Gm.projs) list.push({ y: pr.y, k: 8, o: pr });
    for (const h of Gm.haz) if (h.type === 'lob' || h.kind === 'giant') list.push({ y: h.y, k: 9, o: h });
    if (p.formT > 0) for (let i = 0; i < p.formN; i++) { const a = t * 4.5 + (i / p.formN) * TAU; list.push({ y: p.y + Math.sin(a) * 66, k: 10, o: a }); }
    for (const g of Gm.ghosts) list.push({ y: g.y - 0.1, k: 11, o: g });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      switch (it.k) {
        case 0: ctx.drawImage(it.o.cv, 0, it.o.oy); break;
        case 1: { const s = A.prop(it.o.kind, it.o.v); ctx.drawImage(s.cv, (it.o.tx + 0.5) * T - s.ax, (it.o.ty + 0.5) * TH - s.ay + 4); drawPropFx(ctx, it.o, t); break; }
        case 2: drawDoor(ctx, room, it.o, th, t); break;
        case 3: drawEnemy(ctx, it.o, t); break;
        case 4: drawPlayer(ctx, p, t); break;
        case 5: A.puppet(ctx, { x: it.o.x, y: it.o.y * YS, face: it.o.face, t: it.o.t, moving: false, atk: Math.max(0, it.o.atk || 0), look: { body: '#d9b06a', dark: '#7a5a2a', eye: '#7dffea' }, flash: 0, scale: 0.92 }); break;
        case 6: drawInteract(ctx, it.o, room, t); break;
        case 7: drawPickup(ctx, it.o, t); break;
        case 8: drawProj(ctx, it.o, t); break;
        case 9: drawHazUpright(ctx, it.o, t); break;
        case 10: { const a = it.o, x = p.x + Math.cos(a) * 66, y = (p.y + Math.sin(a) * 66) * YS - 22; drawSword(ctx, x, y, Math.atan2(Math.cos(a) * YS, -Math.sin(a)), 22, '110,255,200'); glows.push([x, y, 26, '110,255,200', 0.5]); break; }
        case 11: { const g = it.o; ctx.globalAlpha = (g.life / 0.22) * 0.32; A.human(ctx, { x: g.x, y: g.y * YS, face: g.face, t: g.t, moving: true, look: p.look, flash: 0 }); ctx.globalAlpha = 1; break; }
      }
    }

    /* ---- 顶层：光束、粒子、血条、飘字 ---- */
    for (const h of Gm.haz) if (h.type === 'beam') drawBeam(ctx, h, t);
    drawParticles(ctx, false);
    drawBars(ctx, room, t);
    ctx.restore();

    /* ---- 光照 ---- */
    lights.push([p.x, p.y * YS - 24, 230, 1]);
    for (const L of room.lights) lights.push([L.x, L.y * YS - L.z, L.r * (1 + Math.sin(t * 9 + L.x) * 0.04), 0.95]);
    let n = 0;
    for (const pr of Gm.projs) { if (n++ > 70) break; lights.push([pr.x, pr.y * YS - pr.z, pr.from === 0 ? 80 : 54, 0.7]); }
    const lc = this.lctx, lw = this.lightCv.width, lh = this.lightCv.height, am = th.ambient;
    lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = `rgba(${am[0]},${am[1]},${am[2]},${am[3]})`; lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = 'destination-out';
    for (const L of lights) {
      const r = L[2]; lc.globalAlpha = L[3];
      lc.drawImage(lightSprite, (L[0] - cx - r) / 2, (L[1] - cy - r * 0.8) / 2, r, r * 0.8);
    }
    ctx.drawImage(this.lightCv, 0, 0, vw, vh);

    /* ---- 叠加辉光 ---- */
    ctx.save(); ctx.translate(-cx, -cy);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of room.lights) { ctx.globalAlpha = 0.2 + Math.sin(t * 9 + L.x) * 0.03; const r = L.r * 0.7; ctx.drawImage(glow(L.c), L.x - r, L.y * YS - L.z - r * 0.7, r * 2, r * 1.4); }
    n = 0;
    for (const pr of Gm.projs) { if (n++ > 120) break; const r = pr.r * (pr.from === 0 ? 3.4 : 2.8); ctx.globalAlpha = 0.55; ctx.drawImage(glow(pr.c || '255,255,255'), pr.x - r, pr.y * YS - pr.z - r, r * 2, r * 2); }
    for (const g of glows) { ctx.globalAlpha = g[4]; ctx.drawImage(glow(g[3]), g[0] - g[2], g[1] - g[2], g[2] * 2, g[2] * 2); }
    ctx.globalAlpha = 1;
    drawParticles(ctx, true);
    ctx.globalCompositeOperation = 'source-over';
    drawTexts(ctx, Gm, t);
    ctx.restore();

    drawMotes(ctx, th, t, dt, vw, vh);
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0, vw, vh);
    const low = p.hp < p.maxHp * 0.3 && !p.dead ? 0.18 + Math.sin(t * 5) * 0.08 : 0;
    const hf = Math.max(Gm.hurtFlash || 0, low);
    if (hf > 0) {
      const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.85);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,20,20,${Math.min(0.6, hf * 1.3)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (Gm.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, Gm.flash * 2)})`; ctx.fillRect(0, 0, vw, vh); }
    if (Gm.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, Gm.fade)})`; ctx.fillRect(0, 0, vw, vh); }
    drawStick(ctx);
  };

  function drawStick(ctx) {
    const I = G.Input, R2 = R;
    if (!I.stick.active) return;
    const s = R2.dpr / R2.scale, ox = I.stick.ox * s, oy = I.stick.oy * s, r = 56 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(200,255,235,0.45)';
    ctx.beginPath(); ctx.arc(ox + I.stick.dx * r, oy + I.stick.dy * r, r * 0.42, 0, TAU); ctx.fill();
  }

  /* ---------- 水面波光 ---------- */
  function drawWater(ctx, room, th, t) {
    const { w, h, tiles } = room;
    const lava = room.theme === 3;
    ctx.lineCap = 'round';
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== 3) continue;
      const px = x * T, py = y * TH, hh = U.hash(x, y, 9);
      const k = Math.sin(t * 1.6 + hh * 20);
      ctx.strokeStyle = th.waterHi; ctx.globalAlpha = 0.22 + k * 0.14; ctx.lineWidth = lava ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(px + 6 + hh * 14 + k * 3, py + 10 + hh * 14); ctx.lineTo(px + 22 + hh * 16 + k * 3, py + 10 + hh * 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 20 - hh * 10 - k * 2, py + 24 + hh * 6); ctx.lineTo(px + 34 - hh * 6 - k * 2, py + 24 + hh * 6); ctx.stroke();
      if (lava && hh < 0.35) { lights.push([px + 24, py + 18, 120, 0.5]); glows.push([px + 24, py + 18, 50, '255,120,40', 0.16]); }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 门 ---------- */
  function doorSortY(room, d) {
    if (d === 'n') return T - 0.3;
    if (d === 's') return room.h * T;
    return ((room.h >> 1) + 2) * T - 1;
  }
  function drawDoor(ctx, room, d, th, t) {
    const cells = room.doors[d].cells, locked = room.locked;
    const x0 = cells[0][0] * T, y0 = cells[0][1] * TH;
    if (d === 'n') A.gate(ctx, x0, TH, 3 * T, room.theme);
    if (!locked) {
      // 通路指示
      const k = 0.35 + Math.sin(t * 3) * 0.15, c = th.lamp;
      ctx.fillStyle = `rgba(${c},${k * 0.5})`;
      if (d === 'n' || d === 's') ctx.fillRect(x0 + 6, y0 + 8, 3 * T - 12, TH - 16);
      else ctx.fillRect(x0 + 8, y0 + 6, T - 16, 3 * TH - 12);
      glows.push([x0 + (d === 'n' || d === 's' ? 1.5 * T : T / 2), y0 + (d === 'n' || d === 's' ? TH / 2 : 1.5 * TH), 70, c, 0.16]);
      return;
    }
    const col = '255,80,80', a = 0.3 + Math.sin(t * 6) * 0.08, H = 46;
    ctx.fillStyle = `rgba(${col},${a})`; ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2;
    if (d === 'n' || d === 's') {
      const by = d === 'n' ? TH : y0 + TH * 0.6;
      ctx.fillRect(x0, by - H, 3 * T, H); ctx.strokeRect(x0, by - H, 3 * T, H);
      ctx.fillStyle = `rgba(255,200,200,${a + 0.3})`; ctx.font = `bold 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('禁', x0 + 1.5 * T, by - H / 2);
      glows.push([x0 + 1.5 * T, by - H / 2, 80, col, 0.3]);
    } else {
      const bx = x0 + T / 2, hh = 26;
      ctx.fillRect(x0 + 8, y0 - hh, T - 16, 3 * TH + hh); ctx.strokeRect(x0 + 8, y0 - hh, T - 16, 3 * TH + hh);
      ctx.fillStyle = `rgba(255,200,200,${a + 0.3})`; ctx.font = `bold 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('禁', bx, y0 + 1.5 * TH - hh / 2);
      glows.push([bx, y0 + 1.5 * TH - hh / 2, 80, col, 0.3]);
    }
  }

  /* ---------- 场景物件的动态部分（火焰） ---------- */
  function drawPropFx(ctx, pp, t) {
    if (pp.kind !== 'brazier' && pp.kind !== 'brazier2') return;
    const x = (pp.tx + 0.5) * T, y = (pp.ty + 0.5) * TH + 4 - 36;
    const c1 = pp.kind === 'brazier' ? '#6affa0' : '#7ad0ff', c2 = pp.kind === 'brazier' ? '#d8ffe0' : '#e0f6ff';
    for (let i = 0; i < 2; i++) {
      const w = 9 - i * 4, hh = 22 - i * 8 + Math.sin(t * 11 + pp.tx + i) * 3;
      ctx.fillStyle = i ? c2 : c1;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - hh * 0.6, x + Math.sin(t * 7 + pp.ty) * 3, y - hh);
      ctx.quadraticCurveTo(x + w, y - hh * 0.5, x + w, y); ctx.closePath(); ctx.fill();
    }
  }

  /* ---------- 玩家 ---------- */
  function drawPlayer(ctx, p, t) {
    if (p.dead) return;
    const blink = p.inv > 0 && p.dashing <= 0 && Math.floor(t * 20) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    A.human(ctx, { x: p.x, y: p.y * YS, face: p.face, t: p.t, moving: p.moving, look: p.look, flash: p.flash, atk: p.atkAnim });
    ctx.globalAlpha = 1;
    if (p.shield > 0) {
      const k = 0.5 + (p.shield / p.shieldMax) * 0.4;
      ctx.strokeStyle = `rgba(200,225,255,${k})`; ctx.lineWidth = 2.5; ctx.fillStyle = 'rgba(180,210,255,0.14)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y * YS - 22, 26, 32, 0, 0, TAU); ctx.fill(); ctx.stroke();
      glows.push([p.x, p.y * YS - 22, 44, '180,210,255', 0.25]);
    }
    if (p.flags.autoShield && p.autoShieldT <= 0) {
      const a = t * 2.4, x = p.x + Math.cos(a) * 24, y = p.y * YS - 26 + Math.sin(a) * 8;
      ctx.fillStyle = '#c9d4e8'; ctx.strokeStyle = '#3a4458'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 6); ctx.lineTo(x + 5, y - 6); ctx.lineTo(x + 5, y + 1); ctx.lineTo(x, y + 7); ctx.lineTo(x - 5, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  /* ---------- 敌人 ---------- */
  function drawEnemy(ctx, e, t) {
    const d = e.def;
    let alpha = e.st === 'spawn' ? 1 - e.stT / 0.25 : e.alpha === undefined ? 1 : e.alpha;
    if (alpha <= 0.02) return;
    if (d.draw === 'jiao') {
      ctx.globalAlpha = alpha;
      const segs = e.segs.map((s) => ({ x: s.x, y: s.y * YS, r: s.r, z: s.z }));
      A.jiao(ctx, segs, d.look, e.t, e.flash, e.face, e.mouth || 0);
      ctx.globalAlpha = 1; return;
    }
    const o = { x: e.x, y: e.y * YS - e.z, face: e.face, t: e.t, moving: e.moving, look: d.look, flash: e.flash, scale: e.scale, wind: e.wind, atk: e.atk, charge: e.charge, alpha };
    if (d.draw !== 'ghost') ctx.globalAlpha = alpha;
    if (e.invT > 0) ctx.globalAlpha = 0.6 + Math.sin(t * 30) * 0.3;
    A.drawEnemy(ctx, d.draw, o);
    ctx.globalAlpha = 1;
    if (e.boss) glows.push([e.x, e.y * YS - 30, 70, d.look.trim ? E().hexRgb(d.look.trim) : '255,120,120', 0.22]);
    if (d.draw === 'flame') { lights.push([e.x, e.y * YS - 20, 130, 0.8]); glows.push([e.x, e.y * YS - 20, 44, '255,140,50', 0.4]); }
    if (d.draw === 'ghost' || d.draw === 'skull') glows.push([e.x, e.y * YS - 24 - e.z, 34, E().hexRgb(d.look.body), 0.25 * alpha]);
  }
  const E = () => G.Ent;

  function drawBars(ctx, room, t) {
    for (const e of room.enemies) {
      if (e.st === 'spawn' || e.untarget) continue;
      const hgt = (HGT[e.def.draw] || 44) * e.scale + e.z;
      const x = e.x, y = e.y * YS - hgt - 8;
      if (!e.boss && (e.hp < e.maxHp || e.elite)) {
        const w = e.elite ? 40 : 28;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
        ctx.fillStyle = e.elite ? '#ffc850' : '#e0484a'; ctx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 3);
      }
      if (!e.boss && e.wind > 0.05 && e.st !== 'idle') {
        ctx.fillStyle = `rgba(255,70,70,${0.6 + Math.sin(t * 24) * 0.4})`; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('!', x, y - 4);
      }
      if (e.stunT > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; ctx.fillStyle = '#ffe36a'; ctx.fillRect(x + Math.cos(a) * 9 - 1.5, y - 4 + Math.sin(a) * 3, 3, 3); }
      if (e.affix && e.elite) { ctx.fillStyle = '#ffd98a'; ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText({ swift: '迅捷', burst: '爆裂', horde: '呼群' }[e.affix], x, y - 6); }
    }
  }

  /* ---------- 交互物 ---------- */
  function drawInteract(ctx, it, room, t) {
    const x = it.x, y = it.y * YS;
    if (it.kind === 'chest') { A.chest(ctx, x, y, t, it.used); if (!it.used) { lights.push([x, y - 10, 150, 0.9]); glows.push([x, y - 12, 50, '255,220,130', 0.3 + Math.sin(t * 3) * 0.1]); } }
    else if (it.kind === 'garden') { A.herbField(ctx, x, y, t, it.used); lights.push([x, y - 10, 170, 0.9]); if (!it.used) glows.push([x, y - 10, 60, '140,255,170', 0.22]); }
    else if (it.kind === 'event') { A.shrine(ctx, x, y, t, it.used); lights.push([x, y - 20, 150, 0.9]); if (!it.used) glows.push([x, y - 24, 50, '255,230,150', 0.25]); }
    else if (it.kind === 'shop') {
      // 摊位 + 掌柜
      A.human(ctx, { x, y: y - 8, face: Math.PI / 2, t, moving: false, look: { robe: '#8a6a3a', trim: '#f0d890', skin: '#f0d0b0', hat: 'bamboo', weapon: 'none' }, flash: 0 });
      ctx.fillStyle = '#5a3d2c'; ctx.strokeStyle = '#17131b'; ctx.lineWidth = 1.4;
      ctx.fillRect(x - 44, y - 2, 88, 16); ctx.strokeRect(x - 44, y - 2, 88, 16);
      ctx.fillStyle = '#7a1f2c'; ctx.fillRect(x - 46, y - 6, 92, 6); ctx.strokeRect(x - 46, y - 6, 92, 6);
      const cols = ['#7dffb0', '#ffd45e', '#7ad0ff', '#ff8a6a', '#d0a0ff'];
      for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(x - 32 + i * 16, y - 10 + Math.sin(t * 2 + i) * 1.2, 3.6, 0, TAU); ctx.fill(); }
      lights.push([x, y - 20, 200, 1]); glows.push([x, y - 12, 70, '255,220,150', 0.2]);
    }
  }

  function drawPickup(ctx, k, t) {
    const x = k.x, y = k.y * YS - k.z - 5 - Math.sin(t * 5 + k.x) * 1.5;
    if (k.kind === 'stone') {
      ctx.fillStyle = '#8affd8'; ctx.strokeStyle = '#1a5a4a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8fff8'; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 2, y - 0.5); ctx.lineTo(x - 2, y - 0.5); ctx.fill();
      glows.push([x, y, 14, '110,255,210', 0.4]);
    } else {
      ctx.fillStyle = '#e0484a'; ctx.strokeStyle = '#3a0f14'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 8, 3.4, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d9b45a'; ctx.fillRect(x - 2, y - 13, 4, 3);
      glows.push([x, y, 22, '255,110,110', 0.4]);
    }
  }

  /* ---------- 飞行道具 ---------- */
  function drawSword(ctx, x, y, a, L, c, mini) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = `rgba(${c},0.32)`;
    ctx.beginPath(); ctx.moveTo(-L * 2.3, 0); ctx.lineTo(-L * 0.3, -3); ctx.lineTo(-L * 0.3, 3); ctx.fill();
    ctx.fillStyle = '#effffa'; ctx.strokeStyle = `rgb(${c})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L * 0.55, 0); ctx.lineTo(-L * 0.15, -3.3); ctx.lineTo(-L * 0.45, 0); ctx.lineTo(-L * 0.15, 3.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!mini) { ctx.fillStyle = '#d9b45a'; ctx.fillRect(-L * 0.45 - 5, -1.4, 6, 2.8); ctx.fillRect(-L * 0.45 - 1, -4, 2, 8); }
    ctx.restore();
  }

  function drawProj(ctx, pr, t) {
    const x = pr.x, y = pr.y * YS - pr.z, a = Math.atan2(pr.vy * YS, pr.vx), c = pr.c || '255,255,255', r = pr.r;
    switch (pr.kind) {
      case 'sword': drawSword(ctx, x, y, a, pr.mini ? 14 : 24, c, pr.mini); break;
      case 'fire': case 'ghostfire': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = `rgba(${c},0.55)`; ctx.beginPath(); ctx.moveTo(-r * 2.8, 0); ctx.quadraticCurveTo(-r, -r * 1.1, r * 0.4, -r * 0.9); ctx.lineTo(r * 0.4, r * 0.9); ctx.quadraticCurveTo(-r, r * 1.1, -r * 2.8, 0); ctx.fill();
        ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.5, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      case 'ice': case 'blade': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = `rgba(${c},0.35)`; ctx.beginPath(); ctx.moveTo(-r * 2.6, 0); ctx.lineTo(-r * 0.4, -r * 0.5); ctx.lineTo(-r * 0.4, r * 0.5); ctx.fill();
        ctx.fillStyle = pr.kind === 'ice' ? '#e8f8ff' : '#ffd0d8'; ctx.strokeStyle = `rgb(${c})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(0, -r * 0.62); ctx.lineTo(-r * 1.1, 0); ctx.lineTo(0, r * 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore(); break;
      }
      case 'needle': case 'bolt': case 'arrow': {
        const L = pr.kind === 'arrow' ? 20 : 15;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${c},0.45)`; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L * 0.4, 0); ctx.stroke();
        ctx.strokeStyle = pr.kind === 'arrow' ? '#8a6238' : '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L * 0.5, 0); ctx.stroke();
        if (pr.kind === 'arrow') { ctx.fillStyle = '#e8e8f0'; ctx.beginPath(); ctx.moveTo(L * 0.5 + 6, 0); ctx.lineTo(L * 0.5 - 1, -3); ctx.lineTo(L * 0.5 - 1, 3); ctx.fill(); }
        ctx.restore(); break;
      }
      case 'ink': {
        ctx.fillStyle = `rgba(${c},0.4)`; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#12141f'; ctx.strokeStyle = `rgb(${c})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); ctx.fill();
        break;
      }
      case 'skullp': A.skull(ctx, { x, y: y + 6, face: Math.atan2(pr.vy, pr.vx), t: pr.t, look: { body: '#b8ffd8', dark: '#3c7a60', eye: '#ff4d6a' }, flash: 0, scale: 1 }); break;
      case 'beetle': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; const f = Math.sin(t * 60 + pr.t * 40) * 3;
        ctx.beginPath(); ctx.ellipse(-1, -3 - f * 0.3, 4, 2, 0.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-1, 3 + f * 0.3, 4, 2, -0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#5a4210'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(3.6, 0, 1.8, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      default: { // orb / blood
        ctx.fillStyle = `rgba(${c},0.38)`; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = pr.kind === 'blood' ? '#3a0510' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, TAU); ctx.fill();
      }
    }
  }

  /* ---------- 地面招式 ---------- */
  function band(ctx, x1, y1, x2, y2, w) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w * 0.5, ny = (dx / l) * w * 0.5;
    ctx.beginPath();
    ctx.moveTo(x1 + nx, (y1 + ny) * YS); ctx.lineTo(x2 + nx, (y2 + ny) * YS);
    ctx.lineTo(x2 - nx, (y2 - ny) * YS); ctx.lineTo(x1 - nx, (y1 - ny) * YS); ctx.closePath();
  }

  function drawHazGround(ctx, h, t) {
    const c = h.c;
    if (h.type === 'circle' || h.type === 'lob') {
      const k = Math.min(1, h.t / (h.type === 'lob' ? h.dur : h.delay));
      ctx.fillStyle = `rgba(${c},${0.1 + k * 0.12})`; ellipse(ctx, h.x, h.y, h.r); ctx.fill();
      ctx.strokeStyle = `rgba(${c},${0.6 + Math.sin(t * 20) * 0.25})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = `rgba(${c},0.3)`; ellipse(ctx, h.x, h.y, h.r * k); ctx.fill();
    } else if (h.type === 'line') {
      const k = Math.min(1, h.t / h.delay);
      if (h.visual) {
        ctx.fillStyle = `rgba(${c},${0.1 + k * 0.2})`; band(ctx, h.x1, h.y1, h.x2, h.y2, h.w); ctx.fill();
        ctx.strokeStyle = `rgba(${c},0.6)`; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (h.t < h.delay) {
        ctx.fillStyle = `rgba(${c},${0.08 + k * 0.1})`; band(ctx, h.x1, h.y1, h.x2, h.y2, h.w); ctx.fill();
        ctx.strokeStyle = `rgba(${c},0.55)`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = `rgba(${c},0.26)`; band(ctx, h.x1, h.y1, h.x2, h.y2, h.w * k); ctx.fill();
      } else {
        const f = 1 - (h.t - h.delay) / h.stay;
        ctx.fillStyle = `rgba(${c},${0.5 + f * 0.3})`; band(ctx, h.x1, h.y1, h.x2, h.y2, h.w); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.5 * f + 0.2})`; band(ctx, h.x1, h.y1, h.x2, h.y2, h.w * 0.4); ctx.fill();
        glows.push([(h.x1 + h.x2) / 2, ((h.y1 + h.y2) / 2) * YS, 200, c, 0.2]);
        lights.push([(h.x1 + h.x2) / 2, ((h.y1 + h.y2) / 2) * YS, 400, 0.6]);
      }
    } else if (h.type === 'puddle') {
      const f = Math.min(1, h.life / 0.5) * Math.min(1, h.t / 0.25);
      if (h.kind === 'web') {
        ctx.strokeStyle = `rgba(235,235,245,${0.5 * f})`; ctx.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.moveTo(h.x, h.y * YS); ctx.lineTo(h.x + Math.cos(a) * h.r, (h.y + Math.sin(a) * h.r) * YS); ctx.stroke(); }
        for (let k = 1; k <= 3; k++) { ellipse(ctx, h.x, h.y, (h.r * k) / 3); ctx.stroke(); }
      } else {
        ctx.fillStyle = `rgba(${c},${0.28 * f})`; ellipse(ctx, h.x, h.y, h.r); ctx.fill();
        ctx.strokeStyle = `rgba(${c},${0.6 * f})`; ctx.lineWidth = 1.5; ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + h.x, rr = h.r * (0.3 + 0.5 * U.hash(i, h.x | 0, 3)), b = (t * 1.5 + i * 0.37) % 1;
          ctx.fillStyle = `rgba(${c},${(1 - b) * 0.6 * f})`; ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * rr, (h.y + Math.sin(a) * rr) * YS - b * 10, 2 + b * 3, 0, TAU); ctx.fill();
        }
        glows.push([h.x, h.y * YS, h.r, c, 0.12 * f]);
      }
    } else if (h.type === 'beam' && h.t < h.delay && h.owner) {
      const o = h.owner, x2 = o.x + Math.cos(h.ang) * h.len, y2 = o.y + Math.sin(h.ang) * h.len, k = h.t / h.delay;
      ctx.fillStyle = `rgba(${c},${0.06 + k * 0.14})`; band(ctx, o.x, o.y, x2, y2, h.w); ctx.fill();
      ctx.strokeStyle = `rgba(${c},${0.4 + k * 0.4})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o.x, o.y * YS); ctx.lineTo(x2, y2 * YS); ctx.stroke();
    }
  }

  function drawBeam(ctx, h, t) {
    if (h.t < h.delay || !h.owner) return;
    const o = h.owner, x2 = o.x + Math.cos(h.ang) * h.len, y2 = o.y + Math.sin(h.ang) * h.len;
    const f = Math.min(1, (h.delay + h.life - h.t) / 0.3), z = 14;
    ctx.save(); ctx.translate(0, -z);
    ctx.fillStyle = `rgba(${h.c},${0.75 * f})`; band(ctx, o.x, o.y, x2, y2, h.w * (0.9 + Math.sin(t * 40) * 0.1)); ctx.fill();
    ctx.fillStyle = `rgba(255,235,235,${0.9 * f})`; band(ctx, o.x, o.y, x2, y2, h.w * 0.35); ctx.fill();
    ctx.restore();
    for (let i = 1; i <= 5; i++) { const k = i / 6; glows.push([U.lerp(o.x, x2, k * 0.5), U.lerp(o.y, y2, k * 0.5) * YS - z, 60, h.c, 0.25 * f]); lights.push([U.lerp(o.x, x2, k * 0.5), U.lerp(o.y, y2, k * 0.5) * YS - z, 150, 0.6]); }
  }

  function drawHazUpright(ctx, h, t) {
    if (h.type === 'lob') {
      const k = Math.min(1, h.t / h.dur), x = U.lerp(h.sx, h.x, k), y = U.lerp(h.sy, h.y, k) * YS - Math.sin(k * Math.PI) * 130 - 10;
      ctx.fillStyle = `rgba(${h.c},0.4)`; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgb(${h.c})`; ctx.strokeStyle = '#1c2a10'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x - 2.5, y - 2.5, 2.4, 0, TAU); ctx.fill();
      glows.push([x, y, 26, h.c, 0.35]);
    } else { // 巨剑术
      const k = Math.min(1, h.t / h.delay), z = 460 * (1 - k * k), x = h.x, y = h.y * YS - z;
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.4 + k * 0.6;
      ctx.fillStyle = '#eaf8ff'; ctx.strokeStyle = '#5ab0e0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-13, -26); ctx.lineTo(-13, -120); ctx.lineTo(13, -120); ctx.lineTo(13, -26); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b8e4ff'; ctx.fillRect(-2, -118, 4, 98);
      ctx.fillStyle = '#d9b45a'; ctx.fillRect(-26, -128, 52, 9); ctx.fillRect(-5, -156, 10, 30);
      ctx.restore(); ctx.globalAlpha = 1;
      glows.push([x, y - 60, 90, '170,225,255', 0.35]); lights.push([x, y - 40, 220, 0.9]);
    }
  }

  /* ---------- 粒子 / 飘字 ---------- */
  function drawParticles(ctx, add) {
    const P = G.FX.parts;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!!p.add !== add) continue;
      const k = p.life / p.max;
      if (p.kind === 'dot') {
        const s = p.size * (0.4 + k * 0.6);
        ctx.fillStyle = `rgba(${p.c},${Math.min(1, k * 1.6)})`;
        ctx.fillRect(p.x - s / 2, p.y * YS - p.z - s / 2, s, s);
      } else if (p.kind === 'ring') {
        const r = U.lerp(p.r1, p.r0, k);
        ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = p.w * k + 0.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y * YS, Math.max(1, r), Math.max(1, r * YS), 0, 0, TAU); ctx.stroke();
      } else if (p.kind === 'bolt') {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let j = 0; j < p.pts.length; j++) { const q = p.pts[j]; if (j) ctx.lineTo(q[0], q[1] * YS - q[2]); else ctx.moveTo(q[0], q[1] * YS - q[2]); }
        ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = p.w * 2.2; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = p.w * 0.7; ctx.stroke();
      } else if (p.kind === 'slash') {
        ctx.save(); ctx.translate(p.x, p.y * YS - p.z); ctx.scale(1, YS);
        ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = 7 * k + 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, p.r * (1.05 - k * 0.25), p.ang - p.arc / 2, p.ang + p.arc / 2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawTexts(ctx, Gm, t) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    for (const x of G.FX.texts) {
      const k = x.life / x.max;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `bold ${x.size}px "Trebuchet MS","Segoe UI",sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const sx = x.x, sy = x.y * YS - x.z;
      ctx.strokeText(x.str, sx, sy); ctx.fillStyle = x.c; ctx.fillText(x.str, sx, sy);
    }
    for (const b of Gm.barks) {
      const e = b.e, k = Math.min(1, b.life * 2);
      ctx.globalAlpha = k; ctx.font = `bold 22px ${FONT}`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      const sx = e.x, sy = e.y * YS - 82 * (e.scale || 1) - (1 - k) * 10;
      ctx.strokeText(b.text, sx, sy); ctx.fillStyle = '#ffd8c0'; ctx.fillText(b.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 氛围微粒 ---------- */
  function drawMotes(ctx, th, t, dt, vw, vh) {
    const kind = th.mote;
    ctx.globalCompositeOperation = kind === 'ash' ? 'source-over' : 'lighter';
    for (const m of R.motes) {
      if (kind === 'firefly') {
        m.x += Math.sin(t * 0.5 * m.v + m.ph) * 0.0006; m.y += Math.cos(t * 0.4 * m.v + m.ph * 2) * 0.0006;
        const a = 0.35 + Math.sin(t * 2 * m.v + m.ph) * 0.35; if (a <= 0) continue;
        ctx.fillStyle = `rgba(200,255,140,${a})`; ctx.fillRect(m.x * vw, m.y * vh, 2.4 * m.s, 2.4 * m.s);
      } else if (kind === 'spore') {
        m.y -= dt * 0.02 * m.v; m.x += Math.sin(t + m.ph) * 0.0004; if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        ctx.fillStyle = `rgba(255,90,100,${0.3 + Math.sin(t * 1.5 + m.ph) * 0.2})`; ctx.fillRect(m.x * vw, m.y * vh, 2.6 * m.s, 2.6 * m.s);
      } else if (kind === 'ash') {
        m.y += dt * 0.03 * m.v; m.x += Math.sin(t * 0.7 + m.ph) * 0.0005; if (m.y > 1.02) { m.y = -0.02; m.x = Math.random(); }
        ctx.fillStyle = m.ph > 5 ? 'rgba(130,255,170,0.5)' : 'rgba(120,115,130,0.5)'; ctx.fillRect(m.x * vw, m.y * vh, 2.2 * m.s, 2.2 * m.s);
      } else {
        m.y += dt * 0.05 * m.v; m.x -= dt * 0.015 * m.v; if (m.y > 1.02 || m.x < -0.02) { m.y = -0.02; m.x = Math.random() * 1.2; }
        ctx.fillStyle = `rgba(230,245,255,${0.5})`; ctx.fillRect(m.x * vw, m.y * vh, 2.4 * m.s, 2.4 * m.s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ============================ 主菜单背景：水墨远山 ============================ */
  R.drawMenu = function (dt) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, t = (this.t += dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#060b18'); g.addColorStop(0.45, '#102438'); g.addColorStop(0.8, '#1d3a44'); g.addColorStop(1, '#0c1a22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // 月
    const mx = vw * 0.84, my = vh * 0.17;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5; ctx.drawImage(glow('190,230,220'), mx - 260, my - 260, 520, 520);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8f4e8'; ctx.beginPath(); ctx.arc(mx, my, 58, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,190,0.35)'; ctx.beginPath(); ctx.arc(mx - 16, my - 10, 12, 0, TAU); ctx.arc(mx + 20, my + 16, 8, 0, TAU); ctx.fill();
    // 星
    for (let i = 0; i < 60; i++) { const a = 0.3 + Math.sin(t * (0.5 + U.hash(i, 1, 1)) + i) * 0.3; ctx.fillStyle = `rgba(220,240,255,${a})`; ctx.fillRect(U.hash(i, 2, 3) * vw, U.hash(i, 5, 7) * vh * 0.5, 1.6, 1.6); }
    // 远山层叠
    const layers = [['#16303f', 0.5, 90, 0.6], ['#12283a', 0.62, 120, 1], ['#0e2030', 0.74, 150, 1.6], ['#08141f', 0.9, 120, 2.4]];
    layers.forEach(([col, base, amp, sp], li) => {
      const off = t * sp * 4;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, vh);
      for (let x = 0; x <= vw + 20; x += 20) {
        const u = (x + off) * 0.004 + li * 10;
        const y = vh * base - (Math.sin(u) * 0.5 + Math.sin(u * 2.3 + 1) * 0.3 + Math.sin(u * 5.1 + 2) * 0.12 + 0.5) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(vw, vh); ctx.closePath(); ctx.fill();
      // 层间雾
      const fg = ctx.createLinearGradient(0, vh * base - 20, 0, vh * base + 90);
      fg.addColorStop(0, 'rgba(150,200,200,0)'); fg.addColorStop(1, 'rgba(150,200,200,0.10)');
      ctx.fillStyle = fg; ctx.fillRect(0, vh * base - 20, vw, 110);
    });
    // 崖上人影
    const fx = vw * 0.22, fy = vh * 0.78;
    ctx.fillStyle = '#050c13';
    ctx.beginPath(); ctx.moveTo(0, vh); ctx.lineTo(0, fy + 40); ctx.quadraticCurveTo(fx - 60, fy - 6, fx + 30, fy); ctx.quadraticCurveTo(fx + 80, fy + 30, fx + 110, vh); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1.5, 1.5);
    A.human(ctx, { x: 0, y: 0, face: -0.3, t, moving: false, look: { robe: '#0a1820', trim: '#16303a', skin: '#0a1820', hair: '#050c13', hat: 'player', backSword: true, weapon: 'none' }, flash: 0 });
    ctx.restore();
    // 飞剑流光
    const st = (t * 0.12) % 1, sx = vw * (1.1 - st * 1.3), sy = vh * (0.12 + st * 0.2);
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(sx, sy, sx + 180, sy - 28);
    lg.addColorStop(0, 'rgba(170,255,230,0.9)'); lg.addColorStop(1, 'rgba(170,255,230,0)');
    ctx.strokeStyle = lg; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 180, sy - 28); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.drawImage(glow('170,255,230'), sx - 14, sy - 14, 28, 28); ctx.globalAlpha = 1;
    for (const m of this.motes) {
      m.x += Math.sin(t * 0.5 * m.v + m.ph) * 0.0005; m.y += Math.cos(t * 0.4 * m.v + m.ph * 2) * 0.0005;
      const a = 0.3 + Math.sin(t * 2 * m.v + m.ph) * 0.3; if (a <= 0) continue;
      ctx.fillStyle = `rgba(200,255,170,${a})`; ctx.fillRect(m.x * vw, vh * 0.5 + m.y * vh * 0.5, 2.2 * m.s, 2.2 * m.s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vignette, 0, 0, vw, vh);
    if (G.Game.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, G.Game.fade)})`; ctx.fillRect(0, 0, vw, vh); }
  };

  /* ============================ 小地图 ============================ */
  R.drawMinimap = function (cv) {
    const Gm = G.Game, f = Gm.floor, cur = Gm.room; if (!f) return;
    const c = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
    c.clearRect(0, 0, W2, H2);
    const cw = 26, chh = 20, gx = 8, gy = 8, reveal = Gm.player.flags.reveal;
    const ox = W2 / 2 - cur.gx * (cw + gx), oy = H2 / 2 - cur.gy * (chh + gy);
    const vis = (r) => r.visited || r.seen || reveal;
    c.lineWidth = 3;
    for (const r of f.rooms) {
      if (!vis(r)) continue;
      for (const d of ['e', 's']) {
        const o = r.links[d]; if (!o || !vis(o)) continue;
        c.strokeStyle = 'rgba(200,220,210,0.4)';
        c.beginPath(); c.moveTo(ox + r.gx * (cw + gx), oy + r.gy * (chh + gy)); c.lineTo(ox + o.gx * (cw + gx), oy + o.gy * (chh + gy)); c.stroke();
      }
    }
    const ICON = { boss: ['首', '#ff6a6a'], treasure: ['宝', '#ffd45e'], shop: ['市', '#ffb86a'], garden: ['药', '#7dffb0'], event: ['缘', '#c9b0ff'], elite: ['精', '#ff9a6a'] };
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 13px ${FONT}`;
    for (const r of f.rooms) {
      if (!vis(r)) continue;
      const x = ox + r.gx * (cw + gx) - cw / 2, y = oy + r.gy * (chh + gy) - chh / 2;
      if (x < -cw || y < -chh || x > W2 || y > H2) continue;
      c.fillStyle = r === cur ? 'rgba(125,255,200,0.9)' : r.visited ? (r.cleared ? 'rgba(170,190,185,0.55)' : 'rgba(220,120,120,0.6)') : 'rgba(90,105,110,0.5)';
      c.strokeStyle = r === cur ? '#eafff6' : 'rgba(10,20,20,0.8)'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(x, y, cw, chh, 4); c.fill(); c.stroke();
      const ic = ICON[r.type];
      if (ic && (r.visited || r.seen || reveal)) { c.fillStyle = r === cur ? '#0a2018' : ic[1]; c.fillText(ic[0], x + cw / 2, y + chh / 2 + 1); }
    }
  };
})();
