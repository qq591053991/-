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

  /* bg 背景 / fog [色, 近, 远] / hemi [天, 地, 强度] / sun [色, 强度] / lamp 灯色 */
  G.Themes = [
    { // 0 神手谷 —— 月夜山谷庭院
      void: '#070b18', mist: '120,150,210',
      floor: '#5b6a61', floor2: '#52625a', line: 'rgba(14,22,22,0.42)', moss: '#3f6c47', grass: '#6aa860',
      face: '#cfc8b4', faceDark: '#a59d8a', base: '#67635c', top: '#343a47', topHi: '#505a6b',
      water: '#25546a', waterHi: '#86c8d4',
      bg: 0x060a17, fog: [0x0a1126, 26, 70], hemi: [0xa9c0ff, 0x2a3348, 0.95], sun: [0xd4e0ff, 1.0],
      lamp: '255,214,150', lampHex: 0xffd696,
      props: ['rock', 'bamboo', 'lantern', 'pine', 'bamboo', 'rock'], mote: 'firefly',
    },
    { // 1 血色禁地 —— 赤雾密林
      void: '#0d0507', mist: '200,70,80',
      floor: '#62533f', floor2: '#6d5c46', line: 'rgba(20,8,8,0.0)', moss: '#55633a', grass: '#c24a52',
      face: '#7a5a4c', faceDark: '#503a32', base: '#30221e', top: '#574236', topHi: '#8a5246',
      water: '#47131f', waterHi: '#d86878',
      bg: 0x0d0507, fog: [0x1c080c, 24, 64], hemi: [0xffb0a0, 0x3a201c, 0.9], sun: [0xffcabc, 0.95],
      lamp: '255,150,130', lampHex: 0xff8a8a,
      props: ['deadtree', 'mushroom', 'rock', 'bones', 'deadtree', 'mushroom'], mote: 'spore',
    },
    { // 2 燕翎堡 —— 魔焰围城
      void: '#07050d', mist: '120,90,190',
      floor: '#55525f', floor2: '#4a4755', line: 'rgba(8,6,12,0.5)', moss: '#22202a', grass: '#5c1c26',
      face: '#575463', faceDark: '#3c3a47', base: '#292732', top: '#302e3a', topHi: '#4c4959',
      water: '#0a0812', waterHi: '#5a3a8a',
      bg: 0x06040c, fog: [0x0d091a, 24, 64], hemi: [0xb8a6ff, 0x241c36, 0.9], sun: [0xd4c8ff, 0.95],
      lamp: '130,255,170', lampHex: 0x82ffaa,
      props: ['brazier', 'barricade', 'banner', 'rubble', 'barricade', 'rubble'], mote: 'ash',
    },
    { // 3 虚天殿 —— 冰火古殿
      void: '#040913', mist: '120,190,255',
      floor: '#93a9b8', floor2: '#869cac', line: 'rgba(214,180,90,0.55)', moss: '#d8f0ff', grass: '#e8f8ff',
      face: '#2b4162', faceDark: '#1c2c47', base: '#131f38', top: '#a9c0cf', topHi: '#dcecf3',
      water: '#b83a0c', waterHi: '#ffd27a',
      bg: 0x040913, fog: [0x0a1a34, 28, 76], hemi: [0xc8dcff, 0x2c3c5e, 0.52], sun: [0xf0f6ff, 0.5], glowK: 0.55,
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

  function drawFloorTile(c, th, ti, x, y, px, py) {
    const hh = (i) => U.hash(x, y, i), TH = T;
    if (ti === 0) { // 石板庭院
      c.fillStyle = (x + y) % 2 ? th.floor : th.floor2; c.fillRect(px, py, T, TH);
      c.fillStyle = `rgba(255,255,255,${0.02 + hh(1) * 0.05})`; c.fillRect(px + 1, py + 1, T - 2, TH - 2);
      c.strokeStyle = th.line; c.lineWidth = 1.5; c.strokeRect(px + 0.5, py + 0.5, T - 1, TH - 1);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(px + 2, py + 2, T - 4, 1.5);
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
    } else { // 玉砖 + 金线
      c.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? th.floor : th.floor2; c.fillRect(px, py, T, TH);
      c.fillStyle = `rgba(255,255,255,${0.04 + hh(1) * 0.08})`; c.fillRect(px, py, T, TH);
      c.strokeStyle = 'rgba(60,90,110,0.22)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, T - 1, TH - 1);
      c.strokeStyle = th.line; c.lineWidth = 1.6;
      if (x % 2 === 0) { c.beginPath(); c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + TH); c.stroke(); }
      if (y % 2 === 0) { c.beginPath(); c.moveTo(px, py + 0.5); c.lineTo(px + T, py + 0.5); c.stroke(); }
      if (hh(2) < 0.3) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + hh(3) * T, py + hh(4) * TH); c.lineTo(px + hh(5) * T, py + hh(6) * TH); c.stroke(); }
      if (hh(7) < 0.12) { c.fillStyle = 'rgba(232,248,255,0.4)'; ell(c, px + hh(8) * T, py + hh(9) * TH, 12, 8); }
    }
  }

  Tx.floor = function (room) {
    const ti = room.theme, th = G.Themes[ti], FS = Tx.FS;
    const w = room.w, h = room.h, tiles = room.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]);
    const cv = document.createElement('canvas'); cv.width = Math.round(w * T * FS); cv.height = Math.round(h * T * FS);
    const c = cv.getContext('2d'); c.scale(FS, FS);
    c.fillStyle = shade(th.base, -0.4); c.fillRect(0, 0, w * T, h * T);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y); if (t === 1) continue;
      drawFloorTile(c, th, ti, x, y, x * T, y * T);
    }
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
    // 门口亮带 + 墙根阴影
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y); if (t === 1) continue;
      const px = x * T, py = y * T;
      if (t === 4) { c.fillStyle = 'rgba(255,235,190,0.10)'; c.fillRect(px, py, T, T); }
      if (at(x, y - 1) === 1) { const g = c.createLinearGradient(0, py, 0, py + 22); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, T, 22); }
      if (at(x - 1, y) === 1) { const g = c.createLinearGradient(px, 0, px + 14, 0); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, 14, T); }
      if (at(x + 1, y) === 1) { const g = c.createLinearGradient(px + T, 0, px + T - 14, 0); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px + T - 14, py, 14, T); }
      if (at(x, y + 1) === 1) { const g = c.createLinearGradient(0, py + T, 0, py + T - 10); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py + T - 10, T, 10); }
    }
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
  Tx.web = function () {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.strokeStyle = 'rgba(235,235,245,0.9)'; x.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); x.stroke(); }
    for (let k = 1; k <= 4; k++) { x.beginPath(); x.arc(64, 64, k * 15, 0, TAU); x.stroke(); }
    return c;
  };
})();
