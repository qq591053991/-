'use strict';
/* 凡人问道 —— 美术：全部角色、怪物、场景均为 Canvas 程序化绘制，无任何图片素材 */
(function () {
  const G = window.G, U = G.U, TAU = G.TAU;
  const A = (G.Art = {});

  const shadeCache = {};
  function shade(hex, amt) {
    const key = hex + '|' + amt;
    if (shadeCache[key]) return shadeCache[key];
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return (shadeCache[key] = `rgb(${r | 0},${g | 0},${b | 0})`);
  }
  A.shade = shade;
  function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  const WHITE = () => '#ffffff';
  const SAME = (c) => c;
  const OUT = '#17131b';

  /* ============================ 场景主题 ============================ */
  G.Themes = [
    { // 0 神手谷 —— 月夜山谷庭院
      void: '#070b18', mist: '120,150,210',
      floor: '#5b6a61', floor2: '#52625a', line: 'rgba(14,22,22,0.42)', moss: '#3f6c47', grass: '#6aa860',
      face: '#cfc8b4', faceDark: '#a59d8a', base: '#67635c', top: '#343a47', topHi: '#505a6b',
      water: '#25546a', waterHi: '#86c8d4',
      ambient: [12, 18, 50, 0.44], lamp: '255,214,150',
      props: ['rock', 'bamboo', 'lantern', 'pine', 'bamboo', 'rock'],
      mote: 'firefly',
    },
    { // 1 血色禁地 —— 赤雾密林
      void: '#0d0507', mist: '200,70,80',
      floor: '#62533f', floor2: '#6d5c46', line: 'rgba(20,8,8,0.0)', moss: '#55633a', grass: '#c24a52',
      face: '#7a5a4c', faceDark: '#503a32', base: '#30221e', top: '#574236', topHi: '#8a5246',
      water: '#5c1a2a', waterHi: '#f08090',
      ambient: [30, 8, 18, 0.4], lamp: '255,150,130',
      props: ['deadtree', 'mushroom', 'rock', 'bones', 'deadtree', 'mushroom'],
      mote: 'spore',
    },
    { // 2 燕翎堡 —— 魔焰围城
      void: '#07050d', mist: '120,90,190',
      floor: '#55525f', floor2: '#4a4755', line: 'rgba(8,6,12,0.5)', moss: '#22202a', grass: '#5c1c26',
      face: '#575463', faceDark: '#3c3a47', base: '#292732', top: '#302e3a', topHi: '#4c4959',
      water: '#0a0812', waterHi: '#5a3a8a',
      ambient: [20, 8, 40, 0.48], lamp: '130,255,170',
      props: ['brazier', 'barricade', 'banner', 'rubble', 'barricade', 'rubble'],
      mote: 'ash',
    },
    { // 3 虚天殿 —— 冰火古殿
      void: '#040913', mist: '120,190,255',
      floor: '#9fb4c2', floor2: '#91a7b7', line: 'rgba(214,180,90,0.5)', moss: '#d8f0ff', grass: '#e8f8ff',
      face: '#2b4162', faceDark: '#1c2c47', base: '#131f38', top: '#a9c0cf', topHi: '#dcecf3',
      water: '#b83a0c', waterHi: '#ffd27a',
      ambient: [8, 18, 48, 0.42], lamp: '150,220,255',
      props: ['icecrystal', 'pillar', 'brazier2', 'statue', 'icecrystal', 'pillar'],
      mote: 'snow',
    },
  ];

  /* ============================ 人形角色 ============================ */
  A.human = function (ctx, o) {
    const L = o.look, s = o.scale || 1, t = o.t || 0;
    const cf = Math.cos(o.face), sf = Math.sin(o.face);
    const fx = cf >= 0 ? 1 : -1;
    const back = sf < -0.6, front = sf > 0.6;
    const C = o.flash > 0 ? WHITE : SAME;
    const OL = o.flash > 0 ? '#fff' : OUT;
    const wk = o.moving ? Math.sin(t * 13) : 0;
    const bob = o.moving ? Math.abs(Math.cos(t * 13)) * 1.8 : Math.sin(t * 2.4) * 0.7;
    const atk = o.atk || 0;
    const hair = L.hair || '#1c1a22';
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(fx * s, s);
    ctx.lineJoin = ctx.lineCap = 'round';

    // 脚
    ctx.fillStyle = C('#1b1820');
    ell(ctx, -4 + wk * 3.2, -1.6, 3.6, 2.1);
    ell(ctx, 4 - wk * 3.2, -1.6, 3.6, 2.1);
    ctx.translate(0, -bob);

    // 背后长发 / 背剑
    if (L.hat === 'crown' || L.longHair) {
      ctx.fillStyle = C(hair);
      ctx.beginPath(); ctx.moveTo(-7, -36); ctx.quadraticCurveTo(-13 - wk, -22, -9 - wk * 2, -10);
      ctx.lineTo(-3, -12); ctx.lineTo(-2, -34); ctx.fill();
    }
    if (L.backSword) {
      ctx.strokeStyle = C('#3b2f2a'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-10, -39); ctx.lineTo(3, -12); ctx.stroke();
      ctx.strokeStyle = C('#d8c27a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, -37); ctx.lineTo(-7, -39.5); ctx.stroke();
    }

    // 后臂
    ctx.fillStyle = C(shade(L.robe, -0.28));
    ctx.beginPath(); ctx.moveTo(-5, -26); ctx.quadraticCurveTo(-11, -20, -9.5 - wk * 2, -12.5);
    ctx.lineTo(-5.5 - wk * 2, -12.5); ctx.quadraticCurveTo(-5, -19, -3, -24); ctx.fill();

    // 袍身
    const sway = wk * 1.6;
    ctx.fillStyle = C(L.robe); ctx.strokeStyle = OL; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6.5, -27.5);
    ctx.quadraticCurveTo(-9, -16, -10.5 + sway, -4.5);
    ctx.quadraticCurveTo(0, -1.5, 10.5 + sway, -4.5);
    ctx.quadraticCurveTo(9, -16, 6.5, -27.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 袍身明暗
    ctx.fillStyle = C(shade(L.robe, -0.2));
    ctx.beginPath(); ctx.moveTo(-6.5, -27); ctx.quadraticCurveTo(-9, -16, -10.2 + sway, -5);
    ctx.quadraticCurveTo(-6, -4, -4 + sway, -3.6); ctx.quadraticCurveTo(-5, -16, -3.5, -27); ctx.fill();
    // 衣襟与腰带
    if (!back) {
      ctx.strokeStyle = C(L.trim); ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-3.4, -27.5); ctx.lineTo(1.6, -19.5); ctx.lineTo(1.6 + sway * 0.5, -4.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -27.5); ctx.lineTo(1.6, -19.5); ctx.stroke();
    }
    ctx.fillStyle = C(shade(L.trim, -0.15));
    ctx.fillRect(-8.2, -19.6, 16.4, 2.8);

    // 头
    const hy = -34.5;
    ctx.fillStyle = C(L.skin || '#efcfae'); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, hy, 7.8, 0, TAU); ctx.fill(); ctx.stroke();

    // 头发
    const hat = L.hat || 'bun';
    if (hat === 'hood') {
      ctx.fillStyle = C(shade(L.robe, 0.08)); ctx.strokeStyle = OL;
      ctx.beginPath(); ctx.moveTo(-8.6, -29); ctx.quadraticCurveTo(-11, -44, 0, -45.5);
      ctx.quadraticCurveTo(11, -44, 8.6, -29); ctx.quadraticCurveTo(0, -32, -8.6, -29); ctx.fill(); ctx.stroke();
      if (!back) {
        ctx.fillStyle = C('#0c0a10');
        ctx.beginPath(); ctx.ellipse(front ? 0 : 1.6, hy + 0.5, 5.2, 5.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = C(L.trim);
        circ(ctx, (front ? 0 : 1.8) - 2.2, hy, 1.1); circ(ctx, (front ? 0 : 1.8) + 2.2, hy, 1.1);
      }
    } else {
      ctx.fillStyle = C(hair);
      if (back) { ctx.beginPath(); ctx.arc(0, hy, 8.2, 0, TAU); ctx.fill(); }
      else {
        ctx.beginPath(); ctx.arc(0, hy, 8.2, Math.PI * 0.98, Math.PI * 2.02);
        ctx.quadraticCurveTo(4, hy - 4.5, -1, hy - 3.2); ctx.quadraticCurveTo(-5, hy - 2.5, -8.2, hy + 1.5); ctx.fill();
        if (!front) { ctx.beginPath(); ctx.arc(-1.5, hy + 0.5, 7.4, Math.PI * 0.55, Math.PI * 1.3); ctx.fill(); }
      }
      if (hat === 'bun' || hat === 'elder' || hat === 'player') {
        circ(ctx, -1, hy - 9.2, 3.3);
        ctx.strokeStyle = C(hat === 'player' ? '#7fe0c0' : L.trim); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-4.5, hy - 8); ctx.lineTo(2.5, hy - 8); ctx.stroke();
        if (hat === 'player') { // 发带
          ctx.beginPath(); ctx.moveTo(-4, hy - 8);
          ctx.quadraticCurveTo(-10, hy - 6 + wk, -12 - Math.sin(t * 5) * 1.5, hy + 1 + Math.sin(t * 6)); ctx.stroke();
        }
      }
      if (hat === 'band') {
        ctx.strokeStyle = C('#b03030'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8, hy - 2.6); ctx.lineTo(8, hy - 2.6); ctx.stroke();
      }
      if (hat === 'bamboo') {
        ctx.fillStyle = C('#b79b5e'); ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-13, hy - 3); ctx.lineTo(0, hy - 13); ctx.lineTo(13, hy - 3);
        ctx.quadraticCurveTo(0, hy + 0.5, -13, hy - 3); ctx.fill(); ctx.stroke();
      }
      if (hat === 'crown') {
        ctx.fillStyle = C('#e0b94a');
        ctx.beginPath(); ctx.moveTo(-4, hy - 7); ctx.lineTo(-4.5, hy - 12); ctx.lineTo(-1.5, hy - 9.5); ctx.lineTo(0, hy - 13.5);
        ctx.lineTo(1.5, hy - 9.5); ctx.lineTo(4.5, hy - 12); ctx.lineTo(4, hy - 7); ctx.fill();
      }
      if (!back) {
        // 眼睛
        const ex = front ? 0 : 1.9;
        if (hat === 'mask') {
          ctx.fillStyle = C('#e8e2d8');
          ctx.beginPath(); ctx.ellipse(ex, hy + 1, 5.6, 5.4, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = C('#b0202a'); ctx.fillRect(ex - 4, hy + 3, 8, 1.2);
        }
        ctx.fillStyle = C(hat === 'mask' ? '#111' : '#231a1a');
        ell(ctx, ex - 2.6, hy + 0.6, 1.05, 1.5); ell(ctx, ex + 2.9, hy + 0.6, 1.05, 1.5);
        if (hat === 'elder') {
          ctx.fillStyle = C(hair);
          ctx.beginPath(); ctx.moveTo(ex - 3.5, hy + 5); ctx.lineTo(ex + 0.5, hy + 15); ctx.lineTo(ex + 4, hy + 5); ctx.fill();
        }
      }
    }

    // 前臂 + 兵器
    const hx = U.lerp(9 + wk * 2, 15, atk), hyy = U.lerp(-13.5, -22, atk);
    const drawArm = () => {
      ctx.fillStyle = C(shade(L.robe, 0.1)); ctx.strokeStyle = OL; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(3.5, -27); ctx.quadraticCurveTo(9, -24, hx + 2.6, hyy + 0.5);
      ctx.lineTo(hx - 2.2, hyy + 3.4); ctx.quadraticCurveTo(4, -17, 2.5, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C(L.skin || '#efcfae'); circ(ctx, hx + 0.8, hyy + 2, 2.3);
    };
    const wp = L.weapon;
    if (wp === 'saber') {
      ctx.save(); ctx.translate(hx + 1, hyy + 2); ctx.rotate(U.lerp(-0.5, 1.4, atk > 0 ? 1 - atk : 0) - 0.4);
      ctx.fillStyle = C('#d5dbe4'); ctx.strokeStyle = OL; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 1.5); ctx.quadraticCurveTo(12, -1, 19, -9); ctx.quadraticCurveTo(11, -4.5, 0, -1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#4a3526'); ctx.fillRect(-4, -1.4, 5, 2.8);
      ctx.restore(); drawArm();
    } else if (wp === 'bow') {
      drawArm();
      ctx.strokeStyle = C('#7a4f2a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx - 3, hyy + 2, 11, -1.15, 1.15); ctx.stroke();
      ctx.strokeStyle = C('#e8e0d0'); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(hx - 3 + 11 * Math.cos(1.15), hyy + 2 - 11 * Math.sin(1.15));
      ctx.lineTo(hx - 3 - atk * 5 + 4, hyy + 2); ctx.lineTo(hx - 3 + 11 * Math.cos(1.15), hyy + 2 + 11 * Math.sin(1.15)); ctx.stroke();
    } else if (wp === 'staff') {
      ctx.strokeStyle = C('#5a4030'); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(hx + 1, -2); ctx.lineTo(hx + 1, -41); ctx.stroke();
      ctx.fillStyle = C(L.trim); circ(ctx, hx + 1, -43, 3.2 + atk * 1.6);
      if (!o.flash) { ctx.globalAlpha *= 0.35; circ(ctx, hx + 1, -43, 6 + atk * 4); ctx.globalAlpha /= 0.35; }
      drawArm();
    } else if (wp === 'silverhand') {
      drawArm();
      ctx.fillStyle = C('#e6edf5'); ctx.strokeStyle = C('#8fa0b8'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx + 1.2, hyy + 2, 3.4, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(hx + 3, hyy + 2 + i * 2); ctx.lineTo(hx + 8 + atk * 3, hyy + 1.5 + i * 3.4); ctx.stroke();
      }
    } else {
      drawArm();
    }
    ctx.restore();
  };

  /* ============================ 兽类与异物 ============================ */
  A.wolf = function (ctx, o) {
    const L = o.look, t = o.t, fx = Math.cos(o.face) >= 0 ? 1 : -1;
    const C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const run = o.moving ? Math.sin(t * (o.charge ? 26 : 14)) : 0;
    const st = o.charge ? 1.18 : 1, crouch = o.wind ? 3 : 0;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(fx * (o.scale || 1) * st, (o.scale || 1) / (o.charge ? 1.08 : 1));
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = C(L.dark); ctx.lineWidth = 3.2;
    const leg = (x, ph) => { ctx.beginPath(); ctx.moveTo(x, -8 + crouch); ctx.lineTo(x + run * ph * 5, -0.5); ctx.stroke(); };
    leg(-8, 1); leg(8, -1);
    ctx.fillStyle = C(L.fur); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    // 尾
    ctx.beginPath(); ctx.moveTo(-11, -14 + crouch); ctx.quadraticCurveTo(-20, -17 + run * 2, -22, -22 + run * 3 + crouch);
    ctx.quadraticCurveTo(-17, -12, -10, -10 + crouch); ctx.fill(); ctx.stroke();
    // 身
    ctx.beginPath(); ctx.ellipse(0, -12.5 + crouch, 13.5, 7.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.dark);
    ctx.beginPath(); ctx.ellipse(-2, -16.5 + crouch, 10, 3.6, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = C(L.fur); ctx.lineWidth = 3.4;
    const leg2 = (x, ph) => { ctx.beginPath(); ctx.moveTo(x, -8 + crouch); ctx.lineTo(x + run * ph * 5, -0.5); ctx.stroke(); };
    leg2(-5, -1); leg2(10, 1);
    // 头
    ctx.fillStyle = C(L.fur); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(8, -22 + crouch); ctx.lineTo(10, -28 + crouch); ctx.lineTo(14, -23 + crouch);
    ctx.quadraticCurveTo(19, -22, 24, -15.5 + crouch); ctx.lineTo(17, -12 + crouch); ctx.quadraticCurveTo(9, -10, 7, -16 + crouch); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.eye); circ(ctx, 15.5, -19 + crouch, 1.5);
    ctx.fillStyle = C('#1a1418'); circ(ctx, 23.4, -15.6 + crouch, 1.4);
    if (o.wind || o.charge) { ctx.fillStyle = C('#fff'); ctx.beginPath(); ctx.moveTo(18, -13 + crouch); ctx.lineTo(20, -10 + crouch); ctx.lineTo(21, -13.5 + crouch); ctx.fill(); }
    ctx.restore();
  };

  A.brute = function (ctx, o) {
    const L = o.look, t = o.t, fx = Math.cos(o.face) >= 0 ? 1 : -1;
    const C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const s = (o.scale || 1) * 1.15;
    const wk = o.moving ? Math.sin(t * 7) : 0;
    const bob = o.moving ? Math.abs(Math.cos(t * 7)) * 1.6 : Math.sin(t * 1.8) * 0.6;
    const up = o.wind || 0; // 抬臂蓄力 0..1
    const back = Math.sin(o.face) < -0.6;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(fx * s, s);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.fillStyle = C(L.dark);
    ctx.fillRect(-8 + wk * 2, -9, 6.5, 9); ctx.fillRect(1.5 - wk * 2, -9, 6.5, 9);
    ctx.translate(0, -bob);
    // 后臂
    ctx.fillStyle = C(shade(L.body, -0.25)); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(-13, -20 - up * 14, 4.6, 9, 0.2 - up * 0.8, 0, TAU); ctx.fill(); ctx.stroke();
    // 躯干
    ctx.fillStyle = C(L.body);
    ctx.beginPath(); ctx.moveTo(-14, -30); ctx.quadraticCurveTo(-15, -14, -9, -7); ctx.lineTo(9, -7);
    ctx.quadraticCurveTo(15, -14, 14, -30); ctx.quadraticCurveTo(0, -36, -14, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.dark);
    ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(9, -7); ctx.lineTo(8, -11); ctx.lineTo(-8, -11); ctx.fill();
    if (L.stone) {
      ctx.strokeStyle = C(L.eye); ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.moveTo(-6, -28); ctx.lineTo(-2, -21); ctx.lineTo(-5, -14); ctx.moveTo(5, -27); ctx.lineTo(3, -18); ctx.stroke();
      ctx.globalAlpha /= 0.8;
    } else {
      ctx.strokeStyle = C(shade(L.body, 0.25)); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-10, -24); ctx.lineTo(10, -24); ctx.moveTo(-11, -18); ctx.lineTo(11, -18); ctx.stroke();
    }
    // 头
    ctx.fillStyle = C(L.skin); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(1, -37, 6.4, 0, TAU); ctx.fill(); ctx.stroke();
    if (!back) {
      ctx.fillStyle = C(L.eye); circ(ctx, 1.2, -37.6, 1.3); circ(ctx, 5, -37.6, 1.3);
      if (L.talisman) {
        ctx.fillStyle = C('#f2d862'); ctx.fillRect(1.2, -43, 4, 9 + Math.sin(t * 6) * 0.6);
        ctx.fillStyle = C('#b0302a'); ctx.fillRect(2.6, -41, 1.2, 5);
      }
    }
    // 前臂
    ctx.fillStyle = C(shade(L.body, 0.12)); ctx.strokeStyle = OL;
    ctx.beginPath(); ctx.ellipse(13.5, -20 - up * 15, 5, 10, -0.2 + up * 0.9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.dark); circ(ctx, 14.5 + up * 6, -11.5 - up * 24, 4.4);
    ctx.restore();
  };

  A.bat = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME;
    const flap = Math.sin(t * 22);
    ctx.save(); ctx.translate(o.x, o.y - 4); ctx.scale(o.scale || 1, o.scale || 1);
    ctx.fillStyle = C(L.wing);
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * 3, -3);
      ctx.quadraticCurveTo(sx * 11, -10 - flap * 7, sx * 18, -4 - flap * 9);
      ctx.lineTo(sx * 14, -1 - flap * 4); ctx.lineTo(sx * 10, -2 - flap * 5); ctx.lineTo(sx * 6, 2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = C(L.body); ell(ctx, 0, -1, 5, 6);
    ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-3, -11); ctx.lineTo(-1, -6); ctx.moveTo(4, -5); ctx.lineTo(3, -11); ctx.lineTo(1, -6); ctx.fill();
    ctx.fillStyle = C(L.eye); circ(ctx, -2, -2.5, 1.1); circ(ctx, 2, -2.5, 1.1);
    ctx.restore();
  };

  A.toad = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const fx = Math.cos(o.face) >= 0 ? 1 : -1;
    const puff = 1 + (o.wind || 0) * 0.22 + Math.sin(t * 3) * 0.03;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(fx * (o.scale || 1), o.scale || 1);
    ctx.fillStyle = C(L.dark);
    ell(ctx, -11, -3, 6, 3.4); ell(ctx, 11, -3, 6, 3.4);
    ctx.fillStyle = C(L.body); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, -10 * puff, 14 * puff, 10 * puff, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(shade(L.body, 0.35));
    ctx.beginPath(); ctx.ellipse(3, -6 * puff, 9 * puff, 5 * puff, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = C(L.spot); circ(ctx, -6, -14 * puff, 2); circ(ctx, -1, -17 * puff, 1.5); circ(ctx, -9, -9 * puff, 1.4);
    ctx.fillStyle = C(L.body); ctx.strokeStyle = OL;
    ctx.beginPath(); ctx.arc(4, -19 * puff, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(10.5, -17 * puff, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.eye); circ(ctx, 4.6, -19 * puff, 1.8); circ(ctx, 11.1, -17 * puff, 1.8);
    ctx.fillStyle = C('#111'); ctx.fillRect(4, -20.2 * puff, 1.4, 2.4); ctx.fillRect(10.5, -18.2 * puff, 1.4, 2.4);
    ctx.strokeStyle = C(L.dark); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(2, -9 * puff); ctx.quadraticCurveTo(9, -6 * puff, 14, -10 * puff); ctx.stroke();
    ctx.restore();
  };

  A.centipede = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const cf = Math.cos(o.face), sf = Math.sin(o.face) * G.YS;
    const s = o.scale || 1, n = 6;
    const sp = o.moving ? (o.charge ? 24 : 12) : 3;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(s, s);
    ctx.lineCap = 'round';
    for (let i = n; i >= 0; i--) {
      const wig = Math.sin(t * sp - i * 0.9) * (o.charge ? 1.5 : 3.2);
      const px = -cf * i * 6.5 - sf * wig, py = -sf * i * 6.5 + cf * wig * G.YS;
      const r = i === 0 ? 7.5 : 6.6 - i * 0.45;
      ctx.strokeStyle = C(L.leg); ctx.lineWidth = 1.5;
      const lw = Math.sin(t * sp * 1.5 + i * 1.3) * 2.5;
      ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px - sf * 10 - cf * lw, py - 1 + cf * 5 * G.YS);
      ctx.moveTo(px, py - 5); ctx.lineTo(px + sf * 10 + cf * lw, py - 1 - cf * 5 * G.YS); ctx.stroke();
      ctx.fillStyle = C(i % 2 ? L.dark : L.body); ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(px, py - 6.5, r, r * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C(shade(L.body, 0.3)); ell(ctx, px - 1, py - 8.5, r * 0.5, r * 0.25);
      if (i === 0) {
        ctx.strokeStyle = C(L.leg); ctx.lineWidth = 2;
        const pin = (o.wind ? 0.9 : 0.5) + Math.sin(t * 8) * 0.12;
        for (const d of [-1, 1]) {
          const a = Math.atan2(sf, cf) + d * pin;
          ctx.beginPath(); ctx.moveTo(px + cf * 5, py - 6 + sf * 5);
          ctx.lineTo(px + Math.cos(a) * 14, py - 6 + Math.sin(a) * 12); ctx.stroke();
        }
        ctx.fillStyle = C(L.eye); circ(ctx, px + cf * 4 - sf * 2.5, py - 8 + sf * 3, 1.4); circ(ctx, px + cf * 4 + sf * 2.5, py - 8 + sf * 3, 1.4);
      }
    }
    ctx.restore();
  };

  A.flower = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const open = 0.55 + (o.wind || 0) * 0.45 + Math.sin(t * 2) * 0.05;
    const sw = Math.sin(t * 1.6) * 2;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(o.scale || 1, o.scale || 1);
    ctx.lineCap = 'round';
    ctx.fillStyle = C(shade(L.stem, -0.2));
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(d * 12, -9, d * 17, -2); ctx.quadraticCurveTo(d * 9, 0, 0, -2); ctx.fill(); }
    ctx.strokeStyle = C(L.stem); ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(-5, -14, sw, -24); ctx.stroke();
    ctx.translate(sw, -27);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.3;
      ctx.fillStyle = C(i % 2 ? L.petal : L.dark); ctx.strokeStyle = OL; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0);
      const ex = Math.cos(a) * 15 * open, ey = Math.sin(a) * 11 * open - (1 - open) * 9;
      ctx.quadraticCurveTo(ex * 0.5 - Math.sin(a) * 6, ey * 0.5 + Math.cos(a) * 4, ex, ey);
      ctx.quadraticCurveTo(ex * 0.5 + Math.sin(a) * 6, ey * 0.5 - Math.cos(a) * 4, 0, 0); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = C(L.core); circ(ctx, 0, -1, 4.5 + (o.wind || 0) * 2);
    ctx.fillStyle = C('#3a1020'); circ(ctx, 0, -1, 2.2);
    ctx.restore();
  };

  A.ghost = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME;
    const fx = Math.cos(o.face) >= 0 ? 1 : -1;
    ctx.save(); ctx.translate(o.x, o.y - 8 - Math.sin(t * 3) * 3); ctx.scale(fx * (o.scale || 1), o.scale || 1);
    ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha) * 0.82;
    const g = ctx.createLinearGradient(0, -34, 0, 6);
    g.addColorStop(0, C(L.body)); g.addColorStop(0.6, C(L.dark)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = o.flash > 0 ? '#fff' : g;
    ctx.beginPath(); ctx.moveTo(-9, -22); ctx.quadraticCurveTo(-10, -36, 0, -36); ctx.quadraticCurveTo(10, -36, 9, -22);
    ctx.quadraticCurveTo(10, -8, 5 + Math.sin(t * 5) * 3, 4); ctx.quadraticCurveTo(2, -4, -1 + Math.sin(t * 4 + 1) * 2, 6);
    ctx.quadraticCurveTo(-4, -4, -8 + Math.sin(t * 6 + 2) * 2, 2); ctx.quadraticCurveTo(-11, -10, -9, -22); ctx.fill();
    // 双爪
    ctx.strokeStyle = C(L.body); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const reach = (o.wind || 0) * 8;
    ctx.beginPath(); ctx.moveTo(6, -20); ctx.quadraticCurveTo(13, -20, 14 + reach, -14 - reach * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -19); ctx.quadraticCurveTo(-11, -16, -10 + reach, -11); ctx.stroke();
    ctx.fillStyle = C(L.eye); ell(ctx, -1.5, -27, 1.7, 2.6); ell(ctx, 5, -27, 1.7, 2.6);
    ctx.fillStyle = C('#081410'); ell(ctx, 2, -21, 2.4, 1.4 + (o.wind || 0) * 2);
    ctx.restore();
  };

  A.skull = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME;
    ctx.save(); ctx.translate(o.x, o.y - 6); ctx.scale(o.scale || 1, o.scale || 1);
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = C(L.dark);
    ctx.beginPath(); ctx.moveTo(-7, -2);
    ctx.quadraticCurveTo(-12 - Math.cos(o.face) * 10, -Math.sin(o.face) * 8 - 2 + Math.sin(t * 14) * 2, -Math.cos(o.face) * 20, -Math.sin(o.face) * 14);
    ctx.quadraticCurveTo(-Math.cos(o.face) * 8 + 4, 6, 7, -2); ctx.fill();
    ctx.fillStyle = C(L.body);
    ctx.beginPath(); ctx.arc(0, -6, 7.5, 0, TAU); ctx.fill(); ctx.fillRect(-4.5, -2, 9, 5);
    ctx.fillStyle = C('#0a1a14'); ell(ctx, -3, -6.5, 2.2, 2.6); ell(ctx, 3, -6.5, 2.2, 2.6);
    ctx.fillStyle = C(L.eye); circ(ctx, -3, -6.2, 1); circ(ctx, 3, -6.2, 1);
    ctx.fillStyle = C('#0a1a14'); ctx.fillRect(-3.5, 0.4, 1.2, 2.2); ctx.fillRect(-0.6, 0.4, 1.2, 2.2); ctx.fillRect(2.3, 0.4, 1.2, 2.2);
    ctx.restore();
  };

  A.crystal = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : '#1c3a58';
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(o.scale || 1, o.scale || 1);
    ctx.lineJoin = 'round';
    const shard = (x, h, w, lean, col) => {
      ctx.fillStyle = C(col); ctx.strokeStyle = OL; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - w, -2); ctx.lineTo(x - w * 0.6 + lean, -h * 0.75); ctx.lineTo(x + lean * 1.3, -h);
      ctx.lineTo(x + w * 0.7 + lean, -h * 0.7); ctx.lineTo(x + w, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C(shade(L.body, 0.5)); ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.moveTo(x - w * 0.3, -4); ctx.lineTo(x + lean, -h * 0.9); ctx.lineTo(x + w * 0.1, -4); ctx.fill();
      ctx.globalAlpha /= 0.6;
    };
    shard(-10, 22, 6, -3, L.dark); shard(10, 26, 6, 3, L.dark); shard(0, 40, 9, 0, L.body);
    const cy = -30 + Math.sin(t * 2.4) * 2, glow = 0.5 + (o.wind || 0) * 0.5;
    ctx.fillStyle = C(L.core); ctx.globalAlpha *= glow; circ(ctx, 0, cy, 5 + (o.wind || 0) * 3); ctx.globalAlpha /= glow;
    ctx.fillStyle = C('#12283c'); ell(ctx, 0, cy, 1.6, 3.2);
    ctx.restore();
  };

  A.flame = function (ctx, o) {
    const L = o.look, t = o.t, C = o.flash > 0 ? WHITE : SAME;
    const hot = o.wind || 0, s = (o.scale || 1) * (1 + hot * 0.3 + Math.sin(t * (10 + hot * 30)) * 0.05);
    ctx.save(); ctx.translate(o.x, o.y - 6); ctx.scale(s, s);
    const lick = (w, h, col, ph) => {
      ctx.fillStyle = C(col);
      ctx.beginPath(); ctx.moveTo(-w, -4);
      ctx.quadraticCurveTo(-w * 1.1, -h * 0.6, Math.sin(t * 9 + ph) * 3 - 2, -h);
      ctx.quadraticCurveTo(w * 0.2, -h * 0.75, 3 + Math.sin(t * 11 + ph) * 2, -h * 0.82);
      ctx.quadraticCurveTo(w * 1.2, -h * 0.5, w, -4); ctx.quadraticCurveTo(0, 5, -w, -4); ctx.fill();
    };
    lick(11, 30, L.dark, 0); lick(8.5, 24, L.body, 1.7); lick(5, 15, L.core, 3.1);
    ctx.fillStyle = C('#3a1408'); ell(ctx, -3, -8, 1.4, 2.2); ell(ctx, 3, -8, 1.4, 2.2);
    ctx.restore();
  };

  A.puppet = function (ctx, o) {
    const L = o.look, t = o.t, fx = Math.cos(o.face) >= 0 ? 1 : -1;
    const C = o.flash > 0 ? WHITE : SAME, OL = o.flash > 0 ? '#fff' : OUT;
    const wk = o.moving ? Math.sin(t * 12) : 0, atk = o.atk || 0;
    ctx.save(); ctx.translate(o.x, o.y); ctx.scale(fx * (o.scale || 1), o.scale || 1);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = C(L.dark); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(-5 + wk * 3, -1); ctx.moveTo(4, -12); ctx.lineTo(5 - wk * 3, -1); ctx.stroke();
    ctx.fillStyle = C(L.body); ctx.strokeStyle = OL; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-9, -29); ctx.lineTo(9, -29); ctx.lineTo(6.5, -11); ctx.lineTo(-6.5, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C(L.dark); ctx.fillRect(-6, -24, 12, 2.4); circ(ctx, 0, -18, 2.6);
    ctx.fillStyle = C(L.eye); circ(ctx, 0, -18, 1.3);
    ctx.fillStyle = C(L.body); ctx.strokeStyle = OL;
    ctx.beginPath(); ctx.roundRect(-6.5, -42, 13, 12, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C('#111'); ctx.fillRect(-3, -38, 9, 3);
    ctx.fillStyle = C(L.eye); ctx.fillRect(1 + Math.sin(t * 3) * 2, -38, 3, 3);
    // 弩臂
    ctx.strokeStyle = C(L.dark); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, -26); ctx.lineTo(15 - atk * 3, -22); ctx.stroke();
    ctx.strokeStyle = C(L.body); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(15 - atk * 3, -29); ctx.quadraticCurveTo(20 - atk * 3, -22, 15 - atk * 3, -15); ctx.stroke();
    ctx.restore();
  };

  /* 墨蛟：segs 为屏幕坐标节点数组 [{x,y,r}]，0 为头 */
  A.jiao = function (ctx, segs, L, t, flash, face, mouth) {
    const C = flash > 0 ? WHITE : SAME, OL = flash > 0 ? '#fff' : '#05070c';
    const order = segs.map((s, i) => i).sort((a, b) => segs[a].y - segs[b].y || b - a);
    ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
    for (const i of order) {
      const s = segs[i];
      if (i === 0) continue;
      const lift = s.z || 0, r = s.r;
      ctx.fillStyle = C(L.body); ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(s.x, s.y - r * 0.75 - lift, r, r * 0.86, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C(L.belly); ctx.globalAlpha *= 0.55;
      ell(ctx, s.x, s.y - r * 0.4 - lift, r * 0.7, r * 0.34); ctx.globalAlpha /= 0.55;
      ctx.fillStyle = C(shade(L.body, 0.22));
      ell(ctx, s.x - r * 0.25, s.y - r * 1.2 - lift, r * 0.45, r * 0.2);
      if (i % 2 === 0 && i < segs.length - 2) { // 背鳍
        ctx.fillStyle = C(L.dark);
        ctx.beginPath(); ctx.moveTo(s.x - 4, s.y - r * 1.5 - lift); ctx.lineTo(s.x, s.y - r * 2.1 - lift - Math.sin(t * 4 + i) * 1.5); ctx.lineTo(s.x + 4, s.y - r * 1.5 - lift); ctx.fill();
      }
    }
    // 头
    const h = segs[0], lift = h.z || 0, r = h.r;
    const cf = Math.cos(face), sf = Math.sin(face);
    ctx.save(); ctx.translate(h.x, h.y - r * 0.8 - lift);
    const fx = cf >= 0 ? 1 : -1; ctx.scale(fx, 1);
    const tilt = Math.atan2(sf * G.YS, Math.abs(cf)) * 0.6; ctx.rotate(tilt);
    // 角
    ctx.strokeStyle = C('#c9b88a'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, -r * 0.7); ctx.quadraticCurveTo(-14, -r * 1.5, -22, -r * 1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -r * 0.8); ctx.quadraticCurveTo(-6, -r * 1.8, -15, -r * 1.75); ctx.stroke();
    // 颅
    ctx.fillStyle = C(L.body); ctx.strokeStyle = OL; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(-r, -r, 2, -r * 0.9);
    ctx.quadraticCurveTo(r * 1.2, -r * 0.7, r * 1.75, -2 - mouth * 5);
    ctx.lineTo(r * 0.5, 2 - mouth * 2); ctx.lineTo(r * 1.6, 5 + mouth * 7); ctx.quadraticCurveTo(r * 0.6, r * 0.95, -r * 0.5, r * 0.8);
    ctx.quadraticCurveTo(-r, r * 0.5, -r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (mouth > 0.2) { ctx.fillStyle = C('#7a1420'); ctx.beginPath(); ctx.moveTo(r * 0.55, 2); ctx.lineTo(r * 1.5, -1 - mouth * 4); ctx.lineTo(r * 1.45, 5 + mouth * 6); ctx.fill(); }
    ctx.fillStyle = C(L.eye); ell(ctx, r * 0.55, -r * 0.42, 3.6, 2.6);
    ctx.fillStyle = C('#111'); ell(ctx, r * 0.6, -r * 0.42, 1.1, 2.4);
    // 须
    ctx.strokeStyle = C(L.belly); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(r * 1.5, -3); ctx.quadraticCurveTo(r * 2.2, -10 + Math.sin(t * 3) * 4, r * 2.6, -2 + Math.sin(t * 2.5) * 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 1.4, 4); ctx.quadraticCurveTo(r * 2, 12 + Math.sin(t * 3.4) * 3, r * 2.4, 8 + Math.cos(t * 2.8) * 5); ctx.stroke();
    ctx.restore();
    ctx.restore();
  };

  A.drawEnemy = function (ctx, kind, o) {
    const f = A[kind]; if (f) f(ctx, o);
  };

  /* ============================ 场景物件（预渲染精灵） ============================ */
  const propCache = {};
  A.prop = function (kind, v) {
    const key = kind + v;
    if (propCache[key]) return propCache[key];
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 150;
    const c = cv.getContext('2d'); c.translate(60, 128);
    c.lineJoin = c.lineCap = 'round';
    const h = (i) => U.hash(v * 7 + i, key.length * 13 + i, 5);
    const rock = (x, y, w, hh, col) => {
      c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x - w, y); c.lineTo(x - w * 0.8, y - hh * 0.6); c.lineTo(x - w * 0.2, y - hh);
      c.lineTo(x + w * 0.5, y - hh * 0.85); c.lineTo(x + w, y - hh * 0.3); c.lineTo(x + w * 0.9, y); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = shade(col.startsWith('#') ? col : '#888888', 0.2); c.globalAlpha = 0.5;
      c.beginPath(); c.moveTo(x - w * 0.7, y - hh * 0.6); c.lineTo(x - w * 0.2, y - hh); c.lineTo(x + w * 0.4, y - hh * 0.85); c.lineTo(x - w * 0.1, y - hh * 0.55); c.fill();
      c.globalAlpha = 1;
    };
    switch (kind) {
      case 'rock':
        rock(-2, 4, 19, 26 + h(1) * 10, '#6b727c'); rock(11, 7, 10, 14, '#5a616b');
        c.fillStyle = '#4b7a4c'; c.globalAlpha = 0.7; ell(c, -8, -6, 7, 3); c.globalAlpha = 1;
        break;
      case 'bamboo':
        for (let i = 0; i < 5; i++) {
          const x = -14 + i * 7 + h(i) * 4, hh = 70 + h(i + 9) * 40, lean = (h(i + 3) - 0.5) * 12;
          c.strokeStyle = i % 2 ? '#4f8f52' : '#3f7a48'; c.lineWidth = 4;
          c.beginPath(); c.moveTo(x, 4); c.lineTo(x + lean, 4 - hh); c.stroke();
          c.strokeStyle = '#2c5a36'; c.lineWidth = 1;
          for (let k = 1; k < 6; k++) { const yy = 4 - (hh * k) / 6, xx = x + (lean * k) / 6; c.beginPath(); c.moveTo(xx - 2.4, yy); c.lineTo(xx + 2.4, yy); c.stroke(); }
          c.fillStyle = i % 2 ? '#5fae5c' : '#4a9450';
          for (let k = 0; k < 4; k++) {
            const yy = 4 - hh * (0.55 + k * 0.13), xx = x + lean * (0.55 + k * 0.13), d = k % 2 ? 1 : -1;
            c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + d * 9, yy - 7, xx + d * 17, yy + 1); c.quadraticCurveTo(xx + d * 8, yy - 1, xx, yy); c.fill();
          }
        }
        break;
      case 'lantern': case 'brazier': case 'brazier2': {
        const stone = kind === 'lantern';
        c.fillStyle = stone ? '#7c8088' : '#3a3540'; c.strokeStyle = OUT; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-11, 5); c.lineTo(-8, -4); c.lineTo(8, -4); c.lineTo(11, 5); c.closePath(); c.fill(); c.stroke();
        c.fillRect(-3.5, -24, 7, 20); c.strokeRect(-3.5, -24, 7, 20);
        if (stone) {
          c.beginPath(); c.rect(-9, -40, 18, 16); c.fill(); c.stroke();
          c.fillStyle = '#ffdc8a'; c.fillRect(-5.5, -37, 11, 10);
          c.fillStyle = '#5a5e68'; c.beginPath(); c.moveTo(-15, -40); c.quadraticCurveTo(0, -56, 15, -40); c.closePath(); c.fill(); c.stroke();
          circ(c, 0, -51, 2.6);
        } else {
          c.beginPath(); c.moveTo(-13, -34); c.quadraticCurveTo(0, -18, 13, -34); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = '#1a181e'; ell(c, 0, -34, 13, 3.4);
        }
        break;
      }
      case 'pine': {
        c.strokeStyle = '#4a3528'; c.lineWidth = 8;
        c.beginPath(); c.moveTo(0, 4); c.quadraticCurveTo(-8, -30, 4, -62); c.stroke();
        c.lineWidth = 4; c.beginPath(); c.moveTo(-2, -36); c.lineTo(-26, -52); c.moveTo(2, -44); c.lineTo(26, -60); c.stroke();
        const tuft = (x, y, w) => {
          c.fillStyle = '#254a36'; c.strokeStyle = '#122a1e'; c.lineWidth = 1.2;
          c.beginPath(); c.ellipse(x, y, w, w * 0.42, 0, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = '#3a6e4c'; ell(c, x - 2, y - w * 0.14, w * 0.75, w * 0.22);
        };
        tuft(-26, -56, 20); tuft(26, -64, 19); tuft(4, -78, 24); tuft(-6, -96, 16);
        break;
      }
      case 'deadtree': {
        c.strokeStyle = '#2a1a1c'; c.lineWidth = 9;
        c.beginPath(); c.moveTo(0, 4); c.quadraticCurveTo(6, -28, -4, -58); c.stroke();
        c.lineWidth = 4.5;
        c.beginPath(); c.moveTo(1, -30); c.quadraticCurveTo(18, -44, 28, -66); c.moveTo(-3, -46); c.quadraticCurveTo(-18, -58, -26, -78); c.moveTo(-4, -58); c.quadraticCurveTo(4, -74, 0, -92); c.stroke();
        for (let i = 0; i < 16; i++) {
          const a = h(i) * TAU, rr = 10 + h(i + 20) * 22, cx = [28, -26, 0][i % 3], cy = [-68, -80, -92][i % 3];
          c.fillStyle = ['#a8303c', '#c2424a', '#7a1f2c'][i % 3]; c.globalAlpha = 0.9;
          ell(c, cx + Math.cos(a) * rr * 0.7, cy + Math.sin(a) * rr * 0.45, 5 + h(i + 40) * 4, 3 + h(i + 50) * 2, a);
        }
        c.globalAlpha = 1;
        break;
      }
      case 'mushroom': {
        const shroom = (x, y, s, col) => {
          c.fillStyle = '#d9c9b8'; c.strokeStyle = OUT; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(x - 3 * s, y); c.quadraticCurveTo(x - 2 * s, y - 14 * s, x - 2 * s, y - 20 * s); c.lineTo(x + 2 * s, y - 20 * s); c.quadraticCurveTo(x + 2 * s, y - 10 * s, x + 3.5 * s, y); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = col;
          c.beginPath(); c.moveTo(x - 12 * s, y - 18 * s); c.quadraticCurveTo(x - 10 * s, y - 34 * s, x, y - 34 * s); c.quadraticCurveTo(x + 10 * s, y - 34 * s, x + 12 * s, y - 18 * s); c.quadraticCurveTo(x, y - 22 * s, x - 12 * s, y - 18 * s); c.fill(); c.stroke();
          c.fillStyle = '#ffe9c8'; circ(c, x - 5 * s, y - 26 * s, 1.8 * s); circ(c, x + 3 * s, y - 29 * s, 1.4 * s); circ(c, x + 6 * s, y - 23 * s, 1.2 * s);
        };
        shroom(-8, 4, 1.25, '#d2506a'); shroom(11, 6, 0.85, '#e07a5a'); shroom(-18, 7, 0.6, '#c23a5a');
        break;
      }
      case 'bones': {
        c.strokeStyle = '#d8cfc0'; c.lineWidth = 3.4;
        for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-16 + i * 7, 4); c.quadraticCurveTo(-18 + i * 7, -18, -6 + i * 6, -24 - (i % 2) * 5); c.stroke(); }
        c.fillStyle = '#e4dccc'; c.strokeStyle = OUT; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(16, -6, 10, 8, 0.2, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = '#1c1416'; ell(c, 13, -7, 2.4, 3); ell(c, 20, -6, 2.2, 2.8);
        break;
      }
      case 'barricade': {
        c.strokeStyle = '#4a382c'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 4); c.stroke();
        c.lineWidth = 4.5;
        for (let i = 0; i < 4; i++) {
          const x = -16 + i * 11;
          c.strokeStyle = '#5c4636'; c.beginPath(); c.moveTo(x - 6, 6); c.lineTo(x + 7, -30); c.stroke();
          c.fillStyle = '#b8bcc4'; c.beginPath(); c.moveTo(x + 5, -27); c.lineTo(x + 10, -40); c.lineTo(x + 9.5, -27); c.fill();
        }
        break;
      }
      case 'banner': {
        c.strokeStyle = '#3a2c24'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(0, 5); c.lineTo(0, -84); c.stroke();
        c.fillStyle = '#6a1420'; c.strokeStyle = OUT; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(1, -82); c.lineTo(28, -78); c.lineTo(24, -60); c.lineTo(29, -42); c.lineTo(1, -40); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#e0b84a'; c.font = 'bold 20px serif'; c.textAlign = 'center'; c.fillText('魔', 14, -54);
        c.fillStyle = '#4a4650'; c.beginPath(); c.moveTo(-9, 5); c.lineTo(-6, -4); c.lineTo(6, -4); c.lineTo(9, 5); c.fill();
        break;
      }
      case 'rubble':
        rock(-6, 5, 16, 18, '#55525e'); rock(10, 7, 11, 12, '#46434f'); rock(-16, 8, 7, 8, '#605d6a');
        c.strokeStyle = '#3a2c24'; c.lineWidth = 4; c.beginPath(); c.moveTo(-4, -8); c.lineTo(20, -26); c.stroke();
        break;
      case 'icecrystal': {
        const sh = (x, hh, w, lean, col) => {
          c.fillStyle = col; c.strokeStyle = '#1c4a6a'; c.lineWidth = 1.3;
          c.beginPath(); c.moveTo(x - w, 4); c.lineTo(x - w * 0.6 + lean, -hh * 0.8); c.lineTo(x + lean * 1.4, -hh); c.lineTo(x + w * 0.7 + lean, -hh * 0.72); c.lineTo(x + w, 4); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.5)';
          c.beginPath(); c.moveTo(x - w * 0.3, 0); c.lineTo(x + lean, -hh * 0.9); c.lineTo(x + w * 0.1, 0); c.fill();
        };
        sh(-13, 34, 8, -6, '#6ab4e0'); sh(13, 28, 7, 6, '#7cc4ec'); sh(0, 58, 11, 1, '#9fdcff');
        break;
      }
      case 'pillar': {
        c.fillStyle = '#7f98a8'; c.strokeStyle = OUT; c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(0, 2, 15, 7, 0, 0, TAU); c.fill(); c.stroke();
        const g = c.createLinearGradient(-11, 0, 11, 0);
        g.addColorStop(0, '#6f8a9c'); g.addColorStop(0.4, '#cfe2ea'); g.addColorStop(1, '#5c7688');
        c.fillStyle = g; c.fillRect(-11, -72, 22, 74); c.strokeRect(-11, -72, 22, 74);
        c.fillStyle = '#d9b45a'; c.fillRect(-12, -66, 24, 3); c.fillRect(-12, -8, 24, 3);
        c.fillStyle = '#a9c0cf'; c.beginPath(); c.ellipse(0, -72, 15, 7, 0, 0, TAU); c.fill(); c.stroke();
        break;
      }
      case 'statue': {
        c.fillStyle = '#5c7080'; c.strokeStyle = OUT; c.lineWidth = 1.4;
        c.fillRect(-15, -8, 30, 12); c.strokeRect(-15, -8, 30, 12);
        c.fillStyle = '#8fa4b4';
        c.beginPath(); c.moveTo(-10, -8); c.quadraticCurveTo(-13, -30, -7, -42); c.lineTo(7, -42); c.quadraticCurveTo(13, -30, 10, -8); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.arc(0, -50, 8, 0, TAU); c.fill(); c.stroke();
        circ(c, 0, -60, 3.5);
        c.strokeStyle = '#5c7080'; c.lineWidth = 3; c.beginPath(); c.moveTo(8, -34); c.lineTo(16, -62); c.stroke();
        break;
      }
    }
    return (propCache[key] = { cv, ax: 60, ay: 128 });
  };
  A.PROP_LIGHT = { lantern: { z: 34, r: 150, c: '255,214,150' }, mushroom: { z: 20, r: 100, c: '255,120,150' },
    brazier: { z: 38, r: 160, c: '130,255,170' }, brazier2: { z: 38, r: 160, c: '140,210,255' }, icecrystal: { z: 30, r: 110, c: '150,220,255' } };

  /* ============================ 房间烘焙：地面与墙体 ============================ */
  const HN = 56, HL = 16, HI = 30, HMAX = 56;
  A.HN = HN; A.HL = HL; A.HI = HI;

  function wallH(room, x, y) {
    if (y === 0) return HN;
    if (x === 0 || x === room.w - 1 || y === room.h - 1) return HL;
    return HI;
  }
  A.wallH = wallH;

  function drawFloorTile(c, th, ti, x, y, px, py, T, TH) {
    const hh = (i) => U.hash(x, y, i);
    if (ti === 0) { // 石板庭院
      c.fillStyle = (x + y) % 2 ? th.floor : th.floor2; c.fillRect(px, py, T, TH);
      c.fillStyle = `rgba(255,255,255,${0.02 + hh(1) * 0.05})`; c.fillRect(px + 1, py + 1, T - 2, TH - 2);
      c.strokeStyle = th.line; c.lineWidth = 1.5; c.strokeRect(px + 0.5, py + 0.5, T - 1, TH - 1);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(px + 2, py + 2, T - 4, 1.5);
      if (hh(2) < 0.22) { c.strokeStyle = 'rgba(10,16,16,0.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + hh(3) * T, py + 3); c.lineTo(px + hh(4) * T, py + TH * 0.5); c.lineTo(px + hh(5) * T, py + TH - 3); c.stroke(); }
      if (hh(6) < 0.3) { c.fillStyle = th.moss; c.globalAlpha = 0.45; ell(c, px + hh(7) * T, py + hh(8) * TH, 8 + hh(9) * 9, 4 + hh(10) * 4); c.globalAlpha = 1; }
    } else if (ti === 1) { // 林地泥土
      c.fillStyle = th.floor; c.fillRect(px, py, T, TH);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? th.floor2 : 'rgba(30,14,14,0.35)'; c.globalAlpha = 0.6;
        ell(c, px + hh(i * 3 + 1) * T, py + hh(i * 3 + 2) * TH, 7 + hh(i * 3 + 3) * 14, 3 + hh(i + 20) * 6);
      }
      c.globalAlpha = 1;
      if (hh(30) < 0.25) { c.fillStyle = th.moss; c.globalAlpha = 0.5; ell(c, px + hh(31) * T, py + hh(32) * TH, 10, 5); c.globalAlpha = 1; }
      if (hh(33) < 0.3) { c.fillStyle = '#6c5a52'; circ(c, px + hh(34) * T, py + hh(35) * TH, 1.5 + hh(36) * 2); }
    } else if (ti === 2) { // 城砖
      c.fillStyle = th.floor2; c.fillRect(px, py, T, TH);
      const off = y % 2 ? T / 2 : 0;
      for (let k = -1; k < 2; k++) {
        const bx = px + k * T + off;
        const x0 = Math.max(px, bx), x1 = Math.min(px + T, bx + T);
        if (x1 <= x0) continue;
        c.fillStyle = U.hash(x * 2 + k + (y % 2), y, 2) > 0.5 ? th.floor : shade(th.floor, -0.08);
        c.fillRect(x0 + 1, py + 1, x1 - x0 - 2, TH - 2);
      }
      if (hh(6) < 0.1) { c.fillStyle = 'rgba(8,6,10,0.22)'; ell(c, px + hh(7) * T, py + hh(8) * TH, 20, 10); ell(c, px + hh(7) * T + 4, py + hh(8) * TH + 1, 11, 5); }
      if (hh(9) < 0.07) { c.fillStyle = th.grass; c.globalAlpha = 0.5; ell(c, px + hh(10) * T, py + hh(11) * TH, 11, 5); c.globalAlpha = 1; }
    } else { // 玉砖 + 金线
      c.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? th.floor : th.floor2; c.fillRect(px, py, T, TH);
      c.fillStyle = `rgba(255,255,255,${0.04 + hh(1) * 0.08})`; c.fillRect(px, py, T, TH);
      c.strokeStyle = 'rgba(60,90,110,0.22)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, T - 1, TH - 1);
      c.strokeStyle = th.line; c.lineWidth = 1.6;
      if (x % 2 === 0) { c.beginPath(); c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + TH); c.stroke(); }
      if (y % 2 === 0) { c.beginPath(); c.moveTo(px, py + 0.5); c.lineTo(px + T, py + 0.5); c.stroke(); }
      if (hh(2) < 0.3) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + hh(3) * T, py + hh(4) * TH); c.lineTo(px + hh(5) * T, py + hh(6) * TH); c.stroke(); }
      if (hh(7) < 0.12) { c.fillStyle = 'rgba(232,248,255,0.4)'; ell(c, px + hh(8) * T, py + hh(9) * TH, 12, 5); }
    }
  }

  function drawGrass(c, th, ti, px, py, x, y, T, TH) {
    const hh = (i) => U.hash(x, y, i + 50);
    if (ti === 3 || ti === 2) return;
    if (hh(0) > (ti === 1 ? 0.3 : 0.2)) return;
    const n = 2 + Math.floor(hh(1) * 3);
    c.strokeStyle = th.grass; c.lineWidth = 1.3; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const gx = px + 6 + hh(i + 2) * (T - 12), gy = py + 8 + hh(i + 6) * (TH - 12);
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + k * 3, gy - 5 - hh(i + k + 12) * 4); c.stroke(); }
    }
  }

  function wallFaceDetail(c, th, ti, x, px, top, hgt, T, seed) {
    const hh = (i) => U.hash(x, seed, i + 90);
    const g = c.createLinearGradient(0, top, 0, top + hgt);
    g.addColorStop(0, shade(th.face, -0.22)); g.addColorStop(0.18, th.face); g.addColorStop(1, th.faceDark);
    c.fillStyle = g; c.fillRect(px, top, T, hgt);
    if (hgt < 24) { c.fillStyle = th.base; c.fillRect(px, top + hgt - 5, T, 5); return; }
    if (ti === 0) {
      c.fillStyle = th.base; c.fillRect(px, top + hgt - 10, T, 10);
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(px, top + hgt - 10, T, 1.5);
      if (x % 4 === 1) { c.fillStyle = '#5a3d2c'; c.fillRect(px + T / 2 - 3, top + 4, 6, hgt - 14); }
      if (x % 4 === 3) { // 漏窗
        c.fillStyle = '#2a2c34'; c.beginPath(); c.arc(px + T / 2, top + 22, 10, 0, TAU); c.fill();
        c.strokeStyle = '#8a8272'; c.lineWidth = 1.6; c.beginPath(); c.arc(px + T / 2, top + 22, 10, 0, TAU);
        c.moveTo(px + T / 2 - 10, top + 22); c.lineTo(px + T / 2 + 10, top + 22); c.moveTo(px + T / 2, top + 12); c.lineTo(px + T / 2, top + 32); c.stroke();
      }
      if (hh(1) < 0.4) { c.fillStyle = 'rgba(60,70,60,0.18)'; ell(c, px + hh(2) * T, top + 14 + hh(3) * 20, 10, 14); }
    } else if (ti === 1) {
      c.strokeStyle = 'rgba(20,10,10,0.45)'; c.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { const yy = top + 8 + i * 15 + hh(i) * 6; c.beginPath(); c.moveTo(px, yy); c.quadraticCurveTo(px + T / 2, yy + (hh(i + 4) - 0.5) * 10, px + T, yy + (hh(i + 8) - 0.5) * 4); c.stroke(); }
      c.fillStyle = th.base; c.fillRect(px, top + hgt - 6, T, 6);
      if (hh(12) < 0.5) { // 藤蔓
        c.strokeStyle = '#3c2a22'; c.lineWidth = 1.6; const vx = px + 6 + hh(13) * (T - 12), vl = 16 + hh(14) * 26;
        c.beginPath(); c.moveTo(vx, top); c.quadraticCurveTo(vx + 5, top + vl * 0.5, vx - 2, top + vl); c.stroke();
        c.fillStyle = '#a8303c'; for (let i = 0; i < 4; i++) ell(c, vx + (i % 2 ? 4 : -3), top + 5 + (vl * i) / 4, 3.4, 2);
      }
    } else if (ti === 2) {
      c.strokeStyle = 'rgba(10,8,14,0.5)'; c.lineWidth = 1.2;
      for (let r = 0; r < 4; r++) {
        const yy = top + 4 + r * 13; c.beginPath(); c.moveTo(px, yy); c.lineTo(px + T, yy); c.stroke();
        const o = r % 2 ? T / 2 : 0;
        c.beginPath(); c.moveTo(px + o, yy); c.lineTo(px + o, yy + 13); c.moveTo(px + (o + T / 2) % T, yy); c.stroke();
      }
      c.fillStyle = th.base; c.fillRect(px, top + hgt - 5, T, 5);
      if (hh(1) < 0.2) { c.fillStyle = 'rgba(90,20,30,0.4)'; ell(c, px + hh(2) * T, top + 20 + hh(3) * 20, 8, 12); }
    } else {
      c.fillStyle = '#d9b45a'; c.fillRect(px, top + 5, T, 2); c.fillRect(px, top + hgt - 9, T, 2);
      c.fillStyle = th.base; c.fillRect(px, top + hgt - 7, T, 7);
      if (x % 2 === 0) { // 云纹
        c.strokeStyle = 'rgba(217,180,90,0.75)'; c.lineWidth = 1.5;
        const cx = px + T / 2, cy = top + hgt / 2 - 1;
        c.beginPath(); c.arc(cx - 6, cy, 6, Math.PI * 0.2, Math.PI * 1.9); c.arc(cx + 6, cy + 1, 6, Math.PI * 1.2, Math.PI * 2.9); c.stroke();
      } else {
        c.strokeStyle = 'rgba(120,200,255,0.4)'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(px + T / 2, top + 12); c.lineTo(px + T / 2, top + hgt - 14); c.stroke();
      }
    }
  }

  function wallTopDetail(c, th, ti, x, y, px, py, T, TH) {
    const hh = (i) => U.hash(x, y, i + 130);
    c.fillStyle = th.top; c.fillRect(px, py, T, TH);
    if (ti === 0) { // 瓦片
      c.strokeStyle = th.topHi; c.lineWidth = 1.2;
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
        const cx = px + k * 12 + 6 + (r % 2 ? 6 : 0), cy = py + r * 9 + 3;
        c.beginPath(); c.arc(cx, cy, 6, 0.15, Math.PI - 0.15); c.stroke();
      }
    } else if (ti === 1) {
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? th.topHi : shade(th.top, 0.12); c.globalAlpha = 0.5; ell(c, px + hh(i) * T, py + hh(i + 4) * TH, 9 + hh(i + 8) * 8, 5); }
      c.globalAlpha = 1;
    } else if (ti === 2) {
      c.fillStyle = th.topHi; c.fillRect(px + 2, py + 2, T / 2 - 3, TH - 4); c.fillRect(px + T / 2 + 1, py + 2, T / 2 - 3, TH - 4);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(px + 2, py + TH - 6, T - 4, 4);
    } else {
      c.fillStyle = th.topHi; c.fillRect(px + 3, py + 3, T - 6, TH - 6);
      c.strokeStyle = 'rgba(217,180,90,0.7)'; c.lineWidth = 1.2; c.strokeRect(px + 5.5, py + 5.5, T - 11, TH - 11);
    }
  }

  A.bakeRoom = function (room) {
    const ti = room.theme, th = G.Themes[ti], T = G.TILE, TH = T * G.YS;
    const w = room.w, h = room.h, tiles = room.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]);
    const cv = document.createElement('canvas'); cv.width = w * T; cv.height = h * TH;
    const c = cv.getContext('2d');
    c.fillStyle = shade(th.base, -0.4); c.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y);
      if (t === 1) continue;
      drawFloorTile(c, th, ti, x, y, x * T, y * TH, T, TH);
      if (t === 4) { c.fillStyle = 'rgba(255,235,190,0.10)'; c.fillRect(x * T, y * TH, T, TH); }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 0) drawGrass(c, th, ti, x * T, y * TH, x, y, T, TH);
    // 水面 / 岩浆 / 深渊
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) !== 3) continue;
      const px = x * T, py = y * TH, w3 = (ax, ay) => at(ax, ay) === 3, RR = 14;
      c.save(); c.beginPath();
      c.roundRect(px, py, T, TH, [!w3(x - 1, y) && !w3(x, y - 1) ? RR : 0, !w3(x + 1, y) && !w3(x, y - 1) ? RR : 0, !w3(x + 1, y) && !w3(x, y + 1) ? RR : 0, !w3(x - 1, y) && !w3(x, y + 1) ? RR : 0]);
      c.clip();
      c.fillStyle = th.water; c.fillRect(px, py, T, TH);
      const g = c.createLinearGradient(0, py, 0, py + TH);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.5, 'rgba(0,0,0,0)');
      if (at(x, y - 1) !== 3) { c.fillStyle = g; c.fillRect(px, py, T, TH); c.fillStyle = shade(th.base, -0.2); c.fillRect(px, py, T, 7); }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      if (at(x - 1, y) !== 3) c.fillRect(px, py, 3, TH);
      if (at(x + 1, y) !== 3) c.fillRect(px + T - 3, py, 3, TH);
      if (at(x, y + 1) !== 3) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(px, py + TH - 2, T, 2); }
      if (ti === 0 && U.hash(x, y, 77) < 0.3) { // 荷叶
        c.fillStyle = '#4f8f5a'; const lx = px + 12 + U.hash(x, y, 78) * 24, ly = py + 14 + U.hash(x, y, 79) * 12;
        c.beginPath(); c.ellipse(lx, ly, 9, 5.5, 0, 0.3, TAU - 0.2); c.lineTo(lx, ly); c.fill();
        if (U.hash(x, y, 80) < 0.5) { c.fillStyle = '#f2b8d0'; circ(c, lx + 5, ly - 5, 2.6); }
      }
      c.restore();
    }
    // 墙根阴影
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) === 1) continue;
      const px = x * T, py = y * TH;
      if (at(x, y - 1) === 1) {
        const g = c.createLinearGradient(0, py, 0, py + 20);
        g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(px, py, T, 20);
      }
      if (at(x - 1, y) === 1) { const g = c.createLinearGradient(px, 0, px + 12, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, 12, TH); }
      if (at(x + 1, y) === 1) { const g = c.createLinearGradient(px + T, 0, px + T - 12, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px + T - 12, py, 12, TH); }
    }
    room.floorCv = cv;

    // 墙体：逐行烘焙成条带，参与纵深排序
    room.wallRows = [];
    for (let y = 0; y < h; y++) {
      let any = false;
      for (let x = 0; x < w; x++) if (at(x, y) === 1) { any = true; break; }
      if (!any) continue;
      const rc = document.createElement('canvas'); rc.width = w * T; rc.height = TH + HMAX;
      const r = rc.getContext('2d');
      for (let x = 0; x < w; x++) {
        if (at(x, y) !== 1) continue;
        const hg = wallH(room, x, y);
        const below = y + 1 < h && at(x, y + 1) === 1 ? wallH(room, x, y + 1) : 0;
        const px = x * T, topY = HMAX - hg;
        wallTopDetail(r, th, ti, x, y, px, topY, T, TH);
        // 顶面描边
        r.fillStyle = 'rgba(255,255,255,0.16)';
        r.fillRect(px, topY + TH - 2, T, 2);
        r.fillStyle = 'rgba(0,0,0,0.4)';
        if (!(x > 0 && at(x - 1, y) === 1 && wallH(room, x - 1, y) >= hg)) r.fillRect(px, topY, 1.5, TH);
        if (!(x < w - 1 && at(x + 1, y) === 1 && wallH(room, x + 1, y) >= hg)) r.fillRect(px + T - 1.5, topY, 1.5, TH);
        if (!(y > 0 && at(x, y - 1) === 1 && wallH(room, x, y - 1) >= hg)) r.fillRect(px, topY, T, 1.5);
        if (hg > below) {
          wallFaceDetail(r, th, ti, x, px, topY + TH, hg - below, T, y);
          r.fillStyle = 'rgba(0,0,0,0.3)';
          if (!(x > 0 && at(x - 1, y) === 1 && wallH(room, x - 1, y) >= hg)) r.fillRect(px, topY + TH, 1.5, hg - below);
          if (!(x < w - 1 && at(x + 1, y) === 1 && wallH(room, x + 1, y) >= hg)) r.fillRect(px + T - 1.5, topY + TH, 1.5, hg - below);
        }
      }
      room.wallRows.push({ sortY: (y + 1) * T - 0.5, cv: rc, oy: y * TH - HMAX });
    }

    // 悬空平台的崖壁
    const cl = document.createElement('canvas'); cl.width = w * T; cl.height = 90;
    const k = cl.getContext('2d');
    for (let x = 0; x < w; x++) {
      const dh = 46 + U.hash(x, 3, 200) * 38;
      const g = k.createLinearGradient(0, 0, 0, dh);
      g.addColorStop(0, shade(th.base, -0.25)); g.addColorStop(1, 'rgba(0,0,0,0)');
      k.fillStyle = g;
      k.beginPath(); k.moveTo(x * T, 0); k.lineTo(x * T + T, 0); k.lineTo(x * T + T - 6, dh * 0.7); k.lineTo(x * T + T / 2, dh); k.lineTo(x * T + 5, dh * 0.75); k.closePath(); k.fill();
    }
    room.cliffCv = cl;
  };

  /* ============================ 交互物件 ============================ */
  A.chest = function (ctx, x, y, t, opened) {
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
    ctx.fillStyle = '#6a4326'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.rect(-15, -16, 30, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9b45a'; ctx.fillRect(-15, -10, 30, 2.4); ctx.fillRect(-2.4, -16, 4.8, 16);
    if (opened) {
      ctx.fillStyle = '#3a2414'; ctx.beginPath(); ctx.moveTo(-15, -16); ctx.lineTo(-12, -30); ctx.lineTo(12, -30); ctx.lineTo(15, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#8a5a34'; ctx.beginPath(); ctx.moveTo(-16, -16); ctx.quadraticCurveTo(0, -31, 16, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe9a0'; circ(ctx, 0, -14, 2.6 + Math.sin(t * 4) * 0.5);
    }
    ctx.restore();
  };

  A.portal = function (ctx, x, y, t, col) {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(${col},${0.8 - i * 0.2})`; ctx.lineWidth = 2.5 - i * 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 30 - i * 8, (30 - i * 8) * G.YS, 0, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = t * 0.8 + (i / 6) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12 * G.YS); ctx.lineTo(Math.cos(a + 0.5) * 28, Math.sin(a + 0.5) * 28 * G.YS); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -90, 0, 0);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},0.4)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-16, -90); ctx.lineTo(16, -90); ctx.lineTo(24, 0); ctx.fill();
    ctx.restore();
  };

  A.herbField = function (ctx, x, y, t, used) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#3b2a1e'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 15, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3626'; ell(ctx, 0, -2, 29, 11);
    const cols = ['#7fe0a0', '#e07ad0', '#ffd45e', '#7ad0ff', '#ff8a6a'];
    for (let i = 0; i < 5; i++) {
      const px = -22 + i * 11, py = -2 + (i % 2) * 5, sw = Math.sin(t * 2 + i) * 1.5, hh = used ? 6 : 13 + (i % 3) * 3;
      ctx.strokeStyle = '#4f9a58'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + sw, py - hh * 0.6, px + sw, py - hh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px - 4, py - 7); ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py - 8); ctx.stroke();
      if (!used) { ctx.fillStyle = cols[i]; circ(ctx, px + sw, py - hh - 1, 2.8); }
    }
    ctx.restore();
  };

  A.shrine = function (ctx, x, y, t, used) {
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
    ctx.fillStyle = '#6b7078'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-17, 4); ctx.lineTo(-13, -6); ctx.lineTo(13, -6); ctx.lineTo(17, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#868c96'; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-8, -44); ctx.quadraticCurveTo(0, -52, 8, -44); ctx.lineTo(10, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = used ? '#4a4e56' : `rgba(255,230,150,${0.7 + Math.sin(t * 3) * 0.3})`;
    ctx.font = 'bold 18px serif'; ctx.textAlign = 'center'; ctx.fillText('缘', 0, -20);
    ctx.restore();
  };

  /* 北墙门楼 */
  A.gate = function (ctx, x, y, w, ti) {
    const th = G.Themes[ti];
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = ti === 3 ? '#d9b45a' : ti === 1 ? '#3a2622' : '#5a3d2c'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.fillRect(-5, -HN - 8, 10, HN + 8); ctx.strokeRect(-5, -HN - 8, 10, HN + 8);
    ctx.fillRect(w - 5, -HN - 8, 10, HN + 8); ctx.strokeRect(w - 5, -HN - 8, 10, HN + 8);
    ctx.fillStyle = th.top;
    ctx.beginPath(); ctx.moveTo(-18, -HN - 6); ctx.quadraticCurveTo(w / 2, -HN - 30, w + 18, -HN - 6);
    ctx.lineTo(w + 10, -HN + 5); ctx.lineTo(-10, -HN + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = th.topHi; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, -HN - 5); ctx.quadraticCurveTo(w / 2, -HN - 25, w + 12, -HN - 5); ctx.stroke();
    ctx.restore();
  };
})();
