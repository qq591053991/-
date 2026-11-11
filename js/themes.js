'use strict';
/* 凡人问道 —— 场景主题：调色板、3D 光照参数，以及地面 / 墙面贴图的程序化烘焙（Canvas → 纹理） */
(function () {
  const G = window.G, U = G.U, TAU = G.TAU;
  const Tx = (G.Tex = {});

  const shadeCache = {};
  function shade(hex, amt) {
    const key = hex + '|' + amt;
    if (shadeCache[key]) return shadeCache[key];
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return (shadeCache[key] = `rgb(${r | 0},${g | 0},${b | 0})`);
  }
  Tx.shade = shade;
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  /* bg 背景 / fog [色, 近, 远] / hemi [天, 地, 强度] / sun [色, 强度] / lamp 灯色
     cloudShadow [云影浓度, 云团大小] / dark 主角光圈之外压多暗 / ink 墨线的颜色 / sea 云海 / shaft 光柱 */
  G.Themes = [
    { // 0 神手谷 —— 月夜山谷庭院
      void: '#070b18', mist: '120,150,210',
      floor: '#5b6a61', floor2: '#52625a', line: 'rgba(14,22,22,0.42)', moss: '#3f6c47', grass: '#6aa860',
      face: '#cfc8b4', faceDark: '#a59d8a', base: '#67635c', top: '#343a47', topHi: '#505a6b',
      water: '#25546a', waterHi: '#86c8d4',
      bg: 0x0a1430, fog: [0x2c4476, 21.5, 54], cloudShadow: [0.24, 15], dark: 0.5, ink: 0x0a121c, hemi: [0x9fc6f2, 0x24384a, 0.95], sun: [0xd4e0ff, 1.0],
      sea: [0xa8c4f4, 0.85, 0x5674b8, 0.9], shaft: [0xcfe0ff, 0.2], // 云海 [近层色, 近层浓度, 远层色, 远层浓度]；光柱 [色, 强度]
      lamp: '255,214,150', lampHex: 0xffd696,
      props: ['rock', 'bamboo', 'lantern', 'pine', 'bamboo', 'rock'], mote: 'firefly',
    },
    { // 1 血色禁地 —— 赤雾密林
      void: '#0d0507', mist: '200,70,80',
      floor: '#62533f', floor2: '#6d5c46', line: 'rgba(20,8,8,0.0)', moss: '#55633a', grass: '#c24a52',
      face: '#7a5a4c', faceDark: '#503a32', base: '#30221e', top: '#574236', topHi: '#8a5246',
      water: '#47131f', waterHi: '#d86878',
      bg: 0x1a080c, fog: [0x54222a, 21.5, 52], cloudShadow: [0.4, 6.5], dark: 0.6, ink: 0x1a0a0c, hemi: [0xffb0a0, 0x3a201c, 0.9], sun: [0xffcabc, 0.95],
      sea: [0xc85c68, 0.78, 0x74242e, 0.88], shaft: [0xffa696, 0.17],
      lamp: '255,150,130', lampHex: 0xff8a8a,
      props: ['deadtree', 'mushroom', 'rock', 'bones', 'deadtree', 'mushroom'], mote: 'spore',
    },
    { // 2 燕翎堡 —— 魔焰围城
      void: '#07050d', mist: '120,90,190',
      floor: '#55525f', floor2: '#4a4755', line: 'rgba(8,6,12,0.5)', moss: '#22202a', grass: '#5c1c26',
      face: '#575463', faceDark: '#3c3a47', base: '#292732', top: '#302e3a', topHi: '#4c4959',
      water: '#0a0812', waterHi: '#5a3a8a',
      bg: 0x0e0a20, fog: [0x2c2458, 21.5, 52], cloudShadow: [0.26, 12], dark: 0.62, ink: 0x0a0812, hemi: [0xb8a6ff, 0x241c36, 0.9], sun: [0xd4c8ff, 0.95],
      sea: [0x8e7cdc, 0.74, 0x40348a, 0.86], shaft: null,
      lamp: '130,255,170', lampHex: 0x82ffaa,
      props: ['brazier', 'barricade', 'banner', 'rubble', 'barricade', 'rubble'], mote: 'ash',
    },
    { // 3 虚天殿 —— 冰火古殿
      void: '#040913', mist: '120,190,255',
      floor: '#62788a', floor2: '#586e80', line: 'rgba(214,180,90,0.6)', moss: '#d8f0ff', grass: '#e8f8ff',
      face: '#2b4162', faceDark: '#1c2c47', base: '#131f38', top: '#8ea4b4', topHi: '#b6cad6',
      water: '#b83a0c', waterHi: '#ffd27a',
      bg: 0x0a1630, fog: [0x2c4e88, 21.5, 58], cloudShadow: [0.16, 16], dark: 0.46, ink: 0x14244a, hemi: [0xc8dcff, 0x2c3c5e, 0.66], sun: [0xf0f6ff, 0.62], glowK: 0.85,
      sea: [0xc8e4ff, 0.85, 0x5e90d0, 0.9], shaft: [0xdff0ff, 0.19],
      lamp: '150,220,255', lampHex: 0x96dcff,
      props: ['icecrystal', 'pillar', 'brazier2', 'statue', 'icecrystal', 'pillar'], mote: 'snow',
    },
  ];

  /* 会发光的场景物件：z 高度(像素) / r 光照半径(像素) / c 颜色 */
  G.PROP_LIGHT = {
    lantern: { z: 40, r: 300, c: 0xffd696 }, mushroom: { z: 22, r: 190, c: 0xff7896 },
    brazier: { z: 46, r: 320, c: 0x82ffaa }, brazier2: { z: 46, r: 320, c: 0x8cd2ff }, icecrystal: { z: 34, r: 210, c: 0x96dcff },
  };

  /* ============================ 地面贴图 ============================ */
  const T = 48; // 绘制坐标沿用 48 像素一格，整体再按 FS 放大
  Tx.FS = 1.5;

  function drawFloorTile(c, th, ti, x, y, px, py, wild) {
    const hh = (i) => U.hash(x, y, i), TH = T;
    if (ti === 0 && wild) { // 山谷：草地，深浅不一，零星野花
      c.fillStyle = hh(1) < 0.5 ? '#45604c' : '#4b6751'; c.fillRect(px, py, T + 0.5, TH + 0.5);
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#587a5c' : '#35493c'; c.globalAlpha = 0.45; ell(c, px + hh(i * 3 + 2) * T, py + hh(i * 3 + 3) * TH, 9 + hh(i * 3 + 4) * 15, 6 + hh(i + 30) * 9); }
      c.globalAlpha = 0.5; c.strokeStyle = '#86b07e'; c.lineWidth = 1; c.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const gx = px + hh(40 + i) * T, gy = py + hh(50 + i) * TH; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (hh(60 + i) - 0.5) * 4, gy - 4 - hh(70 + i) * 4); c.stroke(); }
      c.globalAlpha = 1;
      if (hh(80) < 0.16) { c.fillStyle = hh(81) < 0.5 ? '#f2e6c8' : '#e8b8cc'; for (let i = 0; i < 3; i++) circ(c, px + 8 + hh(82 + i) * 32, py + 8 + hh(86 + i) * 32, 1.5); }
    } else if (ti === 0) { // 庭院：手铺的不规则石板 —— 每个格点各自错开一点，石板之间是生苔的缝
      const J = (ix, iy, k) => (U.hash(ix, iy, 40 + k) - 0.5) * 13;
      const p = [[px + J(x, y, 0), py + J(x, y, 1)], [px + T + J(x + 1, y, 0), py + J(x + 1, y, 1)], [px + T + J(x + 1, y + 1, 0), py + TH + J(x + 1, y + 1, 1)], [px + J(x, y + 1, 0), py + TH + J(x, y + 1, 1)]];
      const mx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, my = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
      const ins = (k) => p.map(([ax, ay]) => [ax + (mx - ax) * k, ay + (my - ay) * k]);
      const poly = (q) => { c.beginPath(); q.forEach(([ax, ay], i) => (i ? c.lineTo(ax, ay) : c.moveTo(ax, ay))); c.closePath(); };
      const tone = hh(1), q = ins(0.05);
      c.fillStyle = tone < 0.34 ? th.floor : tone < 0.68 ? th.floor2 : shade(th.floor, 0.08); poly(q); c.fill();
      c.fillStyle = `rgba(255,255,255,${0.02 + hh(11) * 0.06})`; poly(ins(0.12)); c.fill();
      c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.11)'; c.beginPath(); c.moveTo(q[3][0], q[3][1]); c.lineTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.stroke(); // 受光的两条棱
      c.strokeStyle = 'rgba(0,0,0,0.24)'; c.beginPath(); c.moveTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.lineTo(q[3][0], q[3][1]); c.stroke();
      if (hh(2) < 0.22) { c.strokeStyle = 'rgba(10,16,16,0.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + hh(3) * T, py + 3); c.lineTo(px + hh(4) * T, py + TH * 0.5); c.lineTo(px + hh(5) * T, py + TH - 3); c.stroke(); }
      if (hh(6) < 0.3) { c.fillStyle = th.moss; c.globalAlpha = 0.45; ell(c, px + hh(7) * T, py + hh(8) * TH, 8 + hh(9) * 9, 6 + hh(10) * 6); c.globalAlpha = 1; }
    } else if (ti === 1) { // 林地泥土
      c.fillStyle = th.floor; c.fillRect(px, py, T, TH);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? th.floor2 : 'rgba(30,14,14,0.35)'; c.globalAlpha = 0.6;
        ell(c, px + hh(i * 3 + 1) * T, py + hh(i * 3 + 2) * TH, 7 + hh(i * 3 + 3) * 14, 5 + hh(i + 20) * 9);
      }
      c.globalAlpha = 1;
      if (hh(30) < 0.25) { c.fillStyle = th.moss; c.globalAlpha = 0.5; ell(c, px + hh(31) * T, py + hh(32) * TH, 10, 7); c.globalAlpha = 1; }
      if (hh(33) < 0.3) { c.fillStyle = '#6c5a52'; circ(c, px + hh(34) * T, py + hh(35) * TH, 1.5 + hh(36) * 2); }
      if (hh(40) < 0.17) { // 半埋在土里的踏石
        const sx = px + 10 + hh(41) * 28, sy = py + 10 + hh(42) * 28, rr = 9 + hh(43) * 8, n = 6;
        const pth = (k, dy) => { c.beginPath(); for (let i = 0; i < n; i++) { const a = (i / n) * TAU + hh(44) * 3, r2 = rr * k * (0.75 + U.hash(x * 7 + i, y, 45) * 0.45); if (i) c.lineTo(sx + Math.cos(a) * r2, sy + dy + Math.sin(a) * r2 * 0.8); else c.moveTo(sx + Math.cos(a) * r2, sy + dy + Math.sin(a) * r2 * 0.8); } c.closePath(); };
        c.fillStyle = 'rgba(20,10,10,0.45)'; pth(1.12, 2); c.fill(); c.fillStyle = '#857064'; pth(1, 0); c.fill(); c.fillStyle = 'rgba(255,235,220,0.14)'; pth(0.6, -1.5); c.fill();
      }
      if (hh(50) < 0.1) { // 露出地面的树根
        const x0 = px + hh(51) * T, y0 = py + hh(52) * TH, x1 = px + hh(53) * T, y1 = py + hh(54) * TH;
        c.lineCap = 'round'; c.strokeStyle = 'rgba(24,12,12,0.7)'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(px + T / 2 + (hh(55) - 0.5) * 30, py + TH / 2, x1, y1); c.stroke();
        c.strokeStyle = 'rgba(120,90,76,0.6)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0, y0 - 1); c.quadraticCurveTo(px + T / 2 + (hh(55) - 0.5) * 30, py + TH / 2 - 1, x1, y1 - 1); c.stroke();
      }
    } else if (ti === 2) { // 城砖
      c.fillStyle = th.floor2; c.fillRect(px, py, T, TH);
      const off = y % 2 ? T / 2 : 0;
      for (let k = -1; k < 2; k++) {
        const bx = px + k * T + off, x0 = Math.max(px, bx), x1 = Math.min(px + T, bx + T);
        if (x1 <= x0) continue;
        c.fillStyle = U.hash(x * 2 + k + (y % 2), y, 2) > 0.5 ? th.floor : shade(th.floor, -0.08);
        c.fillRect(x0 + 1, py + 1, x1 - x0 - 2, TH / 2 - 2); c.fillRect(x0 + 1, py + TH / 2 + 1, x1 - x0 - 2, TH / 2 - 2);
      }
      if (hh(6) < 0.1) { c.fillStyle = 'rgba(8,6,10,0.22)'; ell(c, px + hh(7) * T, py + hh(8) * TH, 20, 14); }
      if (hh(9) < 0.07) { c.fillStyle = th.grass; c.globalAlpha = 0.5; ell(c, px + hh(10) * T, py + hh(11) * TH, 11, 7); c.globalAlpha = 1; }
      if (hh(20) < 0.045) { const bx = px + (hh(21) < 0.5 ? 2 : T / 2 + 1), by = py + (hh(22) < 0.5 ? 2 : TH / 2 + 2); c.fillStyle = 'rgba(8,6,12,0.42)'; c.fillRect(bx, by, T / 2 - 3, TH / 2 - 4); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(bx, by + TH / 2 - 6, T / 2 - 3, 2); } // 缺了一块砖
      if (hh(23) < 0.08) { c.strokeStyle = 'rgba(6,4,10,0.55)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(px + hh(24) * T, py); c.lineTo(px + T * 0.3 + hh(25) * T * 0.4, py + TH * 0.4); c.lineTo(px + hh(26) * T, py + TH * 0.7); c.lineTo(px + T * 0.4 + hh(27) * 14, py + TH); c.stroke(); } // 贯穿的裂纹
    } else { // 玉砖 + 金线
      c.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? th.floor : th.floor2; c.fillRect(px, py, T, TH);
      c.fillStyle = `rgba(255,255,255,${0.04 + hh(1) * 0.08})`; c.fillRect(px, py, T, TH);
      c.strokeStyle = 'rgba(60,90,110,0.22)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, T - 1, TH - 1);
      c.strokeStyle = th.line; c.lineWidth = 1.6;
      if (x % 2 === 0) { c.beginPath(); c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + TH); c.stroke(); }
      if (y % 2 === 0) { c.beginPath(); c.moveTo(px, py + 0.5); c.lineTo(px + T, py + 0.5); c.stroke(); }
      if (hh(2) < 0.3) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + hh(3) * T, py + hh(4) * TH); c.lineTo(px + hh(5) * T, py + hh(6) * TH); c.stroke(); }
      if (hh(7) < 0.12) { c.fillStyle = 'rgba(232,248,255,0.4)'; ell(c, px + hh(8) * T, py + hh(9) * TH, 12, 8); }
      if (x % 2 === 0 && y % 2 === 0) { // 金线交点处的菱花
        c.fillStyle = 'rgba(226,192,104,0.85)'; c.beginPath(); c.moveTo(px, py - 6); c.lineTo(px + 6, py); c.lineTo(px, py + 6); c.lineTo(px - 6, py); c.closePath(); c.fill();
        c.fillStyle = 'rgba(56,82,106,0.9)'; c.beginPath(); c.moveTo(px, py - 2.6); c.lineTo(px + 2.6, py); c.lineTo(px, py + 2.6); c.lineTo(px - 2.6, py); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(226,192,104,0.5)'; c.lineWidth = 1; for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.arc(px + dx * 7, py + dy * 7, 3, 0, TAU); c.stroke(); }
      }
    }
  }

  /* 青铜地台：嵌在地面里的大圆盘 —— 外圈云雷纹，内圈如意云头，中心一章一字（虚天殿是北斗星图）。
     凡俗的地面上，只有这一块是"上古留下的东西"：战斗、机缘、首领都发生在它上面。 */
  const MED = [
    // 地台是凡尘之物：低饱和、不发光；纹线一律用旧金 / 骨色，绝不用朱砂（朱砂只属于预警）
    { base: '#2b4643', hi: '#3f6660', line: '#c9ab62', glyph: '玄' }, // 青铜绿锈 + 旧金
    { base: '#3a2b26', hi: '#54403a', line: '#c2a276', glyph: '禁' }, // 沁色古石 + 骨色
    { base: '#2a2836', hi: '#3c394c', line: '#8fb89e', glyph: '燕' }, // 玄铁 + 褪了色的铜绿
    { base: '#38526a', hi: '#587890', line: '#ecca72', glyph: '' },   // 寒玉 + 鎏金星图
  ];
  function medallion(c, cx, cy, R, ti, worn, seed) {
    const M = MED[ti], th = G.Themes[ti], hh = (i) => U.hash(seed, i, 11);
    c.save(); c.translate(cx, cy);
    c.fillStyle = 'rgba(0,0,0,0.38)'; circ(c, 0, 0, R * 1.045); // 陷进地面的一圈暗影
    const g = c.createRadialGradient(0, 0, R * 0.1, 0, 0, R); g.addColorStop(0, M.hi); g.addColorStop(1, M.base);
    c.fillStyle = g; circ(c, 0, 0, R);
    c.strokeStyle = M.line; c.lineCap = 'round'; c.lineJoin = 'round';
    const ring = (r, w, a) => { c.globalAlpha = a; c.lineWidth = w; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); };
    ring(R * 0.972, R * 0.036, 0.9); ring(R * 0.765, 1.7, 0.8); ring(R * 0.735, 1, 0.5); ring(R * 0.455, 1.7, 0.8); ring(R * 0.425, 1, 0.5);
    // 外圈：云雷纹
    const n1 = Math.max(12, Math.round(R / 10) * 2), q1 = Math.min(R * 0.075, (Math.PI * R * 0.86) / n1 - 2.5);
    c.lineWidth = 1.5; c.globalAlpha = 0.78;
    for (let i = 0; i < n1; i++) {
      c.save(); c.rotate((i / n1) * TAU); c.translate(0, -R * 0.862); if (i % 2) c.scale(-1, 1);
      c.beginPath(); c.moveTo(-q1, q1); c.lineTo(-q1, -q1); c.lineTo(q1, -q1); c.lineTo(q1, q1 * 0.55); c.lineTo(-q1 * 0.45, q1 * 0.55); c.lineTo(-q1 * 0.45, -q1 * 0.4); c.lineTo(q1 * 0.4, -q1 * 0.4); c.lineTo(q1 * 0.4, q1 * 0.08); c.stroke();
      c.restore();
    }
    // 内圈：如意云头
    c.lineWidth = 1.8; c.globalAlpha = 0.72;
    for (let i = 0; i < 8; i++) {
      c.save(); c.rotate((i / 8) * TAU + TAU / 16); c.translate(0, -R * 0.6);
      const q = R * 0.082;
      c.beginPath(); c.arc(-q * 0.9, 0, q * 0.62, Math.PI * 0.1, Math.PI * 1.75); c.stroke();
      c.beginPath(); c.arc(q * 0.9, 0, q * 0.62, Math.PI * 1.25, Math.PI * 2.9); c.stroke();
      c.beginPath(); c.arc(0, -q * 0.5, q * 0.8, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.beginPath(); c.moveTo(-q * 1.9, q * 0.95); c.quadraticCurveTo(0, q * 0.35, q * 1.9, q * 0.95); c.stroke();
      c.restore();
    }
    // 中心
    c.globalAlpha = 0.86; c.fillStyle = M.line;
    if (M.glyph) { c.font = `${Math.round(R * 0.5)}px "STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif CJK SC","Songti SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(M.glyph, 0, R * 0.03); }
    else { // 北斗七星 + 周天星点
      const D = [[0.27, 0.0], [0.21, 0.15], [0.07, 0.1], [0.03, -0.06], [-0.08, -0.15], [-0.2, -0.2], [-0.31, -0.12]];
      c.lineWidth = 1.3; c.beginPath();
      [0, 1, 2, 3, 0].forEach((k, i) => (i ? c.lineTo(D[k][0] * R, D[k][1] * R) : c.moveTo(D[k][0] * R, D[k][1] * R)));
      c.moveTo(D[3][0] * R, D[3][1] * R); for (let k = 4; k < 7; k++) c.lineTo(D[k][0] * R, D[k][1] * R);
      c.stroke();
      for (const d of D) circ(c, d[0] * R, d[1] * R, Math.max(2.2, R * 0.024));
      for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; circ(c, Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36, i % 7 ? 1.3 : 2.2); }
    }
    // 岁月：苔痕、缺损、裂纹
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
    const nW = Math.round((worn ? 18 : 9) * (R / 110));
    for (let i = 0; i < nW; i++) { const a = hh(i) * TAU, r = Math.sqrt(hh(i + 40)) * R; c.fillStyle = i % 3 ? th.floor : th.moss; c.globalAlpha = worn ? 0.6 : 0.36; ell(c, Math.cos(a) * r, Math.sin(a) * r, 7 + hh(i + 80) * R * 0.15, 5 + hh(i + 120) * R * 0.09); }
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.2; c.globalAlpha = 0.8;
    for (let i = 0; i < (worn ? 4 : 2); i++) {
      let a = hh(i + 200) * TAU, r = R; c.beginPath(); c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      for (let k = 0; k < 4; k++) { a += (hh(i * 9 + k + 210) - 0.5) * 0.5; r -= R * (0.12 + hh(i * 9 + k + 250) * 0.14); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.stroke();
    }
    c.restore();
  }
  // 各类房间的地台大小（格）；寻常险地只有三成有，而且残破
  const MED_R = { boss: 4.4, elite: 3.2, start: 2.8, treasure: 2.5, shop: 2.5, garden: 2.5, event: 2.5 };
  const LITTER = [['#f0c8d6', '#e8a8c0', '#f8e4ea'], ['#6a2a2a', '#8a3a30', '#4a2420'], ['#1c1a22', '#3a2a2a', '#5a3a20'], ['#eaf6ff', '#cfe6f6', '#ffffff']]; // 落英 / 枯叶 / 余烬 / 霜花

  Tx.floor = function (room) {
    const ti = room.theme, th = G.Themes[ti], FS = Tx.FS;
    const w = room.w, h = room.h, tiles = room.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]);
    const cv = document.createElement('canvas'); cv.width = Math.round(w * T * FS); cv.height = Math.round(h * T * FS);
    const c = cv.getContext('2d'); c.scale(FS, FS);
    const open = room.terrain && room.terrain !== 'court'; // 山野 / 洞窟：没有墙，地面一直铺到林子、岩壁底下
    c.fillStyle = ti === 0 ? '#26382f' : shade(th.base, -0.4); c.fillRect(0, 0, w * T, h * T); // 第一章的石缝里是苔
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y); if (t === 1 && !open) continue;
      drawFloorTile(c, th, ti, x, y, x * T, y * T, open);
    }
    if (open) {
      // 土路：从每个出口踩向空地中央的一条小径 —— 地图之间靠路连着，而不是靠门
      const trail = ti === 0 ? '112,104,84' : ti === 1 ? '64,46,38' : '70,70,80', mx = (w / 2) * T, my = (h / 2) * T;
      c.lineCap = 'round';
      for (const d in room.doors || {}) {
        const [dx0, dy0] = room.doors[d].cells[1], sx = (dx0 + 0.5) * T, sy = (dy0 + 0.5) * T, bx = (sx + mx) / 2 + (U.hash(dx0, dy0, 5) - 0.5) * 90, by = (sy + my) / 2 + (U.hash(dx0, dy0, 6) - 0.5) * 70;
        for (const [lw, a] of [[T * 2.3, 0.2], [T * 1.6, 0.3], [T * 0.9, 0.3]]) { c.strokeStyle = `rgba(${trail},${a})`; c.lineWidth = lw; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(bx, by, mx, my); c.stroke(); }
      }
      // 林下 / 岩壁下的暗：一团一团的，边缘是软的
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (at(x, y) !== 1) continue;
        const sx = (x + 0.5) * T, sy = (y + 0.5) * T, g = c.createRadialGradient(sx, sy, T * 0.2, sx, sy, T * 1.05);
        g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(sx - T * 1.1, sy - T * 1.1, T * 2.2, T * 2.2);
      }
    }
    // 青铜地台
    const seed = (room.gx || 0) * 7 + (room.gy || 0) * 13 + ti * 31;
    let mr = MED_R[room.type] || (U.hash(seed, 3, 9) < 0.34 ? 2.6 : 0);
    if (mr) { mr = Math.min(mr, Math.min(w, h) / 2 - 1.6); medallion(c, (w / 2) * T, (h / 2) * T, mr * T, ti, !MED_R[room.type], seed); }
    // 散落物：成簇的落英 / 枯叶 / 余烬 / 霜花，让地面不那么"干净"
    const nL = Math.round(w * h * (ti === 2 ? 0.5 : 0.9)), LC = LITTER[ti];
    for (let i = 0; i < nL; i++) {
      const k = (i / 7) | 0, lx = U.hash(k, 3, seed) * w * T + (U.hash(i, 7, seed) - 0.5) * 76, ly = U.hash(k, 5, seed) * h * T + (U.hash(i, 9, seed) - 0.5) * 54;
      const t = at(Math.floor(lx / T), Math.floor(ly / T)); if (t !== 0 && t !== 2) continue;
      c.save(); c.translate(lx, ly); c.rotate(U.hash(i, 11, seed) * TAU); c.globalAlpha = 0.45 + U.hash(i, 13, seed) * 0.4; c.fillStyle = LC[i % 3];
      c.beginPath(); c.ellipse(0, 0, ti === 1 ? 4.6 : 3, ti === 1 ? 2.2 : 1.7, 0, 0, TAU); c.fill(); c.restore();
    }
    c.globalAlpha = 1;
    // 水面 / 岩浆 / 深渊（圆角）
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) !== 3) continue;
      const px = x * T, py = y * T, w3 = (ax, ay) => at(ax, ay) === 3, RR = 16;
      c.save(); c.beginPath();
      c.roundRect(px, py, T, T, [!w3(x - 1, y) && !w3(x, y - 1) ? RR : 0, !w3(x + 1, y) && !w3(x, y - 1) ? RR : 0, !w3(x + 1, y) && !w3(x, y + 1) ? RR : 0, !w3(x - 1, y) && !w3(x, y + 1) ? RR : 0]);
      c.clip();
      c.fillStyle = th.water; c.fillRect(px, py, T, T);
      const g = c.createLinearGradient(0, py, 0, py + T);
      g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(0.45, 'rgba(0,0,0,0)');
      if (!w3(x, y - 1)) { c.fillStyle = g; c.fillRect(px, py, T, T); c.fillStyle = shade(th.base, -0.2); c.fillRect(px, py, T, 6); }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      if (!w3(x - 1, y)) c.fillRect(px, py, 3, T);
      if (!w3(x + 1, y)) c.fillRect(px + T - 3, py, 3, T);
      if (!w3(x, y + 1)) { c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(px, py + T - 2, T, 2); }
      // 波纹
      c.strokeStyle = th.waterHi; c.lineCap = 'round'; c.lineWidth = ti === 3 ? 3 : 1.6;
      for (let i = 0; i < 3; i++) {
        c.globalAlpha = 0.18 + U.hash(x, y, 60 + i) * 0.3;
        const lx = px + 5 + U.hash(x, y, 63 + i) * 24, ly = py + 8 + i * 14 + U.hash(x, y, 66 + i) * 5;
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 9 + U.hash(x, y, 69 + i) * 12, ly); c.stroke();
      }
      c.globalAlpha = 1;
      if (ti === 0 && U.hash(x, y, 77) < 0.3) { // 荷叶
        c.fillStyle = '#4f8f5a'; const lx = px + 12 + U.hash(x, y, 78) * 24, ly = py + 14 + U.hash(x, y, 79) * 18;
        c.beginPath(); c.ellipse(lx, ly, 9, 8, 0, 0.3, TAU - 0.2); c.lineTo(lx, ly); c.fill();
        if (U.hash(x, y, 80) < 0.5) { c.fillStyle = '#f2b8d0'; circ(c, lx + 5, ly - 5, 2.6); }
      }
      c.restore();
    }
    // 层次：灯下一圈暖光、物件脚下的接地影、四周压暗 —— 视线自然落在场中
    for (const L of room.lights || []) {
      const lc = `${(L.c >> 16) & 255},${(L.c >> 8) & 255},${L.c & 255}`, g = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.62);
      g.addColorStop(0, `rgba(${lc},0.22)`); g.addColorStop(0.5, `rgba(${lc},0.08)`); g.addColorStop(1, `rgba(${lc},0)`);
      c.fillStyle = g; c.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    for (const p of room.props || []) {
      const sx = (p.tx + 0.5) * T, sy = (p.ty + 0.56) * T, g = c.createRadialGradient(sx, sy, 2, sx, sy, 34);
      g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(sx - 34, sy - 34, 68, 68);
    }
    { const cx = (w / 2) * T, cy = (h / 2) * T, g = c.createRadialGradient(cx, cy, Math.min(w, h) * T * 0.3, cx, cy, Math.hypot(w, h) * T * 0.56);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.36)'); c.fillStyle = g; c.fillRect(0, 0, w * T, h * T); }
    // 门口亮带 + 墙根阴影
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y); if (t === 1) continue;
      const px = x * T, py = y * T;
      if (t === 4) { c.fillStyle = 'rgba(255,235,190,0.10)'; c.fillRect(px, py, T, T); }
      if (open) continue; // 山野没有墙根
      if (ti < 2 && at(x, y - 1) === 1 && U.hash(x, y, 91) < 0.55) { c.fillStyle = th.moss; c.globalAlpha = 0.5; ell(c, px + U.hash(x, y, 92) * T, py + 5, 14 + U.hash(x, y, 93) * 12, 6 + U.hash(x, y, 94) * 5); c.globalAlpha = 1; } // 墙根的苔
      if (at(x, y - 1) === 1) { const g = c.createLinearGradient(0, py, 0, py + 22); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, T, 22); }
      if (at(x - 1, y) === 1) { const g = c.createLinearGradient(px, 0, px + 14, 0); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, 14, T); }
      if (at(x + 1, y) === 1) { const g = c.createLinearGradient(px + T, 0, px + T - 14, 0); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px + T - 14, py, 14, T); }
      if (at(x, y + 1) === 1) { const g = c.createLinearGradient(0, py + T, 0, py + T - 10); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py + T - 10, T, 10); }
    }
    return cv;
  };

  /* 云：一张四方连续的云团图（白 + 透明度），云海、云影、近地的雾都用它 */
  Tx.clouds = function (seed, n = 46, size = 256, aK = 1) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
    for (let i = 0; i < n; i++) {
      const x = U.hash(i, 1, seed) * size, y = U.hash(i, 2, seed) * size, r = size * (0.07 + U.hash(i, 3, seed) * 0.13), a = (0.16 + U.hash(i, 4, seed) * 0.3) * aK;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    return cv;
  };
  /* 墨渍：一摊不规则的墨（白 + 透明度，由材质上色），四周甩出几点 */
  Tx.splat = function (seed) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), hh = (i) => U.hash(seed, i, 53);
    c.fillStyle = '#fff';
    c.beginPath(); // 主体：绕一圈、半径忽大忽小
    for (let i = 0; i <= 26; i++) { const a = (i / 26) * TAU, r = 26 + hh(i % 26) * 16 + (hh((i % 26) + 40) < 0.2 ? 14 : 0), x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath(); c.fill();
    for (let i = 0; i < 14; i++) { // 甩出去的墨点，越远越小；近处的连一道细丝
      const a = hh(60 + i) * TAU, d = 34 + hh(80 + i) * 26, r = 2 + hh(100 + i) * 5 * (1 - (d - 34) / 40);
      circ(c, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r);
      if (hh(120 + i) < 0.4) { c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28); c.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); c.stroke(); }
    }
    c.globalCompositeOperation = 'destination-out'; // 墨色不匀：中间略淡
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 30); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return cv;
  };
  /* 光柱：中间亮、两边淡，自上而下渐隐 */
  Tx.shaft = function () {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const c = cv.getContext('2d');
    let g = c.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 256);
    c.globalCompositeOperation = 'destination-in';
    g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.42, 'rgba(0,0,0,0.45)'); g.addColorStop(0.76, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 256); // 最亮处在落地之前
    return cv;
  };

  /* ============================ 墙面贴图 ============================ */
  // 北墙立面：按整段墙长烘焙，窗、柱、藤蔓、云纹沿墙变化。x0 为该段起始格。
  Tx.wallFace = function (ti, x0, len, seed) {
    const th = G.Themes[ti], PW = 64, PH = 96;
    const cv = document.createElement('canvas'); cv.width = len * PW; cv.height = PH;
    const c = cv.getContext('2d'); c.scale(PW / 48, PH / 56);
    const hgt = 56;
    for (let i = 0; i < len; i++) {
      const x = x0 + i, px = i * 48, hh = (k) => U.hash(x, seed, k + 90);
      const g = c.createLinearGradient(0, 0, 0, hgt);
      g.addColorStop(0, shade(th.face, -0.22)); g.addColorStop(0.18, th.face); g.addColorStop(1, th.faceDark);
      c.fillStyle = g; c.fillRect(px, 0, 48.5, hgt);
      if (ti === 0) {
        c.fillStyle = th.base; c.fillRect(px, hgt - 10, 48.5, 10);
        c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(px, hgt - 10, 48.5, 1.5);
        if (x % 4 === 1) { c.fillStyle = '#5a3d2c'; c.fillRect(px + 21, 4, 6, hgt - 14); }
        if (x % 4 === 3) { // 漏窗
          c.fillStyle = '#2a2c34'; c.beginPath(); c.arc(px + 24, 22, 10, 0, TAU); c.fill();
          c.strokeStyle = '#8a8272'; c.lineWidth = 1.6; c.beginPath(); c.arc(px + 24, 22, 10, 0, TAU);
          c.moveTo(px + 14, 22); c.lineTo(px + 34, 22); c.moveTo(px + 24, 12); c.lineTo(px + 24, 32); c.stroke();
        }
        if (hh(1) < 0.4) { c.fillStyle = 'rgba(60,70,60,0.18)'; ell(c, px + hh(2) * 48, 14 + hh(3) * 20, 10, 14); }
      } else if (ti === 1) {
        c.strokeStyle = 'rgba(20,10,10,0.45)'; c.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { const yy = 8 + k * 15 + hh(k) * 6; c.beginPath(); c.moveTo(px, yy); c.quadraticCurveTo(px + 24, yy + (hh(k + 4) - 0.5) * 10, px + 48, yy + (hh(k + 8) - 0.5) * 4); c.stroke(); }
        c.fillStyle = th.base; c.fillRect(px, hgt - 6, 48.5, 6);
        if (hh(12) < 0.5) { // 藤蔓
          c.strokeStyle = '#3c2a22'; c.lineWidth = 1.6; const vx = px + 6 + hh(13) * 36, vl = 16 + hh(14) * 26;
          c.beginPath(); c.moveTo(vx, 0); c.quadraticCurveTo(vx + 5, vl * 0.5, vx - 2, vl); c.stroke();
          c.fillStyle = '#a8303c'; for (let k = 0; k < 4; k++) ell(c, vx + (k % 2 ? 4 : -3), 5 + (vl * k) / 4, 3.4, 2);
        }
      } else if (ti === 2) {
        c.strokeStyle = 'rgba(10,8,14,0.5)'; c.lineWidth = 1.2;
        for (let r = 0; r < 4; r++) {
          const yy = 4 + r * 13; c.beginPath(); c.moveTo(px, yy); c.lineTo(px + 48, yy); c.stroke();
          const o = r % 2 ? 24 : 0;
          c.beginPath(); c.moveTo(px + o, yy); c.lineTo(px + o, yy + 13); c.stroke();
          c.beginPath(); c.moveTo(px + ((o + 24) % 48), yy); c.lineTo(px + ((o + 24) % 48), yy + 13); c.stroke();
        }
        c.fillStyle = th.base; c.fillRect(px, hgt - 5, 48.5, 5);
        if (hh(1) < 0.2) { c.fillStyle = 'rgba(90,20,30,0.4)'; ell(c, px + hh(2) * 48, 20 + hh(3) * 20, 8, 12); }
      } else {
        c.fillStyle = '#d9b45a'; c.fillRect(px, 5, 48.5, 2); c.fillRect(px, hgt - 9, 48.5, 2);
        c.fillStyle = th.base; c.fillRect(px, hgt - 7, 48.5, 7);
        if (x % 2 === 0) { // 云纹
          c.strokeStyle = 'rgba(217,180,90,0.75)'; c.lineWidth = 1.5; const cx = px + 24, cy = hgt / 2 - 1;
          c.beginPath(); c.arc(cx - 6, cy, 6, Math.PI * 0.2, Math.PI * 1.9); c.arc(cx + 6, cy + 1, 6, Math.PI * 1.2, Math.PI * 2.9); c.stroke();
        } else {
          c.strokeStyle = 'rgba(120,200,255,0.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(px + 24, 12); c.lineTo(px + 24, hgt - 14); c.stroke();
        }
      }
    }
    return cv;
  };

  // 可平铺的墙顶贴图（一格）
  Tx.wallTop = function (ti) {
    const th = G.Themes[ti], cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'); c.scale(64 / 48, 64 / 48);
    c.fillStyle = th.top; c.fillRect(0, 0, 48, 48);
    if (ti === 0) { // 瓦片
      c.strokeStyle = th.topHi; c.lineWidth = 1.3;
      for (let r = 0; r < 4; r++) for (let k = -1; k < 5; k++) { c.beginPath(); c.arc(k * 12 + 6 + (r % 2 ? 6 : 0), r * 12 + 4, 6, 0.15, Math.PI - 0.15); c.stroke(); }
    } else if (ti === 1) {
      for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? th.topHi : shade(th.top, 0.12); c.globalAlpha = 0.5; ell(c, U.hash(i, 1, 5) * 48, U.hash(i, 2, 5) * 48, 8 + U.hash(i, 3, 5) * 7, 6); }
      c.globalAlpha = 1;
    } else if (ti === 2) {
      c.fillStyle = th.topHi; c.fillRect(2, 2, 21, 44); c.fillRect(25, 2, 21, 44);
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(2, 40, 44, 6);
    } else {
      c.fillStyle = th.topHi; c.fillRect(3, 3, 42, 42);
      c.strokeStyle = 'rgba(217,180,90,0.8)'; c.lineWidth = 1.4; c.strokeRect(6, 6, 36, 36);
    }
    return cv;
  };

  // 可平铺的素墙立面（侧墙 / 矮墙 / 内墙）
  Tx.wallPlain = function (ti) {
    const th = G.Themes[ti], cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, th.face); g.addColorStop(1, th.faceDark);
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    c.fillStyle = th.base; c.fillRect(0, 52, 64, 12);
    if (ti === 2) { c.strokeStyle = 'rgba(10,8,14,0.45)'; c.lineWidth = 1.5; for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(0, r * 16); c.lineTo(64, r * 16); c.moveTo(r % 2 ? 32 : 0.5, r * 16); c.lineTo(r % 2 ? 32 : 0.5, r * 16 + 16); c.stroke(); } }
    if (ti === 3) { c.fillStyle = '#d9b45a'; c.fillRect(0, 6, 64, 2.5); }
    if (ti === 1) { c.strokeStyle = 'rgba(20,10,10,0.4)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 20); c.quadraticCurveTo(32, 28, 64, 20); c.moveTo(0, 40); c.quadraticCurveTo(32, 34, 64, 40); c.stroke(); }
    return cv;
  };

  /* ============================ 其它小贴图 ============================ */
  Tx.radial = function (size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  };
  Tx.glyph = function (ch, color, bg) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 128, 128); }
    x.fillStyle = color; x.font = 'bold 92px "STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif CJK SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70);
    return c;
  };
  /* 剑阵阵图：同心环 + 八方剑纹 + 内八角，白色线稿，使用时按流派着色 */
  Tx.array = function () {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.translate(128, 128); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
    for (const [r, w] of [[122, 3], [112, 1.2], [78, 2], [44, 1.5]]) { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
    x.lineWidth = 1.5; x.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + TAU / 16; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 78, Math.sin(a) * 78); } x.stroke();
    for (let i = 0; i < 8; i++) { // 八柄小剑，剑尖朝外
      x.save(); x.rotate((i / 8) * TAU);
      x.beginPath(); x.moveTo(110, 0); x.lineTo(96, -4); x.lineTo(84, 0); x.lineTo(96, 4); x.closePath(); x.fill();
      x.lineWidth = 1.5; x.beginPath(); x.moveTo(84, 0); x.lineTo(50, 0); x.moveTo(80, -6); x.lineTo(80, 6); x.stroke();
      x.restore();
    }
    x.lineWidth = 1; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 113, Math.sin(a) * 113); x.lineTo(Math.cos(a) * 121, Math.sin(a) * 121); x.stroke(); }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 44); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 44, 0, TAU); x.fill();
    return c;
  };
  Tx.web = function () {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.strokeStyle = 'rgba(235,235,245,0.9)'; x.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); x.stroke(); }
    for (let k = 1; k <= 4; k++) { x.beginPath(); x.arc(64, 64, k * 15, 0, TAU); x.stroke(); }
    return c;
  };
})();
