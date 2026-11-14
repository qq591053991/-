/* 妖兽与灵宠的造型
   和山石、树木用同一套语言：削面、下深上浅、描墨线。
   做法是"雕塑"——把一个刚体部件（躯干、头、一条腿）里的所有小块烘成一个几何体，
   颜色写进顶点色，再乘一层从下到上由深变浅的明暗。一只妖兽因此只有七八个网格。 */
(function () {
  'use strict';
  const G = window.G, U = G.U, TAU = G.TAU, PI = Math.PI, Mo = G.Models;
  const { box, cyl, cone, ico, oct } = Mo.geo, ctx = Mo._ctx, finish = Mo._finish;
  const V3 = THREE.Vector3, WHITE = new THREE.Color(0xffffff);
  const tint = (hex, k) => { const c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(WHITE, k); return '#' + c.getHexString(); };
  const sig = (L) => Object.keys(L).map((k) => k + L[k]).join('|');
  const BONE = '#efe6d2', INK = '#15121a';

  /* ---------- 雕塑 ----------
     put(几何体, 颜色, 位置, 缩放, 旋转)：往部件里添一块。
     法线一律取"从这一块的中心向外"——它只给描边用（外扩一圈）；
     光照上的削面交给材质的 flatShading，所以每个面一个明暗 */
  const SC = {};
  const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E3 = new THREE.Euler(), Pv = new V3(), Sv = new V3(), vv = new V3(), nn = new V3(), Cc = new THREE.Color();
  function sculpt(key, build, lo = 0.6, hi = 1.06) {
    if (SC[key]) return SC[key];
    const pos = [], nor = [], colr = [];
    const put = (geo, color, p, s, r) => {
      Pv.set(p[0], p[1], p[2]);
      if (typeof s === 'number') Sv.set(s, s, s); else Sv.set(s[0], s[1], s[2]);
      E3.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); Q4.setFromEuler(E3); M4.compose(Pv, Q4, Sv);
      Cc.set(color);
      const A = geo.attributes.position, I = geo.index, cnt = I ? I.count : A.count;
      for (let i = 0; i < cnt; i++) {
        vv.fromBufferAttribute(A, I ? I.getX(i) : i);
        nn.copy(vv); if (nn.lengthSq() < 1e-8) nn.set(0, 1, 0); nn.normalize().applyQuaternion(Q4);
        vv.applyMatrix4(M4);
        pos.push(vv.x, vv.y, vv.z); nor.push(nn.x, nn.y, nn.z); colr.push(Cc.r, Cc.g, Cc.b);
      }
    };
    build(put);
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
    for (let i = 0; i < pos.length; i += 3) { const k = lo + (hi - lo) * ((pos[i + 1] - y0) / (y1 - y0 || 1)); colr[i] *= k; colr[i + 1] *= k; colr[i + 2] *= k; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    return (SC[key] = g);
  }
  // 把一根沿 Y 轴的条状体（圆柱、锥）从 a 架到 b；锥尖落在 b
  const UPv = new V3(0, 1, 0), Dv = new V3(), Qs = new THREE.Quaternion(), Es = new THREE.Euler();
  function span(put, geo, color, a, b, w, d) {
    Dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = Dv.length(); Qs.setFromUnitVectors(UPv, Dv.normalize()); Es.setFromQuaternion(Qs);
    put(geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, len, d === undefined ? w : d], [Es.x, Es.y, Es.z]);
  }
  Mo.sculpt = sculpt; Mo.span = span; // 场景物件（scenery.js）也用
  const skinOf = (c, o) => c.flat('#ffffff', Object.assign({ vertexColors: true, shininess: 5, flatShading: false }, o)); // 绢本：不要削面，明暗是晕开的
  const glowOf = (c, o) => c.glow('#ffffff', Object.assign({ vertexColors: true }, o));
  const part = (geo, mat, parent, p, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow !== false; if (p) m.position.set(p[0], p[1], p[2]); parent.add(m); return m; };

  /* ============================ 狼 ============================
     胸高臀低、脊上一排鬃、尖吻獠牙。几个开关给灵宠用：
     fox 狐相（大耳大尾）、mark 额上的印记、horn 独角、armor 一片压一片的背甲 */
  Mo.wolf = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'wolf:' + sig(L);
    const fur = L.fur, dark = L.dark, lite = tint(L.fur, 0.2), paw = tint(L.dark, -0.3), fox = !!L.fox, ts = fox ? 1.5 : L.armor ? 1.25 : 1;
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(1), fur, [0, 0.05, 0.13], [0.31, 0.31, 0.38]);                 // 胸
      put(ico(1), fur, [0, 0, -0.2], [0.25, 0.25, 0.34]);                    // 臀
      put(ico(0), dark, [0, -0.08, -0.03], [0.2, 0.14, 0.46]);               // 腹
      put(ico(0), lite, [0, 0.1, 0.27], [0.29, 0.27, 0.2]);                  // 颈毛
      if (L.armor) for (let i = 0; i < 5; i++) put(box(), i % 2 ? tint(L.armor, 0.12) : L.armor, [0, 0.185 - i * 0.016, 0.24 - i * 0.125], [0.36 - i * 0.028, 0.045, 0.18], [0.3, 0, 0]);
      else for (let i = 0; i < 4; i++) put(cone(4), dark, [0, 0.21 - i * 0.024, 0.2 - i * 0.135], [0.07, 0.2 - i * 0.032, 0.12], [-0.6, 0, 0]);
    });
    const headG = sculpt(k + ':head', (put) => {
      put(ico(1), fur, [0, 0, 0], [0.25, 0.22, 0.26]);
      put(cone(4), lite, [0, -0.03, 0.18], [0.14, 0.26, 0.12], [PI / 2, 0, 0]);       // 吻
      put(ico(0), INK, [0, -0.012, 0.305], 0.05);                                      // 鼻
      put(box(), dark, [0, -0.085, 0.13], [0.09, 0.03, 0.2]);                          // 下颌
      for (const sx of [-1, 1]) {
        put(cone(4), BONE, [sx * 0.04, -0.075, 0.22], [0.024, 0.075, 0.024], [PI, 0, 0]);               // 獠牙
        put(cone(4), dark, [sx * 0.085, 0.16, -0.03], [fox ? 0.11 : 0.085, fox ? 0.25 : 0.18, 0.05], [0, 0, -sx * 0.28]); // 耳
        put(cone(4), fur, [sx * 0.14, -0.03, -0.01], [0.07, 0.15, 0.05], [0, 0, -sx * 2.0]);            // 腮毛
      }
      if (L.horn) put(cone(5), L.horn, [0, 0.21, 0.05], [0.06, 0.32, 0.06], [0.5, 0, 0]);
    });
    const eyeG = sculpt(k + ':eye', (put) => {
      for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.075, 0.035, 0.114], [0.075, 0.036, 0.03], [0, 0, sx * 0.45]);
      if (L.mark) { put(oct(), L.mark, [0, 0.1, 0.088], [0.075, 0.03, 0.03]); put(oct(), L.mark, [0, 0.125, 0.07], [0.035, 0.02, 0.03]); }
    }, 1, 1);
    const legF = sculpt(k + ':legF', (put) => { put(cyl(0.5, 0.34, 5), dark, [0, -0.11, 0], [0.09, 0.24, 0.09]); put(box(), paw, [0, -0.235, 0.025], [0.085, 0.05, 0.13]); });
    const legH = sculpt(k + ':legH', (put) => { put(ico(0), fur, [0, -0.01, 0], [0.13, 0.2, 0.18]); put(cyl(0.5, 0.34, 5), dark, [0, -0.14, -0.02], [0.075, 0.2, 0.075]); put(box(), paw, [0, -0.235, 0.01], [0.085, 0.05, 0.13]); });
    const tailG = sculpt(k + ':tail', (put) => { // 蓬尾：一整条向后上方翘起的毛刷，根细、中段最粗、末梢收成一个尖
      const tip = L.tip || lite, a = [0, 0, 0.02], m = [0, 0.13 * ts, -0.3 * ts], e = [0, 0.2 * ts, -0.5 * ts];
      span(put, ico(1), fur, a, m, 0.17 * ts, 0.19 * ts);
      span(put, cone(5), tip, [0, 0.085 * ts, -0.2 * ts], e, 0.16 * ts, 0.17 * ts);
    });
    const body = c.grp([0, 0.3, 0]); part(bodyG, skin, body);
    const head = c.grp([0, 0.12, 0.34], body); part(headG, skin, head); part(eyeG, glo, head, null, false);
    const tail = c.grp([0, 0.07, -0.34], body); part(tailG, skin, tail);
    const legs = [[-0.11, 0.2, legF], [0.11, 0.2, legF], [-0.11, -0.22, legH], [0.11, -0.22, legH]].map(([x, z, q]) => { const lg = c.grp([x, -0.05, z], body); part(q, skin, lg); return lg; });
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.62 * (o.scale || 1), function (e) {
      const t = e.t || 0, run = e.moving ? Math.sin(t * (e.charge ? 26 : 14)) : 0, cr = e.wind ? 0.07 : 0;
      body.position.y = 0.3 - cr + (e.moving ? Math.abs(run) * 0.03 : 0);
      body.scale.z = e.charge ? 1.15 : 1;
      body.rotation.x = e.wind ? 0.18 : 0;
      legs[0].rotation.x = run * 0.8; legs[1].rotation.x = -run * 0.8; legs[2].rotation.x = -run * 0.8; legs[3].rotation.x = run * 0.8;
      head.rotation.x = e.wind ? 0.25 : Math.sin(t * 2) * 0.05;
      tail.rotation.y = Math.sin(t * (e.moving ? 9 : 3)) * 0.3; tail.rotation.x = e.charge ? -0.5 : 0;
    });
  };

  /* ============================ 血蝠 ============================
     大耳、獠牙；翼是一张扇形的膜，三根指骨撑着，后缘在指骨之间凹进去 */
  const WING = { S: [0, 0, 0.05], W: [0.45, 0, 0.16], T1: [1.0, 0, 0.06], M12: [0.8, 0, -0.12], T2: [0.86, 0, -0.42], M23: [0.6, 0, -0.27], T3: [0.5, 0, -0.52], M3B: [0.26, 0, -0.25], B: [0, 0, -0.3] };
  function wingGeo() {
    if (SC.batwing) return SC.batwing;
    const w = WING, pos = [], colr = [], nor = [], sh = { S: 0.7, B: 0.7, W: 0.9, T1: 1.25, T2: 1.25, T3: 1.2, M12: 1.0, M23: 1.0, M3B: 0.85 };
    const tri = (a, b, c2) => { for (const k of [a, b, c2]) { pos.push(w[k][0], w[k][1], w[k][2]); colr.push(sh[k], sh[k], sh[k]); nor.push(0, 1, 0); } };
    tri('W', 'M12', 'T1'); tri('W', 'T2', 'M12'); tri('W', 'M23', 'T2'); tri('W', 'T3', 'M23'); tri('W', 'M3B', 'T3'); tri('W', 'B', 'M3B'); tri('W', 'S', 'B');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    return (SC.batwing = g);
  }
  Mo.bat = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'bat:' + sig(L);
    const mem = c.lam(L.wing, { side: THREE.DoubleSide, vertexColors: true }), lite = tint(L.body, 0.16), bone = tint(L.wing, -0.25);
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(1), L.body, [0, 0, 0], [0.2, 0.23, 0.19]);
      put(ico(0), lite, [0, -0.03, 0.05], [0.18, 0.15, 0.14]);                                              // 胸毛
      put(ico(0), bone, [0, 0.0, 0.1], [0.085, 0.06, 0.07]);                                                 // 吻
      for (const sx of [-1, 1]) {
        put(cone(4), L.body, [sx * 0.07, 0.17, 0], [0.085, 0.22, 0.05], [0, 0, -sx * 0.32]);                // 大耳
        put(cone(4), BONE, [sx * 0.026, -0.05, 0.112], [0.02, 0.055, 0.02], [PI, 0, 0]);                    // 獠牙
        put(cone(4), bone, [sx * 0.045, -0.14, 0], [0.03, 0.07, 0.03], [PI, 0, 0]);                         // 爪
      }
    });
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.048, 0.048, 0.088], [0.05, 0.03, 0.02], [0, 0, sx * 0.4]); }, 1, 1);
    const boneG = sculpt(k + ':bone', (put) => { const w = WING; span(put, cyl(0.5, 0.5, 4), bone, w.S, w.W, 0.05, 0.05); for (const t of ['T1', 'T2', 'T3']) span(put, cone(4), bone, w.W, w[t], 0.045, 0.045); }, 0.9, 1.1);
    const b = c.grp(); part(bodyG, skin, b); part(eyeG, glo, b, null, false);
    const wr = c.grp([0.07, 0.03, 0]), wl = c.grp([-0.07, 0.03, 0]); wr.scale.setScalar(0.52); wl.scale.set(-0.52, 0.52, 0.52);
    for (const w of [wr, wl]) { part(wingGeo(), mem, w); part(boneG, skin, w, [0, 0.004, 0]); }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.3, function (e) {
      const f = Math.sin((e.t || 0) * 22);
      wr.rotation.z = f * 0.75; wl.rotation.z = -f * 0.75;
      b.position.y = f * 0.02;
    });
  };

  /* ============================ 毒蟾 ============================
     又宽又扁，一道阔嘴，背上顶着几颗毒瘤；鼓气时整个涨起来 */
  Mo.toad = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'toad:' + sig(L);
    const lite = tint(L.body, 0.32), toe = tint(L.dark, -0.2);
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(1), L.body, [0, 0.02, -0.03], [0.6, 0.36, 0.56]);
      put(ico(1), L.body, [0, 0.0, 0.2], [0.5, 0.28, 0.34]);                       // 头
      put(ico(1), lite, [0, -0.08, 0.2], [0.38, 0.2, 0.3]);                        // 鼓囊
      put(box(), INK, [0, 0.0, 0.3], [0.42, 0.022, 0.16]);                         // 阔嘴
      for (const [x, y, z, s] of [[-0.14, 0.18, -0.08, 0.1], [0.12, 0.19, -0.14, 0.09], [0.0, 0.205, -0.01, 0.075], [-0.05, 0.16, -0.22, 0.08], [0.21, 0.13, 0.0, 0.07], [-0.22, 0.12, 0.04, 0.065]]) put(ico(0), L.spot, [x, y, z], s);
      for (const sx of [-1, 1]) {
        put(ico(0), L.body, [sx * 0.15, 0.17, 0.17], 0.15);                        // 眼丘
        put(ico(0), L.dark, [sx * 0.27, -0.13, 0.16], [0.16, 0.1, 0.2]); put(box(), toe, [sx * 0.31, -0.175, 0.27], [0.17, 0.03, 0.09]);     // 前腿
        put(ico(0), L.dark, [sx * 0.3, -0.07, -0.16], [0.22, 0.2, 0.3]); put(box(), toe, [sx * 0.37, -0.175, -0.02], [0.12, 0.03, 0.27]);   // 后腿
      }
    });
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) { put(oct(), L.eye, [sx * 0.158, 0.19, 0.232], [0.08, 0.075, 0.03]); put(box(), INK, [sx * 0.158, 0.19, 0.246], [0.07, 0.014, 0.012]); } }, 1, 1);
    const b = c.grp([0, 0.19, 0]); part(bodyG, skin, b); part(eyeG, glo, b, null, false);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.5 * (o.scale || 1), function (e) {
      const puff = 1 + Math.min(1, e.wind || 0) * 0.25 + Math.sin((e.t || 0) * 3) * 0.03;
      b.scale.set(puff, puff, puff); b.position.y = 0.19 * puff;
    });
  };

  /* ============================ 铁背蜈蚣 ============================
     一节一片六角的甲，两侧各翘出一个甲尖；足是两截的尖足；头上一对螯、一对长须 */
  Mo.centipede = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'cent:' + sig(L);
    const plate = (kk, a, b2, extra) => sculpt(k + kk, (put) => {
      put(cyl(0.5, 0.5, 6), a, [0, 0, 0], [1.0, 0.5, 0.95]);
      put(box(), b2, [0, 0.27, 0], [0.3, 0.12, 0.8]);                                                       // 背脊
      for (const sx of [-1, 1]) put(cone(4), a, [sx * 0.56, 0.02, 0], [0.3, 0.34, 0.6], [0, 0, -sx * PI / 2]); // 两侧的甲尖
      if (extra) extra(put);
    });
    const pA = plate(':a', L.body, L.dark), pB = plate(':b', L.dark, L.body);
    const pHead = plate(':h', L.body, L.dark, (put) => { for (const sx of [-1, 1]) span(put, cone(4), L.leg, [sx * 0.16, 0.2, 0.38], [sx * 0.55, 0.55, 1.05], 0.07); });
    const pTail = plate(':t', L.body, L.dark, (put) => { for (const sx of [-1, 1]) span(put, cone(4), L.leg, [sx * 0.2, 0.05, -0.4], [sx * 0.5, 0.2, -1.15], 0.16); });
    const legG = sculpt(k + ':legs', (put) => { for (const sx of [-1, 1]) { span(put, cyl(0.5, 0.5, 4), L.leg, [sx * 0.4, -0.05, 0], [sx * 0.82, 0.12, 0], 0.1); span(put, cone(4), L.leg, [sx * 0.8, 0.12, 0], [sx * 0.98, -0.44, 0], 0.11); } }, 0.75, 1.05);
    const pinG = sculpt(k + ':pin', (put) => { span(put, cone(4), L.leg, [0, 0, 0], [0, 0, 0.66], 0.2); }, 0.9, 1.1);
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.24, 0.2, 0.43], [0.16, 0.1, 0.1]); }, 1, 1);
    const N = 7, segs = [];
    for (let i = 0; i < N; i++) {
      const r = i === 0 ? 0.3 : 0.27 - i * 0.02;
      const s = c.grp([0, r * 0.45, -i * 0.15]); s.scale.setScalar(r);
      part(i === 0 ? pHead : i === N - 1 ? pTail : i % 2 ? pB : pA, skin, s);
      s.userData.lg = part(legG, skin, s); segs.push(s);
    }
    const h = segs[0]; part(eyeG, glo, h, null, false);
    const pin = [part(pinG, skin, h, [-0.24, -0.05, 0.4]), part(pinG, skin, h, [0.24, -0.05, 0.4])];
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.45 * (o.scale || 1), function (e) {
      const t = e.t || 0, sp = e.moving ? (e.charge ? 24 : 12) : 3, amp = e.charge ? 0.03 : 0.07;
      for (let i = 0; i < segs.length; i++) {
        segs[i].position.x = Math.sin(t * sp - i * 0.9) * amp * Math.min(1, i * 0.5);
        segs[i].userData.lg.rotation.y = Math.sin(t * sp * 1.5 + i * 1.3) * 0.35;
      }
      const p = (e.wind ? 0.55 : 0.2) + Math.sin(t * 8) * 0.08;
      pin[0].rotation.y = p; pin[1].rotation.y = -p;
    });
  };

  /* ============================ 食人妖花 ============================
     带刺的茎、贴地的阔叶；花头是一圈尖瓣，瓣尖带齿，张开时露出一圈牙和发光的花心 */
  Mo.flower = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'flower:' + sig(L);
    const leaf = tint(L.stem, -0.2), stemL = tint(L.stem, 0.15);
    const baseG = sculpt(k + ':base', (put) => { for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; put(cone(4), i % 2 ? leaf : L.stem, [Math.cos(a) * 0.2, 0.035, Math.sin(a) * 0.2], [0.2, 0.44, 0.05], [0, -a, -PI / 2 + 0.16]); } }, 0.8, 1.05);
    const stemG = sculpt(k + ':stem', (put) => {
      span(put, cyl(0.42, 0.5, 5), L.stem, [0, 0, 0], [0.04, 0.24, 0], 0.11); span(put, cyl(0.42, 0.5, 5), stemL, [0.04, 0.24, 0], [-0.02, 0.44, 0.02], 0.095); span(put, cyl(0.42, 0.5, 5), L.stem, [-0.02, 0.44, 0.02], [0, 0.6, 0], 0.085);
      for (let i = 0; i < 5; i++) { const a = i * 2.3, y = 0.1 + i * 0.09; span(put, cone(4), leaf, [Math.cos(a) * 0.03, y, Math.sin(a) * 0.03], [Math.cos(a) * 0.13, y + 0.04, Math.sin(a) * 0.13], 0.035); } // 刺
    });
    const bulbG = sculpt(k + ':bulb', (put) => {
      put(ico(1), L.dark, [0, 0, 0], [0.25, 0.22, 0.25]);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; put(cone(4), BONE, [Math.cos(a) * 0.085, 0.12, Math.sin(a) * 0.085], [0.03, 0.08, 0.03]); } // 一圈牙
    });
    const coreG = sculpt(k + ':core', (put) => { put(ico(0), L.core, [0, 0.07, 0], 0.13); }, 1, 1);
    const petalG = (kk, col2) => sculpt(k + kk, (put) => {
      put(oct(), col2, [0, 0.2, 0], [0.2, 0.44, 0.07]);
      put(box(), tint(col2, -0.3), [0, 0.2, 0.025], [0.03, 0.34, 0.03]);       // 瓣脉
      put(cone(4), BONE, [0, 0.43, 0], [0.04, 0.09, 0.03]);                      // 瓣尖的齿
    }, 0.7, 1.1);
    const pA = petalG(':pa', L.petal), pB = petalG(':pb', L.dark);
    part(baseG, skin, g);
    const stem = c.grp(); part(stemG, skin, stem);
    const head = c.grp([0, 0.6, 0], stem); part(bulbG, skin, head); part(coreG, glo, head, null, false);
    const pet = [];
    for (let i = 0; i < 6; i++) { const piv = c.grp(null, head); piv.rotation.y = (i / 6) * TAU; const pv = c.grp(null, piv); part(i % 2 ? pA : pB, skin, pv); pet.push(pv); }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.95 * (o.scale || 1), function (e) {
      const t = e.t || 0, open = 0.35 + Math.min(1, e.wind || 0) * 0.85 + Math.sin(t * 2) * 0.05;
      stem.rotation.z = Math.sin(t * 1.6) * 0.1; stem.rotation.x = Math.cos(t * 1.3) * 0.06;
      for (const p of pet) p.rotation.x = open;
      head.rotation.y = t * 0.3;
    });
  };

  /* ============================ 血玉蜘蛛 ============================
     腹是一块削面的血玉，背上三根玉刺；八条两截的长足高高拱起 */
  Mo.spider = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c, { emissive: new THREE.Color(L.body).multiplyScalar(0.16), shininess: 40 }), glo = glowOf(c), k = 'spider:' + sig(L);
    const lite = tint(L.body, 0.3);
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(0), L.body, [0, 0.05, -0.2], [0.42, 0.32, 0.5]);                  // 腹：一块玉
      put(ico(0), L.body, [0, 0, 0.09], [0.26, 0.2, 0.27]);                     // 头胸
      for (let i = 0; i < 3; i++) put(cone(4), lite, [0, 0.2 - i * 0.02, -0.08 - i * 0.12], [0.06, 0.14 - i * 0.02, 0.06], [-0.4, 0, 0]);
      for (const sx of [-1, 1]) put(cone(4), L.dark, [sx * 0.05, -0.07, 0.2], [0.04, 0.1, 0.04], [PI - 0.4, 0, 0]); // 螯牙
    }, 0.55, 1.1);
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) { put(oct(), L.eye, [sx * 0.05, 0.06, 0.2], 0.05); put(oct(), L.eye, [sx * 0.1, 0.045, 0.16], 0.036); } }, 1, 1);
    const legG = (sx) => sculpt(k + ':leg' + sx, (put) => { span(put, cyl(0.4, 0.5, 4), L.dark, [0, 0, 0], [sx * 0.19, 0.17, 0], 0.045); span(put, cone(4), L.dark, [sx * 0.19, 0.17, 0], [sx * 0.4, -0.215, 0], 0.045); }, 0.7, 1.1);
    const body = c.grp([0, 0.2, 0]); part(bodyG, skin, body); part(eyeG, glo, body, null, false);
    const legs = [];
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      const lg = c.grp([sx * 0.1, 0.02, 0.14 - i * 0.09], body); lg.rotation.y = sx * (0.5 - i * 0.35);
      part(legG(sx), skin, lg); lg.userData.k = i + (sx > 0 ? 0.5 : 0); legs.push(lg);
    }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.4 * (o.scale || 1), function (e) {
      const t = e.t || 0, sp = e.moving ? 16 : 2.5;
      for (const lg of legs) lg.rotation.x = Math.sin(t * sp + lg.userData.k * 2.6) * (e.moving ? 0.35 : 0.06);
      body.position.y = 0.2 + Math.sin(t * 3) * 0.012 + (e.atk || 0) * 0.06;
    });
  };

  /* ============================ 啼魂兽 ============================
     书里是只猴形的小兽：黑毛、大头、长臂长尾，一只专吸鬼物的大鼻子 */
  Mo.monkey = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c), k = 'monkey:' + sig(L);
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(1), L.fur, [0, 0.05, 0], [0.3, 0.34, 0.27]);
      put(ico(0), L.face, [0, 0.02, 0.075], [0.2, 0.22, 0.15]);                 // 肚皮
      for (const sx of [-1, 1]) { put(cyl(0.5, 0.4, 5), L.dark, [sx * 0.08, -0.15, 0.02], [0.09, 0.14, 0.09]); put(box(), L.dark, [sx * 0.08, -0.215, 0.05], [0.09, 0.035, 0.15]); } // 短腿
    });
    const headG = sculpt(k + ':head', (put) => {
      put(ico(1), L.fur, [0, 0, 0], [0.31, 0.27, 0.28]);
      put(ico(0), L.face, [0, -0.015, 0.085], [0.21, 0.18, 0.14]);              // 脸
      put(ico(0), L.dark, [0, -0.04, 0.165], [0.1, 0.075, 0.08]);               // 大鼻子
      put(cone(4), L.dark, [0, 0.16, -0.02], [0.08, 0.12, 0.06], [-0.3, 0, 0]); // 顶上一撮毛
      for (const sx of [-1, 1]) put(ico(0), L.face, [sx * 0.165, 0.03, 0], [0.09, 0.12, 0.05]); // 圆耳
    });
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.068, 0.04, 0.132], [0.075, 0.06, 0.03]); }, 1, 1);
    const armG = sculpt(k + ':arm', (put) => { put(cyl(0.5, 0.4, 5), L.dark, [0, -0.14, 0.02], [0.075, 0.3, 0.075]); put(ico(0), L.fur, [0, -0.3, 0.03], 0.09); });
    const tailG = sculpt(k + ':tail', (put) => { span(put, cyl(0.5, 0.5, 4), L.dark, [0, 0, 0], [0, 0.06, -0.2], 0.05); span(put, cyl(0.5, 0.5, 4), L.dark, [0, 0.06, -0.2], [0, 0.24, -0.3], 0.045); span(put, cone(4), L.fur, [0, 0.24, -0.3], [0, 0.36, -0.2], 0.05); });
    const body = c.grp([0, 0.23, 0]); part(bodyG, skin, body);
    const head = c.grp([0, 0.3, 0.04], body); part(headG, skin, head); part(eyeG, glo, head, null, false);
    const arms = [-1, 1].map((sx) => { const a = c.grp([sx * 0.16, 0.14, 0.02], body); a.rotation.z = sx * 0.2; part(armG, skin, a); return a; });
    const tail = c.grp([0, -0.02, -0.12], body); part(tailG, skin, tail);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.7 * (o.scale || 1), function (e) {
      const t = e.t || 0, wk = e.moving ? Math.sin(t * 13) : 0, a = Math.min(1, e.atk || 0);
      body.position.y = 0.23 + (e.moving ? Math.abs(wk) * 0.05 : Math.sin(t * 2.4) * 0.012);
      arms[0].rotation.x = wk * 0.9 - a * 1.6; arms[1].rotation.x = -wk * 0.9 - a * 1.6;
      head.rotation.x = -a * 0.35 + Math.sin(t * 1.7) * 0.04; head.rotation.z = Math.sin(t * 1.1) * 0.06;
      tail.rotation.y = Math.sin(t * 3) * 0.35;
    });
  };

  /* ============================ 火灵 ============================
     三层削面的焰：外焰、内焰、焰心，各带一两条窜起的火舌；两道黑眼缝 */
  Mo.flame = function (L, o = {}) {
    const c = ctx(), g = c.g, k = 'flame:' + sig(L);
    const m1 = glowOf(c, { transparent: true, opacity: 0.82, depthWrite: false }), m2 = glowOf(c), m3 = glowOf(c);
    const layer = (kk, col2, w, hgt, seed) => sculpt(k + kk, (put) => {
      put(ico(0), col2, [0, w * 0.34, 0], [w, w * 0.72, w]);
      put(cone(5), col2, [0, w * 0.5 + hgt / 2, 0], [w * 0.86, hgt, w * 0.86]);
      for (let i = 0; i < 3; i++) { const a = seed + i * 2.2, r = w * 0.3; span(put, cone(4), col2, [Math.cos(a) * r, w * 0.4, Math.sin(a) * r], [Math.cos(a) * r * 2.1, w * 0.5 + hgt * (0.45 + i * 0.12), Math.sin(a) * r * 2.1], w * 0.34); }
    }, 1, 1);
    const b = c.grp([0, 0.08, 0]);
    const l1 = part(layer(':o', L.dark, 0.48, 0.62, 0.3), m1, b, null, false), l2 = part(layer(':m', L.body, 0.36, 0.46, 1.4), m2, b, [0, 0.01, 0.02], false), l3 = part(layer(':c', L.core, 0.21, 0.3, 2.6), m3, b, [0, 0.02, 0.05], false);
    part(sculpt('flame:eyes', (put) => { for (const sx of [-1, 1]) put(box(), '#3a1408', [sx * 0.07, 0.2, 0.185], [0.05, 0.085, 0.02], [0, 0, -sx * 0.3]); }, 1, 1), m3, b, null, false);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.85 * (o.scale || 1), function (e) {
      const t = e.t || 0, hot = Math.min(1, e.wind || 0), sp = 9 + hot * 30;
      const q = 1 + hot * 0.35 + Math.sin(t * sp) * 0.05; b.scale.set(q, q, q);
      l1.scale.y = 1 + Math.sin(t * 11) * 0.1; l2.scale.y = 1 + Math.sin(t * 13 + 1) * 0.1; l3.scale.y = 1 + Math.sin(t * 15 + 2) * 0.12;
      l1.rotation.y = t * 1.6; l2.rotation.y = -t * 2.1; l1.rotation.z = Math.sin(t * 7) * 0.08;
    }, { light: true });
  };

  /* ============================ 玄冰傀儡（炮台） ============================
     一根六棱的主冰柱，四周斜出几根小冰锥，底下压着碎冰；柱心悬一枚发光的核 */
  Mo.crystal = function (L, o = {}) {
    const c = ctx(), g = c.g, k = 'crystal:' + sig(L);
    const ice = skinOf(c, { transparent: true, opacity: 0.9, emissive: new THREE.Color(L.dark).multiplyScalar(0.3), shininess: 80 }), glo = glowOf(c);
    const shard = (put, col2, a, b2, w) => { const mid = [a[0] + (b2[0] - a[0]) * 0.7, a[1] + (b2[1] - a[1]) * 0.7, a[2] + (b2[2] - a[2]) * 0.7]; span(put, cyl(0.5, 0.36, 6), col2, a, mid, w); span(put, cone(6), col2, mid, b2, w); };
    const bodyG = sculpt(k + ':body', (put) => {
      shard(put, L.body, [0, 0, 0], [0, 1.0, 0], 0.34);
      shard(put, L.dark, [-0.12, 0, 0.04], [-0.42, 0.56, 0.1], 0.2); shard(put, L.dark, [0.12, 0, -0.03], [0.44, 0.66, -0.08], 0.2);
      shard(put, L.dark, [0.02, 0, 0.12], [0.1, 0.46, 0.4], 0.17); shard(put, L.body, [-0.04, 0, -0.14], [-0.12, 0.5, -0.36], 0.16);
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; put(ico(0), i % 2 ? L.dark : L.body, [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.26], [0.16, 0.1, 0.14], [i, i * 2, 0]); } // 碎冰
    }, 0.55, 1.25);
    part(bodyG, ice, g, null, false);
    const core = part(sculpt(k + ':core', (put) => put(oct(), L.core, [0, 0, 0], 1), 1, 1), glo, g, [0, 0.74, 0.02], false); core.scale.setScalar(0.16);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 1.0 * (o.scale || 1), function (e) {
      const t = e.t || 0, w = Math.min(1, e.wind || 0);
      core.position.set(0, 0.8 + Math.sin(t * 2.4) * 0.04, 0.2); core.rotation.y = t * 2; core.scale.setScalar(0.16 + w * 0.12);
    });
  };

  /* ============================ 机关傀儡 ============================
     六角的铜身、斗笠、一道窄窄的眼缝；背后一只齿轮，右臂架着弩 */
  Mo.puppet = function (L, o = {}) {
    const c = ctx(), g = c.g, skin = skinOf(c, { shininess: 26 }), glo = glowOf(c), k = 'puppet:' + sig(L);
    const lite = tint(L.body, 0.18);
    const legG = sculpt(k + ':leg', (put) => { put(cyl(0.5, 0.4, 6), L.dark, [0, 0.14, 0], [0.08, 0.28, 0.08]); put(ico(0), L.body, [0, 0.27, 0], 0.09); put(box(), L.dark, [0, 0.025, 0.03], [0.1, 0.05, 0.16]); }, 0.75, 1.05);
    const torsoG = sculpt(k + ':torso', (put) => {
      put(cyl(0.5, 0.36, 6), L.body, [0, 0.46, 0], [0.38, 0.38, 0.3]);
      put(cyl(0.5, 0.5, 6), L.dark, [0, 0.29, 0], [0.3, 0.06, 0.25]);                           // 腰箍
      put(box(), L.dark, [0, 0.5, 0.125], [0.2, 0.16, 0.04]);                                     // 胸板
      put(cyl(0.5, 0.5, 8), L.dark, [0, 0.47, -0.16], [0.24, 0.05, 0.24], [PI / 2, 0, 0]);       // 背后的齿轮
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; put(box(), L.dark, [Math.cos(a) * 0.13, 0.47 + Math.sin(a) * 0.13, -0.16], [0.05, 0.05, 0.05], [0, 0, a]); }
      for (const sx of [-1, 1]) put(cone(4), lite, [sx * 0.2, 0.64, 0], [0.16, 0.1, 0.2]);        // 肩甲
      put(cyl(0.5, 0.42, 5), L.dark, [-0.21, 0.48, 0.02], [0.07, 0.26, 0.07]);                    // 垂着的左臂
    });
    const coreG = sculpt(k + ':core', (put) => put(oct(), L.eye, [0, 0.43, 0.15], [0.075, 0.075, 0.03]), 1, 1);
    const headG = sculpt(k + ':head', (put) => {
      put(cyl(0.5, 0.5, 6), L.body, [0, 0, 0], [0.26, 0.2, 0.26]);
      put(cone(6), L.dark, [0, 0.15, 0], [0.44, 0.15, 0.44]);                                     // 斗笠
      put(box(), INK, [0, 0.0, 0.115], [0.19, 0.06, 0.03]);                                       // 眼缝
      put(cyl(0.5, 0.5, 6), L.dark, [0, -0.12, 0], [0.1, 0.06, 0.1]);                             // 颈
    });
    const pupG = sculpt(k + ':pupil', (put) => put(box(), L.eye, [0, 0, 0], [0.06, 0.045, 0.012]), 1, 1);
    const armG = sculpt(k + ':arm', (put) => {
      put(box(), L.dark, [0, 0, 0.16], [0.06, 0.06, 0.36]);                                       // 弩身
      for (const sx of [-1, 1]) span(put, cyl(0.4, 0.5, 4), L.body, [0, 0, 0.32], [sx * 0.2, 0, 0.2], 0.04);
      put(box(), INK, [0, 0, 0.2], [0.4, 0.012, 0.012]);                                          // 弦
    }, 0.8, 1.05);
    const legL = part(legG, skin, g, [-0.08, 0, 0]), legR = part(legG, skin, g, [0.08, 0, 0]);
    const torso = c.grp(); part(torsoG, skin, torso); part(coreG, glo, torso, null, false);
    const head = c.grp([0, 0.78, 0], torso); part(headG, skin, head);
    const pupil = part(pupG, glo, head, [0, 0.0, 0.134], false);
    const arm = c.grp([0.2, 0.56, 0], torso); part(armG, skin, arm);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.98 * (o.scale || 1), function (e) {
      const t = e.t || 0, wk = e.moving ? Math.sin(t * 12) : 0;
      legL.position.z = wk * 0.08; legR.position.z = -wk * 0.08;
      torso.position.y = e.moving ? Math.abs(wk) * 0.02 : 0;
      pupil.position.x = Math.sin(t * 3) * 0.05;
      arm.position.z = -(e.atk || 0) * 0.06;
    });
  };

  /* ============================ 鬼影 / 阴魂 ============================
     一领破斗篷：兜帽里是个黑洞，只亮着两点眼；下摆撕成几绺。半透明，不描线 */
  Mo.ghost = function (L, o = {}) {
    const c = ctx(), g = c.g, k = 'ghost:' + sig(L);
    const skin = skinOf(c, { transparent: true, opacity: 0.74, emissive: new THREE.Color(L.body).multiplyScalar(0.3) }), glo = glowOf(c);
    const bodyG = sculpt(k + ':body', (put) => {
      put(ico(1), L.body, [0, 0.54, 0], [0.36, 0.38, 0.34]);                    // 兜帽
      put(cone(4), L.body, [0, 0.78, -0.06], [0.16, 0.2, 0.14], [-0.5, 0, 0]);  // 帽尖
      put(cyl(0.34, 0.5, 7), L.dark, [0, 0.3, 0], [0.42, 0.34, 0.36]);          // 斗篷
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.2, l = 0.2 + (i % 3) * 0.07; put(cone(4), L.dark, [Math.cos(a) * 0.15, 0.14 - l / 2, Math.sin(a) * 0.13], [0.13, l, 0.1], [PI, 0, 0]); } // 撕破的下摆
      put(ico(0), '#06100d', [0, 0.52, 0.1], [0.22, 0.24, 0.16]);               // 脸：一个黑洞
    }, 0.5, 1.1);
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.06, 0.55, 0.185], [0.05, 0.085, 0.02], [0, 0, -sx * 0.25]); }, 1, 1);
    const armG = sculpt(k + ':arm', (put) => { span(put, cyl(0.4, 0.5, 5), L.body, [0, 0, 0], [0, -0.02, 0.26], 0.08); for (let i = -1; i <= 1; i++) span(put, cone(4), L.body, [i * 0.025, -0.02, 0.25], [i * 0.06, -0.06, 0.36], 0.03); }, 0.8, 1.1);
    const b = c.grp([0, 0.2, 0]);
    part(bodyG, skin, b, null, false); part(eyeG, glo, b, null, false);
    const mouth = part(sculpt('ghost:mouth', (put) => put(oct(), '#030807', [0, 0, 0], [1, 1, 1]), 1, 1), glo, b, [0, 0.43, 0.185], false); mouth.scale.set(0.07, 0.04, 0.03);
    const arms = [-1, 1].map((sx) => { const a = c.grp([sx * 0.17, 0.42, 0.05], b); part(armG, skin, a, null, false); return a; });
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 1.0 * (o.scale || 1), function (e) {
      const t = e.t || 0, w = Math.min(1, e.wind || 0);
      b.position.y = 0.2 + Math.sin(t * 3) * 0.06;
      b.rotation.z = Math.sin(t * 2.2) * 0.06;
      arms[0].rotation.x = -0.3 - w * 0.9 + Math.sin(t * 4) * 0.1; arms[1].rotation.x = -0.3 - w * 0.9 - Math.sin(t * 4) * 0.1;
      mouth.scale.y = 0.04 + w * 0.1;
    });
  };

  /* ============================ 噬魂鬼首 ============================
     一颗削面的骷髅，眼窝里两点火，脑后拖着一缕鬼火；下颌一开一合 */
  Mo.skull = function (L, o = {}) {
    const c = ctx(), g = c.g, k = 'skull:' + sig(L);
    const skin = skinOf(c, { emissive: new THREE.Color(L.body).multiplyScalar(0.26) }), glo = glowOf(c), fire = glowOf(c, { transparent: true, opacity: 0.7, depthWrite: false });
    const headG = sculpt(k + ':head', (put) => {
      put(ico(1), L.body, [0, 0.04, -0.01], [0.3, 0.3, 0.32]);
      put(box(), L.body, [0, -0.07, 0.07], [0.2, 0.09, 0.14]);                                  // 上颌
      for (const sx of [-1, 1]) { put(ico(0), '#0a1a14', [sx * 0.066, 0.035, 0.115], [0.1, 0.1, 0.08]); put(cone(4), L.body, [sx * 0.13, 0.17, -0.04], [0.06, 0.16, 0.06], [-0.3, 0, -sx * 0.5]); } // 眼窝、角
      put(cone(4), '#0a1a14', [0, -0.03, 0.14], [0.04, 0.06, 0.03]);                            // 鼻孔
      for (let i = -2; i <= 2; i++) put(box(), BONE, [i * 0.036, -0.125, 0.125], [0.026, 0.04, 0.02]); // 牙
    }, 0.62, 1.08);
    const jawG = sculpt(k + ':jaw', (put) => { put(box(), L.body, [0, 0, 0.03], [0.17, 0.05, 0.16]); for (let i = -2; i <= 2; i++) put(box(), BONE, [i * 0.034, 0.035, 0.1], [0.024, 0.035, 0.02]); }, 0.7, 1.05);
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) put(oct(), L.eye, [sx * 0.066, 0.035, 0.145], 0.045); }, 1, 1);
    const fireG = sculpt(k + ':fire', (put) => { put(cone(5), L.body, [0, 0.06, -0.26], [0.24, 0.4, 0.24], [-1.9, 0, 0]); put(cone(5), tint(L.body, 0.5), [0, 0.05, -0.2], [0.14, 0.26, 0.14], [-1.9, 0, 0]); }, 1, 1);
    part(headG, skin, g, null, false); part(eyeG, glo, g, null, false);
    const jaw = part(jawG, skin, g, [0, -0.15, 0.0], false), fl = part(fireG, fire, g, null, false);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.3, function (e) {
      const t = e.t || 0;
      jaw.position.y = -0.15 - Math.abs(Math.sin(t * 9)) * 0.04;
      fl.scale.set(1 + Math.sin(t * 13) * 0.1, 1, 1 + Math.sin(t * 9 + 1) * 0.18);
    });
  };

  /* ============================ 墨蛟（首领） ============================
     身子一节一节：每节是削面的鳞身、浅色的腹甲、脊上一片鳍。
     头上一对后掠的长角、一排鬃、两根长须，上下两排牙 */
  Mo.jiao = function (L, segs) {
    const c = ctx(), g = c.g, skin = skinOf(c, { emissive: 0x06080f }), glo = glowOf(c), k = 'jiao:' + sig(L);
    const horn = '#c9b88a', S = 1 / G.TILE, parts = [], scale2 = tint(L.body, 0.16); // 鳞身比墨色略亮一档，暗底上才看得出削面
    const segG = (kk, fin) => sculpt(k + kk, (put) => {
      put(ico(1), scale2, [0, 0, 0], [1, 0.86, 1]);
      put(ico(0), L.belly, [0, -0.2, 0], [0.8, 0.5, 0.9]);                                       // 腹甲
      put(cone(4), L.dark, [0, 0.4 + fin * 0.3, 0], [0.2, fin * 0.9, 0.7]);                      // 背鳍
      for (const sx of [-1, 1]) put(cone(4), L.dark, [sx * 0.42, 0.1, 0], [0.2, 0.3, 0.5], [0, 0, -sx * 1.1]); // 两侧的鳞尖
    }, 0.7, 1.15);
    const sA = segG(':sa', 0.62), sB = segG(':sb', 0.34);
    for (let i = 1; i < segs.length; i++) {
      const r = segs[i].r * S * 2, p = c.grp(); p.scale.setScalar(r);
      part(i >= segs.length - 2 ? sB : i % 2 ? sB : sA, skin, p); parts.push(p);
    }
    const headG = sculpt(k + ':head', (put) => {
      put(ico(1), scale2, [0, 0, 0.05], [0.95, 0.8, 1.25]);
      put(ico(1), scale2, [0, 0.02, 0.75], [0.62, 0.42, 0.9]);                                   // 吻
      put(box(), L.belly, [0, 0.2, 0.86], [0.2, 0.05, 0.5], [0.12, 0, 0]);                       // 鼻梁上一道浅色的脊
      for (const sx of [-1, 1]) put(box(), L.dark, [sx * 0.27, 0.36, 0.44], [0.34, 0.09, 0.3], [0.25, 0, -sx * 0.35]); // 两道压下来的眉骨
      for (let i = 0; i < 4; i++) put(cone(4), L.dark, [0, 0.46 - i * 0.03, 0.2 - i * 0.26], [0.16, 0.5 - i * 0.07, 0.36], [-0.5, 0, 0]); // 鬃
      for (const sx of [-1, 1]) {
        span(put, cone(6), horn, [sx * 0.26, 0.3, 0.0], [sx * 0.52, 1.02, -0.72], 0.2);         // 后掠的长角
        span(put, cone(5), horn, [sx * 0.36, 0.2, -0.2], [sx * 0.7, 0.42, -0.62], 0.12);        // 副角
        span(put, cone(4), L.belly, [sx * 0.24, 0.0, 1.12], [sx * 0.86, -0.2, 1.75], 0.07);     // 长须
        put(ico(0), INK, [sx * 0.12, 0.12, 1.16], 0.07);                                          // 鼻孔
        for (let i = 0; i < 4; i++) put(cone(4), BONE, [sx * (0.25 - i * 0.02), -0.2, 0.55 + i * 0.16], [0.06, 0.16, 0.06], [PI, 0, 0]); // 上排牙
      }
    }, 0.7, 1.15);
    const eyeG = sculpt(k + ':eye', (put) => { for (const sx of [-1, 1]) { put(oct(), L.eye, [sx * 0.33, 0.27, 0.5], [0.3, 0.2, 0.26], [0.3, 0, sx * 0.5]); put(box(), INK, [sx * 0.37, 0.31, 0.56], [0.035, 0.16, 0.06], [0.3, 0, sx * 0.5]); } }, 1, 1); // 眼睛朝上偏，俯视下看得见
    const jawG = sculpt(k + ':jaw', (put) => {
      put(box(), L.belly, [0, -0.1, 0.42], [0.5, 0.14, 0.85]);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) put(cone(4), BONE, [sx * (0.2 - i * 0.02), 0.02, 0.3 + i * 0.2], [0.05, 0.13, 0.05]);
    }, 0.7, 1.05);
    const tongG = sculpt(k + ':tongue', (put) => put(box(), '#7a1420', [0, -0.02, 0.42], [0.36, 0.02, 0.66]), 1, 1);
    const head = c.grp(); const hr = segs[0].r * S * 2; head.scale.setScalar(hr);
    part(headG, skin, head); part(eyeG, glo, head, null, false);
    const jaw = c.grp([0, -0.12, 0.35], head); part(jawG, skin, jaw); part(tongG, glo, jaw, null, false);
    const m = finish(c, 1.3, function (e) {
      const sg = e.segs;
      for (let i = 1; i < sg.length; i++) { const s = sg[i]; parts[i - 1].position.set(s.x * S, s.r * S * 0.86 + (s.z || 0) * S, s.y * S); }
      const h = sg[0];
      head.position.set(h.x * S, h.r * S * 0.9 + 0.08, h.y * S);
      head.rotation.y = PI / 2 - e.face;
      jaw.rotation.x = (e.mouth || 0) * 0.55;
    });
    m.world = true; // 自带世界坐标，不随实体整体平移
    return m;
  };

  /* ============================ 交互物 ============================
     宝匣、药园、石碑、坊市的摊子：同样是雕塑出来的削面体，同样描墨线 */
  /* 宝匣：包金角的木匣，盝顶的盖，盖顶嵌一颗发光的珠 */
  Mo.chest = function () {
    const c = ctx(), g = c.g, skin = skinOf(c, { shininess: 22 }), glo = glowOf(c);
    const wood = '#6a4326', woodL = '#8a5a34', gold = '#d2aa52', dk = '#3a2414';
    const baseG = sculpt('chest:base', (put) => {
      put(box(), dk, [0, 0.03, 0], [0.7, 0.06, 0.5]);
      put(box(), wood, [0, 0.19, 0], [0.64, 0.3, 0.44]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(box(), gold, [sx * 0.3, 0.19, sz * 0.2], [0.07, 0.32, 0.07]);   // 包金的四角
      put(box(), gold, [0, 0.33, 0], [0.67, 0.035, 0.47]);                                                                       // 口沿
      put(cyl(0.5, 0.5, 6), gold, [0, 0.21, 0.225], [0.15, 0.03, 0.15], [PI / 2, 0, 0]); put(box(), dk, [0, 0.2, 0.245], [0.03, 0.07, 0.02]); // 锁牌
    }, 0.68, 1.08);
    const lidG = sculpt('chest:lid', (put) => {
      put(cyl(0.36, 0.5, 4), woodL, [0, 0.1, 0.22], [0.92, 0.18, 0.63], [0, PI / 4, 0]);                                         // 盝顶
      put(box(), gold, [0, 0.195, 0.22], [0.48, 0.03, 0.33]);
      put(box(), gold, [0, 0.015, 0.22], [0.67, 0.03, 0.47]);
      for (const sx of [-1, 1]) put(box(), gold, [sx * 0.2, 0.11, 0.22], [0.04, 0.17, 0.5], [0, 0, -sx * 0.5]);                 // 两道箍
    }, 0.72, 1.1);
    const gemG = sculpt('chest:gem', (put) => put(oct(), '#ffe9a0', [0, 0, 0], [1, 1.3, 1]), 1, 1);
    part(baseG, skin, g);
    const lid = c.grp([0, 0.345, -0.22]); part(lidG, skin, lid);
    const gem = part(gemG, glo, lid, [0, 0.27, 0.22], false);
    return { g, mats: c.mats, update(it, t) { lid.rotation.x = it.used ? -1.9 : 0; gem.visible = !it.used; gem.scale.setScalar(0.1 + Math.sin(t * 4) * 0.015); gem.rotation.y = t * 1.5; } };
  };

  /* 药园：一畦土，四周围一圈卵石；灵药是带尖叶的茎，顶上一枚发光的蕾 */
  Mo.herbField = function () {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c);
    const bedG = sculpt('herb:bed', (put) => {
      put(cyl(0.5, 0.52, 8), '#3b2a1e', [0, 0.045, 0], [1.46, 0.09, 1.06]);
      put(cyl(0.5, 0.5, 8), '#4d3826', [0, 0.085, 0], [1.22, 0.05, 0.86]);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.2, q = 0.12 + U.hash(i, 3, 5) * 0.08; put(ico(0), i % 3 ? '#7d848c' : '#69727e', [Math.cos(a) * 0.74, 0.04, Math.sin(a) * 0.54], [q * 1.3, q, q * 1.1], [U.hash(i, 1, 5), U.hash(i, 2, 5) * 3, 0]); } // 一圈卵石
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; put(ico(0), '#4b7a4c', [Math.cos(a) * 0.76, 0.1, Math.sin(a) * 0.55], [0.13, 0.05, 0.1]); }  // 石上的苔
    }, 0.7, 1.1);
    const herbG = sculpt('herb:plant', (put) => {
      span(put, cyl(0.3, 0.5, 5), '#4f9a58', [0, 0, 0], [0.01, 0.3, 0], 0.04);
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.3; span(put, cone(4), i % 2 ? '#62b46c' : '#3f8a50', [0, 0.05 + i * 0.05, 0], [Math.cos(a) * 0.18, 0.15 + i * 0.06, Math.sin(a) * 0.18], 0.08, 0.025); }
    }, 0.75, 1.1);
    const cols = ['#7fe0a0', '#e07ad0', '#ffd45e', '#7ad0ff', '#ff8a6a'], herbs = [], buds = [];
    part(bedG, skin, g);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, r = i === 0 ? 0 : 0.36, sgrp = c.grp([Math.cos(a) * r * 1.2, 0.1, Math.sin(a) * r * 0.85]); sgrp.rotation.y = i * 1.3;
      part(herbG, skin, sgrp);
      buds.push(part(sculpt('herb:bud' + (i % 5), (put) => put(oct(), cols[i % 5], [0, 0.35, 0], [0.09, 0.14, 0.09]), 1, 1), glo, sgrp, null, false)); herbs.push(sgrp);
    }
    return { g, mats: c.mats, update(it, t) { herbs.forEach((h, i) => { h.rotation.z = Math.sin(t * 2 + i) * 0.1; h.scale.y = it.used ? 0.5 : 1; }); buds.forEach((b) => (b.visible = !it.used)); } };
  };

  /* 机缘石碑：两级石座上一方尖首的碑，碑脚生苔；碑面的字是发光的 */
  Mo.shrine = function () {
    const c = ctx(), g = c.g, skin = skinOf(c);
    const st = '#868c96', dk = '#646a74';
    const stoneG = sculpt('shrine', (put) => {
      put(cyl(0.42, 0.5, 6), dk, [0, 0.08, 0], [0.96, 0.16, 0.62]);
      put(box(), st, [0, 0.2, 0], [0.58, 0.08, 0.28]);
      put(box(), st, [0, 0.7, 0], [0.44, 0.94, 0.14]);
      put(cone(4), st, [0, 1.27, 0], [0.62, 0.2, 0.2], [0, PI / 4, 0]);                                    // 尖首
      for (const sx of [-1, 1]) put(box(), dk, [sx * 0.2, 0.7, 0.01], [0.045, 0.94, 0.16]);                // 碑侧的边框
      put(ico(0), '#4b7a4c', [-0.26, 0.17, 0.12], [0.2, 0.07, 0.14]); put(ico(0), '#4b7a4c', [0.2, 0.25, -0.02], [0.14, 0.05, 0.12]); // 苔
      put(ico(0), dk, [0.36, 0.07, 0.2], [0.16, 0.12, 0.14]); put(ico(0), st, [-0.4, 0.05, 0.16], [0.12, 0.09, 0.11]);               // 碑脚的碎石
    }, 0.68, 1.1);
    part(stoneG, skin, g);
    const tex = new THREE.CanvasTexture(G.Tex.glyph('缘', '#ffe696')); tex.encoding = THREE.sRGBEncoding;
    const gm = new THREE.MeshBasicMaterial({ map: tex, transparent: true }); c.mats.push(gm);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gm); gl.position.set(0, 0.72, 0.076); gl.scale.setScalar(0.38); g.add(gl);
    return { g, mats: c.mats, update(it, t) { gm.opacity = it.used ? 0.25 : 0.75 + Math.sin(t * 3) * 0.25; } };
  };

  /* 坊市的摊子：木柜前垂一幅靛蓝布，棚顶是靛蓝与赭黄相间的布条，檐口垂着一排布角 */
  Mo.shop = function () {
    const c = ctx(), g = c.g, skin = skinOf(c), glo = glowOf(c);
    const wood = '#5a3d2c', woodD = '#3c2a1e', indigo = '#2f4a6a', ochre = '#b8924e';
    const stallG = sculpt('shop:stall', (put) => {
      put(box(), woodD, [0, 0.03, 0.2], [1.96, 0.06, 0.56]);
      put(box(), wood, [0, 0.27, 0.2], [1.9, 0.5, 0.5]);
      put(box(), indigo, [0, 0.3, 0.46], [1.94, 0.4, 0.03]); put(box(), '#c9a85a', [0, 0.49, 0.47], [1.94, 0.03, 0.035]);     // 柜前的布与金边
      put(box(), '#7a5a3c', [0, 0.545, 0.2], [2.0, 0.05, 0.62]);                                                                 // 台面
      for (const sx of [-1, 1]) { put(cyl(0.5, 0.5, 6), woodD, [sx * 0.96, 0.92, -0.38], [0.07, 1.84, 0.07]); put(cyl(0.5, 0.5, 6), woodD, [sx * 0.96, 0.8, 0.5], [0.06, 1.6, 0.06]); }
      for (let i = 0; i < 7; i++) { const x = -0.9 + i * 0.3, col2 = i % 2 ? ochre : indigo; put(box(), col2, [x, 1.74, 0.06], [0.3, 0.05, 0.98], [0.26, 0, 0]); put(cone(4), col2, [x, 1.54, 0.535], [0.3, 0.15, 0.04], [PI, 0, 0]); }
      put(box(), woodD, [0, 1.88, -0.4], [2.12, 0.06, 0.07]);
    }, 0.62, 1.1);
    part(stallG, skin, g);
    const cols = ['#7dffb0', '#ffd45e', '#7ad0ff', '#ff8a6a', '#d0a0ff'], wares = [];
    for (let i = 0; i < 5; i++) wares.push(part(sculpt('shop:ware' + i, (put) => put(i % 2 ? oct() : ico(0), cols[i], [0, 0, 0], 0.14), 1, 1), glo, g, [-0.64 + i * 0.32, 0.66, 0.22], false));
    const keeper = G.Assets.makeRig('shopkeeper', {}) || (G.Assets.ready && G.Assets.make('shopkeeper', { show: ['Rogue_Cape'] })) || Mo.human({ robe: '#8a6a3a', trim: '#f0d890', skin: '#f0d0b0', hat: 'bamboo', weapon: 'none' });
    keeper.g.position.set(0, 0, -0.26); g.add(keeper.g);
    return { g, mats: c.mats.concat(keeper.mats), update(it, t) { wares.forEach((w, i) => { w.position.y = 0.66 + Math.sin(t * 2 + i) * 0.03; w.rotation.y = t + i; }); keeper.update({ t, moving: false }); } };
  };

  /* ============================ 灵宠的形象 ============================ */
  const pet0 = Mo.pet;
  const PETS = {
    tihun: () => Mo.monkey({ fur: '#2c2834', dark: '#17151c', face: '#5c526c', eye: '#c9a0ff' }, { scale: 0.82 }),
    yinyue: () => Mo.wolf({ fur: '#eaeef6', dark: '#b4bed2', eye: '#ffc0e8', mark: '#ffd8f2', fox: true }, { scale: 0.7 }),
    tujia: () => Mo.wolf({ fur: '#b08a52', dark: '#6a4e2a', eye: '#ffe36a', armor: '#8a6a3a', tip: '#6a4e2a' }, { scale: 0.82 }),
    baolin: () => Mo.wolf({ fur: '#e8c050', dark: '#8a6a20', eye: '#7dffea', horn: '#fff2c0', tip: '#fff2c0' }, { scale: 0.98 }),
  };
  Mo.pet = (id) => (PETS[id] ? PETS[id]() : pet0(id));

  /* ============================ 飞剑（写实画风） ============================
     一口像样的剑：菱形截面的剑身（脊暗、刃亮，收成剑尖）、两头起翘的剑格、缠绳的剑柄、剑首、剑穗。
     剑身是受光的金属，自带一点灵光（自发光），外面罩一层剑芒；三档随功法进境换形：
     0 凡铁飞剑 / 1 青元剑光（月白剑身、青芒）/ 2 青竹蜂云剑（竹节剑身、亮剑尖、金格）/ mini 金蚨子刃
     整口剑沿 +Z，剑尖在前；长度归一成 1，由调用处缩放 */
  const SWD = {
    0: { ridge: '#59646e', edge: '#e6eef4', aura: 0x8fd8d0, glow: 0.1, emis: 0.06, guard: '#8a6a3c', grip: '#2a2422', tassel: '#9a2a22', L: 0.78 },
    1: { ridge: '#4fae8e', edge: '#f2fff8', aura: 0x5cffb0, glow: 0.17, emis: 0.2, guard: '#d9b45a', grip: '#1e3a36', tassel: '#3fd0a0', L: 0.82 },
    2: { ridge: '#3f8a2c', edge: '#dcffa8', aura: 0x9aff4a, glow: 0.18, emis: 0.22, guard: '#f0cc5a', grip: '#24341e', tassel: '#f0cc5a', joint: '#2c6220', tip: '#f6ffe0', L: 0.86 },
    mini: { ridge: '#b0822a', edge: '#fff4c0', aura: 0xffdc82, glow: 0.18, emis: 0.24, L: 0.42, bare: true },
  };
  const swGeo = {};
  // 把若干三角形攒成一个带顶点色的几何体；法线按面算，所以每个面一个明暗（金属的棱）
  function triGeo(key, build) {
    if (swGeo[key]) return swGeo[key];
    const pos = [], col = [], c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
    const tri = (a, b, c, ca, cb, cc) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); c1.set(ca); c2.set(cb || ca); c3.set(cc || cb || ca); col.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c3.r, c3.g, c3.b); };
    const quad = (a, b, c, d, ca, cb, cc, cd) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
    // 一截四棱台：两头各一个菱形（半宽 w、半厚 t），棱上的颜色 e（左右刃）与 r（上下脊）
    const seg = (z0, w0, t0, z1, w1, t1, e, r) => {
      const A = [[w0, 0, z0], [0, t0, z0], [-w0, 0, z0], [0, -t0, z0]], B = [[w1, 0, z1], [0, t1, z1], [-w1, 0, z1], [0, -t1, z1]], C = [e, r, e, r];
      for (let i = 0; i < 4; i++) { const k = (i + 1) % 4; if (w1 < 1e-5 && t1 < 1e-5) tri(A[i], A[k], B[0], C[i], C[k], e); else quad(A[i], A[k], B[k], B[i], C[i], C[k], C[k], C[i]); }
    };
    const box = (cx, cy, cz, sx, sy, sz, c, ry = 0) => { // 一个长方体，可绕 Y 轴转
      const co = Math.cos(ry), si = Math.sin(ry), P = (x, y, z) => [cx + (x * co + z * si), cy + y, cz + (-x * si + z * co)], h = [sx / 2, sy / 2, sz / 2];
      const v = [P(-h[0], -h[1], -h[2]), P(h[0], -h[1], -h[2]), P(h[0], h[1], -h[2]), P(-h[0], h[1], -h[2]), P(-h[0], -h[1], h[2]), P(h[0], -h[1], h[2]), P(h[0], h[1], h[2]), P(-h[0], h[1], h[2])];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], c);
    };
    build({ tri, quad, seg, box });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    return (swGeo[key] = g);
  }
  const Z_GUARD = -0.2, Z_TIP = 0.5;
  // 剑身：自剑格到剑尖，中段略收，末了收成尖；wk 是宽度的倍数（剑芒用它放大一圈）
  const bladeOf = (key, st, wk = 1, tk = 1) => triGeo(key, (b) => {
    const N = 10, TP = 0.72, hw = (u) => 0.044 * wk * (u < TP ? 1 - 0.14 * u : (1 - 0.14 * TP) * (1 - Math.pow((u - TP) / (1 - TP), 1.35))), ht = (u) => 0.015 * tk * (u < TP ? 1 - 0.25 * u : (1 - 0.25 * TP) * (1 - (u - TP) / (1 - TP)));
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, z0 = Z_GUARD + u0 * (Z_TIP - Z_GUARD), z1 = Z_GUARD + u1 * (Z_TIP - Z_GUARD);
      const tipC = st.tip && u0 > 0.7; // 青竹蜂云剑：前三成是亮的剑尖
      b.seg(z0, hw(u0), ht(u0), z1, i === N - 1 ? 0 : hw(u1), i === N - 1 ? 0 : ht(u1), tipC ? st.tip : st.edge, tipC ? st.edge : st.ridge);
    }
    if (st.joint && wk === 1) for (const u of [0.18, 0.42, 0.64]) { const z = Z_GUARD + u * (Z_TIP - Z_GUARD); b.seg(z - 0.012, hw(u) * 1.12, ht(u) * 1.7, z + 0.012, hw(u) * 1.12, ht(u) * 1.7, st.joint, st.joint); } // 竹节
  });
  // 剑格、剑柄、剑首、剑穗
  const hiltOf = (key, st) => triGeo(key, (b) => {
    const g = st.guard, dk = G.Tex.shade(g, -0.35);
    b.box(0, 0, Z_GUARD, 0.08, 0.044, 0.044, g);                                 // 剑格：中间一块
    for (const sx of [-1, 1]) { b.box(sx * 0.068, 0, Z_GUARD + 0.012, 0.075, 0.03, 0.03, g, sx * 0.5); b.box(sx * 0.104, 0, Z_GUARD + 0.034, 0.026, 0.026, 0.036, dk, sx * 0.9); } // 两翼前翘
    b.box(0, 0.024, Z_GUARD, 0.03, 0.012, 0.03, G.Tex.shade(g, 0.4));               // 格上一颗饰
    b.seg(Z_GUARD - 0.19, 0.02, 0.02, Z_GUARD - 0.02, 0.023, 0.023, st.grip, st.grip);               // 剑柄
    for (let i = 0; i < 4; i++) b.box(0, 0, Z_GUARD - 0.045 - i * 0.04, 0.048, 0.048, 0.012, i % 2 ? dk : g, PI / 4); // 缠绳
    b.seg(Z_GUARD - 0.24, 0.012, 0.012, Z_GUARD - 0.19, 0.034, 0.034, g, g); b.seg(Z_GUARD - 0.19, 0.034, 0.034, Z_GUARD - 0.175, 0.02, 0.02, g, g); // 剑首
    for (const [dx, dy, l] of [[0.012, -0.03, 0.2], [-0.014, -0.05, 0.26]]) b.seg(Z_GUARD - 0.24 - l, 0.002, 0.002, Z_GUARD - 0.235, 0.011, 0.007, st.tassel, st.tassel); // 剑穗（两缕）
  });
  const swMat = {};
  function swordMats(style, giant) {
    const k = style + (giant ? 'G' : ''); if (swMat[k]) return swMat[k];
    const st = SWD[style], o = giant ? { transparent: true } : {};
    const blade = new THREE.MeshPhongMaterial(Object.assign({ vertexColors: true, shininess: 110, specular: 0xffffff, emissive: st.aura, emissiveIntensity: st.emis * (giant ? 1.3 : 1), side: THREE.DoubleSide }, o));
    const hilt = new THREE.MeshPhongMaterial(Object.assign({ vertexColors: true, shininess: 40, specular: 0x554422, emissive: 0x241a0c, side: THREE.DoubleSide }, o));
    const aura = new THREE.MeshBasicMaterial({ color: st.aura, transparent: true, opacity: st.glow * (giant ? 1.3 : 1), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const m of [blade, hilt, aura]) m.userData.o0 = m.opacity;
    return (swMat[k] = { blade, hilt, aura });
  }
  function swordDH(style, giant) {
    const st = SWD[style] || SWD[0], M = giant ? swordMats(style, true) : swordMats(style), g = new THREE.Group(), body = new THREE.Group(); g.rotation.order = 'YXZ';
    const mats = giant ? { blade: M.blade.clone(), hilt: M.hilt.clone(), aura: M.aura.clone() } : M; // 巨剑要单独淡入淡出
    if (giant) for (const k in mats) mats[k].userData.o0 = M[k].userData.o0;
    const add = (geo, m, rz) => { const x = new THREE.Mesh(geo, m); x.renderOrder = rz || 0; body.add(x); return x; };
    add(bladeOf('aura' + style, st, 1.9, 2.6), mats.aura, 12);
    add(bladeOf('blade' + style, st), mats.blade);
    if (!st.bare) add(hiltOf('hilt' + style, st), mats.hilt);
    body.scale.setScalar(st.L); body.position.z = st.bare ? 0 : st.L * 0.06; g.add(body);
    g.userData.mats = [mats.blade, mats.hilt, mats.aura];
    return g;
  }
  if (G.DH) {
    Mo.sword = (style) => swordDH(SWD[style] ? style : 0);
    Mo.giantSword = function () { // 巨剑术：剑尖朝下，原点在剑尖
      const g = new THREE.Group(), s = swordDH(1, true), L = 4.4;
      s.rotation.set(PI / 2, 0, 0); s.scale.setScalar(L / SWD[1].L); s.position.y = L * (Z_TIP + 0.06); g.add(s);
      g.userData.mats = s.userData.mats;
      return g;
    };
  }
})();
