'use strict';
/* 凡人问道 —— 3D 模型：全部由 Three.js 基础几何体拼装（无外部模型文件）。
   约定：单位为「格」，模型正面朝 +Z，脚底在 y = 0。 */
(function () {
  const G = window.G, U = G.U, TAU = G.TAU, PI = Math.PI;
  const Mo = (G.Models = {});

  /* ---------- 共享几何体 ---------- */
  const GEO = {};
  const gg = (k, f) => GEO[k] || (GEO[k] = f());
  const box = () => gg('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sph = (n = 12) => gg('sph' + n, () => new THREE.SphereGeometry(0.5, n, Math.max(6, Math.round(n * 0.7))));
  const cyl = (rt = 0.5, rb = 0.5, n = 10) => gg(`cyl${rt}_${rb}_${n}`, () => new THREE.CylinderGeometry(rt, rb, 1, n));
  const cone = (n = 10) => gg('cone' + n, () => new THREE.ConeGeometry(0.5, 1, n));
  const ico = (d = 0) => gg('ico' + d, () => new THREE.IcosahedronGeometry(0.5, d));
  const oct = () => gg('oct', () => new THREE.OctahedronGeometry(0.5));
  const dome = () => gg('dome', () => new THREE.SphereGeometry(0.5, 14, 7, 0, TAU, 0, PI / 2));
  const tor = (tube = 0.04, arc = TAU) => gg(`tor${tube}_${arc}`, () => new THREE.TorusGeometry(0.5, tube, 6, 16, arc));
  const tri = () => gg('tri', () => { // 翼面：直角三角片
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.2, 0, 0, 0.5, 1, 0, -0.2, 0.75, 0, 0.45, 0, 0, 0.5], 3));
    g.computeVertexNormals(); return g;
  });
  Mo.geo = { box, sph, cyl, cone, ico, oct, dome, tor };

  const col = (hex, k = 0) => { const c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else if (k > 0) c.lerp(new THREE.Color(0xffffff), k); return c; };

  /* ---------- 拼装上下文 ---------- */
  function ctx() {
    const g = new THREE.Group(), mats = [];
    const reg = (m) => { m.userData.o0 = m.opacity; if (m.emissive) m.userData.e0 = m.emissive.clone(); mats.push(m); return m; };
    const lam = (c, o) => reg(new THREE.MeshLambertMaterial(Object.assign({ color: c instanceof THREE.Color ? c : col(c) }, o)));
    const flat = (c, o) => reg(new THREE.MeshPhongMaterial(Object.assign({ color: c instanceof THREE.Color ? c : col(c), flatShading: true, shininess: 12 }, o)));
    const glow = (c, o) => reg(new THREE.MeshBasicMaterial(Object.assign({ color: c instanceof THREE.Color ? c : col(c) }, o)));
    const add = (geo, mat, p, s, r, parent) => {
      const m = new THREE.Mesh(geo, mat);
      if (p) m.position.set(p[0], p[1], p[2]);
      if (s !== undefined && s !== null) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
      if (r) m.rotation.set(r[0], r[1], r[2]);
      m.castShadow = true;
      (parent || g).add(m); return m;
    };
    const grp = (p, parent) => { const q = new THREE.Group(); if (p) q.position.set(p[0], p[1], p[2]); (parent || g).add(q); return q; };
    return { g, mats, lam, flat, glow, add, grp };
  }

  function finish(c, h, update, extra) {
    const m = Object.assign({ g: c.g, mats: c.mats, h, update, _f: 0, _a: 1 }, extra);
    m.setFlash = function (f) {
      f = f > 0 ? 1 : 0; if (f === this._f) return; this._f = f;
      for (const mt of this.mats) if (mt.emissive) { mt.emissive.copy(mt.userData.e0); if (f) mt.emissive.addScalar(0.42); }
    };
    m.setAlpha = function (a) {
      a = Math.round(a * 20) / 20; if (a === this._a) return; this._a = a;
      for (const mt of this.mats) { mt.opacity = mt.userData.o0 * a; mt.transparent = a < 0.999 || mt.userData.o0 < 1; mt.depthWrite = a > 0.5; }
    };
    m.dispose = function () { for (const mt of this.mats) mt.dispose(); };
    return m;
  }

  /* ============================ 人形 ============================ */
  Mo.human = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const hat = L.hat || 'bun', wp = L.weapon || 'none';
    const robe = lam(L.robe), robeD = lam(col(L.robe, -0.22)), trim = lam(L.trim), skin = lam(L.skin || '#efcfae'), hair = lam(L.hair || '#1c1a22'), dark = lam('#1b1820');
    const footL = add(box(), dark, [-0.075, 0.035, 0.03], [0.09, 0.07, 0.17]);
    const footR = add(box(), dark, [0.075, 0.035, 0.03], [0.09, 0.07, 0.17]);
    const torso = grp();
    add(cyl(0.3, 0.5, 14), robe, [0, 0.31, 0], [0.44, 0.5, 0.38], null, torso);
    add(cyl(0.5, 0.5, 14), trim, [0, 0.4, 0], [0.31, 0.05, 0.27], null, torso);
    add(sph(10), robe, [0, 0.535, 0], [0.37, 0.13, 0.25], null, torso);
    if (hat !== 'hood') add(box(), trim, [0, 0.47, 0.105], [0.035, 0.17, 0.03], [0.12, 0, 0], torso);

    // 头
    const head = grp([0, 0.69, 0.005], torso);
    const face = add(sph(14), hat === 'hood' ? lam('#0c0a10') : skin, null, 0.3, null, head);
    const eyeM = hat === 'hood' ? glow(L.trim) : lam('#231a1a');
    if (hat !== 'mask') { add(sph(6), eyeM, [-0.055, 0.005, 0.135], 0.042, null, head); add(sph(6), eyeM, [0.055, 0.005, 0.135], 0.042, null, head); }
    let ribbon = null;
    if (hat === 'hood') {
      add(sph(12), robe, [0, 0.015, -0.045], [0.37, 0.38, 0.37], null, head);
      add(cone(10), robe, [0, 0.2, -0.07], [0.2, 0.2, 0.2], [-0.5, 0, 0], head);
    } else {
      add(dome(), hair, [0, 0.01, -0.012], [0.325, 0.33, 0.33], [-0.28, 0, 0], head);
      add(sph(10), hair, [0, -0.015, -0.045], [0.31, 0.29, 0.27], null, head);
      if (hat === 'bun' || hat === 'elder' || hat === 'player') {
        add(sph(8), hair, [0, 0.17, -0.035], 0.12, null, head);
        add(cyl(0.5, 0.5, 6), hat === 'player' ? lam('#7fe0c0') : trim, [0, 0.165, -0.035], [0.02, 0.2, 0.02], [0, 0, PI / 2], head);
      }
      if (hat === 'player') { // 发带
        ribbon = grp([0, 0.15, -0.09], head);
        const rb = lam('#7fe0c0', { side: THREE.DoubleSide });
        add(box(), rb, [-0.03, -0.1, -0.02], [0.03, 0.22, 0.01], [0.3, 0, 0.1], ribbon);
        add(box(), rb, [0.03, -0.08, -0.02], [0.03, 0.18, 0.01], [0.35, 0, -0.1], ribbon);
      }
      if (hat === 'band') add(cyl(0.5, 0.5, 14), lam('#b03030'), [0, 0.05, 0], [0.315, 0.035, 0.315], null, head);
      if (hat === 'bamboo') add(cone(16), lam('#b79b5e'), [0, 0.14, 0], [0.56, 0.17, 0.56], null, head);
      if (hat === 'crown') {
        add(cone(6), lam('#e0b94a', { emissive: 0x3a2a05 }), [0, 0.22, -0.01], [0.11, 0.16, 0.11], null, head);
        add(box(), hair, [0, -0.24, -0.135], [0.25, 0.44, 0.06], [0.1, 0, 0], head);
      }
      if (hat === 'mask') {
        add(sph(10), lam('#e8e2d8'), [0, -0.005, 0.085], [0.25, 0.27, 0.14], null, head);
        add(box(), lam('#b0202a'), [0, -0.06, 0.155], [0.14, 0.02, 0.02], null, head);
        const em = lam('#111111'); add(sph(6), em, [-0.055, 0.01, 0.148], 0.045, null, head); add(sph(6), em, [0.055, 0.01, 0.148], 0.045, null, head);
      }
      if (hat === 'elder') add(cone(8), hair, [0, -0.2, 0.1], [0.12, 0.24, 0.08], [PI, 0, 0], head);
    }

    // 手臂
    const mkArm = (sx) => {
      const a = grp([sx * 0.2, 0.545, 0], torso); a.rotation.z = sx * 0.14;
      add(cyl(0.38, 0.5, 8), robeD, [0, -0.14, 0], [0.13, 0.3, 0.13], null, a);
      add(sph(8), skin, [0, -0.3, 0], 0.075, null, a);
      return a;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    let orb = null, armBase = 0;
    if (wp === 'saber') {
      const steel = lam('#d5dbe4', { emissive: 0x20242c });
      add(box(), steel, [0, -0.3, 0.22], [0.022, 0.07, 0.42], [-0.2, 0, 0], armR);
      add(box(), lam('#4a3526'), [0, -0.3, 0.01], [0.035, 0.035, 0.12], [-0.2, 0, 0], armR);
    } else if (wp === 'bow') {
      const b = add(tor(0.03, PI), lam('#7a4f2a'), [0, -0.3, 0.05], 0.44, null, armR);
      b.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
      armBase = -1.3;
    } else if (wp === 'staff') {
      add(cyl(0.5, 0.5, 6), lam('#5a4030'), [0.29, 0.47, 0.1], [0.035, 0.95, 0.035], null, torso);
      orb = add(sph(10), glow(L.trim), [0.29, 0.99, 0.1], 0.12, null, torso); orb.castShadow = false;
      armBase = -0.9;
    } else if (wp === 'silverhand') {
      const sv = glow('#e9f2ff');
      add(sph(8), sv, [0, -0.3, 0], 0.11, null, armR);
      for (let i = -1; i <= 1; i++) add(cone(5), sv, [i * 0.035, -0.36, 0.06], [0.025, 0.13, 0.025], [1.9, 0, 0], armR);
    }
    if (L.backSword) {
      const bs = grp([0, 0.47, -0.17], torso); bs.rotation.z = 0.62;
      add(box(), lam('#3b2f2a'), [0, 0, 0], [0.05, 0.6, 0.035], null, bs);
      add(box(), lam('#d8c27a'), [0, 0.3, 0], [0.14, 0.03, 0.045], null, bs);
      add(box(), lam('#2a2422'), [0, 0.38, 0], [0.035, 0.13, 0.035], null, bs);
    }
    if (o.scale) g.scale.setScalar(o.scale);

    return finish(c, 0.98 * (o.scale || 1), function (e) {
      const t = e.t || 0, mv = e.moving, wk = mv ? Math.sin(t * 13) : 0;
      const atk = e.atk || 0, wind = e.wind || 0;
      torso.position.y = mv ? Math.abs(Math.cos(t * 13)) * 0.035 : Math.sin(t * 2.4) * 0.012;
      torso.rotation.x = e.dashing ? 0.5 : mv ? 0.09 : 0;
      footL.position.z = 0.03 + wk * 0.09; footR.position.z = 0.03 - wk * 0.09;
      armL.rotation.x = wk * 0.6;
      let ar = armBase - wk * 0.6 * (armBase ? 0.2 : 1);
      if (wp === 'saber' || wp === 'silverhand') ar = wind > 0 ? -2.5 * Math.min(1, wind) : atk > 0 ? -2.5 * atk * atk : ar;
      else if (wp === 'bow') ar = armBase - 0.2 * atk;
      else if (wp === 'staff') ar = armBase - 0.5 * Math.max(wind, atk);
      else ar = atk > 0 ? -1.55 * atk : wind > 0 ? -2.2 * Math.min(1, wind) : ar;
      armR.rotation.x = ar;
      if (wp === 'none' && wind > 0) armL.rotation.x = -2.2 * Math.min(1, wind);
      if (orb) orb.scale.setScalar(0.12 + Math.max(wind, atk) * 0.08 + Math.sin(t * 5) * 0.008);
      if (ribbon) { ribbon.rotation.x = 0.2 + (mv ? 0.7 : 0) + Math.sin(t * 5) * 0.12; ribbon.rotation.z = Math.sin(t * 3.3) * 0.15; }
    });
  };

  /* ============================ 巨躯（铁奴 / 铁尸 / 石卫 / 铜甲尸） ============================ */
  Mo.brute = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp, flat } = c;
    const mk = L.stone ? flat : lam;
    const body = mk(L.body), dark = mk(L.dark), skin = mk(L.skin), eye = glow(L.eye);
    const legL = add(box(), dark, [-0.13, 0.15, 0], [0.17, 0.3, 0.2]);
    const legR = add(box(), dark, [0.13, 0.15, 0], [0.17, 0.3, 0.2]);
    const torso = grp();
    add(cyl(0.5, 0.36, L.stone ? 6 : 10), body, [0, 0.56, 0], [0.62, 0.52, 0.42], null, torso);
    add(box(), dark, [0, 0.33, 0], [0.42, 0.09, 0.32], null, torso);
    add(sph(10), body, [0, 0.8, 0], [0.7, 0.2, 0.4], null, torso);
    if (!L.stone) { const band = lam(col(L.body, 0.25)); add(box(), band, [0, 0.62, 0.2], [0.44, 0.03, 0.03], null, torso); add(box(), band, [0, 0.5, 0.19], [0.4, 0.03, 0.03], null, torso); }
    else add(box(), eye, [0.02, 0.6, 0.212], [0.03, 0.26, 0.01], [0, 0, 0.3], torso);
    const head = grp([0, 0.97, 0.03], torso);
    add(L.stone ? ico(0) : sph(12), skin, null, 0.27, null, head);
    add(sph(6), eye, [-0.05, 0.01, 0.118], 0.045, null, head); add(sph(6), eye, [0.05, 0.01, 0.118], 0.045, null, head);
    let tali = null;
    if (L.talisman) { tali = grp([0, 0.07, 0.135], head); add(box(), lam('#f2d862', { emissive: 0x4a3c08 }), [0, -0.1, 0], [0.08, 0.2, 0.008], null, tali); add(box(), lam('#b0302a'), [0, -0.1, 0.006], [0.02, 0.12, 0.004], null, tali); }
    const mkArm = (sx) => {
      const a = grp([sx * 0.38, 0.8, 0], torso); a.rotation.z = sx * 0.1;
      add(cyl(0.5, 0.42, 8), body, [0, -0.2, 0], [0.19, 0.44, 0.19], null, a);
      add(L.stone ? ico(0) : sph(8), dark, [0, -0.46, 0], 0.2, null, a);
      return a;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    const s = (o.scale || 1) * 1.12; g.scale.setScalar(s);
    return finish(c, 1.2 * s, function (e) {
      const t = e.t || 0, mv = e.moving, wk = mv ? Math.sin(t * 7) : 0, up = Math.min(1, e.wind || 0);
      torso.position.y = mv ? Math.abs(Math.cos(t * 7)) * 0.04 : Math.sin(t * 1.8) * 0.012;
      legL.position.z = wk * 0.1; legR.position.z = -wk * 0.1;
      armL.rotation.x = wk * 0.5 - up * 2.9; armR.rotation.x = -wk * 0.5 - up * 2.9;
      torso.rotation.x = up * -0.2 + (e.st === 'rec' ? 0.35 : 0);
      if (tali) tali.rotation.x = Math.sin(t * 6) * 0.12 - (mv ? 0.25 : 0);
    });
  };

  /* ============================ 狼 ============================ */
  Mo.wolf = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const fur = lam(L.fur), dark = lam(L.dark), eye = glow(L.eye);
    const body = grp([0, 0.3, 0]);
    add(sph(12), fur, [0, 0, 0], [0.27, 0.25, 0.6], null, body);
    add(sph(10), dark, [0, 0.06, -0.03], [0.2, 0.16, 0.52], null, body);
    add(cone(8), fur, [0, 0.1, -0.4], [0.1, 0.32, 0.1], [-2.3, 0, 0], body);
    const head = grp([0, 0.1, 0.32], body);
    add(sph(10), fur, null, [0.23, 0.21, 0.25], null, head);
    add(cone(8), fur, [0, -0.02, 0.17], [0.12, 0.2, 0.11], [PI / 2, 0, 0], head);
    add(sph(6), lam('#1a1418'), [0, -0.02, 0.27], 0.04, null, head);
    add(cone(5), dark, [-0.07, 0.13, -0.02], [0.07, 0.12, 0.05], null, head); add(cone(5), dark, [0.07, 0.13, -0.02], [0.07, 0.12, 0.05], null, head);
    add(sph(6), eye, [-0.07, 0.03, 0.1], 0.04, null, head); add(sph(6), eye, [0.07, 0.03, 0.1], 0.04, null, head);
    const legs = [];
    for (const [x, z] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.22], [0.1, -0.22]]) {
      const lg = grp([x, -0.05, z], body); add(cyl(0.5, 0.4, 6), dark, [0, -0.13, 0], [0.07, 0.26, 0.07], null, lg); legs.push(lg);
    }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.62 * (o.scale || 1), function (e) {
      const t = e.t || 0, run = e.moving ? Math.sin(t * (e.charge ? 26 : 14)) : 0, cr = e.wind ? 0.07 : 0;
      body.position.y = 0.3 - cr + (e.moving ? Math.abs(run) * 0.03 : 0);
      body.scale.z = e.charge ? 1.15 : 1;
      body.rotation.x = e.wind ? 0.18 : 0;
      legs[0].rotation.x = run * 0.8; legs[1].rotation.x = -run * 0.8; legs[2].rotation.x = -run * 0.8; legs[3].rotation.x = run * 0.8;
      head.rotation.x = e.wind ? 0.25 : Math.sin(t * 2) * 0.05;
    });
  };

  /* ============================ 血蝠 ============================ */
  Mo.bat = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const body = lam(L.body), wing = lam(L.wing, { side: THREE.DoubleSide }), eye = glow(L.eye);
    add(sph(10), body, [0, 0, 0], [0.17, 0.2, 0.17]);
    add(cone(5), body, [-0.05, 0.12, 0], [0.05, 0.1, 0.04]); add(cone(5), body, [0.05, 0.12, 0], [0.05, 0.1, 0.04]);
    add(sph(6), eye, [-0.04, 0.03, 0.075], 0.035); add(sph(6), eye, [0.04, 0.03, 0.075], 0.035);
    const wl = grp([-0.06, 0.02, 0]), wr = grp([0.06, 0.02, 0]);
    const a = add(tri(), wing, null, [0.42, 1, 0.34], null, wr);
    const b = add(tri(), wing, null, [-0.42, 1, 0.34], null, wl);
    a.castShadow = b.castShadow = true;
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.3, function (e) {
      const f = Math.sin((e.t || 0) * 22);
      wr.rotation.z = f * 0.75; wl.rotation.z = -f * 0.75;
      g.children[0].position.y = f * 0.02;
    });
  };

  /* ============================ 毒蟾 ============================ */
  Mo.toad = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const body = lam(L.body), dark = lam(L.dark), spot = lam(L.spot), eye = glow(L.eye);
    const b = grp([0, 0.19, 0]);
    add(sph(12), body, null, [0.56, 0.38, 0.5], null, b);
    add(sph(10), lam(col(L.body, 0.35)), [0, -0.06, 0.1], [0.42, 0.24, 0.36], null, b);
    add(sph(6), spot, [-0.12, 0.15, -0.05], 0.07, null, b); add(sph(6), spot, [0.1, 0.16, -0.1], 0.06, null, b); add(sph(6), spot, [0.02, 0.17, 0.02], 0.05, null, b);
    for (const sx of [-1, 1]) {
      add(sph(8), body, [sx * 0.12, 0.17, 0.14], 0.13, null, b);
      add(sph(6), eye, [sx * 0.125, 0.185, 0.185], 0.07, null, b);
      add(sph(8), dark, [sx * 0.24, -0.14, 0.12], [0.16, 0.08, 0.2], null, b);
      add(sph(8), dark, [sx * 0.25, -0.13, -0.14], [0.2, 0.1, 0.24], null, b);
    }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.5 * (o.scale || 1), function (e) {
      const puff = 1 + Math.min(1, e.wind || 0) * 0.25 + Math.sin((e.t || 0) * 3) * 0.03;
      b.scale.set(puff, puff, puff); b.position.y = 0.19 * puff;
    });
  };

  /* ============================ 铁背蜈蚣 ============================ */
  Mo.centipede = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const m1 = lam(L.body), m2 = lam(L.dark), leg = lam(L.leg), eye = glow(L.eye);
    const segs = [];
    for (let i = 0; i < 7; i++) {
      const r = i === 0 ? 0.3 : 0.27 - i * 0.02;
      const s = grp([0, r * 0.45, -i * 0.15]);
      add(sph(10), i % 2 ? m2 : m1, null, [r, r * 0.78, r * 0.9], null, s);
      const lg = [];
      for (const sx of [-1, 1]) lg.push(add(cyl(0.5, 0.3, 5), leg, [sx * r * 0.62, -r * 0.2, 0], [0.025, r * 0.75, 0.025], [0, 0, sx * 1.0], s));
      s.userData.lg = lg; segs.push(s);
    }
    const h = segs[0];
    const pin = [add(cone(5), leg, [-0.07, 0, 0.17], [0.04, 0.2, 0.04], [PI / 2, 0, 0], h), add(cone(5), leg, [0.07, 0, 0.17], [0.04, 0.2, 0.04], [PI / 2, 0, 0], h)];
    add(sph(6), eye, [-0.07, 0.07, 0.1], 0.04, null, h); add(sph(6), eye, [0.07, 0.07, 0.1], 0.04, null, h);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.45 * (o.scale || 1), function (e) {
      const t = e.t || 0, sp = e.moving ? (e.charge ? 24 : 12) : 3, amp = e.charge ? 0.03 : 0.07;
      for (let i = 0; i < segs.length; i++) {
        segs[i].position.x = Math.sin(t * sp - i * 0.9) * amp * Math.min(1, i * 0.5);
        const k = Math.sin(t * sp * 1.5 + i * 1.3) * 0.35;
        segs[i].userData.lg[0].rotation.x = k; segs[i].userData.lg[1].rotation.x = -k;
      }
      const p = (e.wind ? 0.55 : 0.2) + Math.sin(t * 8) * 0.08;
      pin[0].rotation.y = p; pin[1].rotation.y = -p;
    });
  };

  /* ============================ 食人妖花 ============================ */
  Mo.flower = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const stemM = lam(L.stem), p1 = lam(L.petal, { side: THREE.DoubleSide }), p2 = lam(L.dark, { side: THREE.DoubleSide }), core = glow(L.core);
    for (const sx of [-1, 1]) add(sph(8), lam(col(L.stem, -0.2)), [sx * 0.2, 0.03, 0], [0.36, 0.05, 0.2]);
    const stem = grp();
    add(cyl(0.4, 0.5, 6), stemM, [0, 0.28, 0], [0.09, 0.56, 0.09], null, stem);
    const head = grp([0, 0.6, 0], stem);
    add(sph(10), lam(L.dark), null, 0.22, null, head);
    add(sph(8), core, [0, 0.06, 0], 0.13, null, head);
    const pet = [];
    for (let i = 0; i < 6; i++) {
      const piv = grp(null, head); piv.rotation.y = (i / 6) * TAU;
      const pv = grp(null, piv);
      add(sph(8), i % 2 ? p1 : p2, [0, 0.16, 0], [0.16, 0.36, 0.05], null, pv);
      pet.push(pv);
    }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.95 * (o.scale || 1), function (e) {
      const t = e.t || 0, open = 0.35 + Math.min(1, e.wind || 0) * 0.85 + Math.sin(t * 2) * 0.05;
      stem.rotation.z = Math.sin(t * 1.6) * 0.1; stem.rotation.x = Math.cos(t * 1.3) * 0.06;
      for (const p of pet) p.rotation.x = open;
      head.rotation.y = t * 0.3;
    });
  };

  /* ============================ 鬼影 / 阴魂 ============================ */
  Mo.ghost = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const em = col(L.body).multiplyScalar(0.35);
    const body = lam(L.body, { transparent: true, opacity: 0.72, emissive: em }), dk = lam(L.dark, { transparent: true, opacity: 0.6, emissive: col(L.dark).multiplyScalar(0.3) }), eye = glow(L.eye);
    const b = grp([0, 0.2, 0]);
    add(sph(12), body, [0, 0.52, 0], [0.34, 0.36, 0.32], null, b).castShadow = false;
    add(cone(12), dk, [0, 0.18, 0], [0.36, 0.56, 0.32], [PI, 0, 0], b).castShadow = false;
    add(sph(6), eye, [-0.07, 0.55, 0.14], [0.05, 0.08, 0.04], null, b); add(sph(6), eye, [0.07, 0.55, 0.14], [0.05, 0.08, 0.04], null, b);
    const mouth = add(sph(6), lam('#081410'), [0, 0.43, 0.15], [0.07, 0.04, 0.04], null, b);
    const arms = [];
    for (const sx of [-1, 1]) { const a = grp([sx * 0.17, 0.42, 0.05], b); add(cyl(0.3, 0.5, 6), body, [0, 0, 0.13], [0.07, 0.3, 0.07], [PI / 2, 0, 0], a).castShadow = false; arms.push(a); }
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 1.0 * (o.scale || 1), function (e) {
      const t = e.t || 0, w = Math.min(1, e.wind || 0);
      b.position.y = 0.2 + Math.sin(t * 3) * 0.06;
      b.rotation.z = Math.sin(t * 2.2) * 0.06;
      arms[0].rotation.x = -0.3 - w * 0.9 + Math.sin(t * 4) * 0.1; arms[1].rotation.x = -0.3 - w * 0.9 - Math.sin(t * 4) * 0.1;
      mouth.scale.y = 0.04 + w * 0.1;
    });
  };

  Mo.skull = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow } = c;
    const bone = lam(L.body, { emissive: col(L.body).multiplyScalar(0.3) }), dk = lam('#0a1a14'), eye = glow(L.eye);
    add(sph(10), bone, [0, 0.03, 0], [0.3, 0.3, 0.3]);
    add(box(), bone, [0, -0.11, 0.03], [0.18, 0.1, 0.18]);
    add(sph(6), dk, [-0.065, 0.03, 0.115], 0.09); add(sph(6), dk, [0.065, 0.03, 0.115], 0.09);
    add(sph(6), eye, [-0.065, 0.03, 0.14], 0.04); add(sph(6), eye, [0.065, 0.03, 0.14], 0.04);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.3, function (e) { g.children[1].position.y = -0.11 - Math.abs(Math.sin((e.t || 0) * 9)) * 0.035; });
  };

  /* ============================ 玄冰傀儡（炮台） ============================ */
  Mo.crystal = function (L, o = {}) {
    const c = ctx(), { g, add, flat, glow } = c;
    const m1 = flat(L.body, { transparent: true, opacity: 0.92, emissive: col(L.dark).multiplyScalar(0.35), shininess: 60 }), m2 = flat(L.dark, { emissive: col(L.dark).multiplyScalar(0.25), shininess: 60 });
    add(cone(6), m1, [0, 0.45, 0], [0.34, 0.9, 0.34]);
    add(cone(5), m2, [-0.22, 0.25, 0.04], [0.22, 0.52, 0.22], [0, 0, 0.3]);
    add(cone(5), m2, [0.22, 0.3, -0.03], [0.22, 0.62, 0.22], [0, 0, -0.28]);
    add(cone(5), m2, [0.03, 0.2, 0.2], [0.18, 0.42, 0.18], [0.35, 0, 0]);
    const core = add(oct(), glow(L.core), [0, 0.74, 0.02], 0.16); core.castShadow = false;
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 1.0 * (o.scale || 1), function (e) {
      const t = e.t || 0, w = Math.min(1, e.wind || 0);
      core.position.y = 0.76 + Math.sin(t * 2.4) * 0.04; core.rotation.y = t * 2; core.scale.setScalar(0.16 + w * 0.12);
    });
  };

  /* ============================ 火灵 ============================ */
  Mo.flame = function (L, o = {}) {
    const c = ctx(), { g, add, glow, grp } = c;
    const b = grp([0, 0.1, 0]);
    const l1 = add(cone(8), glow(L.dark, { transparent: true, opacity: 0.85 }), [0, 0.32, 0], [0.46, 0.7, 0.46], null, b);
    const l2 = add(cone(8), glow(L.body), [0, 0.26, 0.02], [0.34, 0.54, 0.34], null, b);
    const l3 = add(cone(8), glow(L.core), [0, 0.2, 0.04], [0.2, 0.36, 0.2], null, b);
    add(sph(8), glow(L.dark, { transparent: true, opacity: 0.85 }), [0, 0.04, 0], [0.46, 0.3, 0.46], null, b);
    add(sph(8), glow(L.body), [0, 0.05, 0.02], [0.34, 0.24, 0.34], null, b);
    const dk = glow('#3a1408'); add(sph(6), dk, [-0.07, 0.14, 0.15], [0.04, 0.07, 0.03], null, b); add(sph(6), dk, [0.07, 0.14, 0.15], [0.04, 0.07, 0.03], null, b);
    for (const m of b.children) m.castShadow = false;
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.85 * (o.scale || 1), function (e) {
      const t = e.t || 0, hot = Math.min(1, e.wind || 0), sp = 9 + hot * 30;
      const s = 1 + hot * 0.35 + Math.sin(t * sp) * 0.05; b.scale.set(s, s, s);
      l1.scale.y = 0.7 + Math.sin(t * 11) * 0.08; l2.scale.y = 0.54 + Math.sin(t * 13 + 1) * 0.07; l3.scale.y = 0.36 + Math.sin(t * 15 + 2) * 0.06;
      l1.rotation.z = Math.sin(t * 7) * 0.1; l2.rotation.z = Math.sin(t * 9 + 1) * 0.12;
    }, { light: true });
  };

  /* ============================ 机关傀儡 ============================ */
  Mo.puppet = function (L, o = {}) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const body = lam(L.body), dark = lam(L.dark), eye = glow(L.eye);
    const legL = add(cyl(0.5, 0.4, 6), dark, [-0.08, 0.14, 0], [0.07, 0.28, 0.07]);
    const legR = add(cyl(0.5, 0.4, 6), dark, [0.08, 0.14, 0], [0.07, 0.28, 0.07]);
    const torso = grp();
    add(cyl(0.5, 0.36, 6), body, [0, 0.46, 0], [0.36, 0.38, 0.28], null, torso);
    add(box(), dark, [0, 0.52, 0.125], [0.22, 0.04, 0.03], null, torso);
    add(sph(8), eye, [0, 0.42, 0.13], 0.07, null, torso);
    const head = grp([0, 0.78, 0], torso);
    add(cyl(0.5, 0.5, 10), body, null, [0.25, 0.22, 0.25], null, head);
    add(box(), lam('#111111'), [0, 0.01, 0.115], [0.19, 0.06, 0.03], null, head);
    const pupil = add(box(), eye, [0, 0.01, 0.132], [0.06, 0.05, 0.01], null, head);
    const arm = grp([0.2, 0.56, 0], torso);
    add(box(), dark, [0, 0, 0.16], [0.06, 0.06, 0.34], null, arm);
    const bow = add(tor(0.035, PI), body, [0, 0, 0.3], 0.34, null, arm); bow.rotation.set(-PI / 2, 0, 0);
    if (o.scale) g.scale.setScalar(o.scale);
    return finish(c, 0.98 * (o.scale || 1), function (e) {
      const t = e.t || 0, wk = e.moving ? Math.sin(t * 12) : 0;
      legL.position.z = wk * 0.08; legR.position.z = -wk * 0.08;
      torso.position.y = e.moving ? Math.abs(wk) * 0.02 : 0;
      pupil.position.x = Math.sin(t * 3) * 0.05;
      arm.position.z = -(e.atk || 0) * 0.06;
    });
  };

  /* ============================ 墨蛟（首领） ============================ */
  Mo.jiao = function (L, segs) {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const body = lam(L.body, { emissive: 0x06080f }), belly = lam(L.belly), dark = lam(L.dark), eye = glow(L.eye), horn = lam('#c9b88a');
    const S = 1 / G.TILE, parts = [];
    for (let i = 1; i < segs.length; i++) {
      const r = segs[i].r * S * 2, p = grp();
      add(sph(12), body, null, [r, r * 0.86, r], null, p);
      add(sph(8), belly, [0, -r * 0.2, 0], [r * 0.8, r * 0.5, r * 0.9], null, p);
      if (i % 2 === 0 && i < segs.length - 2) add(cone(4), dark, [0, r * 0.52, 0], [r * 0.3, r * 0.55, r * 0.6], null, p);
      parts.push(p);
    }
    const head = grp();
    const hr = segs[0].r * S * 2;
    add(sph(12), body, [0, 0, 0.05], [hr * 0.95, hr * 0.8, hr * 1.25], null, head);
    add(sph(10), body, [0, 0.02, hr * 0.75], [hr * 0.62, hr * 0.42, hr * 0.9], null, head);
    const jaw = grp([0, -hr * 0.12, hr * 0.35], head);
    add(box(), belly, [0, -hr * 0.1, hr * 0.42], [hr * 0.5, hr * 0.14, hr * 0.85], null, jaw);
    add(box(), glow('#7a1420'), [0, -hr * 0.02, hr * 0.42], [hr * 0.4, hr * 0.02, hr * 0.7], null, jaw);
    for (const sx of [-1, 1]) {
      add(sph(8), eye, [sx * hr * 0.33, hr * 0.2, hr * 0.5], hr * 0.2, null, head);
      add(cone(6), horn, [sx * hr * 0.28, hr * 0.5, -hr * 0.2], [hr * 0.16, hr * 0.9, hr * 0.16], [-0.9, 0, sx * -0.25], head);
      add(cyl(0.3, 0.5, 5), belly, [sx * hr * 0.4, -hr * 0.05, hr * 1.25], [hr * 0.05, hr * 0.9, hr * 0.05], [1.2, 0, sx * -0.6], head);
    }
    const m = finish(c, 1.3, function (e) {
      const sg = e.segs;
      for (let i = 1; i < sg.length; i++) {
        const s = sg[i], p = parts[i - 1];
        p.position.set(s.x * S, s.r * S * 0.86 + (s.z || 0) * S, s.y * S);
      }
      const h = sg[0];
      head.position.set(h.x * S, h.r * S * 0.9 + 0.08, h.y * S);
      head.rotation.y = PI / 2 - e.face;
      jaw.rotation.x = (e.mouth || 0) * 0.55;
    });
    m.world = true; // 自带世界坐标，不随实体整体平移
    return m;
  };

  // 玩家形象：优先用 Tripo 生成的模型，其次 KayKit，最后几何体
  Mo.hero = function (look) {
    return G.Assets.makeRig('player', { atk: 'cast' }) || (G.Assets.ready && G.Assets.make('player', { atk: 'cast' })) || Mo.human(look);
  };

  Mo.forEnemy = function (e) {
    const d = e.def, k = d.draw, o = { scale: e.scale || 1 };
    // 有同名的 Tripo 模型（assets/tripo/<角色键名>.glb）就用它
    const tm = G.Assets.makeRig(e.key, { atk: d.gl && d.gl.atk, walk: d.gl && d.gl.walk, scale: ((d.gl && d.gl.s) || d.scale || 1) * (e.elite ? 1.22 : 1) });
    if (tm) return tm;
    if (d.gl && G.Assets.ready) { // 其次用社区模型
      const c = d.gl, m = G.Assets.make(c.v, { show: c.show, atk: c.atk, walk: c.walk, scale: (c.s || 1) * (e.elite ? 1.22 : 1) });
      if (m) return m;
    }
    if (k === 'jiao') return Mo.jiao(d.look, e.segs);
    return (Mo[k] || Mo.human)(d.look, o);
  };

  /* ============================ 场景物件 ============================ */
  Mo.prop = function (kind, v, ti) {
    const c = ctx(), { g, add, lam, flat, glow, grp } = c;
    const h = (i) => U.hash(v * 7 + i, kind.length * 13 + i, 5);
    let anim = null;
    const rock = (x, y, z, s, colr) => { const m = add(ico(0), flat(colr), [x, y + s * 0.3, z], [s, s * (0.7 + h(s * 10 | 0) * 0.5), s * 0.85], [h(3) * 3, h(4) * 3, h(5) * 3]); return m; };
    switch (kind) {
      case 'rock':
        rock(-0.05, 0, 0, 0.7, ti === 1 ? '#6a5a55' : '#6b727c'); rock(0.28, 0, 0.16, 0.36, '#5a616b'); rock(-0.3, 0, 0.2, 0.26, '#565c66');
        add(sph(6), lam('#4b7a4c'), [-0.12, 0.34, 0.05], [0.3, 0.08, 0.26]);
        break;
      case 'bamboo': {
        const leaf = lam('#5fae5c', { side: THREE.DoubleSide });
        for (let i = 0; i < 5; i++) {
          const x = -0.28 + i * 0.14 + h(i) * 0.08, z = (h(i + 5) - 0.5) * 0.4, hh = 1.5 + h(i + 9) * 0.9;
          const s = grp([x, 0, z]); s.rotation.z = (h(i + 3) - 0.5) * 0.24; s.rotation.x = (h(i + 13) - 0.5) * 0.16;
          add(cyl(0.42, 0.5, 6), lam(i % 2 ? '#4f8f52' : '#3f7a48'), [0, hh / 2, 0], [0.075, hh, 0.075], null, s);
          for (let k = 1; k < 5; k++) add(cyl(0.5, 0.5, 6), lam('#2c5a36'), [0, (hh * k) / 5, 0], [0.085, 0.02, 0.085], null, s);
          for (let k = 0; k < 4; k++) {
            const a = h(i * 4 + k) * TAU;
            add(sph(6), leaf, [Math.cos(a) * 0.18, hh * (0.6 + k * 0.12), Math.sin(a) * 0.18], [0.36, 0.03, 0.1], [0.3, a, 0.5], s);
          }
        }
        break;
      }
      case 'lantern': {
        const st = lam('#7c8088');
        add(cyl(0.6, 1, 6), st, [0, 0.1, 0], [0.4, 0.2, 0.4]);
        add(box(), st, [0, 0.45, 0], [0.15, 0.5, 0.15]);
        add(box(), st, [0, 0.72, 0], [0.4, 0.06, 0.4]);
        add(box(), glow('#ffdc8a'), [0, 0.88, 0], [0.26, 0.26, 0.26]).castShadow = false;
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(), st, [x * 0.15, 0.88, z * 0.15], [0.05, 0.28, 0.05]);
        add(cone(4), lam('#5a5e68'), [0, 1.12, 0], [0.7, 0.24, 0.7], [0, PI / 4, 0]);
        add(sph(6), st, [0, 1.26, 0], 0.09);
        break;
      }
      case 'brazier': case 'brazier2': {
        const ir = lam('#3a3540'), fc = kind === 'brazier' ? ['#3aff8a', '#d8ffe0'] : ['#5ab8ff', '#e0f6ff'];
        add(cyl(0.6, 1, 6), ir, [0, 0.08, 0], [0.36, 0.16, 0.36]);
        add(cyl(0.5, 0.5, 6), ir, [0, 0.42, 0], [0.09, 0.56, 0.09]);
        add(cyl(1, 0.45, 10), ir, [0, 0.8, 0], [0.26, 0.22, 0.26]);
        const f1 = add(cone(8), glow(fc[0], { transparent: true, opacity: 0.9 }), [0, 1.14, 0], [0.34, 0.6, 0.34]);
        const f2 = add(cone(8), glow(fc[1]), [0, 1.06, 0], [0.18, 0.36, 0.18]);
        f1.castShadow = f2.castShadow = false;
        anim = (t) => { f1.scale.y = 0.6 + Math.sin(t * 11 + v) * 0.1; f1.rotation.z = Math.sin(t * 7 + v) * 0.12; f2.scale.y = 0.36 + Math.sin(t * 14 + v) * 0.07; f1.position.y = 0.84 + f1.scale.y * 0.5; f2.position.y = 0.88 + f2.scale.y * 0.5; };
        break;
      }
      case 'pine': {
        const bark = lam('#4a3528'), n1 = lam('#254a36'), n2 = lam('#3a6e4c');
        const tr = grp(); tr.rotation.z = -0.12 + h(1) * 0.2;
        add(cyl(0.32, 0.5, 7), bark, [0, 0.75, 0], [0.22, 1.5, 0.22], null, tr);
        add(cyl(0.4, 0.5, 6), bark, [-0.3, 1.05, 0], [0.09, 0.7, 0.09], [0, 0, 1.1], tr);
        add(cyl(0.4, 0.5, 6), bark, [0.3, 1.25, 0.05], [0.09, 0.7, 0.09], [0, 0, -1.1], tr);
        const tuft = (x, y, z, s) => { add(sph(8), n1, [x, y, z], [s, s * 0.34, s * 0.8], null, tr); add(sph(8), n2, [x - 0.03, y + s * 0.08, z], [s * 0.74, s * 0.24, s * 0.6], null, tr); };
        tuft(-0.62, 1.22, 0, 0.84); tuft(0.62, 1.46, 0.05, 0.8); tuft(0.06, 1.72, 0, 1.0); tuft(-0.12, 2.02, 0, 0.66);
        break;
      }
      case 'deadtree': {
        const bark = lam('#2a1a1c'), lf = [flat('#a8303c'), flat('#c2424a'), flat('#7a1f2c')];
        add(cyl(0.3, 0.5, 7), bark, [0, 0.65, 0], [0.24, 1.3, 0.24], [0, 0, 0.08]);
        const br = [[0.34, 1.25, 0, -0.8, 0.9], [-0.36, 1.45, 0.05, 0.75, 0.9], [0, 1.75, -0.05, 0.05, 0.8]];
        for (const [x, y, z, rz, l] of br) add(cyl(0.3, 0.5, 6), bark, [x, y, z], [0.09, l, 0.09], [0, 0, rz]);
        for (let i = 0; i < 12; i++) {
          const b = br[i % 3], a = h(i) * TAU, rr = 0.2 + h(i + 20) * 0.34;
          add(ico(0), lf[i % 3], [b[0] * 1.9 + Math.cos(a) * rr, b[1] + 0.32 + Math.sin(a) * rr * 0.5, b[2] + Math.sin(a * 1.7) * rr], 0.24 + h(i + 40) * 0.2, [a, a * 2, 0]);
        }
        break;
      }
      case 'mushroom': {
        const shroom = (x, z, s, cc) => {
          add(cyl(0.34, 0.5, 8), lam('#d9c9b8'), [x, 0.24 * s, z], [0.14 * s, 0.48 * s, 0.14 * s]);
          add(dome(), lam(cc, { emissive: col(cc).multiplyScalar(0.45) }), [x, 0.42 * s, z], [0.56 * s, 0.56 * s, 0.56 * s]);
          for (let i = 0; i < 4; i++) { const a = i * 1.7 + x * 9; add(sph(6), glow('#ffe9c8'), [x + Math.cos(a) * 0.15 * s, 0.6 * s, z + Math.sin(a) * 0.15 * s], 0.05 * s).castShadow = false; }
        };
        shroom(-0.12, 0, 1.3, '#d2506a'); shroom(0.26, 0.14, 0.85, '#e07a5a'); shroom(-0.34, 0.2, 0.6, '#c23a5a');
        break;
      }
      case 'bones': {
        const bn = lam('#d8cfc0');
        for (let i = 0; i < 5; i++) { const r = add(tor(0.05, PI), bn, [-0.32 + i * 0.14, 0, -0.05], 0.5 - (i % 2) * 0.08); r.rotation.y = PI / 2 + (i - 2) * 0.08; }
        add(sph(10), bn, [0.36, 0.14, 0.18], [0.3, 0.26, 0.32]);
        const dk = lam('#1c1416'); add(sph(6), dk, [0.3, 0.16, 0.31], 0.08); add(sph(6), dk, [0.43, 0.16, 0.3], 0.08);
        break;
      }
      case 'barricade': {
        const wd = lam('#5c4636'), sp = lam('#b8bcc4');
        add(cyl(0.5, 0.5, 6), lam('#4a382c'), [0, 0.14, 0.05], [0.1, 0.92, 0.1], [0, 0, PI / 2]);
        for (let i = 0; i < 4; i++) {
          const x = -0.34 + i * 0.23, s = grp([x, 0.04, 0.05]); s.rotation.x = -0.75;
          add(cyl(0.4, 0.5, 6), wd, [0, 0.4, 0], [0.08, 0.84, 0.08], null, s);
          add(cone(6), sp, [0, 0.92, 0], [0.09, 0.24, 0.09], null, s);
        }
        break;
      }
      case 'banner': {
        add(cyl(0.6, 1, 6), lam('#4a4650'), [0, 0.08, 0], [0.3, 0.16, 0.3]);
        add(cyl(0.5, 0.5, 6), lam('#3a2c24'), [0, 0.95, 0], [0.05, 1.9, 0.05]);
        const tex = new THREE.CanvasTexture(G.Tex.glyph('魔', '#e0b84a', '#6a1420')); tex.encoding = THREE.sRGBEncoding;
        const cloth = add(box(), lam(0xffffff, { map: tex }), [0.3, 1.45, 0], [0.54, 0.8, 0.02]);
        anim = (t) => { cloth.rotation.y = Math.sin(t * 2 + v) * 0.12; cloth.position.z = Math.sin(t * 2 + v) * 0.03; };
        break;
      }
      case 'rubble':
        rock(-0.1, 0, 0, 0.56, '#55525e'); rock(0.26, 0, 0.14, 0.38, '#46434f'); rock(-0.36, 0, 0.2, 0.26, '#605d6a');
        add(box(), lam('#3a2c24'), [0.08, 0.34, -0.05], [0.08, 0.08, 0.9], [0.5, 0.6, 0]);
        break;
      case 'icecrystal': {
        const ic = (cc) => flat(cc, { transparent: true, opacity: 0.88, emissive: 0x16405e, shininess: 80 });
        add(cone(6), ic('#9fdcff'), [0, 0.62, 0], [0.42, 1.24, 0.42]);
        add(cone(5), ic('#6ab4e0'), [-0.28, 0.36, 0.04], [0.3, 0.74, 0.3], [0, 0, 0.36]);
        add(cone(5), ic('#7cc4ec'), [0.28, 0.3, -0.04], [0.26, 0.62, 0.26], [0, 0, -0.34]);
        add(cone(5), ic('#8fd0f4'), [0.04, 0.22, 0.24], [0.2, 0.46, 0.2], [0.4, 0, 0]);
        break;
      }
      case 'pillar': {
        const jd = lam('#b9d0dc'), gd = lam('#d9b45a', { emissive: 0x3a2c08 });
        add(cyl(0.5, 0.5, 14), lam('#7f98a8'), [0, 0.07, 0], [0.62, 0.14, 0.62]);
        add(cyl(0.5, 0.5, 14), jd, [0, 0.9, 0], [0.44, 1.56, 0.44]);
        add(cyl(0.5, 0.5, 14), gd, [0, 0.24, 0], [0.48, 0.06, 0.48]); add(cyl(0.5, 0.5, 14), gd, [0, 1.56, 0], [0.48, 0.06, 0.48]);
        add(cyl(0.5, 0.5, 14), lam('#a9c0cf'), [0, 1.74, 0], [0.64, 0.14, 0.64]);
        break;
      }
      case 'statue': {
        const s1 = lam('#5c7080'), s2 = lam('#8fa4b4');
        add(box(), s1, [0, 0.12, 0], [0.66, 0.24, 0.5]);
        add(cyl(0.3, 0.5, 10), s2, [0, 0.6, 0], [0.46, 0.72, 0.36]);
        add(sph(10), s2, [0, 1.1, 0], 0.32); add(sph(8), s2, [0, 1.3, -0.02], 0.12);
        add(cyl(0.5, 0.5, 6), s1, [0.26, 0.9, 0.1], [0.045, 1.3, 0.045], [0, 0, -0.2]);
        break;
      }
    }
    return { g, mats: c.mats, anim };
  };

  /* ============================ 交互物 ============================ */
  Mo.chest = function () {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    const wood = lam('#6a4326'), gold = lam('#d9b45a', { emissive: 0x4a3608 });
    add(box(), wood, [0, 0.17, 0], [0.62, 0.34, 0.42]);
    add(box(), gold, [0, 0.17, 0], [0.1, 0.36, 0.44]); add(box(), gold, [0, 0.3, 0], [0.64, 0.05, 0.44]);
    const lid = grp([0, 0.34, -0.21]);
    const lg = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false, 0, PI);
    add(lg, lam('#8a5a34'), [0, 0, 0.21], [0.3, 0.62, 0.42], [0, 0, PI / 2], lid);
    add(box(), gold, [0, 0.0, 0.21], [0.1, 0.04, 0.44], null, lid);
    const gem = add(sph(8), glow('#ffe9a0'), [0, 0.3, 0.22], 0.09); gem.castShadow = false;
    return { g, mats: c.mats, update(it, t) { lid.rotation.x = it.used ? -1.9 : 0; gem.visible = !it.used; gem.scale.setScalar(0.09 + Math.sin(t * 4) * 0.015); } };
  };

  Mo.herbField = function () {
    const c = ctx(), { g, add, lam, glow, grp } = c;
    add(cyl(0.5, 0.52, 20), lam('#3b2a1e'), [0, 0.05, 0], [1.5, 0.1, 1.1]);
    add(cyl(0.5, 0.5, 20), lam('#4a3626'), [0, 0.085, 0], [1.3, 0.06, 0.92]);
    const cols = ['#7fe0a0', '#e07ad0', '#ffd45e', '#7ad0ff', '#ff8a6a'], herbs = [], buds = [];
    const stemM = lam('#4f9a58');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, r = i === 0 ? 0 : 0.36, s = grp([Math.cos(a) * r * 1.2, 0.1, Math.sin(a) * r * 0.85]);
      add(cyl(0.3, 0.5, 5), stemM, [0, 0.15, 0], [0.035, 0.3, 0.035], null, s);
      add(sph(6), stemM, [0.06, 0.1, 0], [0.14, 0.02, 0.06], [0, 0, 0.5], s); add(sph(6), stemM, [-0.06, 0.14, 0], [0.14, 0.02, 0.06], [0, 0, -0.5], s);
      const b = add(sph(8), glow(cols[i % 5]), [0, 0.33, 0], 0.09, null, s); b.castShadow = false; buds.push(b); herbs.push(s);
    }
    return { g, mats: c.mats, update(it, t) { herbs.forEach((s, i) => { s.rotation.z = Math.sin(t * 2 + i) * 0.1; s.scale.y = it.used ? 0.5 : 1; }); buds.forEach((b) => (b.visible = !it.used)); } };
  };

  Mo.shrine = function () {
    const c = ctx(), { g, add, lam } = c;
    const st = lam('#6b7078');
    add(cyl(0.7, 1, 6), st, [0, 0.1, 0], [0.7, 0.2, 0.5]);
    add(box(), lam('#868c96'), [0, 0.68, 0], [0.42, 0.98, 0.14]);
    add(cyl(0.5, 0.5, 12, 1), lam('#868c96'), [0, 1.17, 0], [0.42, 0.14, 0.42], [PI / 2, 0, 0]);
    const tex = new THREE.CanvasTexture(G.Tex.glyph('缘', '#ffe696')); tex.encoding = THREE.sRGBEncoding;
    const gm = new THREE.MeshBasicMaterial({ map: tex, transparent: true }); c.mats.push(gm);
    const gl = add(new THREE.PlaneGeometry(1, 1), gm, [0, 0.72, 0.075], 0.4); gl.castShadow = false;
    return { g, mats: c.mats, update(it, t) { gm.opacity = it.used ? 0.25 : 0.75 + Math.sin(t * 3) * 0.25; } };
  };

  Mo.shop = function () {
    const c = ctx(), { g, add, lam, glow } = c;
    const wood = lam('#5a3d2c');
    add(box(), wood, [0, 0.26, 0.2], [1.9, 0.52, 0.5]);
    add(box(), lam('#7a1f2c'), [0, 0.54, 0.2], [2.0, 0.05, 0.6]);
    for (const sx of [-1, 1]) add(cyl(0.5, 0.5, 6), wood, [sx * 0.92, 0.9, -0.2], [0.06, 1.8, 0.06]);
    add(box(), lam('#8a2a34'), [0, 1.78, 0], [2.1, 0.06, 0.9], [0.22, 0, 0]);
    const cols = ['#7dffb0', '#ffd45e', '#7ad0ff', '#ff8a6a', '#d0a0ff'], wares = [];
    for (let i = 0; i < 5; i++) { const w = add(i % 2 ? Mo.geo.oct() : sph(8), glow(cols[i]), [-0.64 + i * 0.32, 0.66, 0.22], 0.13); w.castShadow = false; wares.push(w); }
    const keeper = G.Assets.makeRig('shopkeeper', {}) || (G.Assets.ready && G.Assets.make('shopkeeper', { show: ['Rogue_Cape'] })) || Mo.human({ robe: '#8a6a3a', trim: '#f0d890', skin: '#f0d0b0', hat: 'bamboo', weapon: 'none' });
    keeper.g.position.set(0, 0, -0.26); g.add(keeper.g);
    return { g, mats: c.mats.concat(keeper.mats), update(it, t) { wares.forEach((w, i) => { w.position.y = 0.66 + Math.sin(t * 2 + i) * 0.03; w.rotation.y = t + i; }); keeper.update({ t, moving: false }); } };
  };

  Mo.portal = function (hex) {
    const c = ctx(), { g, add, glow } = c;
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = add(tor(0.035), glow(hex, { transparent: true, opacity: 0.9 - i * 0.2 }), [0, 0.04 + i * 0.02, 0], 1.3 - i * 0.34, [PI / 2, 0, 0]);
      r.castShadow = false; rings.push(r);
    }
    const beam = add(cyl(0.3, 0.5, 16), glow(hex, { transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [0, 1.1, 0], [1.0, 2.2, 1.0]);
    beam.castShadow = false;
    return { g, mats: c.mats, update(it, t) { rings.forEach((r, i) => { r.rotation.z = t * (0.8 + i * 0.5) * (i % 2 ? -1 : 1); r.position.y = 0.05 + i * 0.03 + Math.sin(t * 2 + i) * 0.03; }); beam.scale.x = beam.scale.z = 1 + Math.sin(t * 3) * 0.08; } };
  };

  /* ============================ 小物 ============================ */
  /* ============================ 法器：飞剑 ============================
     剑身几何体：沿 +Z，菱形截面，前端收成剑尖。所有飞剑、巨剑、羽刃都用它。 */
  function bladeGeo() {
    return gg('blade', () => {
      const T = [0, 0, 0.5], zb = 0.18, A = [[0.5, 0, zb], [0, 0.5, zb], [-0.5, 0, zb], [0, -0.5, zb]], B = A.map((v) => [v[0], v[1], -0.5]);
      const tri = [];
      for (let i = 0; i < 4; i++) { const k = (i + 1) % 4; tri.push(T, A[i], A[k], A[i], B[i], B[k], A[i], B[k], A[k]); }
      tri.push(B[0], B[2], B[1], B[0], B[3], B[2]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals(); return g;
    });
  }
  Mo.bladeGeo = bladeGeo;
  const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, side: THREE.DoubleSide }, o));
  const aura = (c, op) => basic(c, { transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

  /* 三档飞剑，随功法进境换形：
     0 凡铁飞剑 —— 铁色剑身，只有一线微光
     1 青元剑光 —— 青元剑诀：月白剑身，青色剑芒
     2 青竹蜂云剑 —— 竹节剑身、亮剑尖、金色剑格
     mini 金蚨子刃 */
  const SWORD = {
    0: { blade: 0xd6dfe6, aura: 0x8fd8d0, glow: 0.26, guard: 0x7a5a34 },
    1: { blade: 0xeafff6, aura: 0x5cffb0, glow: 0.42, guard: 0xd9b45a },
    2: { blade: 0xb2ea80, aura: 0x9aff4a, glow: 0.42, guard: 0xf0cc5a, joint: 0x4a8e38, tip: 0xf4ffe2 },
    mini: { blade: 0xfff0c0, aura: 0xffdc82, glow: 0.4, L: 0.36 },
  };
  Mo.sword = function (style) {
    const st = SWORD[style] || SWORD[0], L = st.L || 0.62, g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const add = (geo, m, p, sc) => { const x = new THREE.Mesh(geo, m); x.position.set(p[0], p[1], p[2]); x.scale.set(sc[0], sc[1], sc[2]); g.add(x); return x; };
    add(bladeGeo(), aura(st.aura, st.glow), [0, 0, L * 0.08], [0.2, 0.07, L * 1.3]);
    add(bladeGeo(), basic(st.blade), [0, 0, L * 0.1], [0.085, 0.03, L]);
    if (st.joint) { // 竹节与亮剑尖
      const jm = basic(st.joint);
      for (let i = 0; i < 3; i++) add(box(), jm, [0, 0, -L * 0.4 + (i + 0.6) * L * 0.207], [0.1 - i * 0.012, 0.042, 0.022]);
      add(bladeGeo(), basic(st.tip), [0, 0, L * 0.42], [0.05, 0.033, L * 0.34]);
    }
    if (st.guard) { add(box(), basic(st.guard), [0, 0, -L * 0.42], [0.19, 0.045, 0.035]); add(box(), basic(0x2a2422), [0, 0, -L * 0.55], [0.035, 0.035, L * 0.24]); }
    return g;
  };

  /* 巨剑术：青元剑光聚成的巨剑，剑尖朝下，原点在剑尖 */
  Mo.giantSword = function () {
    const g = new THREE.Group(), mats = [];
    const mk = (c, o) => { const m = basic(c, Object.assign({ transparent: true }, o)); m.userData.o0 = (o && o.opacity) || 1; mats.push(m); return m; };
    const add = (geo, m, p, sc, down) => { const x = new THREE.Mesh(geo, m); x.position.set(p[0], p[1], p[2]); x.scale.set(sc[0], sc[1], sc[2]); if (down) x.rotation.x = PI / 2; g.add(x); return x; };
    add(bladeGeo(), mk(0x5cffb0, { opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }), [0, 1.6, 0], [1.25, 0.34, 3.5], true);
    add(bladeGeo(), mk(0xeafff6), [0, 1.5, 0], [0.62, 0.12, 3.0], true);
    add(bladeGeo(), mk(0x9ff0cc), [0, 1.5, 0], [0.16, 0.14, 2.9], true);
    add(box(), mk(0xd9b45a), [0, 3.08, 0], [1.2, 0.16, 0.16]);
    add(box(), mk(0x2a2422), [0, 3.5, 0], [0.15, 0.7, 0.13]);
    g.userData.mats = mats;
    return g;
  };

  /* 风雷翅：一对由羽刃排成的光翼，原点在脚下，朝 +Z */
  Mo.wings = function () {
    const g = new THREE.Group(), m1 = aura(0x8fa8ff, 0.34), m2 = aura(0xdfe8ff, 0.6), m3 = aura(0xffe36a, 0.7);
    const z1 = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3();
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
      const k = i / 5, len = 0.95 - k * 0.42, up = 1.05 - k * 1.25; // 自上而下六根羽刃
      d.set(sx * Math.cos(up), Math.sin(up), -0.35 - k * 0.15).normalize();
      for (const [m, w] of [[m1, 0.13], [i % 2 ? m3 : m2, 0.045]]) {
        const f = new THREE.Mesh(bladeGeo(), m); f.scale.set(w, 0.02, len);
        f.quaternion.setFromUnitVectors(z1, d); f.position.set(sx * 0.14, 1.02, -0.14).addScaledVector(d, len * 0.5); g.add(f);
      }
    }
    g.userData.mats = [m1, m2, m3]; for (const m of g.userData.mats) m.userData.o0 = m.opacity;
    return g;
  };

  /* 玄铁飞天盾：六角玄铁盾牌，原点在盾心，盾面朝 +Z */
  Mo.shieldPlate = function () {
    const g = new THREE.Group();
    const hex = gg('hex', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
    const add = (m, sc, z) => { const x = new THREE.Mesh(hex, m); x.rotation.x = PI / 2; x.scale.set(sc, 0.07, sc); x.position.z = z; g.add(x); return x; };
    add(basic(0xbcd8ff), 0.62, -0.012);                                   // 灵光镶边
    add(new THREE.MeshLambertMaterial({ color: 0x39414f, emissive: 0x10141c }), 0.54, 0);
    add(new THREE.MeshLambertMaterial({ color: 0x5a6578, emissive: 0x161b26 }), 0.3, 0.03);
    add(basic(0xdcecff), 0.1, 0.06);
    return g;
  };
})();
