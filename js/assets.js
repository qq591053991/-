'use strict';
/* 凡人问道 —— 社区模型：加载 KayKit 角色（GLB）、按角色换色、带上下半身分层的骨骼动画。
   模型数据在 assets/models.js（base64 内嵌，file:// 下也能用）。加载失败时游戏自动退回 js/models.js 里的几何体模型。 */
(function () {
  const G = window.G, U = G.U;
  const As = (G.Assets = { ready: false, failed: false, settled: false, models: {}, clips: {}, tex: {}, tripo: {} });

  /* ---------- 角色配置：基础模型 + 贴图换色 + 默认显示的配件 ----------
     hue:  [起始色相, 结束色相, 新色相, 饱和度倍率, 明度倍率]  —— 只作用于有彩色的像素
     gray: [色相, 饱和度, 明度倍率]                              —— 给灰色金属上色
     dark: 明度                                                  —— 把近黑色（头发）提亮成灰白
     tint: 材质乘色 */
  const V = {
    hanli:      { m: 'Mage', hue: [[200, 345, 168, 0.8, 1.0]] },
    disciple:   { m: 'Mage', hue: [[200, 345, 286, 0.75, 1.2]] },
    flamecult:  { m: 'Mage', hue: [[200, 345, 6, 1.0, 0.62]], tint: [0.92, 0.85, 0.9] },
    jiyin:      { m: 'Mage', hue: [[200, 345, 140, 0.7, 0.5]], dark: 0.74, tint: [0.86, 0.96, 0.88] },
    thug:       { m: 'Barbarian', hue: [[185, 255, 24, 0.75, 0.78]] },
    modaifu:    { m: 'Barbarian', hue: [[185, 255, 215, 0.16, 1.05]] },
    ironslave:  { m: 'Knight', gray: [215, 0.16, 0.6], hue: [[320, 30, 20, 0.5, 0.55]], tint: [0.84, 0.88, 0.96] },
    golem:      { m: 'Knight', gray: [200, 0.3, 1.12], hue: [[320, 30, 190, 0.9, 1.0]], tint: [0.9, 0.98, 1.0] },
    wangchan:   { m: 'Knight', gray: [352, 0.6, 0.72] },
    archer:     { m: 'Rogue_Hooded', hue: [[90, 185, 62, 0.7, 0.72]] },
    ghostcult:  { m: 'Rogue_Hooded', hue: [[90, 185, 158, 0.7, 0.42]], tint: [0.82, 0.92, 0.86] },
    bloodguard: { m: 'Rogue', hue: [[90, 185, 354, 1.0, 0.78]], dark: 0.2 },
    shopkeeper: { m: 'Rogue', hue: [[90, 185, 40, 0.85, 1.0]] },
    ironcorpse: { m: 'Skeleton_Warrior', hue: [[290, 30, 130, 0.8, 0.8]], tint: [0.72, 0.95, 0.78], glow: 0x9dff6a },
    corpse:     { m: 'Skeleton_Warrior', hue: [[290, 30, 34, 0.9, 0.9]], tint: [1.0, 0.82, 0.55], glow: 0xa0ff6a },
  };
  As.V = V;

  /* 出招动画：[片段名, 出手时刻占比] */
  const ATK = {
    chop1: ['1H_Melee_Attack_Chop', 0.42], chop2: ['2H_Melee_Attack_Chop', 0.5], shoot1: ['1H_Ranged_Shoot', 0.2], shoot2: ['2H_Ranged_Shoot', 0.2],
    cast: ['Spellcast_Shoot', 0.42], raise: ['Spellcast_Raise', 0.45], punch: ['Unarmed_Melee_Attack_Punch_A', 0.3], throw: ['Throw', 0.45],
  };
  const UPPER = /^(spine|chest|upperarm|lowerarm|wrist|hand|handslot|head|elbowIK|handIK)/;
  const SCALE = 0.5; // KayKit 角色约 2.6 单位高 → 约 1.3 格

  function b64(s) { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

  As.load = function (done) {
    const data = window.G_MODEL_DATA, tdata = window.G_TRIPO_DATA || {};
    const fail = (why) => { if (!this.failed) console.warn('[凡人问道] 社区模型未能加载，改用内置几何体模型：', why); this.failed = true; };
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) { fail('缺少加载器'); this.settled = true; done && done(); return; }
    if (!data) fail('缺少模型数据');
    const loader = new THREE.GLTFLoader(), keys = Object.keys(data || {}), tkeys = Object.keys(tdata);
    let left = keys.length + tkeys.length;
    if (!left) { this.settled = true; done && done(); return; }
    const fin = () => { if (--left > 0) return; this.ready = !this.failed && keys.length > 0; this.settled = true; window.G_MODEL_DATA = window.G_TRIPO_DATA = null; done && done(); };
    for (const k of keys) {
      try {
        loader.parse(b64(data[k]), '', (g) => {
          if (k === 'anims') for (const c of g.animations) { // 拆成上半身 / 下半身两层，便于「边跑边出招」
            const up = [], lo = [];
            for (const t of c.tracks) (UPPER.test(t.name.split('.')[0]) ? up : lo).push(t);
            this.clips[c.name] = { dur: c.duration, U: new THREE.AnimationClip(c.name + '_U', c.duration, up), L: new THREE.AnimationClip(c.name + '_L', c.duration, lo) };
          } else this.models[k] = g.scene;
          fin();
        }, (e) => { fail(e && e.message); fin(); });
      } catch (e) { fail(e.message); fin(); }
    }
    // Tripo 生成的角色（名字即角色键名：hanli、modaifu、thug……有就用，没有就退回 KayKit / 几何体模型）
    for (const k of tkeys) {
      try { loader.parse(b64(tdata[k]), '', (g) => { this.tripo[k] = g.scene; fin(); }, (e) => { console.warn('[凡人问道] Tripo 模型加载失败：', k, e && e.message); fin(); }); }
      catch (e) { console.warn('[凡人问道] Tripo 模型加载失败：', k, e.message); fin(); }
    }
  };

  /* ---------- 贴图换色（在 256×256 的画布上逐像素改色相） ---------- */
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s, l];
  }
  function rgbOf(h, s, l) {
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    h /= 360; if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  function texture(key) {
    if (As.tex[key]) return As.tex[key];
    const v = V[key]; let img = null;
    As.models[v.m].traverse((c) => { if (!img && c.isMesh && c.material.map) img = c.material.map.image; });
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      let [h, s, l] = hsl(p[i], p[i + 1], p[i + 2]), hit = false;
      if (s > 0.2 && v.hue) for (const r of v.hue) {
        const inR = r[0] <= r[1] ? h >= r[0] && h <= r[1] : h >= r[0] || h <= r[1];
        if (inR) { h = r[2]; s = Math.min(1, s * r[3]); l = Math.min(0.96, l * r[4]); hit = true; break; }
      }
      if (!hit && v.gray && s <= 0.2 && l > 0.2 && l < 0.92) { h = v.gray[0]; s = v.gray[1]; l = Math.min(0.95, l * v.gray[2]); hit = true; }
      if (!hit && v.dark && l < 0.17) { s = 0.04; l = v.dark - (0.17 - l) * 0.8; hit = true; }
      if (hit) { const c = rgbOf(h, s, l); p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; }
    }
    cx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.flipY = false;
    return (As.tex[key] = t);
  }

  /* ---------- 生成一个角色实例 ---------- */
  As.make = function (key, o = {}) {
    if (!this.ready) return null;
    const v = V[key]; if (!v || !this.models[v.m]) return null;
    const root = THREE.SkeletonUtils.clone(this.models[v.m]);
    const tex = texture(key), show = new Set(o.show || []);
    const body = new THREE.MeshLambertMaterial({ map: tex }), mats = [body];
    if (v.tint) body.color.setRGB(v.tint[0], v.tint[1], v.tint[2]);
    let glow = null;
    root.traverse((c) => {
      if (!c.isMesh) return;
      if (!c.isSkinnedMesh && !show.has(c.name)) { c.visible = false; return; }
      if (c.material.name === 'Glow') { if (!glow) { glow = new THREE.MeshBasicMaterial({ color: v.glow || 0xffe07a }); mats.push(glow); } c.material = glow; }
      else c.material = body;
      c.castShadow = true; c.frustumCulled = false;
    });
    for (const m of mats) { m.userData.o0 = 1; if (m.emissive) m.userData.e0 = m.emissive.clone(); }
    const sc = SCALE * (o.scale || 1);
    root.scale.setScalar(sc);
    const g = new THREE.Group(); g.add(root);

    const mixer = new THREE.AnimationMixer(root), acts = { U: {}, L: {} }, A = o.atk ? ATK[o.atk] : null, C = this.clips;
    const loco = o.walk ? 'Walking_A' : 'Running_A';
    const act = (layer, name) => {
      let a = acts[layer][name];
      if (!a) { a = mixer.clipAction(C[name][layer]); a.setEffectiveWeight(0); a.play(); acts[layer][name] = a; }
      return a;
    };
    const setLayer = (layer, name, time, dt) => {
      const tgt = act(layer, name), k = Math.min(1, dt * 14);
      for (const n in acts[layer]) { const a = acts[layer][n], w = a.getEffectiveWeight(), to = a === tgt ? 1 : 0; a.setEffectiveWeight(Math.abs(to - w) < 0.02 ? to : w + (to - w) * k); }
      if (time >= 0) { tgt.paused = true; tgt.time = time; } else tgt.paused = false;
    };
    act('L', 'Idle').setEffectiveWeight(1); act('U', 'Idle').setEffectiveWeight(1);
    act('L', loco); act('U', loco);

    const m = { g, mats, gl: true, h: 1.32 * (o.scale || 1), lt: null, _f: 0, _a: 1 };
    m.update = function (e) {
      const t = e.t || 0; let dt = this.lt === null ? 0.016 : t - this.lt; this.lt = t;
      if (!(dt >= 0 && dt < 0.25)) dt = 0.016;
      const moving = !!e.moving, wind = e.wind || 0, atk = e.atk || 0;
      let lo = moving ? loco : 'Idle', up = lo, upT = -1;
      if (e.dashing) lo = up = 'Dodge_Forward';
      else if (A && wind > 0.03) { up = A[0]; upT = Math.min(1, wind) * A[1] * C[up].dur; }
      else if (A && atk > 0.03) { up = A[0]; upT = (A[1] + (1 - Math.min(1, atk)) * (1 - A[1]) * 0.8) * C[up].dur; }
      setLayer('L', lo, -1, dt); setLayer('U', up, upT, dt);
      const ts = e.charge || e.st === 'lunge' ? 1.8 : o.walk ? 1.0 : 1.15;
      acts.L[loco].timeScale = ts; acts.U[loco].timeScale = ts;
      mixer.update(dt);
    };
    m.setFlash = function (f) {
      f = f > 0 ? 1 : 0; if (f === this._f) return; this._f = f;
      for (const mt of mats) if (mt.emissive) { mt.emissive.copy(mt.userData.e0); if (f) mt.emissive.addScalar(0.4); }
    };
    m.setAlpha = function (a) {
      a = Math.round(a * 20) / 20; if (a === this._a) return; this._a = a;
      for (const mt of mats) { mt.opacity = a; mt.transparent = a < 0.999; mt.depthWrite = a > 0.5; }
    };
    m.dispose = function () { mixer.stopAllAction(); mixer.uncacheRoot(root); for (const mt of mats) mt.dispose(); };
    return m;
  };
  /* ============================ Tripo 角色（Mixamo 骨骼）============================
     Tripo 导出的模型只带骨骼、不带动画，这里按骨骼直接算姿势：待机、奔跑、出招、闪避。
     每根骨骼的转动都以「角色空间的坐标轴」给出（X 指向角色左侧，Y 向上，Z 向前），
     再换算回骨骼自己的局部坐标，所以不依赖模型导出时骨骼轴向怎么摆。 */
  const RIG = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const STYLE = { chop1: 'chop', chop2: 'chop', punch: 'chop', shoot1: 'shoot', shoot2: 'shoot', cast: 'cast', throw: 'cast', raise: 'raise' };
  const lerp = (a, b2, t) => a + (b2 - a) * t;

  As.makeRig = function (name, o = {}) {
    const src = this.tripo[name]; if (!src) return null;
    const root = THREE.SkeletonUtils.clone(src); root.updateMatrixWorld(true);
    const B = {}, v = new THREE.Vector3(), mats = [];
    let top = 0, hx = 0, hz = 0;
    root.traverse((c) => {
      if (c.isBone) {
        const n = c.name.replace(/^mixamorig:?/, ''); c.getWorldPosition(v); top = Math.max(top, v.y);
        if (n === 'Hips') { hx = v.x; hz = v.z; }
        if (RIG.includes(n)) { const w = c.getWorldQuaternion(new THREE.Quaternion()); B[n] = { b: c, q0: c.quaternion.clone(), w, wi: w.clone().invert() }; }
      } else if (c.isMesh) {
        const m = new THREE.MeshLambertMaterial({ map: c.material.map || null, color: c.material.map ? 0xffffff : c.material.color });
        m.userData.o0 = 1; m.userData.e0 = m.emissive.clone(); mats.push(m);
        c.material = m; c.castShadow = true; c.frustumCulled = false;
      }
    });
    if (!B.Hips || !B.LeftUpLeg || !B.LeftArm || !(top > 0)) return null; // 不是 Mixamo 骨骼
    const sc = ((o.height || 1.2) / top) * (o.scale || 1); // 头顶骨骼对齐到约 1.2 格高
    root.scale.multiplyScalar(sc); root.position.set(-hx * sc, 0, -hz * sc);
    const g = new THREE.Group(); g.add(root);

    const E3 = new THREE.Euler(), Q = new THREE.Quaternion(), T2 = new THREE.Quaternion();
    const set = (n, x, y, z) => { const k = B[n]; if (!k) return; E3.set(x, y, z, 'XYZ'); Q.setFromEuler(E3); k.b.quaternion.copy(k.q0).multiply(T2.copy(k.wi).multiply(Q).multiply(k.w)); };
    const style = STYLE[o.atk] || o.atk || 'cast';
    const m = { g, mats, gl: true, rig: true, h: 1.35 * (o.scale || 1), lt: null, wr: 0, wd: 0, ph: Math.random() * 6, _f: 0, _a: 1 };

    m.update = function (e) {
      const t = e.t || 0; let dt = this.lt === null ? 0.016 : t - this.lt; this.lt = t;
      if (!(dt >= 0 && dt < 0.25)) dt = 0.016;
      const k = Math.min(1, dt * 12);
      this.wr += ((e.moving ? 1 : 0) - this.wr) * k; this.wd += ((e.dashing ? 1 : 0) - this.wd) * Math.min(1, dt * 20);
      this.ph += dt * (e.charge || e.st === 'lunge' ? 17 : o.walk ? 8 : 11.5) * (0.35 + 0.65 * this.wr);
      const wr = this.wr, wd = this.wd, s = Math.sin(this.ph), c = Math.cos(this.ph), br = Math.sin(t * 2.2), idle = 1 - wr;
      const wind = Math.min(1, e.wind || 0), atk = Math.min(1, e.atk || 0);
      // 腿：摆动 + 抬腿时屈膝
      let lu = -0.72 * s * wr, ru = 0.72 * s * wr, lk = (0.1 + 0.95 * Math.max(0, c)) * wr, rk = (0.1 + 0.95 * Math.max(0, -c)) * wr;
      // 手臂：A 字站姿先放低一些；奔跑时与腿反向摆动、屈肘
      let lax = 0.65 * s * wr, laz = -0.3 + 0.03 * br * idle, lfx = -0.12 - 0.8 * wr;
      let rax = -0.65 * s * wr, raz = 0.3 - 0.03 * br * idle, rfx = -0.12 - 0.8 * wr;
      let spx = 0.02 * br * idle + 0.16 * wr, sp2y = 0.12 * s * wr, hpy = -0.1 * s * wr, hdx = -0.03 * br * idle - 0.1 * wr, hdy = 0.06 * Math.sin(t * 0.7) * idle;
      // 出招
      if (style === 'cast') { // 并指前递：御剑 / 施法
        const w = Math.max(wind, atk); if (w > 0.01) { const q = w * (2 - w); rax = lerp(rax, -1.4, q); raz = lerp(raz, 0.5, q); rfx = lerp(rfx, -0.08, q); sp2y = lerp(sp2y, 0.24, q); lax = lerp(lax, 0.3, q * 0.6); }
      } else if (style === 'chop') { // 举起 → 劈下
        const up = wind > 0.01 ? wind : atk * atk, q = Math.max(wind, atk > 0.01 ? 1 : 0);
        if (q > 0) { rax = lerp(rax, lerp(-0.6, -2.7, up), q); raz = lerp(raz, 0.25, q); rfx = lerp(rfx, lerp(-0.2, -0.9, up), q); spx += lerp(0.22, -0.12, up) * q; sp2y = lerp(sp2y, lerp(0.3, -0.25, up), q); }
      } else if (style === 'raise') { // 双臂高举：召唤 / 落雷
        const w = Math.max(wind, atk); if (w > 0.01) { const q = w * (2 - w); rax = lerp(rax, -2.35, q); lax = lerp(lax, -2.35, q); raz = lerp(raz, 0.15, q); laz = lerp(laz, -0.15, q); rfx = lerp(rfx, -0.25, q); lfx = lerp(lfx, -0.25, q); hdx -= 0.18 * q; }
      } else if (style === 'shoot') { // 双手前举
        const w = Math.max(wind, atk); if (w > 0.01) { const q = w * (2 - w); rax = lerp(rax, -1.45, q); lax = lerp(lax, -1.3, q); raz = lerp(raz, 0.55, q); laz = lerp(laz, -0.55, q); rfx = lerp(rfx, -0.1, q); lfx = lerp(lfx, -0.35, q); }
      }
      // 闪避：前倾、双臂后掠、弓步
      if (wd > 0.01) { spx += 0.5 * wd; lax = lerp(lax, 1.05, wd); rax = lerp(rax, 1.05, wd); lfx = lerp(lfx, -0.1, wd); rfx = lerp(rfx, -0.1, wd); lu = lerp(lu, -0.95, wd); ru = lerp(ru, 0.55, wd); lk = lerp(lk, 0.75, wd); rk = lerp(rk, 0.35, wd); }
      set('Hips', 0, hpy, 0); set('Spine', spx, 0, 0); set('Spine2', 0, sp2y, 0); set('Head', hdx, hdy, 0);
      set('LeftArm', lax, 0, laz); set('RightArm', rax, 0, raz); set('LeftForeArm', lfx, 0, 0); set('RightForeArm', rfx, 0, 0);
      set('LeftUpLeg', lu, 0, 0); set('RightUpLeg', ru, 0, 0); set('LeftLeg', lk, 0, 0); set('RightLeg', rk, 0, 0);
      set('LeftFoot', -lk * 0.35, 0, 0); set('RightFoot', -rk * 0.35, 0, 0);
      root.position.y = (Math.abs(c) * 0.035 * wr + br * 0.006 * idle) * sc / 1.45;
    };
    m.setFlash = function (f) {
      f = f > 0 ? 1 : 0; if (f === this._f) return; this._f = f;
      for (const mt of mats) { mt.emissive.copy(mt.userData.e0); if (f) mt.emissive.addScalar(0.4); }
    };
    m.setAlpha = function (a) {
      a = Math.round(a * 20) / 20; if (a === this._a) return; this._a = a;
      for (const mt of mats) { mt.opacity = a; mt.transparent = a < 0.999; mt.depthWrite = a > 0.5; }
    };
    m.dispose = function () { for (const mt of mats) mt.dispose(); };
    m.update({ t: 0 });
    return m;
  };
})();
