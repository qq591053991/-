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
  const roomLights = [], mists = [], motes = [], seas = [], shafts = [], wisps = [];
  let cshadow = null;
  const actors = new Map(), inters = new Map(), allyM = new Map(), petM = new Map();
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

  let glows, dusts, orbs, shards, orbRims, shardRims, fySw, bugs, P = {};
  let trailMesh, trPos, trCol, trQ = 0, arrayTex = null, bugSeq = 0, fyN = 0, heroS0 = 1;
  const ZHU = '255,74,50';       // 朱砂：一切危险区域的预警色
  const formTr = [], menuTr = [{}, {}, {}], hoverTr = [];

  /* 拖尾：我方飞剑共用一个网格，每帧重建。每条拖尾记下最近若干个位置，连成一条渐隐的带子 */
  const TR_PTS = 10, TR_MAXQ = 1400;
  function initTrails() {
    trPos = new Float32Array(TR_MAXQ * 12); trCol = new Float32Array(TR_MAXQ * 12);
    const idx = new Uint16Array(TR_MAXQ * 6);
    for (let q = 0; q < TR_MAXQ; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(trCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    trailMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trailMesh.frustumCulled = false; trailMesh.renderOrder = 25; scene.add(trailMesh);
  }
  function trail(o, x, y, z, c, width, gain) {
    let h = o._tr; if (!h) h = o._tr = [];
    const n0 = h.length;
    if (!n0 || Math.abs(h[n0 - 3] - x) + Math.abs(h[n0 - 2] - y) + Math.abs(h[n0 - 1] - z) > 0.004) { h.push(x, y, z); if (h.length > TR_PTS * 3) h.splice(0, 3); }
    const n = h.length / 3; if (n < 2) return;
    const cr = c.col.r * gain, cg = c.col.g * gain, cb = c.col.b * gain;
    for (let i = 0; i < n - 1 && trQ < TR_MAXQ; i++) {
      const a = i * 3, ax = h[a], ay = h[a + 1], az = h[a + 2], bx = h[a + 3], by = h[a + 4], bz = h[a + 5];
      let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const k0 = i / (n - 1), k1 = (i + 1) / (n - 1), w0 = width * k0, w1 = width * k1, f0 = k0 * k0, f1 = k1 * k1, o = trQ * 12;
      trPos[o] = ax - dz * w0; trPos[o + 1] = ay; trPos[o + 2] = az + dx * w0;
      trPos[o + 3] = ax + dz * w0; trPos[o + 4] = ay; trPos[o + 5] = az - dx * w0;
      trPos[o + 6] = bx - dz * w1; trPos[o + 7] = by; trPos[o + 8] = bz + dx * w1;
      trPos[o + 9] = bx + dz * w1; trPos[o + 10] = by; trPos[o + 11] = bz - dx * w1;
      trCol[o] = trCol[o + 3] = cr * f0; trCol[o + 1] = trCol[o + 4] = cg * f0; trCol[o + 2] = trCol[o + 5] = cb * f0;
      trCol[o + 6] = trCol[o + 9] = cr * f1; trCol[o + 7] = trCol[o + 10] = cg * f1; trCol[o + 8] = trCol[o + 11] = cb * f1;
      trQ++;
    }
  }

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
      s.scale.set(26 + Math.random() * 18, 9 + Math.random() * 6, 1); s.renderOrder = -4;
      scene.add(s); mists.push(s);
    }
    // 云海：两层缓慢流动的云，一远一近。房间、山台、石柱都从云里露出来 —— 远景因此是亮的，近处的山石成了剪影
    for (let i = 0; i < 2; i++) {
      const tex = ctex(Tx.clouds(i ? 9 : 3, i ? 120 : 90, 256, 1.5), true); tex.repeat.set(i ? 5 : 3, i ? 5 : 3);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(230, 230), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      m.rotation.x = -PI / 2; m.renderOrder = -6 + i; m.frustumCulled = false; scene.add(m); seas.push(m);
    }
    // 云影：贴着地面缓缓移动的暗斑
    { const tex = ctex(Tx.clouds(21, 24), true);
      cshadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: 0x02040c, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      cshadow.rotation.x = -PI / 2; cshadow.renderOrder = 1; scene.add(cshadow); }
    // 光柱：顺着月光方向斜插进场内的几道光
    { const tex = ctex(Tx.shaft()), yv = new THREE.Vector3(-0.405, 0.867, 0.289), cam = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
      const zv = cam.clone().addScaledVector(yv, -cam.dot(yv)).normalize(), xv = new THREE.Vector3().crossVectors(yv, zv), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv));
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })); m.quaternion.copy(q); m.renderOrder = 28; scene.add(m); shafts.push(m); } }
    // 近地的薄雾：飘在场内墙根处，隔在镜头与地面之间
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.07, depthWrite: false, fog: false })); s.scale.set(9 + i * 1.5, 2.6, 1); s.renderOrder = 8; s.userData = { ph: i * 1.7, v: 0.05 + i * 0.012 }; scene.add(s); wisps.push(s); }
    for (let i = 0; i < 54; i++) motes.push({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * TAU, v: 0.5 + Math.random() });

    glows = new Cloud(2600, true); dusts = new Cloud(700, false);
    scene.add(glows.obj); scene.add(dusts.obj);

    const mkInst = (geo, n, o) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(Object.assign({ color: 0xffffff }, o)), n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, tmpC.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    };
    // 弹幕 = 芯 + 外壳（外壳只画背面，于是在芯的外围露出一圈色边）。我方白芯，敌方暗芯
    orbs = mkInst(Mo.geo.sph(10), 900); orbRims = mkInst(Mo.geo.sph(10), 900, { side: THREE.BackSide });
    shards = mkInst(Mo.geo.oct(), 500); shardRims = mkInst(Mo.geo.oct(), 500, { side: THREE.BackSide });
    fySw = mkInst(Mo.bladeGeo(), 240, { side: THREE.DoubleSide }); // 蜂云剑阵的小剑
    bugs = mkInst(Mo.geo.sph(10), 160);                             // 噬金虫
    initTrails();
    arrayTex = ctex(Tx.array());

    // 贴地图形的池
    const flatMat = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
    const circG = new THREE.CircleGeometry(1, 48), ringG = new THREE.RingGeometry(0.93, 1, 64), thinG = new THREE.RingGeometry(0.86, 1, 64), planeG = new THREE.PlaneGeometry(1, 1);
    const flat = (geo, o) => () => { const m = new THREE.Mesh(geo, flatMat(o)); m.rotation.x = -PI / 2; return m; };
    P.circ = new Pool(flat(circG)); P.ring = new Pool(flat(ringG)); P.band = new Pool(() => { const m = new THREE.Mesh(planeG, flatMat({ side: THREE.DoubleSide })); m.rotation.order = 'YXZ'; return m; });
    P.fxring = new Pool(flat(thinG, { blending: THREE.AdditiveBlending }));
    P.web = new Pool(flat(circG, { map: webTex }));
    P.beam = new Pool(() => new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    P.sw0 = new Pool(() => Mo.sword(0)); P.sw1 = new Pool(() => Mo.sword(1)); P.sw2 = new Pool(() => Mo.sword(2)); P.mini = new Pool(() => Mo.sword('mini'));
    P.arr = new Pool(flat(circG, { map: arrayTex, blending: THREE.AdditiveBlending }));
    P.wing = new Pool(() => Mo.wings()); P.plate = new Pool(() => Mo.shieldPlate());
    P.gem = new Pool(() => { const m = new THREE.Mesh(Mo.geo.oct(), new THREE.MeshBasicMaterial({ color: 0x8affd8 })); m.scale.set(0.15, 0.24, 0.15); return m; });
    P.potion = new Pool(() => { const g = new THREE.Group(); const a = new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshLambertMaterial({ color: 0xe0484a, emissive: 0x5a1012 })); a.scale.setScalar(0.24); const b = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xd9b45a })); b.scale.set(0.09, 0.14, 0.09); b.position.y = 0.16; g.add(a, b); return g; });
    P.ball = new Pool(() => new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    P.giant = new Pool(() => Mo.giantSword());
    // 法宝的实体：金光砖、元磁神山、混元钵、土牢的石柱
    P.brick = new Pool(() => { const g = new THREE.Group(), a = new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })), b = new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ color: 0xffb93c, side: THREE.BackSide })); b.scale.setScalar(1.16); g.add(a, b); return g; });
    P.hill = new Pool(() => { const g = new THREE.Group(), a = new THREE.Mesh(Mo.geo.cone(6), new THREE.MeshPhongMaterial({ color: 0x5c6470, emissive: 0x2c2416, flatShading: true, shininess: 6 })), b = new THREE.Mesh(Mo.geo.cone(6), new THREE.MeshBasicMaterial({ color: 0xd0a858, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); b.scale.setScalar(1.14); g.add(a, b); return g; });
    P.bowl = new Pool(() => { const m = new THREE.Mesh(Mo.geo.dome(), new THREE.MeshLambertMaterial({ color: 0xd6a04e, emissive: 0x5a3a10, side: THREE.DoubleSide })); m.rotation.x = PI; return m; });
    P.rock = new Pool(() => new THREE.Mesh(Mo.geo.box(), new THREE.MeshLambertMaterial({ color: 0x8e7650, emissive: 0x1c140a })));
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

    // 山石：岛缘、假山、山岩墙与远山全用它堆出来，最后合并成一个网格
    const scn = new THREE.Group(); g.add(scn);
    const rockM = new THREE.MeshLambertMaterial({ vertexColors: true }); rs.mats.push(rockM);
    const sd = (room.gx || 0) * 31 + (room.gy || 0) * 17 + ti * 7;
    // rk：放一块山石，top 是它顶面的高度
    const rockFg = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(0.4, 0.44, 0.54) }); rs.mats.push(rockFg); // 前景的山石压暗成剪影
    const rk = (x, top, z, s, sy, k, fg) => {
      const geo = Mo.rockGeo((k + sd) % 4, ti), m = new THREE.Mesh(geo, fg ? rockFg : rockM);
      m.position.set(x, top - geo.userData.h * s * sy, z); m.scale.set(s, s * sy, s * (0.8 + U.hash(k, 3, sd) * 0.4)); m.rotation.y = U.hash(k, 7, sd) * TAU; scn.add(m); return m;
    };
    // 建筑构件（瓦顶、立柱、栏杆、角楼）：同样合并成一个网格
    const archRoot = new THREE.Group(); g.add(archRoot);
    const kit = Mo.archKit(archRoot, ti);
    // 一格山岩：顶面在 top，根部埋进地里
    let wk = 700;
    const crag = (x, z, top) => { wk++; const sc = 0.6 + U.hash(wk, 11, sd) * 0.17; rk(x + (U.hash(wk, 13, sd) - 0.5) * 0.2, top, z + (U.hash(wk, 15, sd) - 0.5) * 0.2, sc, (top + 0.3) / (1.1 * sc), wk); return wk; };
    const treeOn = (x, top, z, kind, sc) => { const tr = Mo.tree(wk + sd, ti, kind, sc); tr.g.position.set(x, top - 0.1, z); tr.g.rotation.y = U.hash(wk, 17, sd) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); };

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
    // 北墙。七玄门：粉墙 + 黛瓦坡顶 + 檐柱；血色禁地：一道山岩；燕翎堡：城墙 + 垛口 + 扶壁；虚天殿：玉墙 + 金脊 + 玉柱
    runs(w, (x) => at(x, 0) === 1, (x0, len) => {
      if (ti === 1) { for (let i = 0; i < len; i++) { const top = 1.25 + U.hash(x0 + i, 1, sd) * 0.75; crag(x0 + i + 0.5, 0.5, top); if (U.hash(x0 + i, 2, sd) < 0.2) treeOn(x0 + i + 0.5, top, 0.4, 'round', 1.15); } return; }
      wallBox(x0, 0, len, 1, HN, tx(ctex(Tx.wallFace(ti, x0, len, room.gx * 7 + room.gy))));
      if (ti === 0) {
        kit.roofX(x0, len, 0.5, HN, 1.9, 0.52);
        for (let cx = x0 + 0.45; cx <= x0 + len - 0.4; cx += 3.05) kit.column(cx, 1.12, HN, 0.1);
        return;
      }
      const cap = lm({ map: topT(len, 1.3) });
      mesh(cap, x0 + len / 2, HN + 0.07, 0.56, len + 0.12, 0.14, 1.3);
      if (ti === 3) {
        mesh(lm({ color: new THREE.Color('#d9b45a') }), x0 + len / 2, HN + 0.2, 0.5, len + 0.04, 0.12, 0.22);
        for (let cx = x0 + 0.5; cx <= x0 + len - 0.4; cx += 3.05) kit.column(cx, 1.16, HN + 0.14, 0.14, true);
      } else {
        for (let i = 0; i < len; i++) kit.crenel(x0 + i + 0.5, HN + 0.14, 0.6, 0.5, 1.05);
        for (let cx = x0 + 1.5; cx <= x0 + len - 1; cx += 4) kit.buttress(cx, 1.0, HN);
      }
    });
    // 南墙。七玄门、虚天殿：石栏杆（看得见栏外的山石）；血色禁地：矮岩；燕翎堡：矮城墙
    runs(w, (x) => at(x, h - 1) === 1, (x0, len) => {
      if (ti === 1) { for (let i = 0; i < len; i++) crag(x0 + i + 0.5, h - 0.5, 0.28 + U.hash(x0 + i, 3, sd) * 0.22); }
      else if (ti === 2) { wallBox(x0, h - 1, len, 1, HL); for (let i = 0; i < len; i += 2) kit.crenel(x0 + i + 0.5, HL - 0.14, h - 0.5, 0.6, 0.7); }
      else kit.balustrade(x0, len, h - 0.5, true);
    });
    // 东西两墙。七玄门：院墙 + 小瓦顶；血色禁地：山岩；燕翎堡：城墙 + 垛口；虚天殿：玉墙 + 金脊
    for (const x of [0, w - 1]) runs(h - 2, (i) => at(x, i + 1) === 1, (y0, len) => {
      if (ti === 1) { for (let i = 0; i < len; i++) crag(x + 0.5, y0 + 1 + i + 0.5, 0.72 + U.hash(x, y0 + i, sd) * 0.42); return; }
      wallBox(x, y0 + 1, 1, len, HS);
      if (ti === 0) kit.roofZ(x + 0.5, y0 + 1, len, HS, 1.34, 0.3);
      else if (ti === 2) { for (let i = 0; i < len; i += 2) kit.crenel(x + 0.5, HS - 0.02, y0 + 1 + i + 0.5, 1.04, 0.56); }
      else mesh(lm({ color: new THREE.Color('#d9b45a') }), x + 0.5, HS + 0.05, y0 + 1 + len / 2, 0.24, 0.1, len + 0.04);
    });
    // 四角：角楼（山岩墙没有角楼）
    if (ti !== 1) for (const [cxx, czz, north] of [[0.5, 0.5, 1], [w - 0.5, 0.5, 1], [0.5, h - 0.5, 0], [w - 0.5, h - 0.5, 0]]) {
      if (at(Math.floor(cxx), Math.floor(czz)) !== 1) continue;
      if (north) kit.tower(cxx, czz, HN + 0.42, 1.1); else kit.tower(cxx, czz, ti === 2 ? 0.95 : 0.72, ti === 2 ? 1.04 : 0.62);
    }
    // 屋内的隔墙。七玄门：假山，山上偶尔立一棵小松；血色禁地：山岩；虚天殿：覆雪的冰岩；燕翎堡：残垣
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (at(x, y) !== 1) continue;
      if (ti === 2) { wallBox(x, y, 1, 1, HI); if (U.hash(x, y, sd) < 0.6) rk(x + 0.5, HI + 0.2 + U.hash(x, y, sd + 1) * 0.16, y + 0.5, 0.42, 0.6, x * 31 + y); continue; }
      const top = 0.72 + U.hash(x, y, sd + 2) * 0.45; crag(x + 0.5, y + 0.5, top);
      if (ti === 0 && U.hash(x, y, sd + 3) < 0.22) treeOn(x + 0.5, top, y + 0.5, 'pine', 0.55);
    }

    // 门：门楼 / 门柱 / 禁制 / 通路微光
    const postM = lm({ color: new THREE.Color(ti === 3 ? '#d9b45a' : ti === 1 ? '#3a2622' : ti === 2 ? '#3c3a47' : '#5a3d2c') });
    const roofM = lm({ color: new THREE.Color(th.top) }), roofHi = lm({ color: new THREE.Color(th.topHi) });
    for (const d in room.doors) {
      const cells = room.doors[d].cells, cx = cells[1][0] + 0.5, cz = cells[1][1] + 0.5, ns = d === 'n' || d === 's';
      if (d === 'n') {
        const ag = Mo.archGate(ti); ag.g.position.set(cx, 0, 0.9); g.add(ag.g); rs.mats.push(...ag.mats); rs.tex.push(...ag.tex); // 青铜环门
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
    // 岛缘与远山
    const dz = (d) => (room.doors[d] ? room.doors[d].cells[1] : null), nearDoor = (d, val, axis) => { const c = dz(d); return c && Math.abs(c[axis] + 0.5 - val) < 2.3; };
    let kk = 0; const rv = (i) => U.hash(kk, i, sd);
    // 南缘：贴着矮墙外侧的一排矮石，把浮台的直边裹住
    for (let x = -0.3; x < w + 0.5; x += 1.45) { kk++; if (nearDoor('s', x, 0)) continue; rk(x + rv(1) * 0.5, -0.5 + rv(2) * 0.3, h + 0.55 + rv(3) * 0.35, 0.9 + rv(4) * 0.45, 1.6 + rv(5) * 0.7, kk, true); }
    // 东西两缘
    for (let z = 0.4; z < h; z += 1.55) for (const e of [0, 1]) { kk++; if (nearDoor(e ? 'e' : 'w', z, 1)) continue; rk(e ? w + 0.55 + rv(1) * 0.3 : -0.55 - rv(1) * 0.3, 0.2 + rv(2) * 0.55, z + rv(3) * 0.5, 1.0 + rv(4) * 0.6, 1.7 + rv(5) * 0.7, kk); }
    const plant = (x, top, z, kind, sc, seed, dark) => { const tr = Mo.tree(seed + sd, ti, kind, sc); if (dark) for (const m of tr.mats) m.color.multiplyScalar(dark); tr.g.position.set(x, top - 0.1, z); tr.g.rotation.y = U.hash(seed, 17, sd) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); };
    // 山台：比岛缘更低、更远的一圈石台，一级一级降进云里，台上偶尔有树
    for (let i = 0; i < 11; i++) {
      kk++; const side = i % 3, u = rv(1); // 0 南 / 1 西 / 2 东
      const tx2 = side === 0 ? -1.5 + u * (w + 3) : side === 1 ? -2.3 - rv(2) * 1.9 : w + 2.3 + rv(2) * 1.9;
      const tz2 = side === 0 ? h + 2.1 + rv(2) * 2.2 : 0.5 + u * (h + 1.5), top = -1.2 - rv(3) * 2.4;
      rk(tx2, top, tz2, 1.5 + rv(4) * 1.1, 1.9 + rv(5) * 0.7, kk, side === 0);
      if (ti < 2 && rv(6) < 0.45) plant(tx2, top, tz2, ti === 1 ? 'round' : rv(7) < 0.35 ? 'bloom' : 'pine', 1.15, kk, side === 0 ? 0.6 : 0);
    }
    // 前景：南面两角各立一座高石，石上的树探进画面；镜头一动，它和场内就错开了
    [[-1.4, h + 0.75], [w + 1.4, h + 0.75]].forEach(([fx, fz], i) => {
      kk++; const top = 0.45 + rv(1) * 0.5;
      rk(fx, top, fz, 1.25, 2.4, kk, true); rk(fx + (i ? 1 : -1), top - 0.8, fz + 0.5, 0.9, 2.2, kk + 50, true);
      if (ti < 2) plant(fx, top, fz, ti === 1 ? 'round' : i ? 'bloom' : 'pine', 1.75, kk, 0.55);
      else rk(fx, top + 1.3 + rv(2) * 0.9, fz, 0.42, 3.6, kk + 80, true); // 围城与古殿没有树：立一根石笋 / 冰笋
    });
    // 贴地的小物：墙根、石根处的草丛（枯草 / 碎砾 / 冰凌），补上最细的一层
    { const bladeG = Mo.geo.cone(4), bm = [lm({ color: new THREE.Color(Mo.PAL[ti].cap) }), lm({ color: new THREE.Color(Mo.PAL[ti].cap2) })], fm = ti === 0 ? lm({ color: new THREE.Color('#f2d6e0') }) : null;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (at(x, y) !== 0 || U.hash(x, y, sd + 40) > 0.6) continue;
        const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => { const tt = at(x + dx, y + dy); return tt === 1 || tt === 2; });
        if (!nb.length) continue;
        const [dx, dy] = nb[Math.floor(U.hash(x, y, sd + 41) * nb.length)], bx = x + 0.5 + dx * 0.38, bz = y + 0.5 + dy * 0.38;
        for (let k = 0; k < 4; k++) {
          const hgt = (ti === 2 ? 0.07 : 0.14) + U.hash(x * 5 + k, y, sd + 42) * (ti === 2 ? 0.08 : 0.2), b = new THREE.Mesh(bladeG, bm[k % 2]);
          b.position.set(bx + (U.hash(x * 5 + k, y, sd + 43) - 0.5) * (dy ? 0.5 : 0.16), hgt / 2, bz + (U.hash(x * 5 + k, y, sd + 44) - 0.5) * (dx ? 0.5 : 0.16));
          b.scale.set(ti === 2 ? 0.14 : 0.06, hgt, ti === 2 ? 0.12 : 0.06); b.rotation.set((U.hash(x * 5 + k, y, sd + 45) - 0.5) * 0.5, U.hash(x * 5 + k, y, sd + 46) * 3, (U.hash(x * 5 + k, y, sd + 47) - 0.5) * 0.5); scn.add(b);
        }
        if (fm && U.hash(x, y, sd + 48) < 0.3) { const f = new THREE.Mesh(Mo.geo.sph(6), fm); f.position.set(bx + 0.08, 0.12, bz - 0.06); f.scale.setScalar(0.07); scn.add(f); }
      }
    }
    // 北面：高出墙头的一道山脊，脊上有树
    for (let x = -0.9; x < w + 1; x += 1.8) {
      kk++; if (nearDoor('n', x, 0)) continue;
      const top = 1.15 + rv(2) * 1.25, rx = x + rv(1) * 0.6, rz = -0.8 - rv(3) * 0.9;
      rk(rx, top, rz, 1.3 + rv(4) * 0.9, 1.8 + rv(5) * 0.8, kk);
      if (ti < 2 && rv(6) < 0.42) { const tr = Mo.tree(kk + sd, ti, ti === 1 ? 'round' : rv(7) < 0.3 ? 'bloom' : 'pine', 1.3); tr.g.position.set(rx, top - 0.12, rz); tr.g.rotation.y = rv(8) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); }
    }
    // 立轴：庭院与古殿的北墙上各挂两幅山水
    if (ti === 0 || ti === 3) {
      const dn = dz('n'), dcx = dn ? dn[0] + 0.5 : w / 2;
      for (const off of [-3.5, 3.5]) {
        const sx = dcx + off; if (sx < 1.7 || sx > w - 1.7 || at(Math.floor(sx), 0) !== 1 || room.lights.some((L) => L.sconce && Math.abs(L.x * S - sx) < 0.75)) continue;
        const sc2 = Mo.scroll(ti, Math.floor(sx) * 7 + sd); sc2.g.position.set(sx, HN - 0.03, 1.035); g.add(sc2.g); rs.mats.push(...sc2.mats); rs.tex.push(...sc2.tex); rs.anims.push(sc2.anim);
      }
    }
    // 远景：云海里的几根石柱，柱顶有树有灯，天外飞瀑垂落 —— 把"盆景天地"从一方浮台扩成一片
    const FALL = [0xbfe0ff, 0xd86a78, 0, 0xcfeaff][ti];
    [[w * 0.16, -5.5], [w * 0.55, -8.5], [w * 0.9, -5.2], [-5.5, h * 0.42], [w + 5.5, h * 0.62]].forEach(([ix, iz], i) => {
      const hv = (k) => U.hash(i, k, (room.gx || 0) * 5 + (room.gy || 0) * 3 + ti), sc = 2.2 + hv(1) * 1.8;
      const isl = new THREE.Group(); isl.position.set(ix + (hv(3) - 0.5) * 2, -0.7 + hv(2) * 1.7, iz - hv(4) * 2);
      // 一根自云海里拔起的石柱，旁边再靠一根矮的
      rk(isl.position.x, isl.position.y + 0.04, isl.position.z, sc * 0.82, 3.6, i * 3 + 1);
      rk(isl.position.x + sc * 0.8, isl.position.y - 0.9 - hv(6) * 1.2, isl.position.z + 0.5, sc * 0.5, 3.4, i * 3 + 2);
      rk(isl.position.x - sc * 0.7, isl.position.y - 1.8 - hv(7) * 1.5, isl.position.z - 0.4, sc * 0.42, 3.2, i * 3 + 3);
      const put = (kind, v, k, x, z) => {
        const pm = Mo.prop(kind, v, ti); pm.g.scale.setScalar(k); pm.g.position.set(x, 0, z); pm.g.rotation.y = hv(v) * TAU; isl.add(pm.g); rs.mats.push(...pm.mats); if (pm.anim) rs.anims.push(pm.anim);
        const L = G.PROP_LIGHT[kind]; if (L) glowSprite(isl.position.x + x, isl.position.y + L.z * S * k, isl.position.z + z, L.c, 3.2, 0.34);
      };
      put(th.props[(i * 2 + 3) % th.props.length], i + 11, 1.5, -sc * 0.12, 0);
      if (i % 2 === 0) put(th.props[(i + 2) % th.props.length], i + 23, 1.1, sc * 0.24, sc * 0.1);
      if (FALL && i !== 1) { // 飞瀑
        const wm = new THREE.MeshBasicMaterial({ color: FALL, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
        const wf = new THREE.Mesh(new THREE.PlaneGeometry(0.34 + hv(5) * 0.3, 11), wm); wf.position.set(sc * 0.36, -5.7, sc * 0.3); isl.add(wf);
        rs.geos.push(wf.geometry); rs.mats.push(wm); rs.anims.push((t) => { wm.opacity = 0.26 + Math.sin(t * 6 + i * 2) * 0.05 + Math.sin(t * 13.7 + i) * 0.03; });
      }
      g.add(isl);
    });
    const mergedScn = mergeStatic(scn);
    if (mergedScn) { g.add(mergedScn); rs.geos.push(mergedScn.geometry); rs.mats.push(mergedScn.material); }
    rs.mats.push(...kit.mats());
    const mergedArch = mergeStatic(archRoot);
    if (mergedArch) { g.add(mergedArch); rs.geos.push(mergedArch.geometry); rs.mats.push(mergedArch.material); }
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
      const P2 = q.attributes.position, N2 = q.attributes.normal, C2 = m.vertexColors ? q.attributes.color : null; // 山石、叶团的颜色烘在顶点上
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < P2.count; i++) {
        v.fromBufferAttribute(P2, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
        if (C2) colr.push(m.color.r * C2.getX(i), m.color.g * C2.getY(i), m.color.b * C2.getZ(i)); else colr.push(m.color.r, m.color.g, m.color.b);
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
    for (const m of petM.values()) { dyn.remove(m.g); m.dispose(); } petM.clear();
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
    for (const s of wisps) s.material.color.copy(mc);
    seas[0].material.color.setHex(th.sea[2]); seas[0].material.opacity = th.sea[3]; seas[0].position.set(w / 2, -11, h / 2);
    seas[1].material.color.setHex(th.sea[0]); seas[1].material.opacity = th.sea[1]; seas[1].position.set(w / 2, -6.5, h / 2);
    cshadow.position.set(w / 2, 0.012, h / 2); cshadow.scale.set(w - 1.2, h - 1.2, 1); cshadow.material.opacity = th.cloudShadow[0]; cshadow.material.map.repeat.set(w / th.cloudShadow[1], h / th.cloudShadow[1]);
    shafts.forEach((m, i) => {
      m.visible = !!th.shaft; if (!th.shaft) return;
      m.material.color.setHex(th.shaft[0]); m.userData.o = th.shaft[1];
      m.position.set(w * [0.2, 0.47, 0.72, 0.93][i], 4, h * [0.45, 0.28, 0.58, 0.3][i]); m.scale.set(2.2 + (i % 2) * 1.2, 16, 1);
    });
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
    const Gm = G.Game;
    if (Gm.state === 'play' && Gm.isManualNow()) { tx += ((I.mouse.x / W) * 2 - 1) * 1.1; tz += ((I.mouse.y / H) * 2 - 1) * 0.9; }
    else if (Gm.state === 'play' && Gm.target) { tx += U.clamp((Gm.target.x * S - px) * 0.14, -1.1, 1.1); tz += U.clamp((Gm.target.y * S - pz) * 0.14, -0.9, 0.9); }
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
    seas[0].material.map.offset.set(t * 0.0016, t * 0.0007); seas[1].material.map.offset.set(-t * 0.004, t * 0.0022);
    cshadow.material.map.offset.set(t * 0.006, t * 0.0035);
    shafts.forEach((m, i) => { if (m.visible) m.material.opacity = m.userData.o * (0.75 + Math.sin(t * 0.6 + i * 1.9) * 0.25); });
    wisps.forEach((s, i) => { const u = s.userData, k = (t * u.v + u.ph) % 1; s.position.set(-2 + k * (room.w + 4), 0.45 + (i % 2) * 0.35, i < 3 ? 1.6 + i * 0.5 : room.h - 2 - (i - 3) * 0.6); s.material.opacity = 0.085 * Math.sin(k * PI); });
    // 氛围微粒
    const kind = th.mote, w = room.w, h = room.h;
    for (const m of motes) {
      let c, a = 0.6, size = 0.12;
      if (kind === 'firefly' && m.ph < 2.3) { // 落英：花瓣是凡尘之物，不发光
        m.y -= 0.0015 * m.v; m.x += Math.sin(t * 0.7 + m.ph * 3) * 0.0007; if (m.y < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); }
        dusts.push(m.x * (w + 4) - 2, 0.15 + m.y * 3.2, m.z * (h + 4) - 2, rgb('240,200,214'), 0.85, 0.075); continue;
      }
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
      // c 是招式本身的颜色（流派色）；wc 是预警色：敌方一律朱砂
      const c = rgb(h.c), foe = h.from === 1, wc = foe ? rgb(ZHU) : c;
      if (h.type === 'zone') { syncZone(h, c, t); continue; }
      if (h.type === 'circle' || h.type === 'lob') {
        const k = Math.min(1, h.t / (h.type === 'lob' ? h.dur : h.delay));
        if (h.kind === 'giant') { // 巨剑术：阵图 + 光柱 + 自天而降的巨剑
          const m = P.arr.get(); m.position.set(h.x * S, 0.045, h.y * S); m.scale.set(h.r * S, h.r * S, 1); m.rotation.z = t * 2.2; m.material.color.copy(c.col); m.material.opacity = 0.35 + k * 0.6; m.renderOrder = 5;
          flatAt(P.circ, h.x, h.y, Math.max(1, h.r * k), c, 0.16, 0.025, 3);
          const b = P.beam.get(); b.position.set(h.x * S, 4, h.y * S); b.rotation.set(0, t * 3, 0); b.scale.set(0.2 + k * 0.5, 8, 0.2 + k * 0.5); b.material.color.copy(c.col); b.material.opacity = 0.1 + k * 0.22;
          const gsw = P.giant.get(); place(gsw, h.x, h.y, 520 * (1 - k * k)); gsw.rotation.y = t * 1.5;
          for (const mt of gsw.userData.mats) mt.opacity = mt.userData.o0 * (0.3 + k * 0.7);
          glows.push(gsw.position.x, gsw.position.y + 1.4, gsw.position.z, c, 0.5, 4);
          continue;
        }
        if (!foe) { // 我方的落点：不用朱砂，只画一圈流派色的细环，再加上法宝本身
          flatAt(P.circ, h.x, h.y, h.r, c, 0.05 + k * 0.1, 0.02, 2); flatAt(P.ring, h.x, h.y, h.r, c, 0.55, 0.03, 4);
          const fall = 1 - k * k;
          if (h.kind === 'brick') { const b = P.brick.get(); b.position.set(h.x * S, 0.3 + fall * 9, h.y * S); b.rotation.set(0, t * 2 + h.x, 0); b.scale.set(1.0, 0.5, 0.66); glows.push(b.position.x, b.position.y, b.position.z, c, 0.6, 2.6); }
          else if (h.kind === 'hill') {
            const m = P.hill.get(), sc = h.r * S * 1.05; m.position.set(h.x * S, sc * 0.55 + fall * 13, h.y * S); m.rotation.set(0, h.x, 0); m.scale.set(sc, sc * 1.1, sc);
            for (let i = 0; i < 5; i++) { const a = t * 3 + i * 1.26, rr = (h.pull || h.r) * (1 - ((t * 1.4 + i * 0.2) % 1)); glows.push((h.x + Math.cos(a) * rr) * S, 0.2, (h.y + Math.sin(a) * rr) * S, c, 0.6, 0.5); }
          } else if (h.kind === 'leizi') { const b = P.ball.get(); place(b, U.lerp(h.sx, h.x, k), U.lerp(h.sy, h.y, k), 16 + Math.sin(k * PI) * 110); b.scale.setScalar(0.2); b.material.color.setRGB(1, 0.96, 0.7); glows.push(b.position.x, b.position.y, b.position.z, c, 0.8, 1.2); }
          else if (h.kind === 'burrow') { for (let i = 0; i < 3; i++) dusts.push((h.x + U.rand(-h.r, h.r) * 0.5) * S, 0.08 + Math.random() * 0.2, (h.y + U.rand(-h.r, h.r) * 0.5) * S, rgb('150,120,80'), 0.7, 0.3); }
          else if (h.kind === 'xueying') { for (let i = 0; i < 4; i++) glows.push(h.x * S, 0.25 + i * 0.3, h.y * S, c, 0.5 + k * 0.4, 1.5 - i * 0.2); }
          continue;
        }
        flatAt(P.circ, h.x, h.y, h.r, wc, 0.12 + k * 0.14, 0.02, 2);
        flatAt(P.circ, h.x, h.y, Math.max(1, h.r * k), wc, 0.3, 0.025, 3);
        flatAt(P.ring, h.x, h.y, h.r, wc, 0.75 + Math.sin(t * 20) * 0.25, 0.03, 4);
        if (h.type === 'lob') {
          const b = P.ball.get(); place(b, U.lerp(h.sx, h.x, k), U.lerp(h.sy, h.y, k), 14 + Math.sin(k * PI) * 130);
          b.scale.setScalar(0.34); b.material.color.copy(c.col).multiplyScalar(0.3);
          glows.push(b.position.x, b.position.y, b.position.z, c, 0.6, 1.1);
        }
      } else if (h.type === 'line') {
        const k = Math.min(1, h.t / h.delay);
        if (h.visual || h.t < h.delay) {
          bandAt(h.x1, h.y1, h.x2, h.y2, h.w, wc, 0.1 + k * 0.18, 0.02, 2);
          if (!h.visual) bandAt(h.x1, h.y1, h.x2, h.y2, h.w * k, wc, 0.28, 0.025, 3);
        } else {
          const f = 1 - (h.t - h.delay) / h.stay;
          bandAt(h.x1, h.y1, h.x2, h.y2, h.w, c, 0.55 + f * 0.3, 0.02, 2);
          const b = P.beam.get(), dx = h.x2 - h.x1, dy = h.y2 - h.y1, len = Math.hypot(dx, dy);
          b.position.set(((h.x1 + h.x2) / 2) * S, 0.45, ((h.y1 + h.y2) / 2) * S); b.rotation.set(0, -Math.atan2(dy, dx), 0);
          b.scale.set(len * S, 0.9, h.w * S * 0.8); b.material.color.copy(c.col); b.material.opacity = 0.3 + f * 0.25;
          if (h.kind === 'rift') bandAt(h.x1, h.y1, h.x2, h.y2, h.w * 0.45, rgb('8,4,20'), 0.92 * f, 0.03, 5);          // 空间裂缝：漆黑的缝
          if (h.kind === 'xuantian') bandAt(h.x1, h.y1, h.x2, h.y2, h.w * 0.3, rgb('255,255,255'), 0.9 * f, 0.03, 5); // 玄天剑光：白炽的芯
        }
      } else if (h.type === 'puddle') {
        const f = Math.min(1, h.life / 0.5) * Math.min(1, h.t / 0.25);
        if (h.kind === 'web') flatAt(P.web, h.x, h.y, h.r, rgb('235,235,245'), 0.6 * f, 0.025, 2);
        else { flatAt(P.circ, h.x, h.y, h.r, c, 0.3 * f, 0.02, 2); flatAt(P.ring, h.x, h.y, h.r, wc, 0.7 * f, 0.03, 3); }
      } else if (h.type === 'beam' && h.owner) {
        const o = h.owner, x2 = o.x + Math.cos(h.ang) * h.len, y2 = o.y + Math.sin(h.ang) * h.len;
        if (h.t < h.delay) { const k = h.t / h.delay; bandAt(o.x, o.y, x2, y2, h.w, wc, 0.08 + k * 0.2, 0.02, 2); bandAt(o.x, o.y, x2, y2, 4, wc, 0.5 + k * 0.4, 0.03, 3); }
        else {
          const f = Math.min(1, (h.delay + h.life - h.t) / 0.3);
          for (let i = 0; i < 2; i++) {
            const b = P.beam.get(); b.position.set(((o.x + x2) / 2) * S, 0.34, ((o.y + y2) / 2) * S); b.rotation.set(0, -h.ang, 0);
            b.scale.set(h.len * S, i ? 0.14 : 0.36, h.w * S * (i ? 0.4 : 1) * (0.9 + Math.sin(t * 40) * 0.1));
            if (i) b.material.color.setRGB(0.1, 0.02, 0.03); else b.material.color.copy(c.col);
            b.material.opacity = (i ? 0.9 : 0.7) * f;
          }
          bandAt(o.x, o.y, x2, y2, h.w * 1.6, wc, 0.25 * f, 0.02, 2);
        }
      }
    }
  }

  /* 我方的阵：大庚剑阵、颠倒五行阵、土牢 */
  const WUXING = ['255,240,200', '110,255,170', '110,160,255', '255,120,60', '208,168,88']; // 金 木 水 火 土
  function syncZone(h, c, t) {
    const f = Math.min(1, h.t / 0.35) * Math.min(1, h.life / 0.4), grow = 0.25 + 0.75 * Math.min(1, h.t / 0.35), r = h.r * grow;
    const arr = (rr, rot, col, op) => { const m = P.arr.get(); m.position.set(h.x * S, 0.045, h.y * S); m.scale.set(rr * S, rr * S, 1); m.rotation.z = rot; m.material.color.copy(col.col); m.material.opacity = op; m.renderOrder = 5; };
    if (h.kind === 'dageng') { // 七十二口青竹蜂云剑，剑尖朝下，环立成阵
      const gold = rgb('255,235,130');
      arr(r * 1.02, t * 0.7, c, 0.75 * f); arr(r * 0.56, -t * 1.5, gold, 0.6 * f);
      flatAt(P.ring, h.x, h.y, r, c, 0.9 * f, 0.035, 4); flatAt(P.circ, h.x, h.y, r, c, 0.07 * f, 0.02, 2);
      for (let i = 0; i < 72 && fyN < 240; i++) {
        const a = (i / 72) * TAU + t * 0.45, x = (h.x + Math.cos(a) * r) * S, z = (h.y + Math.sin(a) * r) * S, y = 0.66 + Math.sin(t * 3 + i * 0.7) * 0.07 + (1 - f) * 1.6;
        dummy.position.set(x, y, z); dummy.rotation.set(PI / 2, 0, a + t * 2); dummy.scale.set(0.105, 0.042, 0.74); dummy.updateMatrix();
        fySw.setMatrixAt(fyN, dummy.matrix); fySw.setColorAt(fyN, tmpC.set(i % 3 ? 0xc4f296 : 0xf4ffe2)); fyN++;
        if (i % 4 === 0) glows.push(x, y, z, c, 0.5 * f, 0.8);
        if (((t * 24 + i * 7) | 0) % 31 === 0) glows.push(x, y - 0.2, z, GOLD, 0.95, 0.5); // 剑身上游走的辟邪神雷
      }
      if (h.t < 0.5) { const b = P.beam.get(), k = h.t / 0.5; b.position.set(h.x * S, 4, h.y * S); b.rotation.set(0, t * 3, 0); b.scale.set(0.3 + k, 8, 0.3 + k); b.material.color.copy(c.col); b.material.opacity = 0.3 * (1 - k); }
      glows.push(h.x * S, 0.3, h.y * S, c, 0.12 * f, 9);
    } else if (h.kind === 'wuxing') { // 五色灵光绕阵流转
      arr(r, t * 0.6, c, 0.6 * f); flatAt(P.ring, h.x, h.y, r, c, 0.6 * f, 0.035, 4); flatAt(P.circ, h.x, h.y, r, c, 0.05 * f, 0.02, 2);
      for (let i = 0; i < 5; i++) {
        const a = t * 0.8 + (i / 5) * TAU, ec = rgb(WUXING[i]), x = h.x + Math.cos(a) * r * 0.82, y = h.y + Math.sin(a) * r * 0.82;
        flatAt(P.circ, x, y, 9, ec, 0.5 * f, 0.03, 4);
        glows.push(x * S, 0.3 + Math.sin(t * 3 + i) * 0.08, y * S, ec, 0.8 * f, 1.1); glows.push(x * S, 0.9, y * S, ec, 0.3 * f, 0.6);
      }
    } else if (h.kind === 'tulao') { // 一圈石柱拔地而起
      const k = Math.min(1, h.t / 0.14) * Math.min(1, h.life / 0.25);
      flatAt(P.ring, h.x, h.y, h.r, c, 0.6 * f, 0.035, 4); flatAt(P.circ, h.x, h.y, h.r, c, 0.08 * f, 0.02, 2);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU, m = P.rock.get(), hh = 1.0 + (i % 3) * 0.16;
        m.position.set((h.x + Math.cos(a) * h.r) * S, hh * (k - 0.5), (h.y + Math.sin(a) * h.r) * S); m.rotation.set(0, a + i, 0); m.scale.set(0.42, hh, 0.36);
      }
    }
  }

  /* 色相定流派，芯定敌我：我方的芯是亮的（近白），敌方的芯是暗的；外圈一律是流派色 */
  function putOrb(i, x, y, z, sx, sy, sz, ry, c, foe, rim) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    orbs.setMatrixAt(i, dummy.matrix);
    orbs.setColorAt(i, foe ? tmpC.copy(c.col).multiplyScalar(0.1) : tmpC.copy(c.col).lerp(WHITE, 0.85));
    dummy.scale.set(sx * rim, sy * rim, sz * rim); dummy.updateMatrix();
    orbRims.setMatrixAt(i, dummy.matrix); orbRims.setColorAt(i, tmpC.copy(c.col));
  }
  function putShard(i, x, y, z, sx, sy, sz, ry, c, foe) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    shards.setMatrixAt(i, dummy.matrix);
    shards.setColorAt(i, foe ? tmpC.copy(c.col).multiplyScalar(0.1) : tmpC.copy(c.col).lerp(WHITE, 0.85));
    dummy.scale.set(sx * 1.9, sy * 1.9, sz * 1.22); dummy.updateMatrix();
    shardRims.setMatrixAt(i, dummy.matrix); shardRims.setColorAt(i, tmpC.copy(c.col));
  }

  function syncProjs(Gm, t) {
    let no = 0, ns = 0, nf = fyN, nb = 0; // fyN：大庚剑阵已经占用的小剑实例
    for (const pr of Gm.projs) {
      const c = rgb(pr.c || '255,255,255'), x = pr.x * S, y = pr.z * S, z = pr.y * S, a = Math.atan2(pr.vy, pr.vx), r = pr.r * S, foe = pr.from === 1, ry = PI / 2 - a;
      if (pr.kind === 'sword') { // 飞剑：按功法进境换形，带拖尾
        const s = (pr.mini ? P.mini : pr.style === 2 ? P.sw2 : pr.style === 1 ? P.sw1 : P.sw0).get(); s.position.set(x, y, z); s.rotation.set(0, ry, 0);
        glows.push(x, y, z, c, pr.style ? 0.5 : 0.32, pr.mini ? 0.7 : 1.0);
        trail(pr, x, y, z, c, pr.mini ? 0.05 : pr.style ? 0.1 : 0.07, pr.style ? 0.95 : 0.55);
        if (pr.style === 2 && !pr.mini && ((pr.t * 40) | 0) % 2 === 0) glows.push(x + U.rand(-0.2, 0.2), y + U.rand(-0.1, 0.1), z + U.rand(-0.2, 0.2), GOLD, 0.95, 0.32); // 剑身游走的金色电弧
      } else if (pr.kind === 'fy') { // 蜂云剑阵：七十二口竹青小剑
        if (nf < 240) {
          dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(0.075, 0.032, 0.5); dummy.updateMatrix();
          fySw.setMatrixAt(nf, dummy.matrix); fySw.setColorAt(nf, tmpC.set(nf % 3 ? 0xc4f296 : 0xf4ffe2)); nf++;
        }
        glows.push(x, y, z, c, 0.4, 0.62);
        trail(pr, x, y, z, c, 0.045, 0.8);
        if (((pr.t * 30 + nf) | 0) % 7 === 0) glows.push(x, y, z, GOLD, 0.9, 0.42);
      } else if (pr.kind === 'beetle') { // 噬金虫：金银相间的甲虫，振翅
        if (pr._i === undefined) pr._i = bugSeq++;
        if (nb < 160) {
          dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(0.2, 0.13, 0.3); dummy.updateMatrix();
          bugs.setMatrixAt(nb, dummy.matrix); bugs.setColorAt(nb, tmpC.set(pr._i % 2 ? 0xffd24a : 0xe6ecf2)); nb++;
        }
        const f = Math.sin(t * 70 + pr._i) * 0.07 + 0.11, sx = Math.sin(a), sz = -Math.cos(a);
        glows.push(x + sx * f, y + 0.05, z + sz * f, WHITE3, 0.75, 0.22); glows.push(x - sx * f, y + 0.05, z - sz * f, WHITE3, 0.75, 0.22);
        glows.push(x, y, z, c, 0.35, 0.6);
      } else if (pr.kind === 'jiao') { // 青蛟旗：一条青蛟，身子由走过的位置连成
        const hh = pr._h || (pr._h = []); hh.push(x, z); if (hh.length > 24) hh.splice(0, 2);
        for (let j = hh.length - 2, q = 0; j >= 0 && no < 900; j -= 2, q++) {
          const sc = r * (1.5 - q * 0.09) * (q ? 1 : 1.25), yy = y + Math.sin(t * 9 - q * 0.8) * 0.12;
          putOrb(no, hh[j], yy, hh[j + 1], sc, sc * 0.9, sc, 0, c, false, 1.25); no++;
          if (q % 3 === 0) glows.push(hh[j], yy, hh[j + 1], c, 0.5, r * 5);
        }
        trail(pr, x, y, z, c, r * 1.4, 0.8);
      } else if (pr.kind === 'ice' || pr.kind === 'blade' || pr.kind === 'needle' || pr.kind === 'bolt' || pr.kind === 'arrow' || pr.kind === 'hook' || pr.kind === 'drill') {
        const thin = pr.kind === 'needle' || pr.kind === 'bolt' || pr.kind === 'arrow';
        if (ns < 500) { putShard(ns, x, y, z, thin ? 0.08 : r * 1.4, thin ? 0.08 : r * 0.95, thin ? 0.66 : r * 4.0, pr.spin ? t * 22 : ry, c, foe); ns++; }
        if (pr.kind !== 'arrow') glows.push(x, y, z, c, foe ? 0.36 : 0.6, r * 4.2); // 凡人的箭不发光
        if (!foe) trail(pr, x, y, z, c, r * 0.9, 0.6);
      } else {
        const big = pr.kind === 'fire' && !foe;
        if (no < 900) { putOrb(no, x, y, z, r * 1.5, r * 1.5, r * 1.5, 0, c, foe, foe ? 1.42 : 1.3); no++; }
        glows.push(x, y, z, c, foe ? 0.36 : 0.75, r * (big ? 6.5 : 4.6));
        if (big || pr.kind === 'spirit' || pr.kind === 'flame') trail(pr, x, y, z, c, r * (big ? 1.3 : 0.9), big ? 0.8 : 0.6);
        else if (pr.kind === 'ghostfire' || pr.kind === 'skullp') glows.push(x - Math.cos(a) * r * 2.4, y, z - Math.sin(a) * r * 2.4, c, 0.3, r * 3.4);
      }
    }
    orbs.count = orbRims.count = no; shards.count = shardRims.count = ns; fySw.count = nf; bugs.count = nb;
    for (const m of [orbs, orbRims, shards, shardRims, fySw, bugs]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  const WHITE = new THREE.Color(0xffffff), GOLD = [1, 0.92, 0.5], WHITE3 = [1, 1, 1];

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
      } else if (p.kind === 'array') {
        const r = U.lerp(p.r1, p.r0, k * k), m = P.arr.get(), c = rgb(p.c);
        m.position.set(p.x * S, 0.05, p.y * S); m.scale.set(r * S, r * S, 1); m.rotation.z = p.rot + t * p.spin;
        m.material.color.copy(c.col); m.material.opacity = Math.min(1, k * 2.2); m.renderOrder = 6;
      } else if (p.kind === 'wings') {
        const pl = G.Game.player, w = P.wing.get(), q = 1 - k;
        place(w, pl.x, pl.y, 0); w.rotation.y = PI / 2 - pl.face; w.scale.setScalar(ACTOR * (0.55 + Math.min(1, q * 5) * 0.6));
        for (const mt of w.userData.mats) mt.opacity = mt.userData.o0 * Math.min(1, k * 2.4);
        glows.push(pl.x * S, 1.1, pl.y * S, rgb('190,205,255'), 0.3 * k, 4);
      } else if (p.kind === 'bolt') {
        glows.push(p.x * S, p.z * S + 0.15, p.y * S, rgb(p.c), 0.9 * k, 2.4);
      }
    }
  }

  function syncActors(Gm, room, p, t) {
    frame++;
    // 敌人
    for (const e of room.enemies) {
      const c = rgb(ZHU);
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
    // 自动瞄准的锁定标记
    const tg = Gm.target;
    if (tg && !tg.dead && Gm.state === 'play' && !Gm.isManualNow()) {
      const tc = rgb(Gm.targetInRange ? '160,255,220' : '150,170,165'), rr = tg.r * 1.45 + 6 + Math.sin(t * 7) * 2;
      flatAt(P.ring, tg.x, tg.y, rr, tc, Gm.targetInRange ? 0.85 : 0.4, 0.04, 5);
      for (let i = 0; i < 4; i++) { const a = t * 2.4 + i * (TAU / 4); glows.push((tg.x + Math.cos(a) * rr) * S, 0.08, (tg.y + Math.sin(a) * rr) * S, tc, Gm.targetInRange ? 0.95 : 0.4, 0.34); }
    }

    // 主角
    if (p) {
      if (heroOwner !== p) { if (heroM) { dyn.remove(heroM.g); heroM.dispose(); } heroM = Mo.hero(p.look); if (!heroM.gl) heroM.g.scale.multiplyScalar(ACTOR); heroS0 = heroM.g.scale.x; dyn.add(heroM.g); heroOwner = p; }
      heroM.g.scale.setScalar(heroS0 * (p.apeT > 0 ? 1.3 * Math.min(1, 0.8 + (p.apeT > 0.3 ? 0.2 : 0)) : 1)); // 惊蛰十二变：身形暴涨
      heroM.g.visible = !p.dead && !(p.inv > 0 && p.dashing <= 0 && Math.floor(t * 20) % 2 === 0);
      place(heroM.g, p.x, p.y, 0); heroM.g.rotation.y = PI / 2 - p.face;
      heroM.update({ t: p.t, moving: p.moving, atk: p.atkAnim, dashing: p.dashing > 0 });
      heroM.setFlash(p.flash);
      pLight.position.set(p.x * S, 1.9, p.y * S + 0.7);
      if (!p.dead) flatAt(P.ring, p.x, p.y, 17, rgb('127,224,192'), 0.4, 0.03, 4);
      if (p.fy && p.sp >= 100 && !p.dead) { flatAt(P.ring, p.x, p.y, 24 + Math.sin(t * 6) * 3, rgb('200,255,120'), 0.7, 0.035, 5); glows.push(p.x * S, 0.5, p.y * S, rgb('200,255,120'), 0.22, 2.4); }
      const tier = p.fy ? 2 : p.qy ? 1 : 0, swPool = P['sw' + tier], swC = rgb(tier === 2 ? '170,255,110' : tier === 1 ? '110,255,170' : '150,255,220');
      // 本命飞剑悬在身后，出剑时前指（身静器动）
      if (!p.dead) for (let i = 0, nh = Math.min(3, p.swords); i < nh; i++) {
        const off = (i - (nh - 1) / 2) * 30, fa = p.face, s = swPool.get();
        const hx = p.x - Math.cos(fa) * 20 - Math.sin(fa) * off, hy = p.y - Math.sin(fa) * 20 + Math.cos(fa) * off;
        s.position.set(hx * S, 1.12 + Math.sin(t * 2.4 + i * 1.7) * 0.06, hy * S);
        s.rotation.set(U.lerp(-1.18, -0.25, Math.min(1, p.atkAnim)), PI / 2 - fa, 0);
        glows.push(s.position.x, s.position.y + 0.1, s.position.z, swC, tier ? 0.34 : 0.2, 0.9);
      }
      // 玄铁盾：绕身飞旋的盾牌 + 一层薄薄的护体灵光
      if (p.shield > 0) {
        const s = P.shield.get(); place(s, p.x, p.y, 30); s.scale.set(1.4, 1.8, 1.4); s.material.opacity = 0.06 + (p.shield / p.shieldMax) * 0.12;
        for (let i = 0; i < 2; i++) { const a = t * 3.2 + i * PI, pl = P.plate.get(); pl.position.set(p.x * S + Math.cos(a) * 0.78, 0.78, p.y * S + Math.sin(a) * 0.78); pl.rotation.set(0, PI / 2 - a, 0); pl.scale.setScalar(0.95); }
      }
      if (p.flags.autoShield && p.autoShieldT <= 0) { const a = t * 2.4, pl = P.plate.get(); pl.position.set(p.x * S + Math.cos(a) * 0.62, 0.95, p.y * S + Math.sin(a) * 0.62); pl.rotation.set(0, PI / 2 - a, 0); pl.scale.setScalar(0.5); }
      if (!p.dead) syncGear(p, t);
      // 青元剑阵：脚下阵图 + 环身飞剑
      if (p.formT > 0) {
        const fc = rgb('110,255,200'), fade = Math.min(1, p.formT * 2), ar = P.arr.get();
        ar.position.set(p.x * S, 0.045, p.y * S); ar.scale.set(96 * S, 96 * S, 1); ar.rotation.z = -t * 1.6; ar.material.color.copy(fc.col); ar.material.opacity = 0.75 * fade; ar.renderOrder = 5;
        const fp = P['sw' + Math.max(1, tier)];
        for (let i = 0; i < p.formN; i++) {
          const a = t * 4.5 + (i / p.formN) * TAU, s = fp.get(), o = formTr[i] || (formTr[i] = {});
          s.position.set((p.x + Math.cos(a) * 66) * S, 0.5, (p.y + Math.sin(a) * 66) * S); s.rotation.set(0, -a, 0);
          glows.push(s.position.x, 0.5, s.position.z, fc, 0.45, 0.9);
          trail(o, s.position.x, 0.5, s.position.z, fc, 0.09, 0.9);
        }
      } else if (formTr.length) formTr.length = 0;
    } else if (heroM) heroM.g.visible = false;

    // 灵宠灵虫
    for (const pt of Gm.pets) {
      let m = petM.get(pt);
      if (!m) { m = Mo.pet(pt.id); if (!m.gl) m.g.scale.multiplyScalar(ACTOR); dyn.add(m.g); petM.set(pt, m); }
      m.seen = frame; m.g.visible = !(pt.hide > 0);
      const fly = pt.z ? pt.z + Math.sin(t * 3 + pt.slot) * 4 : 0;
      place(m.g, pt.x, pt.y, fly); m.g.rotation.y = PI / 2 - pt.face;
      m.update({ t: pt.t, moving: pt.moving || !!pt.z, atk: pt.atk, charge: pt.charge, wind: pt.atk > 0.5 ? 1 : 0 });
      if (pt.hide > 0) continue;
      const pc = rgb(E_PET_C[pt.id] || '127,224,192'), x = pt.x * S, z = pt.y * S;
      flatAt(P.ring, pt.x, pt.y, 11, rgb('127,224,192'), 0.4, 0.03, 4); // 与主角脚下同色的环：这是自己人
      if (pt.id === 'shuangwu') { // 六翼：三对振动的霜翼
        const sx = Math.sin(pt.face), sz = -Math.cos(pt.face), y = fly * S + 0.35;
        for (let i = 0; i < 3; i++) { const fl = 0.22 + Math.abs(Math.sin(t * 34 + i * 1.3)) * 0.22, bx = x - Math.cos(pt.face) * i * 0.14, bz = z - Math.sin(pt.face) * i * 0.14; glows.push(bx + sx * fl, y + 0.08, bz + sz * fl, WHITE3, 0.7, 0.34); glows.push(bx - sx * fl, y + 0.08, bz - sz * fl, WHITE3, 0.7, 0.34); }
        glows.push(x, y, z, pc, 0.3, 1.6);
      } else if (pt.id === 'baolin') { if (pt.charge || ((t * 20) | 0) % 3 === 0) glows.push(x + U.rand(-0.25, 0.25), 0.3 + Math.random() * 0.4, z + U.rand(-0.25, 0.25), GOLD, 0.9, 0.3); if (pt.charge) trail(pt, x, 0.4, z, pc, 0.16, 0.9); else pt._tr = null; }
      else if (pt.id === 'yinyue') glows.push(x, 0.4, z, pc, 0.24 + Math.sin(t * 2) * 0.06, 1.8);
      else if (pt.id === 'zhizhu') glows.push(x, 0.26, z, pc, 0.3, 0.9);
      else if (pt.id === 'tihun') { glows.push(x, 0.4, z, pc, 0.2 + pt.atk * 0.5, 1.4 + pt.atk * 2); }
      else if (pt.id === 'renxing') glows.push(x, 0.62, z + 0.05, pc, 0.3, 0.6);
    }
    for (const [a, m] of petM) if (m.seen !== frame) { dyn.remove(m.g); m.dispose(); petM.delete(a); }

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

  /* 主角身上常驻的法宝：混元钵、皇鳞甲的鳞光、紫罗极火、惊蛰十二变的灵光 */
  const E_PET_C = { zhizhu: '255,90,110', tihun: '154,120,255', shuangwu: '150,220,255', yinyue: '255,200,235', tujia: '208,168,88', baolin: '255,235,130', quhun: '200,205,215', renxing: '255,190,90' };
  function syncGear(p, t) {
    const x = p.x * S, z = p.y * S;
    if (p.flags.bowl) {
      const b = G.Ent.bowlPos(p), m = P.bowl.get(), on = p.bowlN > 0;
      m.position.set(b.x * S, 0.9 + Math.sin(t * 3) * 0.05, b.y * S); m.rotation.set(PI, t * 2, 0); m.scale.setScalar(on ? 0.5 : 0.3);
      if (on) glows.push(m.position.x, m.position.y - 0.1, m.position.z, rgb('224,180,106'), 0.4, 1.3);
    }
    if (p.lin > 0) { const lc = rgb('255,215,120'); flatAt(P.ring, p.x, p.y, 22, lc, 0.7, 0.04, 5); for (let i = 0; i < 6; i++) { const a = t * 1.6 + i * (TAU / 6); glows.push(x + Math.cos(a) * 0.42, 0.35 + (i % 3) * 0.32, z + Math.sin(a) * 0.42, lc, 0.7, 0.26); } }
    if (p.flags.ziluo) {
      const zc = rgb('190,120,255');
      flatAt(P.circ, p.x, p.y, 112, zc, 0.05, 0.02, 2); flatAt(P.ring, p.x, p.y, 112, zc, 0.3, 0.03, 3);
      for (let i = 0; i < 12; i++) { const a = t * 1.3 + i * (TAU / 12), rr = 104 + Math.sin(t * 4 + i * 2) * 7, fl = (t * 1.6 + i * 0.37) % 1; glows.push((p.x + Math.cos(a) * rr) * S, 0.1 + fl * 0.75, (p.y + Math.sin(a) * rr) * S, zc, 0.85 * (1 - fl), 0.75 - fl * 0.4); }
    }
    if (p.apeT > 0) { const ac = rgb('224,184,120'); flatAt(P.ring, p.x, p.y, 30 + Math.sin(t * 8) * 2, ac, 0.7, 0.04, 5); glows.push(x, 1.0, z, ac, 0.3, 4.5); }
    if (p.wardT > 0) glows.push(x, 0.5, z, rgb('232,208,138'), 0.18, 2.6);
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
          const path = (pts) => { c.beginPath(); for (let j = 0; j < pts.length; j++) { const s = proj(pts[j][0], pts[j][1], pts[j][2]); if (j) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); } };
          path(q.pts);
          c.strokeStyle = `rgba(${q.c},${k * 0.3})`; c.lineWidth = q.w * 5.5; c.stroke();
          c.strokeStyle = `rgba(${q.c},${k})`; c.lineWidth = q.w * 2.2; c.stroke();
          c.strokeStyle = `rgba(255,255,255,${k})`; c.lineWidth = q.w * 0.8; c.stroke();
          for (const br of q.br || []) { path(br); c.strokeStyle = `rgba(${q.c},${k * 0.85})`; c.lineWidth = q.w * 0.9; c.stroke(); }
          c.globalCompositeOperation = 'source-over';
        } else if (q.kind === 'petal') { // 流光花瓣：一枚转着的小瓣，带一点拖光
          const s = proj(q.x, q.y, q.z), a = Math.min(1, k * 2.5);
          c.globalCompositeOperation = 'lighter';
          c.save(); c.translate(s.x, s.y); c.rotate(q.rot);
          c.fillStyle = `rgba(${q.c},${a * 0.85})`; c.beginPath(); c.ellipse(0, 0, q.size, q.size * 0.42, 0, 0, TAU); c.fill();
          c.fillStyle = `rgba(255,255,255,${a * 0.7})`; c.beginPath(); c.ellipse(q.size * 0.2, 0, q.size * 0.45, q.size * 0.14, 0, 0, TAU); c.fill();
          c.restore(); c.globalCompositeOperation = 'source-over';
        } else if (q.kind === 'ribbon') { // 绸带：绕身盘旋上升，由粗到细
          const u0 = 1 - k, N = 22, w = q.who;
          c.globalCompositeOperation = 'lighter';
          let prev = null;
          for (let j = 0; j <= N; j++) {
            const u = j / N, hd = Math.min(1, u0 * 1.5), tt = u * hd, a = q.a0 + tt * q.turns * TAU + u0 * 2.4, rr = q.r * (1 - tt * 0.45);
            const s = proj(w.x + Math.cos(a) * rr, w.y + Math.sin(a) * rr, 6 + tt * 78);
            if (prev) {
              const al = Math.min(1, k * 2) * (0.3 + u * 0.7);
              c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(s.x, s.y);
              c.strokeStyle = `rgba(${q.c},${al * 0.55})`; c.lineWidth = 2 + u * 6.5; c.stroke();
              c.strokeStyle = `rgba(255,255,255,${al * u})`; c.lineWidth = 0.6 + u * 1.8; c.stroke();
            }
            prev = s;
          }
          c.globalCompositeOperation = 'source-over';
        } else if (q.kind === 'thread') { // 剑丝
          const s1 = proj(q.x1, q.y1, 20), s2 = proj(q.x2, q.y2, 20);
          c.globalCompositeOperation = 'lighter';
          c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(s2.x, s2.y);
          c.strokeStyle = `rgba(${q.c},${k * 0.45})`; c.lineWidth = 4; c.stroke();
          c.strokeStyle = `rgba(255,255,255,${k * 0.95})`; c.lineWidth = 1.1; c.stroke();
          c.globalCompositeOperation = 'source-over';
        } else if (q.kind === 'slash') {
          c.globalCompositeOperation = 'lighter';
          c.beginPath(); const rr = q.r * (1.05 - k * 0.25);
          for (let j = 0; j <= 10; j++) { const a = q.ang - q.arc / 2 + (q.arc * j) / 10, s = proj(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr, q.z); if (j) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); }
          c.strokeStyle = `rgba(${q.c},${k})`; c.lineWidth = 8 * k + 1.5; c.stroke();
          c.globalCompositeOperation = 'source-over';
        }
      }
      // 大庚剑阵：阵中往复穿梭的万千剑丝
      for (const h of Gm.haz) {
        if (h.kind !== 'dageng' || h.type !== 'zone') continue;
        const f = Math.min(1, h.t / 0.35) * Math.min(1, h.life / 0.4), step = (t * 16) | 0;
        c.globalCompositeOperation = 'lighter'; c.lineWidth = 1.3;
        for (let i = 0; i < 18; i++) {
          const a = U.hash(i, step, 3) * TAU, b = a + 1.2 + U.hash(i, step, 5) * 3.9;
          const s1 = proj(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r, 22), s2 = proj(h.x + Math.cos(b) * h.r, h.y + Math.sin(b) * h.r, 22);
          c.strokeStyle = `rgba(200,255,160,${(0.28 + U.hash(i, step, 7) * 0.45) * f})`;
          c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.stroke();
        }
        c.globalCompositeOperation = 'source-over';
      }
      // 蜂云剑阵：飞剑之间游走的辟邪神雷
      const fy = Gm.projs.filter((x) => x.fy);
      if (fy.length > 1) {
        c.globalCompositeOperation = 'lighter'; c.lineWidth = 1.4;
        for (let n = 0, tries = 0; n < 5 && tries < 24; tries++) {
          const a = U.pick(fy), b = U.pick(fy);
          if (a === b || U.dist2(a.x, a.y, b.x, b.y) > 110 * 110) continue;
          const s1 = proj(a.x, a.y, a.z), s2 = proj(b.x, b.y, b.z), mx = (s1.x + s2.x) / 2 + U.rand(-9, 9), my = (s1.y + s2.y) / 2 + U.rand(-9, 9);
          c.strokeStyle = 'rgba(255,235,130,0.85)'; c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(mx, my); c.lineTo(s2.x, s2.y); c.stroke(); n++;
        }
        c.globalCompositeOperation = 'source-over';
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

  function beginPools() { for (const k in P) P[k].begin(); glows.n = 0; dusts.n = 0; trQ = 0; fyN = 0; }
  function endPools() {
    for (const k in P) P[k].end(); glows.end(); dusts.end();
    const g = trailMesh.geometry; g.setDrawRange(0, trQ * 6); g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
  }

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
      const a = t * 1.3 + (i / 3) * TAU, s = P.sw2.get(), fc = rgb('170,255,110');
      s.position.set(cx + Math.cos(a) * 1.2, 0.9 + Math.sin(t * 2 + i) * 0.12, cz + Math.sin(a) * 1.2); s.rotation.set(0, -a, 0);
      glows.push(s.position.x, s.position.y, s.position.z, fc, 0.5, 1.0);
      trail(menuTr[i], s.position.x, s.position.y, s.position.z, fc, 0.09, 0.9);
    }
    for (const m of [orbs, orbRims, shards, shardRims, fySw, bugs]) m.count = 0;
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
