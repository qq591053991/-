'use strict';
/* 凡人问道 —— 渲染（Three.js）：倾斜透视相机下的真 3D 场景。
   世界坐标：游戏逻辑的 (x, y) 像素平面 → 三维 (x/48, 高度, y/48)，一格 = 1 单位。
   飘字、血条、闪电等贴在最上层的东西画在一张 2D 叠加画布上（按相机投影定位）。 */
(function () {
  const G = window.G, U = G.U, T = G.TILE, TAU = G.TAU, PI = Math.PI, S = 1 / T;
  const Mo = G.Models, Tx = G.Tex;
  const FONT = '"STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif CJK SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif';
  const R = (G.Render = { FONT, ok: true, t: 0 });

  const PITCH = 0.84, FOV = 26, HALF_TAN = Math.tan((FOV * PI) / 360), BASE_DIST = 23;
  const ACTOR = 1.3; // 角色模型整体放大（Q 版比例，俯视下更易辨认）
  const HN = 1.5, HS = 0.9, HL = 0.38, HI = 0.8; // 北墙 / 侧墙 / 南矮墙 / 内墙 高度
  const MAX_LIGHTS = 6;

  let renderer, scene, camera, hemi, sun, pLight, dyn, ov, octx, W = 1, H = 1, dpr = 1;
  let cur = null, curRoom = null, frame = 0, camSnap = true, maxAniso = 1;
  const camT = new THREE.Vector3(), built = new Set();
  const roomLights = [], mists = [], motes = [];
  const actors = new Map(), inters = new Map(), allyM = new Map();
  let heroM = null, heroOwner = null, menuRoom = null, menuHero = null;
  let vignette = null, glowTex = null, webTex = null, glyphTex = null;
  const v3 = new THREE.Vector3(), dummy = new THREE.Object3D(), tmpC = new THREE.Color();

  /* ---------- 小工具 ---------- */
  function ctex(cv, repeat) {
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  const rgbCache = {};
  function rgb(str) { // 'r,g,b' → [0..1]（显示空间）
    let c = rgbCache[str];
    if (!c) { const a = String(str).split(','); c = rgbCache[str] = [a[0] / 255, a[1] / 255, a[2] / 255]; c.col = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); c.css = `rgb(${str})`; }
    return c;
  }
  function hexRgb(h) { return parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16); }

  /* 对象池：每帧 begin → get… → end，未取用的自动隐藏 */
  function Pool(make) { this.items = []; this.n = 0; this.make = make; }
  Pool.prototype.begin = function () { this.n = 0; };
  Pool.prototype.get = function () {
    let o = this.items[this.n];
    if (!o) { o = this.make(); this.items.push(o); dyn.add(o); }
    this.n++; o.visible = true; return o;
  };
  Pool.prototype.end = function () { for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false; };

  /* 点云：粒子与光晕 */
  function Cloud(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.colr = new Float32Array(max * 4); this.size = new Float32Array(max);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('acolor', new THREE.BufferAttribute(this.colr, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: additive ? 1 : 0 }, uK: { value: 1 } },
      vertexShader: 'attribute vec4 acolor; attribute float size; varying vec4 vC; uniform float uScale; void main(){ vC = acolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(240.0, size * uScale / max(0.1,-mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; uniform float uSoft; uniform float uK; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float a = mix(smoothstep(1.0, 0.7, r), (1.0 - r) * (1.0 - r) * 1.6, uSoft); gl_FragColor = vec4(vC.rgb, vC.a * min(1.0, a) * uK); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.obj = new THREE.Points(g, this.mat); this.obj.frustumCulled = false; this.obj.renderOrder = additive ? 30 : 20;
  }
  Cloud.prototype.push = function (x, y, z, c, a, size) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.colr[i * 4] = c[0]; this.colr[i * 4 + 1] = c[1]; this.colr[i * 4 + 2] = c[2]; this.colr[i * 4 + 3] = a;
    this.size[i] = size;
  };
  Cloud.prototype.end = function () {
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = this.geo.attributes.acolor.needsUpdate = this.geo.attributes.size.needsUpdate = true;
    this.mat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * HALF_TAN);
  };

  let glows, dusts, orbs, shards, P = {};

  /* ============================ 初始化 ============================ */
  R.init = function (cv) {
    this.cv = cv;
    ov = document.getElementById('fx2d'); octx = ov.getContext('2d');
    try {
      if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { this.ok = false; const n = document.getElementById('nogl'); if (n) n.className = 'show'; return; }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 24, 70);
    camera = new THREE.PerspectiveCamera(FOV, 1, 1, 260);
    hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.castShadow = true;
    // 手机上降低阴影贴图与像素比，保住帧率
    R.lite = (navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) < 820;
    const sm = R.lite ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;
    scene.add(sun); scene.add(sun.target);
    pLight = new THREE.PointLight(0xfff0d8, 0.85, 9, 1.2); scene.add(pLight);
    for (let i = 0; i < MAX_LIGHTS; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.4); scene.add(l); roomLights.push(l); }
    dyn = new THREE.Group(); scene.add(dyn);

    glowTex = ctex(Tx.radial(128, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]));
    webTex = ctex(Tx.web());
    glyphTex = ctex(Tx.glyph('禁', '#ffd0d0'));
    vignette = Tx.radial(256, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);

    // 云海
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
      s.userData = { a: Math.random() * TAU, r: 14 + Math.random() * 16, y: -3 - Math.random() * 5, sp: (0.01 + Math.random() * 0.02) * (i % 2 ? 1 : -1) };
      s.scale.set(26 + Math.random() * 18, 9 + Math.random() * 6, 1); s.renderOrder = -5;
      scene.add(s); mists.push(s);
    }
    for (let i = 0; i < 54; i++) motes.push({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * TAU, v: 0.5 + Math.random() });

    glows = new Cloud(2600, true); dusts = new Cloud(700, false);
    scene.add(glows.obj); scene.add(dusts.obj);

    const mkInst = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, tmpC.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    };
    orbs = mkInst(Mo.geo.sph(10), 900); shards = mkInst(Mo.geo.oct(), 500);

    // 贴地图形的池
    const flatMat = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
    const circG = new THREE.CircleGeometry(1, 48), ringG = new THREE.RingGeometry(0.93, 1, 64), thinG = new THREE.RingGeometry(0.86, 1, 64), planeG = new THREE.PlaneGeometry(1, 1);
    const flat = (geo, o) => () => { const m = new THREE.Mesh(geo, flatMat(o)); m.rotation.x = -PI / 2; return m; };
    P.circ = new Pool(flat(circG)); P.ring = new Pool(flat(ringG)); P.band = new Pool(() => { const m = new THREE.Mesh(planeG, flatMat({ side: THREE.DoubleSide })); m.rotation.order = 'YXZ'; return m; });
    P.fxring = new Pool(flat(thinG, { blending: THREE.AdditiveBlending }));
    P.web = new Pool(flat(circG, { map: webTex }));
    P.beam = new Pool(() => new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    P.sword = new Pool(() => Mo.sword(0x96ffdc)); P.mini = new Pool(() => Mo.sword(0xffdc82, true)); P.fsword = new Pool(() => Mo.sword(0x6effc8));
    P.swQ = new Pool(() => Mo.sword(0x5cff9a, false, 0xe6fff0)); // 青元剑诀：青色剑光
    P.swF = new Pool(() => Mo.sword(0x9aff4a, false, 0xd8ffa8, 0xffe36a)); // 青竹蜂云剑：竹青剑身 + 金色雷弧
    P.gem = new Pool(() => { const m = new THREE.Mesh(Mo.geo.oct(), new THREE.MeshBasicMaterial({ color: 0x8affd8 })); m.scale.set(0.15, 0.24, 0.15); return m; });
    P.potion = new Pool(() => { const g = new THREE.Group(); const a = new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshLambertMaterial({ color: 0xe0484a, emissive: 0x5a1012 })); a.scale.setScalar(0.24); const b = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xd9b45a })); b.scale.set(0.09, 0.14, 0.09); b.position.y = 0.16; g.add(a, b); return g; });
    P.ball = new Pool(() => new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    P.giant = new Pool(() => Mo.giantSword());
    P.shield = new Pool(() => new THREE.Mesh(Mo.geo.sph(14), new THREE.MeshBasicMaterial({ color: 0xbcd8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  };

  R.resize = function () {
    if (!this.ok) return;
    W = Math.max(320, window.innerWidth); H = Math.max(240, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(R.lite ? Math.min(dpr, 1.5) : dpr); renderer.setSize(W, H, false);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); ov.style.width = W + 'px'; ov.style.height = H + 'px';
    camera.aspect = W / H; camera.updateProjectionMatrix();
  };

  /* 屏幕坐标 → 地面上的游戏坐标 */
  R.toWorld = function (cx, cy) {
    if (!this.ok) return { x: 0, y: 0 };
    v3.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position);
    const k = -camera.position.y / (v3.y || -1e-6);
    return { x: (camera.position.x + v3.x * k) * T, y: (camera.position.z + v3.z * k) * T };
  };
  /* 游戏坐标 → 屏幕坐标（CSS 像素） */
  function proj(x, y, z) { v3.set(x * S, (z || 0) * S, y * S).project(camera); return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H }; }
  R.toScreen = (x, y, z) => proj(x, y, z);
  R.updateCam = function (dt, snap) { if (snap) camSnap = true; };

  /* ============================ 房间场景 ============================ */
  function buildRoom(room) {
    const ti = room.theme, th = G.Themes[ti], w = room.w, h = room.h, tiles = room.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : tiles[y * w + x]);
    const g = new THREE.Group(), rs = { g, tex: [], mats: [], geos: [], anims: [], doors: {}, lights: [], sprites: [] };
    const tx = (t) => { rs.tex.push(t); return t; };
    const lm = (o) => { const m = new THREE.MeshLambertMaterial(o); rs.mats.push(m); return m; };
    const boxG = Mo.geo.box();
    const mesh = (mat, x, y, z, sx, sy, sz, cast = true) => { const m = new THREE.Mesh(boxG, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };

    // 地面
    const fgeo = new THREE.PlaneGeometry(w, h); rs.geos.push(fgeo);
    const floor = new THREE.Mesh(fgeo, lm({ map: tx(ctex(Tx.floor(room))) }));
    floor.rotation.x = -PI / 2; floor.position.set(w / 2, 0, h / 2); floor.receiveShadow = true; g.add(floor);
    // 浮岛基座
    const rock = lm({ color: new THREE.Color(Tx.shade(th.base, -0.3)) }), rock2 = new THREE.MeshPhongMaterial({ color: new THREE.Color(Tx.shade(th.base, -0.45)), flatShading: true, shininess: 4 });
    rs.mats.push(rock2);
    mesh(rock, w / 2, -1.01, h / 2, w + 0.3, 2, h + 0.3, false);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(Mo.geo.cone(6), rock2), s = 2.5 + U.hash(i, w, 3) * 4;
      c.position.set(1 + U.hash(i, h, 1) * (w - 2), -2 - s * 0.9, 1 + U.hash(i, w, 2) * (h - 2)); c.scale.set(s, s * 2, s); c.rotation.x = PI; g.add(c);
    }

    // 墙体
    const topC = Tx.wallTop(ti), plainC = Tx.wallPlain(ti);
    const topT = (rx, ry) => { const t = tx(ctex(topC, true)); t.repeat.set(rx, ry); return t; };
    const plainT = (rx) => { const t = tx(ctex(plainC, true)); t.repeat.set(rx, 1); return t; };
    const wallBox = (x0, y0, lx, ly, hgt, faceTex) => {
      const side = lm({ map: plainT(ly) }), face = lm({ map: faceTex || plainT(lx) }), top = lm({ map: topT(lx, ly) });
      const m = new THREE.Mesh(boxG, [side, side, top, rock, face, face]);
      m.position.set(x0 + lx / 2, hgt / 2, y0 + ly / 2); m.scale.set(lx, hgt, ly); m.castShadow = m.receiveShadow = true; g.add(m);
      return m;
    };
    const runs = (len, isWall, cb) => { let s = -1; for (let i = 0; i <= len; i++) { const on = i < len && isWall(i); if (on && s < 0) s = i; if (!on && s >= 0) { cb(s, i - s); s = -1; } } };
    runs(w, (x) => at(x, 0) === 1, (x0, len) => {
      wallBox(x0, 0, len, 1, HN, tx(ctex(Tx.wallFace(ti, x0, len, room.gx * 7 + room.gy))));
      const cap = lm({ map: topT(len, 1.3) });
      mesh(cap, x0 + len / 2, HN + 0.07, 0.56, len + 0.12, 0.14, 1.3);
      if (ti === 0 || ti === 3) mesh(lm({ color: new THREE.Color(ti === 0 ? th.topHi : '#d9b45a') }), x0 + len / 2, HN + 0.2, 0.5, len + 0.04, 0.12, 0.22);
      if (ti === 2) for (let i = 0; i < len; i++) mesh(cap, x0 + i + 0.5, HN + 0.3, 0.6, 0.5, 0.34, 1.05); // 垛口
    });
    runs(w, (x) => at(x, h - 1) === 1, (x0, len) => wallBox(x0, h - 1, len, 1, HL));
    for (const x of [0, w - 1]) runs(h - 2, (i) => at(x, i + 1) === 1, (y0, len) => wallBox(x, y0 + 1, 1, len, HS));
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (at(x, y) === 1) wallBox(x, y, 1, 1, HI);

    // 门：门楼 / 门柱 / 禁制 / 通路微光
    const postM = lm({ color: new THREE.Color(ti === 3 ? '#d9b45a' : ti === 1 ? '#3a2622' : ti === 2 ? '#3c3a47' : '#5a3d2c') });
    const roofM = lm({ color: new THREE.Color(th.top) }), roofHi = lm({ color: new THREE.Color(th.topHi) });
    for (const d in room.doors) {
      const cells = room.doors[d].cells, cx = cells[1][0] + 0.5, cz = cells[1][1] + 0.5, ns = d === 'n' || d === 's';
      if (d === 'n') {
        for (const sx of [-1.5, 1.5]) mesh(postM, cx + sx, (HN + 0.5) / 2, 0.86, 0.26, HN + 0.5, 0.26);
        mesh(postM, cx, HN + 0.34, 0.86, 3.5, 0.2, 0.22);
        mesh(roofM, cx, HN + 0.62, 0.8, 4.3, 0.16, 1.5).rotation.x = 0.1;
        mesh(roofHi, cx, HN + 0.74, 0.74, 4.0, 0.12, 0.26);
      } else {
        const ph = d === 's' ? 0.8 : 1.3;
        if (ns) for (const sx of [-1.5, 1.5]) mesh(postM, cx + sx * 1.0, ph / 2, cz, 0.3, ph, 0.3);
        else for (const sz of [-1.5, 1.5]) mesh(postM, cx, ph / 2, cz + sz * 1.0, 0.3, ph, 0.3);
      }
      const bm = new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
      const barrier = new THREE.Mesh(boxG, bm); barrier.position.set(cx, 0.66, cz); barrier.scale.set(ns ? 2.9 : 0.16, 1.3, ns ? 0.16 : 2.9); g.add(barrier);
      const gm = new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), gm); rs.geos.push(glyph.geometry);
      glyph.position.set(cx + (d === 'w' ? 0.1 : d === 'e' ? -0.1 : 0), 0.7, cz + (d === 'n' ? 0.1 : d === 's' ? 0.1 : 0));
      if (!ns) glyph.rotation.y = d === 'w' ? PI / 2 : -PI / 2;
      g.add(glyph);
      const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.lampHex), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(ns ? 2.7 : 0.8, ns ? 0.8 : 2.7), sm); rs.geos.push(strip.geometry);
      strip.rotation.x = -PI / 2; strip.position.set(cx, 0.03, cz); g.add(strip);
      rs.mats.push(bm, gm, sm);
      rs.doors[d] = { barrier, glyph, strip, bm, sm };
    }

    // 场景物件：静态部分合并成一个网格（大幅减少绘制调用），发光 / 透明 / 带动画的部分保留
    const propRoot = new THREE.Group(); g.add(propRoot);
    for (const pp of room.props) {
      const m = Mo.prop(pp.kind, pp.v, ti);
      m.g.position.set(pp.tx + 0.5, 0, pp.ty + 0.5);
      if (!['lantern', 'banner', 'pillar', 'statue', 'brazier', 'brazier2'].includes(pp.kind)) m.g.rotation.y = U.hash(pp.tx, pp.ty, 9) * TAU;
      propRoot.add(m.g); rs.mats.push(...m.mats); if (m.anim) rs.anims.push(m.anim);
    }
    const merged = mergeStatic(propRoot);
    if (merged) { g.add(merged); rs.geos.push(merged.geometry); rs.mats.push(merged.material); }
    // 灯光与光晕
    const glowSprite = (x, y, z, hex, s, op) => {
      const sm = new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(sm); sp.position.set(x, y, z); sp.scale.set(s, s, 1); g.add(sp); rs.mats.push(sm); rs.sprites.push(sp); return sp;
    };
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.lampHex) }); rs.mats.push(lampM);
    for (const L of room.lights) {
      const x = L.x * S, y = L.z * S, z = L.y * S;
      if (L.sconce) { // 北墙壁灯
        mesh(postM, x, y + 0.28, 1.06, 0.06, 0.06, 0.2, false);
        const lamp = new THREE.Mesh(boxG, lampM); lamp.position.set(x, y + 0.06, 1.14); lamp.scale.set(0.2, 0.3, 0.2); g.add(lamp);
        mesh(roofM, x, y + 0.25, 1.14, 0.3, 0.06, 0.3, false);
        rs.lights.push({ x, y: y + 0.1, z: 1.5, c: L.c, r: L.r * S });
        glowSprite(x, y + 0.06, 1.3, L.c, 2.0, 0.32);
      } else {
        rs.lights.push({ x, y: y + 0.25, z: z + 0.2, c: L.c, r: L.r * S });
        glowSprite(x, y, z + 0.1, L.c, 2.4, 0.3);
      }
    }
    // 岩浆的光
    if (ti === 3) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (at(x, y) === 3 && U.hash(x, y, 9) < 0.3) glowSprite(x + 0.5, 0.25, y + 0.5, 0xff7a28, 2.4, 0.3);
    return rs;
  }

  /* 把一组静态网格烘焙成单个带顶点色的网格 */
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const pos = [], nor = [], colr = [], v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (Array.isArray(m) || m.map || m.transparent || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial) || m.emissive.getHex() !== 0 || m.side === THREE.DoubleSide) return;
      let q = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (m.flatShading) q.computeVertexNormals();
      const P2 = q.attributes.position, N2 = q.attributes.normal;
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < P2.count; i++) {
        v.fromBufferAttribute(P2, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
        colr.push(m.color.r, m.color.g, m.color.b);
      }
      q.dispose(); o.visible = false;
    });
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  function disposeRoom(rs) {
    for (const t of rs.tex) t.dispose();
    for (const m of rs.mats) m.dispose();
    for (const q of rs.geos) q.dispose();
  }

  function clearActors() {
    for (const m of actors.values()) { dyn.remove(m.g); m.dispose(); } actors.clear();
    for (const m of inters.values()) { dyn.remove(m.g); for (const mt of m.mats) mt.dispose(); } inters.clear();
    for (const m of allyM.values()) { dyn.remove(m.g); m.dispose(); } allyM.clear();
  }

  function setRoom(room) {
    if (curRoom === room) return;
    if (cur) scene.remove(cur.g);
    clearActors();
    // 换层时释放旧楼层的房间
    if (room._fl !== (curRoom && curRoom._fl)) { for (const r of built) { if (r._rs) { disposeRoom(r._rs); r._rs = null; } } built.clear(); }
    curRoom = room;
    if (!room._rs) { room._rs = buildRoom(room); built.add(room); }
    cur = room._rs; scene.add(cur.g);
    const th = G.Themes[room.theme], w = room.w, h = room.h;
    scene.background = new THREE.Color(th.bg);
    scene.fog.color.set(th.fog[0]); scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
    sun.color.set(th.sun[0]); sun.intensity = th.sun[1];
    sun.position.set(w / 2 - 7, 15, h / 2 + 5); sun.target.position.set(w / 2, 0, h / 2);
    const e = Math.max(w, h) / 2 + 3, sc = sun.shadow.camera;
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const L = cur.lights[i], pl = roomLights[i];
      if (L) { pl.color.set(L.c); pl.intensity = 1.05; pl.distance = L.r; pl.position.set(L.x, L.y, L.z); } else pl.intensity = 0;
    }
    glows.mat.uniforms.uK.value = th.glowK || 1;
    const mc = rgb(th.mist).col;
    for (const s of mists) s.material.color.copy(mc);
    camSnap = true;
  }

  /* ============================ 相机 ============================ */
  function updateCamera(dt, px, pz, room, shake) {
    const aspect = W / H, dist = Math.max(BASE_DIST, 12.5 / (2 * HALF_TAN * aspect));
    // 视野在地面上的范围：左右半宽、向北（远处）与向南（近处）能看到多远
    const hf = (FOV * PI) / 360, ch = dist * Math.sin(PITCH), cd = dist * Math.cos(PITCH);
    const halfW = HALF_TAN * aspect * dist, north = ch / Math.tan(PITCH - hf) - cd, south = cd - ch / Math.tan(PITCH + hf);
    let tx = px, tz = pz;
    const I = G.Input;
    if (!I.touchMode) { tx += ((I.mouse.x / W) * 2 - 1) * 1.1; tz += ((I.mouse.y / H) * 2 - 1) * 0.9; }
    const x0 = halfW - 2.5, x1 = room.w - halfW + 2.5, z0 = north * 0.6 - 0.5, z1 = room.h - south * 0.72;
    tx = x0 > x1 ? room.w / 2 : U.clamp(tx, x0, x1);
    tz = z0 > z1 ? (z0 + z1) / 2 : U.clamp(tz, z0, z1);
    if (camSnap) { camT.set(tx, 0, tz); camSnap = false; }
    else { const q = 1 - Math.exp(-7 * dt); camT.x += (tx - camT.x) * q; camT.z += (tz - camT.z) * q; }
    const sx = shake ? U.rand(-shake, shake) * 0.02 : 0, sz = shake ? U.rand(-shake, shake) * 0.02 : 0;
    const dc = R.debugCam; // 仅供截图调试：拉近相机
    if (dc) { camera.position.set(dc.x, dc.dist * Math.sin(PITCH), dc.z + dc.dist * Math.cos(PITCH)); camera.lookAt(dc.x, 0.4, dc.z); camera.updateMatrixWorld(); return; }
    camera.position.set(camT.x + sx, dist * Math.sin(PITCH), camT.z + dist * Math.cos(PITCH) + sz);
    camera.lookAt(camT.x + sx, 0, camT.z + sz);
    camera.updateMatrixWorld();
  }

  /* ============================ 每帧同步：静态场景动效 ============================ */
  function animateRoom(room, t) {
    for (const a of cur.anims) a(t);
    const th = G.Themes[room.theme];
    for (const d in cur.doors) {
      const o = cur.doors[d], locked = !!room.locked;
      o.barrier.visible = o.glyph.visible = locked; o.strip.visible = !locked;
      if (locked) o.bm.opacity = 0.28 + Math.sin(t * 6) * 0.08; else o.sm.opacity = 0.16 + Math.sin(t * 3) * 0.08;
    }
    for (let i = 0; i < cur.sprites.length; i++) { const sp = cur.sprites[i]; sp.material.rotation = 0; sp.scale.x = sp.scale.y = sp.userData.s0 || (sp.userData.s0 = sp.scale.x); sp.scale.multiplyScalar(1 + Math.sin(t * 9 + i * 2.1) * 0.05); sp.scale.z = 1; }
    for (let i = 0; i < MAX_LIGHTS; i++) if (cur.lights[i]) roomLights[i].intensity = 1.05 + Math.sin(t * 9 + i * 2.1) * 0.07;
    // 云海
    for (const s of mists) { const u = s.userData; u.a += u.sp * 0.016; s.position.set(room.w / 2 + Math.cos(u.a) * (u.r + room.w * 0.35), u.y, room.h / 2 + Math.sin(u.a) * (u.r * 0.6 + room.h * 0.35)); }
    // 氛围微粒
    const kind = th.mote, w = room.w, h = room.h;
    for (const m of motes) {
      let c, a = 0.6, size = 0.12;
      if (kind === 'firefly') { m.x += Math.sin(t * 0.5 * m.v + m.ph) * 0.0006; m.z += Math.cos(t * 0.4 * m.v + m.ph * 2) * 0.0006; a = 0.4 + Math.sin(t * 2 * m.v + m.ph) * 0.4; c = rgb('200,255,140'); size = 0.16; }
      else if (kind === 'spore') { m.y += 0.0018 * m.v; if (m.y > 1) { m.y = 0; m.x = Math.random(); m.z = Math.random(); } c = rgb('255,90,100'); a = 0.5; }
      else if (kind === 'ash') { m.y -= 0.0022 * m.v; if (m.y < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); } c = m.ph > 5 ? rgb('130,255,170') : rgb('150,145,160'); a = 0.45; }
      else { m.y -= 0.004 * m.v; m.x -= 0.0008 * m.v; if (m.y < 0 || m.x < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); } c = rgb('230,245,255'); a = 0.7; size = 0.1; }
      if (a > 0.02) glows.push(m.x * (w + 4) - 2, 0.2 + m.y * 3.4, m.z * (h + 4) - 2, c, a, size);
    }
  }

  /* ============================ 每帧同步：动态物体 ============================ */
  function place(o, x, y, z) { o.position.set(x * S, (z || 0) * S, y * S); }
  function flatAt(pool, x, y, r, c, op, yy, order) {
    const m = pool.get(); m.position.set(x * S, yy, y * S); m.scale.set(r * S, r * S, 1); m.material.color.copy(c.col); m.material.opacity = op; m.renderOrder = order || 2; return m;
  }
  function bandAt(x1, y1, x2, y2, w, c, op, yy, order) {
    const m = P.band.get(), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    m.position.set(((x1 + x2) / 2) * S, yy, ((y1 + y2) / 2) * S); m.rotation.set(-PI / 2, -Math.atan2(dy, dx), 0); m.scale.set(len * S, w * S, 1);
    m.material.color.copy(c.col); m.material.opacity = op; m.material.blending = THREE.NormalBlending; m.renderOrder = order || 2; return m;
  }

  function syncHazards(Gm, t) {
    for (const h of Gm.haz) {
      const c = rgb(h.c);
      if (h.type === 'circle' || h.type === 'lob') {
        const k = Math.min(1, h.t / (h.type === 'lob' ? h.dur : h.delay));
        flatAt(P.circ, h.x, h.y, h.r, c, 0.12 + k * 0.14, 0.02, 2);
        flatAt(P.circ, h.x, h.y, Math.max(1, h.r * k), c, 0.3, 0.025, 3);
        flatAt(P.ring, h.x, h.y, h.r, c, 0.75 + Math.sin(t * 20) * 0.25, 0.03, 4);
        if (h.type === 'lob') {
          const b = P.ball.get(); place(b, U.lerp(h.sx, h.x, k), U.lerp(h.sy, h.y, k), 14 + Math.sin(k * PI) * 130);
          b.scale.setScalar(0.34); b.material.color.copy(c.col);
          glows.push(b.position.x, b.position.y, b.position.z, c, 0.7, 1.1);
        } else if (h.kind === 'giant') {
          const gsw = P.giant.get(); place(gsw, h.x, h.y, 440 * (1 - k * k));
          for (const m of gsw.userData.mats) m.opacity = 0.45 + k * 0.55;
          glows.push(gsw.position.x, gsw.position.y + 1.4, gsw.position.z, c, 0.5, 4);
        }
      } else if (h.type === 'line') {
        const k = Math.min(1, h.t / h.delay);
        if (h.visual || h.t < h.delay) {
          bandAt(h.x1, h.y1, h.x2, h.y2, h.w, c, 0.1 + k * 0.18, 0.02, 2);
          if (!h.visual) bandAt(h.x1, h.y1, h.x2, h.y2, h.w * k, c, 0.28, 0.025, 3);
        } else {
          const f = 1 - (h.t - h.delay) / h.stay;
          bandAt(h.x1, h.y1, h.x2, h.y2, h.w, c, 0.55 + f * 0.3, 0.02, 2);
          const b = P.beam.get(), dx = h.x2 - h.x1, dy = h.y2 - h.y1, len = Math.hypot(dx, dy);
          b.position.set(((h.x1 + h.x2) / 2) * S, 0.45, ((h.y1 + h.y2) / 2) * S); b.rotation.set(0, -Math.atan2(dy, dx), 0);
          b.scale.set(len * S, 0.9, h.w * S * 0.8); b.material.color.copy(c.col); b.material.opacity = 0.3 + f * 0.25;
        }
      } else if (h.type === 'puddle') {
        const f = Math.min(1, h.life / 0.5) * Math.min(1, h.t / 0.25);
        if (h.kind === 'web') flatAt(P.web, h.x, h.y, h.r, rgb('235,235,245'), 0.6 * f, 0.025, 2);
        else { flatAt(P.circ, h.x, h.y, h.r, c, 0.3 * f, 0.02, 2); flatAt(P.ring, h.x, h.y, h.r, c, 0.6 * f, 0.03, 3); }
      } else if (h.type === 'beam' && h.owner) {
        const o = h.owner, x2 = o.x + Math.cos(h.ang) * h.len, y2 = o.y + Math.sin(h.ang) * h.len;
        if (h.t < h.delay) { const k = h.t / h.delay; bandAt(o.x, o.y, x2, y2, h.w, c, 0.08 + k * 0.2, 0.02, 2); bandAt(o.x, o.y, x2, y2, 4, c, 0.5 + k * 0.4, 0.03, 3); }
        else {
          const f = Math.min(1, (h.delay + h.life - h.t) / 0.3);
          for (let i = 0; i < 2; i++) {
            const b = P.beam.get(); b.position.set(((o.x + x2) / 2) * S, 0.34, ((o.y + y2) / 2) * S); b.rotation.set(0, -h.ang, 0);
            b.scale.set(h.len * S, i ? 0.14 : 0.36, h.w * S * (i ? 0.4 : 1) * (0.9 + Math.sin(t * 40) * 0.1));
            if (i) b.material.color.setRGB(1, 0.92, 0.92); else b.material.color.copy(c.col);
            b.material.opacity = (i ? 0.9 : 0.7) * f;
          }
          bandAt(o.x, o.y, x2, y2, h.w * 1.6, c, 0.25 * f, 0.02, 2);
        }
      }
    }
  }

  function syncProjs(Gm, t) {
    let no = 0, ns = 0;
    for (const pr of Gm.projs) {
      const c = rgb(pr.c || '255,255,255'), x = pr.x * S, y = pr.z * S, z = pr.y * S, a = Math.atan2(pr.vy, pr.vx), r = pr.r * S;
      if (pr.kind === 'sword') {
        const s = (pr.mini ? P.mini : pr.style === 2 ? P.swF : pr.style === 1 ? P.swQ : P.sword).get(); s.position.set(x, y, z); s.rotation.y = PI / 2 - a;
        glows.push(x, y, z, c, 0.55, pr.mini ? 0.7 : 1.1);
        if (pr.style === 2 && !pr.mini) glows.push(x + U.rand(-0.15, 0.15), y + U.rand(-0.1, 0.1), z + U.rand(-0.15, 0.15), GOLD, 0.9, 0.35);
      } else if (pr.kind === 'fy') { // 蜂云剑阵的小剑
        if (ns < 500) {
          dummy.position.set(x, y, z); dummy.rotation.set(0, PI / 2 - a, 0); dummy.scale.set(0.12, 0.05, 0.62); dummy.updateMatrix();
          shards.setMatrixAt(ns, dummy.matrix); shards.setColorAt(ns, tmpC.set(0xdcffb0)); ns++;
        }
        glows.push(x, y, z, c, 0.5, 0.8);
        if (((pr.t * 30) | 0) % 5 === 0) glows.push(x, y, z, GOLD, 0.9, 0.45);
      } else if (pr.kind === 'ice' || pr.kind === 'blade' || pr.kind === 'needle' || pr.kind === 'bolt' || pr.kind === 'arrow') {
        if (ns < 500) {
          const thin = pr.kind === 'needle' || pr.kind === 'bolt' || pr.kind === 'arrow';
          dummy.position.set(x, y, z); dummy.rotation.set(0, PI / 2 - a, 0);
          dummy.scale.set(thin ? 0.09 : r * 1.5, thin ? 0.09 : r * 1.0, thin ? 0.7 : r * 4.2); dummy.updateMatrix();
          shards.setMatrixAt(ns, dummy.matrix);
          shards.setColorAt(ns, pr.kind === 'arrow' ? tmpC.set(0xe8dcc0) : tmpC.copy(c.col).lerp(WHITE, 0.55)); ns++;
        }
        glows.push(x, y, z, c, 0.6, r * 4.4);
      } else {
        if (no < 900) {
          dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(r * 2); dummy.updateMatrix();
          orbs.setMatrixAt(no, dummy.matrix);
          orbs.setColorAt(no, pr.kind === 'ink' ? tmpC.set(0x12141f) : pr.kind === 'beetle' ? tmpC.set(0xffd24a) : tmpC.copy(c.col).lerp(WHITE, pr.kind === 'blood' ? 0.1 : 0.4)); no++;
        }
        glows.push(x, y, z, c, pr.from === 0 ? 0.75 : 0.62, r * (pr.kind === 'fire' ? 6.5 : 5));
        if (pr.kind === 'fire' || pr.kind === 'ghostfire' || pr.kind === 'skullp') glows.push(x - Math.cos(a) * r * 2.4, y, z - Math.sin(a) * r * 2.4, c, 0.4, r * 3.6);
      }
    }
    orbs.count = no; shards.count = ns;
    orbs.instanceMatrix.needsUpdate = shards.instanceMatrix.needsUpdate = true;
    orbs.instanceColor.needsUpdate = shards.instanceColor.needsUpdate = true;
  }
  const WHITE = new THREE.Color(0xffffff), GOLD = [1, 0.92, 0.5];

  function syncFx(t) {
    for (const p of G.FX.parts) {
      const k = p.life / p.max;
      if (p.kind === 'dot') {
        const c = rgb(p.c), size = p.size * S * (0.5 + k * 0.7) * (p.add ? 3.2 : 2.2);
        (p.add ? glows : dusts).push(p.x * S, p.z * S + 0.03, p.y * S, c, Math.min(1, k * 1.6) * (p.add ? 0.9 : 0.8), size);
      } else if (p.kind === 'ring') {
        const r = U.lerp(p.r1, p.r0, k), m = P.fxring.get(), c = rgb(p.c);
        m.position.set(p.x * S, 0.06, p.y * S); m.scale.set(Math.max(0.02, r * S), Math.max(0.02, r * S), 1);
        m.material.color.copy(c.col); m.material.opacity = k * 0.9; m.renderOrder = 6;
      }
    }
  }

  function syncActors(Gm, room, p, t) {
    frame++;
    // 敌人
    for (const e of room.enemies) {
      const c = rgb('255,90,90');
      if (e.st === 'spawn') {
        const k = 1 - Math.min(1, e.stT / 0.8);
        flatAt(P.ring, e.x, e.y, 10 + e.r * 1.4 * (1 - k * 0.3), c, 0.5 + k * 0.5, 0.03, 4);
        flatAt(P.circ, e.x, e.y, Math.max(1, e.r * 1.6 * k), c, 0.15 + k * 0.2, 0.02, 2);
        for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; glows.push((e.x + Math.cos(a) * e.r * 1.4) * S, 0.1 + k * 0.5, (e.y + Math.sin(a) * e.r * 1.4) * S, c, 0.9, 0.3); }
        if (e.stT > 0.25) continue;
      }
      let m = actors.get(e);
      if (!m) { m = Mo.forEnemy(e); if (!m.world && !m.gl) m.g.scale.multiplyScalar(ACTOR); dyn.add(m.g); actors.set(e, m); }
      m.seen = frame;
      if (!m.world) { m.g.position.set(e.x * S, e.z * S, e.y * S); m.g.rotation.y = PI / 2 - e.face; }
      m.update(e);
      m.setFlash(e.flash);
      let alpha = e.st === 'spawn' ? U.clamp(1 - e.stT / 0.25, 0, 1) : e.alpha === undefined ? 1 : e.alpha;
      if (e.invT > 0) alpha *= 0.6 + Math.sin(t * 30) * 0.3;
      m.setAlpha(alpha); m.g.visible = alpha > 0.03;
      if (e.elite) { const gc = rgb('255,200,80'); flatAt(P.ring, e.x, e.y, e.r * 1.6, gc, 0.6 + Math.sin(t * 5) * 0.2, 0.03, 4); flatAt(P.circ, e.x, e.y, e.r * 1.6, gc, 0.12, 0.02, 2); }
      if (e.slowT > 0) flatAt(P.ring, e.x, e.y, e.r * 1.25, rgb('140,220,255'), 0.7, 0.035, 4);
      if (alpha > 0.1) {
        const L = e.def.look, d = e.def.draw;
        if (e.boss) glows.push(e.x * S, 0.7, e.y * S, rgb(hexRgb(L.trim || L.belly || '#ff7878')), 0.16, 5);
        if (d === 'flame') glows.push(e.x * S, 0.45, e.y * S, rgb('255,140,50'), 0.5, 3);
        if (d === 'ghost' || d === 'skull') glows.push(e.x * S, e.z * S + 0.5, e.y * S, rgb(hexRgb(L.body)), 0.3 * alpha, 2.4);
        if (d === 'crystal') glows.push(e.x * S, 0.78, e.y * S, rgb('200,240,255'), 0.4 + (e.wind || 0) * 0.5, 1.6);
        if (L.weapon === 'staff' && !m.gl) glows.push(e.x * S + Math.cos(e.face) * 0.05, 1.0 * (e.scale || 1), e.y * S, rgb(hexRgb(L.trim)), 0.35 + Math.max(e.wind || 0, e.atk || 0) * 0.5, 1.2);
      }
    }
    for (const [e, m] of actors) if (m.seen !== frame) { dyn.remove(m.g); m.dispose(); actors.delete(e); }

    // 主角
    if (p) {
      if (heroOwner !== p) { if (heroM) { dyn.remove(heroM.g); heroM.dispose(); } heroM = Mo.hero(p.look); if (!heroM.gl) heroM.g.scale.multiplyScalar(ACTOR); dyn.add(heroM.g); heroOwner = p; }
      heroM.g.visible = !p.dead && !(p.inv > 0 && p.dashing <= 0 && Math.floor(t * 20) % 2 === 0);
      place(heroM.g, p.x, p.y, 0); heroM.g.rotation.y = PI / 2 - p.face;
      heroM.update({ t: p.t, moving: p.moving, atk: p.atkAnim, dashing: p.dashing > 0 });
      heroM.setFlash(p.flash);
      pLight.position.set(p.x * S, 1.9, p.y * S + 0.7);
      if (!p.dead) flatAt(P.ring, p.x, p.y, 17, rgb('127,224,192'), 0.4, 0.03, 4);
      if (p.fy && p.sp >= 100 && !p.dead) { flatAt(P.ring, p.x, p.y, 24 + Math.sin(t * 6) * 3, rgb('200,255,120'), 0.7, 0.035, 5); glows.push(p.x * S, 0.5, p.y * S, rgb('200,255,120'), 0.22, 2.4); }
      if (p.shield > 0) { const s = P.shield.get(); place(s, p.x, p.y, 30); s.scale.set(1.4, 1.8, 1.4); s.material.opacity = 0.14 + (p.shield / p.shieldMax) * 0.2; }
      if (p.flags.autoShield && p.autoShieldT <= 0) { const a = t * 2.4; glows.push(p.x * S + Math.cos(a) * 0.5, 0.6, p.y * S + Math.sin(a) * 0.5, rgb('200,215,240'), 0.9, 0.5); }
      if (p.formT > 0) for (let i = 0; i < p.formN; i++) {
        const a = t * 4.5 + (i / p.formN) * TAU, s = P.fsword.get();
        s.position.set((p.x + Math.cos(a) * 66) * S, 0.5, (p.y + Math.sin(a) * 66) * S); s.rotation.y = -a;
        glows.push(s.position.x, 0.5, s.position.z, rgb('110,255,200'), 0.5, 0.9);
      }
    } else if (heroM) heroM.g.visible = false;

    // 傀儡
    for (const a of Gm.allies) {
      let m = allyM.get(a);
      if (!m) { m = Mo.puppet({ body: '#d9b06a', dark: '#7a5a2a', eye: '#7dffea' }, { scale: 0.92 * ACTOR }); dyn.add(m.g); allyM.set(a, m); }
      m.seen = frame; place(m.g, a.x, a.y, 0); m.g.rotation.y = PI / 2 - a.face; m.update({ t: a.t, moving: false, atk: Math.max(0, a.atk || 0) });
    }
    for (const [a, m] of allyM) if (m.seen !== frame) { dyn.remove(m.g); m.dispose(); allyM.delete(a); }

    // 交互物
    const th = G.Themes[room.theme];
    for (const it of room.interact) {
      let m = inters.get(it);
      if (!m) {
        m = it.kind === 'chest' ? Mo.chest() : it.kind === 'garden' ? Mo.herbField() : it.kind === 'event' ? Mo.shrine() : it.kind === 'shop' ? Mo.shop() : Mo.portal(th.lampHex);
        place(m.g, it.x, it.y, 0); dyn.add(m.g); inters.set(it, m);
      }
      m.update(it, t);
      const lc = rgb(th.lamp);
      if (it.kind === 'portal') glows.push(it.x * S, 0.9, it.y * S, lc, 0.3, 6);
      else if (!it.used) {
        flatAt(P.ring, it.x, it.y, it.r * 0.85, rgb('255,230,160'), 0.22 + Math.sin(t * 3) * 0.12, 0.03, 4);
        glows.push(it.x * S, 0.5, it.y * S, it.kind === 'garden' ? rgb('140,255,170') : rgb('255,225,150'), 0.22 + Math.sin(t * 3) * 0.06, 3.4);
      }
    }
    // 掉落物
    for (const k of room.pickups) {
      const bob = Math.sin(t * 5 + k.x) * 1.5;
      if (k.kind === 'stone') { const m = P.gem.get(); place(m, k.x, k.y, k.z + 9 + bob); m.rotation.y = t * 3 + k.x; glows.push(m.position.x, m.position.y, m.position.z, rgb('110,255,210'), 0.5, 0.7); }
      else { const m = P.potion.get(); place(m, k.x, k.y, k.z + 8 + bob); glows.push(m.position.x, m.position.y, m.position.z, rgb('255,110,110'), 0.45, 0.9); }
    }
  }

  /* ============================ 2D 叠加层 ============================ */
  const HGT = { human: 50, brute: 60, wolf: 32, bat: 18, toad: 28, centipede: 24, flower: 50, ghost: 54, skull: 20, crystal: 50, flame: 44, puppet: 50, jiao: 70 };

  function drawOverlay(Gm, room, p, t, world) {
    const c = octx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (world) {
      // 闪电与刀光
      c.lineJoin = c.lineCap = 'round';
      for (const q of G.FX.parts) {
        const k = q.life / q.max;
        if (q.kind === 'bolt') {
          c.globalCompositeOperation = 'lighter';
          c.beginPath();
          for (let j = 0; j < q.pts.length; j++) { const s = proj(q.pts[j][0], q.pts[j][1], q.pts[j][2]); if (j) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); }
          c.strokeStyle = `rgba(${q.c},${k})`; c.lineWidth = q.w * 2.4; c.stroke();
          c.strokeStyle = `rgba(255,255,255,${k})`; c.lineWidth = q.w * 0.8; c.stroke();
          c.globalCompositeOperation = 'source-over';
        } else if (q.kind === 'slash') {
          c.globalCompositeOperation = 'lighter';
          c.beginPath(); const rr = q.r * (1.05 - k * 0.25);
          for (let j = 0; j <= 10; j++) { const a = q.ang - q.arc / 2 + (q.arc * j) / 10, s = proj(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr, q.z); if (j) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); }
          c.strokeStyle = `rgba(${q.c},${k})`; c.lineWidth = 8 * k + 1.5; c.stroke();
          c.globalCompositeOperation = 'source-over';
        }
      }
      // 血条 / 预警 / 状态
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      for (const e of room.enemies) {
        if (e.st === 'spawn' || e.untarget) continue;
        const hgt = (HGT[e.def.draw] || 46) * (e.scale || 1) * (e.segs ? 1 : ACTOR) + e.z;
        const s = proj(e.x, e.y, hgt + 12), x = s.x, y = s.y;
        if (!e.boss && (e.hp < e.maxHp || e.elite)) {
          const bw = e.elite ? 44 : 30;
          c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(x - bw / 2 - 1, y - 1, bw + 2, 6);
          c.fillStyle = e.elite ? '#ffc850' : '#e0484a'; c.fillRect(x - bw / 2, y, bw * Math.max(0, e.hp / e.maxHp), 4);
        }
        if (!e.boss && e.wind > 0.05 && e.st !== 'idle') { c.fillStyle = `rgba(255,70,70,${0.6 + Math.sin(t * 24) * 0.4})`; c.font = 'bold 18px sans-serif'; c.fillText('!', x, y - 5); }
        if (e.stunT > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; c.fillStyle = '#ffe36a'; c.fillRect(x + Math.cos(a) * 10 - 2, y - 4 + Math.sin(a) * 3, 4, 4); }
        if (e.affix && e.elite) { c.fillStyle = '#ffd98a'; c.font = `13px ${FONT}`; c.fillText({ swift: '迅捷', burst: '爆裂', horde: '呼群' }[e.affix], x, y - 7); }
      }
      // 飘字
      c.lineJoin = 'round';
      for (const x of G.FX.texts) {
        const k = x.life / x.max, s = proj(x.x, x.y, x.z);
        c.globalAlpha = Math.min(1, k * 2.2);
        c.font = `bold ${Math.round(x.size * 1.1)}px "Trebuchet MS","Segoe UI",sans-serif`;
        c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.strokeText(x.str, s.x, s.y); c.fillStyle = x.c; c.fillText(x.str, s.x, s.y);
      }
      for (const b of Gm.barks) {
        const e = b.e, k = Math.min(1, b.life * 2), s = proj(e.x, e.y, 84 * (e.scale || 1) * (e.segs ? 1 : ACTOR));
        c.globalAlpha = k; c.font = `bold 24px ${FONT}`; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.strokeText(b.text, s.x, s.y - (1 - k) * 10); c.fillStyle = '#ffd8c0'; c.fillText(b.text, s.x, s.y - (1 - k) * 10);
      }
      c.globalAlpha = 1;
    }
    c.drawImage(vignette, 0, 0, W, H);
    if (world && p) {
      const low = p.hp < p.maxHp * 0.3 && !p.dead ? 0.18 + Math.sin(t * 5) * 0.08 : 0, hf = Math.max(Gm.hurtFlash || 0, low);
      if (hf > 0) {
        const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
        g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,20,20,${Math.min(0.6, hf * 1.3)})`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (Gm.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(0.5, Gm.flash * 2)})`; c.fillRect(0, 0, W, H); }
    }
    if (Gm.fade > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(1, Gm.fade)})`; c.fillRect(0, 0, W, H); }
    const I = G.Input;
    if (I.stick.active) {
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(I.stick.ox, I.stick.oy, 56, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(200,255,235,0.45)';
      c.beginPath(); c.arc(I.stick.ox + I.stick.dx * 56, I.stick.oy + I.stick.dy * 56, 24, 0, TAU); c.fill();
    }
  }

  function beginPools() { for (const k in P) P[k].begin(); glows.n = 0; dusts.n = 0; }
  function endPools() { for (const k in P) P[k].end(); glows.end(); dusts.end(); }

  /* ============================ 游戏画面 ============================ */
  R.drawWorld = function (dt) {
    if (!this.ok) return;
    const Gm = G.Game, room = Gm.room, p = Gm.player, t = (this.t += dt);
    if (!room) return;
    if (!room._fl) room._fl = Gm.floor;
    setRoom(room);
    if (menuHero) menuHero.g.visible = false;
    beginPools();
    updateCamera(dt, p.x * S, p.y * S, room, Gm.shakeAmt > 0.2 ? Gm.shakeAmt : 0);
    animateRoom(room, t);
    syncHazards(Gm, t);
    syncActors(Gm, room, p, t);
    syncProjs(Gm, t);
    syncFx(t);
    endPools();
    renderer.render(scene, camera);
    drawOverlay(Gm, room, p, t, true);
  };

  /* ============================ 主菜单：庭院环视 ============================ */
  R.drawMenu = function (dt) {
    if (!this.ok) return;
    const t = (this.t += dt), Gm = G.Game;
    if (!menuRoom) {
      menuRoom = { type: 'start', theme: 0, chapter: 0, links: {}, gx: 3, gy: 1, depth: 0, _fl: 'menu' };
      G.World.buildRoom(menuRoom, true);
    }
    setRoom(menuRoom);
    if (!menuHero && G.Assets.settled) { menuHero = Mo.hero({ robe: '#3f8f86', trim: '#d9f2e6', skin: '#f2d2b0', hat: 'player', backSword: true, weapon: 'none' }); scene.add(menuHero.g); }
    if (heroM) heroM.g.visible = false;
    const cx = menuRoom.w / 2, cz = menuRoom.h / 2 + 0.6;
    if (menuHero) { menuHero.g.visible = true; menuHero.g.position.set(cx, 0, cz); menuHero.g.rotation.y = 0.5; menuHero.update({ t, moving: false }); }
    pLight.position.set(cx, 1.8, cz + 0.8);
    beginPools();
    animateRoom(menuRoom, t);
    for (let i = 0; i < 3; i++) { // 环身飞剑
      const a = t * 1.3 + (i / 3) * TAU, s = P.fsword.get();
      s.position.set(cx + Math.cos(a) * 1.2, 0.9 + Math.sin(t * 2 + i) * 0.12, cz + Math.sin(a) * 1.2); s.rotation.y = -a;
      glows.push(s.position.x, s.position.y, s.position.z, rgb('110,255,200'), 0.55, 1.0);
    }
    orbs.count = shards.count = 0;
    endPools();
    const a = Math.sin(t * 0.13) * 0.55 + 0.25, wide = W / H < 1 ? 1.7 : 1, d = 12.5 * wide;
    camera.position.set(cx + Math.sin(a) * d, 5.6 * wide, cz + Math.cos(a) * d);
    camera.lookAt(cx - 2.2 * Math.cos(a) * (W / H > 1.2 ? 1 : 0), 1.6, cz);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    drawOverlay(Gm, menuRoom, null, t, false);
  };

  /* ============================ 小地图（2D） ============================ */
  R.drawMinimap = function (cv) {
    const Gm = G.Game, f = Gm.floor, crm = Gm.room; if (!f || !crm) return;
    const c = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
    c.clearRect(0, 0, W2, H2);
    const cw = 26, chh = 20, gx = 8, gy = 8, reveal = Gm.player.flags.reveal;
    const ox = W2 / 2 - crm.gx * (cw + gx), oy = H2 / 2 - crm.gy * (chh + gy);
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
      c.fillStyle = r === crm ? 'rgba(125,255,200,0.9)' : r.visited ? (r.cleared ? 'rgba(170,190,185,0.55)' : 'rgba(220,120,120,0.6)') : 'rgba(90,105,110,0.5)';
      c.strokeStyle = r === crm ? '#eafff6' : 'rgba(10,20,20,0.8)'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(x, y, cw, chh, 4); c.fill(); c.stroke();
      const ic = ICON[r.type];
      if (ic) { c.fillStyle = r === crm ? '#0a2018' : ic[1]; c.fillText(ic[0], x + cw / 2, y + chh / 2 + 1); }
    }
  };
})();
