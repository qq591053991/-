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
  const ACTOR = 1.3; // 角色模型整体放大（俯视下更易辨认）
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
      uniforms: { uScale: { value: 500 }, uSoft: { value: additive ? 1 : 0 }, uK: { value: 1 }, uInk: { value: additive && G.PAPER ? 1 : 0 } },
      vertexShader: 'attribute vec4 acolor; attribute float size; varying vec4 vC; uniform float uScale; void main(){ vC = acolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(240.0, size * uScale / max(0.1,-mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; uniform float uSoft; uniform float uK; uniform float uInk; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float a = mix(smoothstep(1.0, 0.7, r), (1.0 - r) * (1.0 - r) * 1.6, uSoft); gl_FragColor = vec4(vC.rgb, vC.a * min(1.0, a) * uK); if (uInk > 0.5) { vec3 A = gl_FragColor.rgb * gl_FragColor.a; float m = max(max(A.r, A.g), A.b); gl_FragColor = vec4(vec3(m) - A + m * 0.16, 1.0); } }',
      transparent: true, depthWrite: false, blending: additive ? (G.PAPER ? THREE.SubtractiveBlending : THREE.AdditiveBlending) : THREE.NormalBlending,
    });
    this.obj = new THREE.Points(g, this.mat); this.obj.frustumCulled = false; this.obj.renderOrder = additive ? 30 : 20;
  }
  Cloud.prototype.push = function (x, y, z, c, a, size) {
    if (this.n >= this.max) return;
    const i = this.n++;
    if (curRoom && curRoom.hc) y += hW(x, z);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.colr[i * 4] = c[0]; this.colr[i * 4 + 1] = c[1]; this.colr[i * 4 + 2] = c[2]; this.colr[i * 4 + 3] = a;
    this.size[i] = size;
  };
  Cloud.prototype.end = function () {
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = this.geo.attributes.acolor.needsUpdate = this.geo.attributes.size.needsUpdate = true;
    this.mat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * HALF_TAN);
  };

  /* 贴图粒子（卡通画风）：火、烟、火花。和点云一样一次画完，只是每个点从一张图集里取一格，还能转。
     贴图是黑底白图——叠加时乘上颜色；mode：add 叠加 / fire 叠加，亮处过渡到白炽 / smoke 正常混合，亮度当透明度 */
  function TexCloud(max, img, N, mode) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.colr = new Float32Array(max * 4); this.misc = new Float32Array(max * 3); // 大小、取图集的第几格、转角
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('acolor', new THREE.BufferAttribute(this.colr, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('misc', new THREE.BufferAttribute(this.misc, 3).setUsage(THREE.DynamicDrawUsage));
    const tex = new THREE.Texture(img); tex.needsUpdate = true;
    const out = mode === 'smoke' ? 'gl_FragColor = vec4(vC.rgb, vC.a * l);' : mode === 'fire' ? 'gl_FragColor = vec4(mix(vC.rgb, vec3(1.0, 0.93, 0.72), smoothstep(0.42, 0.95, l)) * l, vC.a);' : 'gl_FragColor = vec4(vC.rgb * l, vC.a);';
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, map: { value: tex }, uN: { value: N } },
      vertexShader: 'attribute vec4 acolor; attribute vec3 misc; varying vec4 vC; varying vec3 vM; uniform float uScale; void main(){ vC = acolor; vM = misc; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(420.0, misc.x * uScale / max(0.1,-mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `varying vec4 vC; varying vec3 vM; uniform sampler2D map; uniform float uN;
        void main(){ vec2 q = gl_PointCoord - 0.5; float sn = sin(vM.z), cs = cos(vM.z); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) * 1.42; // 转过之后四角会伸出格子，所以贴图只占中间一块
          if (abs(q.x) > 0.5 || abs(q.y) > 0.5) discard;
          float cell = floor(vM.y + 0.5); vec2 uv = (vec2(mod(cell, uN), floor(cell / uN)) + q + 0.5) / uN;
          float l = texture2D(map, uv).r; ${out} }`,
      transparent: true, depthWrite: false, blending: mode === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.obj = new THREE.Points(g, this.mat); this.obj.frustumCulled = false; this.obj.renderOrder = mode === 'smoke' ? 19 : 31;
  }
  TexCloud.prototype.push = function (x, y, z, c, a, size, cell, rot) {
    if (this.n >= this.max) return;
    const i = this.n++;
    if (curRoom && curRoom.hc) y += hW(x, z);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.colr[i * 4] = c[0]; this.colr[i * 4 + 1] = c[1]; this.colr[i * 4 + 2] = c[2]; this.colr[i * 4 + 3] = a;
    this.misc[i * 3] = size * 1.42; this.misc[i * 3 + 1] = cell || 0; this.misc[i * 3 + 2] = rot || 0;
  };
  TexCloud.prototype.end = function () {
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = this.geo.attributes.acolor.needsUpdate = this.geo.attributes.misc.needsUpdate = true;
    this.mat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * HALF_TAN);
  };
  const NOFX = { n: 0, push() {}, end() {} }; // 没有贴图时（青绿画风）这几样粒子不画
  let fires = NOFX, smokes = NOFX, sparks = NOFX, FXT = null;

  let glows, dusts, orbs, shards, orbRims, shardRims, fySw, bugs, P = {};
  let trailMesh, trPos, trCol, trQ = 0, arrayTex = null, bugSeq = 0, fyN = 0, heroS0 = 1;
  const ZHU = G.PAPER ? '222,52,30' : '255,74,50';       // 朱砂：敌人与危险（绢上用更沉的朱）
  const QING = G.PAPER ? '20,150,118' : '127,224,192'; // 青：自己人
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
    trailMesh = new THREE.Mesh(g, Mo.inkBlend(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    trailMesh.frustumCulled = false; trailMesh.renderOrder = 25; scene.add(trailMesh);
  }
  function trail(o, x, y, z, c, width, gain) {
    let h = o._tr; if (!h) h = o._tr = [];
    if (curRoom && curRoom.hc) y += hW(x, z);
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
    pLight = new THREE.PointLight(0xfff0d8, G.PAPER ? 0.35 : 0.55, 10.5, 1.2); scene.add(pLight);
    for (let i = 0; i < MAX_LIGHTS; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.4); scene.add(l); roomLights.push(l); }
    dyn = new THREE.Group(); scene.add(dyn);

    glowTex = ctex(Tx.radial(128, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]));
    webTex = ctex(Tx.web());
    glyphTex = ctex(Tx.glyph('禁', '#ffd0d0'));
    vignette = G.PAPER ? Tx.radial(256, [[0, 'rgba(96,70,40,0)'], [0.66, 'rgba(96,70,40,0)'], [1, 'rgba(96,70,40,0.34)']]) : Tx.radial(256, [[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]); // 绢本：四边是一圈旧绢的黄

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
    for (let i = 0; i < 28; i++) motes.push({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * TAU, v: 0.5 + Math.random() });

    glows = new Cloud(2600, true); dusts = new Cloud(700, false);
    scene.add(glows.obj); scene.add(dusts.obj);
    if (G.DH && Tx.img.fx_flame && Tx.img.fx_smoke && Tx.img.fx_burst && Tx.img.fx_array) { // 卡通画风：法术特效用贴图
      fires = new TexCloud(700, Tx.img.fx_flame, 2, 'fire'); smokes = new TexCloud(500, Tx.img.fx_smoke, 2, 'smoke'); sparks = new TexCloud(400, Tx.img.fx_burst, 1, 'add');
      scene.add(fires.obj); scene.add(smokes.obj); scene.add(sparks.obj);
      const ft = (n) => { const t = new THREE.Texture(Tx.img['fx_' + n]); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso; t.needsUpdate = true; return t; };
      FXT = { array: ft('array'), bagua: ft('bagua'), warn: ft('warn'), ring: ft('ring'), slash: ft('slash'), bolt: ft('bolt'), crack: ft('crack'), swirl: ft('swirl'), streak: Tx.img.fx_streak ? ft('streak') : ft('bolt') };
    }

    const mkInst = (geo, n, o) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(Object.assign({ color: 0xffffff }, o)), n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, tmpC.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    };
    // 弹幕 = 芯 + 外壳（外壳只画背面，于是在芯的外围露出一圈色边）。我方白芯，敌方暗芯
    orbs = mkInst(Mo.geo.sph(10), 900); orbRims = mkInst(Mo.geo.sph(10), 900, { side: THREE.BackSide });
    shards = mkInst(Mo.geo.oct(), 500); shardRims = mkInst(Mo.geo.oct(), 500, { side: THREE.BackSide });
    fySw = Mo.fyGeo ? mkInst(Mo.fyGeo(), 240, { side: THREE.DoubleSide, vertexColors: true }) : mkInst(Mo.bladeGeo(), 240, { side: THREE.DoubleSide }); // 蜂云剑阵的小剑（卡通画风：一口口翠竹剑）
    bugs = mkInst(Mo.geo.sph(10), 160);                             // 噬金虫
    initTrails();
    arrayTex = FXT ? FXT.array : ctex(Tx.array());

    // 贴地图形的池
    /* 贴地的图形（预警圈、阵纹、脚下的环、墨渍）要"披"在地形上：台地上高、平地上低，跨过台沿时顺着坡走。
       做法是在顶点着色器里按世界坐标去查一张高度图（每间房一张，格点高度），把每个顶点抬到地面上。
       所以这些图形的网格要有足够的细分，并且不参加 liftDyn 的整体抬升 */
    const flatMat = (o) => {
      const m = new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
      m.onBeforeCompile = (sh) => {
        sh.uniforms.hMap = HU.map; sh.uniforms.hSize = HU.size;
        sh.vertexShader = 'uniform sampler2D hMap;\nuniform vec2 hSize;\n' + sh.vertexShader.replace('#include <project_vertex>', `
          vec4 dWorld = modelMatrix * vec4( transformed, 1.0 );
          dWorld.y += texture2D( hMap, ( dWorld.xz + 0.5 ) / hSize ).r;
          vec4 mvPosition = viewMatrix * dWorld;
          gl_Position = projectionMatrix * mvPosition;`);
      };
      m.customProgramCacheKey = () => 'drape';
      return m;
    };
    const circG = new THREE.RingGeometry(0.0001, 1, 48, 8), ringG = new THREE.RingGeometry(0.93, 1, 64), thinG = new THREE.RingGeometry(0.86, 1, 64), planeG = new THREE.PlaneGeometry(1, 1, 12, 4);
    const flat = (geo, o) => () => { const ink = o && o.ink; if (o) delete o.ink; const mt = flatMat(o); if (ink) Mo.inkBlend(mt); const m = new THREE.Mesh(geo, mt); m.rotation.x = -PI / 2; m.userData.drape = true; return m; };
    P.circ = new Pool(flat(circG)); P.ring = new Pool(flat(ringG)); P.band = new Pool(() => { const m = new THREE.Mesh(planeG, flatMat({ side: THREE.DoubleSide })); m.rotation.order = 'YXZ'; m.userData.drape = true; return m; });
    P.fxring = new Pool(flat(thinG, { blending: THREE.AdditiveBlending, ink: 1 }));
    P.web = new Pool(flat(circG, { map: webTex }));
    for (let i = 0; i < 3; i++) P['stain' + i] = new Pool(flat(planeG, { map: ctex(Tx.splat(i * 7 + 1)) })); // 战斗留在地上的墨渍
    P.beam = new Pool(() => new THREE.Mesh(Mo.geo.box(), Mo.inkBlend(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))));
    P.sw0 = new Pool(() => Mo.sword(0)); P.sw1 = new Pool(() => Mo.sword(1)); P.sw2 = new Pool(() => Mo.sword(2)); P.mini = new Pool(() => Mo.sword('mini'));
    P.arr = new Pool(flat(circG, { map: arrayTex, blending: THREE.AdditiveBlending, ink: 1 }));
    if (FXT) {
      const addv = { blending: THREE.AdditiveBlending };
      P.bagua = new Pool(flat(circG, Object.assign({ map: FXT.bagua }, addv)));   // 颠倒五行阵：八卦阵图
      P.shock = new Pool(flat(circG, Object.assign({ map: FXT.ring }, addv)));    // 冲击波
      P.warn = new Pool(flat(circG, Object.assign({ map: FXT.warn }, addv)));     // 敌人招式的预警圈
      P.swirl = new Pool(flat(circG, Object.assign({ map: FXT.swirl }, addv)));   // 毒瘴的漩涡
      P.crackG = new Pool(flat(circG, Object.assign({ map: FXT.crack }, addv)));  // 地裂里的余烬
      P.crackD = new Pool(flat(circG, { alphaMap: FXT.crack, color: 0x070504 })); // 地裂：焦黑的缝
      // 剑气：一弯月牙，平躺在离地一尺处
      P.slash = new Pool(() => { const m = new THREE.Mesh(planeG, new THREE.MeshBasicMaterial({ map: FXT.slash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.rotation.x = -PI / 2; m.renderOrder = 29; return m; });
      // 闪电：一条从 A 拉到 B、正对镜头的带子，顶点每帧重写
      P.boltq = new Pool(() => {
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(THREE.DynamicDrawUsage));
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)); g2.setIndex([0, 1, 2, 0, 2, 3]);
        const m = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: FXT.bolt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = 30; m.userData.drape = true; return m;
      });
      // 剑光、光束：同样是一条正对镜头的带子，贴的是流光（一头亮、拖着细丝）；两头各放一条、亮头朝外，中间就是匀的
      P.beamq = new Pool(() => {
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(THREE.DynamicDrawUsage));
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)); g2.setIndex([0, 1, 2, 0, 2, 3]);
        const m = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: FXT.streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = 30; m.userData.drape = true; return m;
      });
      P.streakF = new Pool(() => { const m = new THREE.Mesh(planeG, flatMat({ map: FXT.streak, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.rotation.order = 'YXZ'; m.userData.drape = true; return m; }); // 贴地的流光
    }
    P.wing = new Pool(() => Mo.wings()); P.plate = new Pool(() => Mo.shieldPlate());
    P.gem = new Pool(() => { const m = new THREE.Mesh(Mo.geo.oct(), new THREE.MeshBasicMaterial({ color: 0x8affd8 })); m.scale.set(0.15, 0.24, 0.15); return m; });
    P.potion = new Pool(() => { const g = new THREE.Group(); const a = new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshLambertMaterial({ color: 0xe0484a, emissive: 0x5a1012 })); a.scale.setScalar(0.24); const b = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xd9b45a })); b.scale.set(0.09, 0.14, 0.09); b.position.y = 0.16; g.add(a, b); return g; });
    P.ball = new Pool(() => new THREE.Mesh(Mo.geo.sph(10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    P.giant = new Pool(() => Mo.giantSword());
    // 法宝的实体：金光砖、元磁神山、混元钵、土牢的石柱
    P.brick = new Pool(() => { const g = new THREE.Group(), a = new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })), b = new THREE.Mesh(Mo.geo.box(), new THREE.MeshBasicMaterial({ color: 0xffb93c, side: THREE.BackSide })); b.scale.setScalar(1.16); g.add(a, b); return g; });
    P.hill = new Pool(() => { const g = new THREE.Group(), a = new THREE.Mesh(Mo.geo.cone(6), new THREE.MeshPhongMaterial({ color: 0x5c6470, emissive: 0x2c2416, flatShading: true, shininess: 6 })), b = new THREE.Mesh(Mo.geo.cone(6), new THREE.MeshBasicMaterial({ color: 0xd0a858, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); b.scale.setScalar(1.14); g.add(a, b); return g; });
    P.bowl = new Pool(() => { const m = new THREE.Mesh(Mo.geo.dome(), new THREE.MeshLambertMaterial({ color: 0xd6a04e, emissive: 0x5a3a10, side: THREE.DoubleSide })); m.rotation.x = PI; return m; });
    if (G.DH) { // 土牢的石柱：上细下粗、棱角不齐的六棱石，叠一层石纹
      const pillar = (v) => {
        const g2 = new THREE.CylinderGeometry(0.34, 1, 1, 6, 3).toNonIndexed(), A = g2.attributes.position, col = new Float32Array(A.count * 3), c0 = new THREE.Color(0x4a4032), c1 = new THREE.Color(0xa8987c), tc = new THREE.Color();
        for (let i = 0; i < A.count; i++) {
          const x = A.getX(i), y = A.getY(i) + 0.5, z = A.getZ(i), j = U.hash(Math.round(x * 40) + v * 7, Math.round(y * 9), Math.round(z * 40)) - 0.5, tw = y * 0.5 * (v % 2 ? 1 : -1), cs = Math.cos(tw), sn = Math.sin(tw);
          A.setXYZ(i, (x * cs - z * sn) * (1 + j * 0.32), y + (y > 0.95 ? j * 0.22 : 0), (x * sn + z * cs) * (1 + j * 0.32));
          tc.copy(c0).lerp(c1, Math.min(1, y * 1.1)).multiplyScalar(0.88 + (j + 0.5) * 0.24); col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
        }
        g2.setAttribute('color', new THREE.BufferAttribute(col, 3)); g2.computeVertexNormals(); return g2;
      };
      const pg = [0, 1, 2].map(pillar); let rk = 0;
      P.rock = new Pool(() => { const m = new THREE.Mesh(pg[rk++ % 3], brushMat(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.castShadow = true; m.userData.rockH = 1; return m; });
    }
    else P.rock = new Pool(() => new THREE.Mesh(Mo.geo.box(), new THREE.MeshLambertMaterial({ color: 0x8e7650, emissive: 0x1c140a })));
    P.shield = new Pool(() => new THREE.Mesh(Mo.geo.sph(14), Mo.inkBlend(new THREE.MeshBasicMaterial({ color: 0xbcd8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))));

    if (G.DH) { heightMist(); initSky(); }
    initPost();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  };


  /* ============================ 收尾一趟（卡通画风） ============================
     整幅画面先画进一张高动态范围的图（发光的东西叠起来可以超过"白"，不被截掉），再过一遍：
     1. 泛光：超过白的那部分向四周晕开——剑光、阵图、火才像是"自己在发亮"。做法是取出亮部画进一张半大的图，
        用它的各级缩小图当作由近到远的模糊，叠回去；不需要一趟趟地模糊；
     2. 冲击波：爆炸那一圈空气把后面的景象折弯一下，红色略微错开；
     3. 大招蓄势：天色压暗、偏冷，只压暗处，发光的不压——法术因此更亮；
     4. 落下的一瞬：一帧"墨"，画面只剩黑白两色，落点放出几道白；
     5. 高光柔和地收住（不是硬切成一片白），略提一点饱和与反差。
     画面仍在显示空间里叠加（各种发光的东西原先就是按显示空间调的），所以不开这一趟时看起来和原来一样。
     这一趟的思路参考了开源游戏 Small Magic（MIT）的收尾处理；代码是另写的。 */
  /* 谷底的雾（卡通画风）：三自带的雾只按离镜头的远近算；这里再加一层按高度算的——
     比浮台低的东西越往下越化进雾色里，石峰的脚、台基、云海下面的一切因此"沉"下去，浮台就浮起来了。
     做法是把所有内置材质共用的那几段雾的着色器换掉（顶点里算出世界高度，片元里取两种雾里浓的那个）。
     世界高度由视图矩阵反推（不用 cameraPosition：朗伯、基础材质不会给它赋值） */
  function heightMist() {
    const C = THREE.ShaderChunk;
    C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying float vFogY;\n#endif';
    C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif';
    C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
    C.fog_fragment = C.fog_fragment.replace('float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );', 'float fogFactor = max( smoothstep( fogNear, fogFar, vFogDepth ), smoothstep( -0.7, -7.0, vFogY ) * 0.93 );');
  }

  /* 天穹（卡通画风）：一只罩在外面的大球——地平线以上由淡到蓝，太阳那一边有一圈暖晕；地平线以下就是雾的颜色。
     打斗时镜头朝下，看不到天；主菜单与远望的镜头里看得到 */
  let sky = null;
  function initSky() {
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x4f8fd0) }, uHor: { value: new THREE.Color(0xb4d0e6) }, uSun: { value: new THREE.Vector3(-0.4, 0.5, 0.3).normalize() }, uSunC: { value: new THREE.Color(0xfff0d0) } },
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunC;
        void main() { vec3 d = normalize(vD); float h = max(d.y, 0.0); vec3 c = mix(uHor, uTop, 1.0 - pow(1.0 - h, 2.6));
          float s = max(dot(d, uSun), 0.0); c += uSunC * (pow(s, 24.0) * 0.5 + pow(s, 3.0) * 0.14) * step(0.0, d.y + 0.05);
          gl_FragColor = vec4(c, 1.0); }` });
    sky = new THREE.Mesh(new THREE.SphereGeometry(215, 24, 14), m); sky.renderOrder = -20; sky.frustumCulled = false; scene.add(sky);
  }

  let post = null;
  function initPost() {
    if (!G.DH || !renderer.capabilities.isWebGL2) return;
    if (R.noAO === undefined) R.noAO = /[?&]ao=0\b/.test(location.search); // 网址加 ?ao=0 关掉环境遮蔽（排查用）
    const gl = renderer.getContext();
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return;
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    // 画场景的那张图带一张深度图：环境遮蔽要靠它知道每个像素有多远。深度图挂不上的设备就不开环境遮蔽
    const mkS = (withDepth) => { const o = { type: THREE.HalfFloatType, samples: R.lite ? 2 : 4, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      if (withDepth) { o.depthTexture = new THREE.DepthTexture(sz.x, sz.y, THREE.UnsignedIntType); o.depthTexture.minFilter = o.depthTexture.magFilter = THREE.NearestFilter; }
      return new THREE.WebGLRenderTarget(sz.x, sz.y, o); };
    let rtS = mkS(!R.noAO), hasDepth = !R.noAO;
    if (hasDepth) { // 多重采样的图：深度图挂在"汇总"用的那只帧缓冲上，单独查一下它齐不齐
      renderer.setRenderTarget(rtS); const fb = renderer.properties.get(rtS).__webglFramebuffer;
      if (fb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) hasDepth = false; }
      renderer.resetState(); renderer.setRenderTarget(null);
      if (!hasDepth) { rtS.depthTexture.dispose(); rtS.dispose(); rtS = mkS(false); }
    }
    const rtB = new THREE.WebGLRenderTarget(Math.max(2, sz.x >> 1), Math.max(2, sz.y >> 1), { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    renderer.setRenderTarget(rtS); const okS = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(rtB); const okB = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    if (!okS || !okB) { rtS.dispose(); rtB.dispose(); return; } // 这台设备画不了半浮点的图：不开这一趟
    // 画进图里时也按显示空间输出（three 默认往图里画线性值）：叠加发光的结果才和直接画到屏幕上一致
    THREE.ShaderChunk.encodings_fragment = 'gl_FragColor = LinearTosRGB( gl_FragColor );';
    const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const bright = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { tDrawn: { value: rtS.texture }, uPx: { value: new THREE.Vector2() }, uThr: { value: 0.96 } }, vertexShader: VS,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDrawn; uniform vec2 uPx; uniform float uThr;
        void main() { vec3 c = (texture2D(tDrawn, vUv + uPx * vec2(-0.5, -0.5)).rgb + texture2D(tDrawn, vUv + uPx * vec2(0.5, -0.5)).rgb + texture2D(tDrawn, vUv + uPx * vec2(-0.5, 0.5)).rgb + texture2D(tDrawn, vUv + uPx * vec2(0.5, 0.5)).rgb) * 0.25;
          float l = max(c.r, max(c.g, c.b)); c *= max(l - uThr, 0.0) / max(l, 1e-4); // 只留超过门槛的部分，颜色不变
          gl_FragColor = vec4(min(c, vec3(1.6)), 1.0); }` });
    /* 环境遮蔽：东西挨着东西的地方（墙根、石脚、树下、人物脚边）天光照不进去，该暗一点。
       每个像素从深度图还原出自己在镜头里的位置与朝向，在周围一小圈（世界里大约半格多）取八个点：
       哪个点高出自己这片面，就挡掉一点天光。取点的方向每 4×4 个像素转一轮，再用 4×4 的均值抹平（隔着深度断层的不算）。半幅大小 */
    const hw = () => Math.max(2, sz.x >> 1), hh = () => Math.max(2, sz.y >> 1);
    const rtA = new THREE.WebGLRenderTarget(hw(), hh(), { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const rtA2 = new THREE.WebGLRenderTarget(hw(), hh(), { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const aoM = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: VS,
      uniforms: { tDepth: { value: rtS.depthTexture }, uPx: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2(1, 260) }, uTan: { value: new THREE.Vector2(1, 1) }, uRad: { value: 0.75 } },
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 uPx; uniform vec2 uNF; uniform vec2 uTan; uniform float uRad;
        vec2 snap(vec2 uv) { return (floor(uv / uPx) + 0.5) * uPx; }
        float vz(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNF.x * uNF.y / (uNF.y - d * (uNF.y - uNF.x)); }
        vec3 vp(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) * uTan * z, -z); }
        void main() {
          vec2 u0 = snap(vUv);
          float z = vz(u0), zz = clamp(z / 128.0, 0.0, 1.0) * 255.0;
          if (z > 110.0) { gl_FragColor = vec4(1.0, floor(zz) / 255.0, fract(zz), 1.0); return; }
          vec3 p = vp(u0, z); vec2 ex = vec2(uPx.x, 0.0), ey = vec2(0.0, uPx.y);
          float zl = vz(u0 - ex), zr = vz(u0 + ex), zd = vz(u0 - ey), zu = vz(u0 + ey);
          vec3 dx = abs(zr - z) < abs(z - zl) ? vp(u0 + ex, zr) - p : p - vp(u0 - ex, zl);
          vec3 dy = abs(zu - z) < abs(z - zd) ? vp(u0 + ey, zu) - p : p - vp(u0 - ey, zd);
          vec3 n = normalize(cross(dx, dy));
          vec2 fc = floor(mod(gl_FragCoord.xy, 4.0));
          float ang = fract((fc.x + fc.y * 4.0) * 0.4375 + 0.03) * 6.2832, occ = 0.0;
          vec2 rUv = min(uRad / (z * uTan * 2.0), vec2(0.07));
          for (int i = 0; i < 8; i++) {
            float t = (float(i) + 0.5) / 8.0, a = ang + float(i) * 2.4;
            vec2 uv = snap(u0 + vec2(cos(a), sin(a)) * rUv * (0.2 + 0.8 * t));
            vec3 v = vp(uv, vz(uv)) - p; float vv = dot(v, v);
            occ += max(0.0, dot(v, n) / (sqrt(vv) + 1e-4) - 0.16) * max(0.0, 1.0 - vv / (uRad * uRad * 3.0));
          }
          float ao = clamp(1.0 - occ * 0.36, 0.0, 1.0);
          ao = mix(ao, 1.0, smoothstep(50.0, 105.0, z));
          gl_FragColor = vec4(ao, floor(zz) / 255.0, fract(zz), 1.0);
        }` });
    const aoB = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: VS, uniforms: { tA: { value: rtA.texture }, uPx: { value: new THREE.Vector2() } },
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tA; uniform vec2 uPx;
        float zOf(vec4 c) { return (c.g * 255.0 + c.b) * (128.0 / 255.0); }
        void main() {
          vec4 c0 = texture2D(tA, vUv); float z0 = zOf(c0), s = 0.0, ws = 0.0;
          for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
            vec4 c = texture2D(tA, vUv + (vec2(float(x), float(y)) - 1.5) * uPx);
            float wgt = max(0.0, 1.0 - abs(zOf(c) - z0) * 2.2 / (1.0 + z0 * 0.03)); s += c.r * wgt; ws += wgt;
          }
          gl_FragColor = vec4(ws > 1e-3 ? s / ws : c0.r, 0.0, 0.0, 1.0);
        }` });
    const GRADE = { sh: [0.93, 0.97, 1.07], hi: [1.04, 1.01, 0.95], sat: 1.1, con: 0.14, vig: 0.16, wash: 0.08, ao: [0.42, 0.46, 0.58] }; // 没写调色的主题用这一套
    const U = { tDrawn: { value: rtS.texture }, tBright: { value: rtB.texture }, tAO: { value: rtA2.texture }, uAO: { value: 0 }, uAoTint: { value: new THREE.Vector3(0.42, 0.46, 0.58) },
      uSh: { value: new THREE.Vector3(1, 1, 1) }, uHi: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.07 }, uCon: { value: 0.1 }, uVig: { value: 0 }, uWash: { value: 0 }, uSunC: { value: new THREE.Color(1, 0.9, 0.7) }, uAoShow: { value: /[?&]ao=show\b/.test(location.search) ? 1 : 0 }, uSize: { value: new THREE.Vector2(sz.x, sz.y) }, uShock: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uDoom: { value: 0 }, uDoomCol: { value: new THREE.Vector3(0.36, 0.44, 0.6) }, uInk: { value: 0 }, uInkAt: { value: new THREE.Vector2(0.5, 0.5) }, uBloom: { value: 0.3 }, uSquash: { value: Math.sin(PITCH) } };
    const fin = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: U, vertexShader: VS,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDrawn; uniform sampler2D tBright; uniform vec2 uSize; uniform vec4 uShock[3]; uniform float uDoom; uniform vec3 uDoomCol; uniform float uInk; uniform vec2 uInkAt; uniform float uBloom; uniform float uSquash;
        uniform sampler2D tAO; uniform float uAO; uniform vec3 uAoTint; uniform vec3 uSh; uniform vec3 uHi; uniform float uSat; uniform float uCon; uniform float uVig; uniform float uWash; uniform vec3 uSunC; uniform float uAoShow;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 glowAt(float lod, float w) { vec2 px = exp2(lod + 1.0) / uSize * 0.6; // 每级取四处：缩小图直接放大是一格一格的，错开取一下就柔了
          return (texture2DLodEXT(tBright, vUv + px * vec2(1.0, 0.4), lod).rgb + texture2DLodEXT(tBright, vUv + px * vec2(-0.4, 1.0), lod).rgb + texture2DLodEXT(tBright, vUv + px * vec2(-1.0, -0.4), lod).rgb + texture2DLodEXT(tBright, vUv + px * vec2(0.4, -1.0), lod).rgb) * 0.25 * w; }
        void main() {
          vec2 asp = vec2(uSize.x / uSize.y, 1.0 / uSquash), at = vUv, split = vec2(0.0); // 地上的圆在斜着看的镜头里是个扁圆
          for (int i = 0; i < 3; i++) { vec4 s = uShock[i]; if (s.w <= 0.0) continue;
            vec2 sd = (vUv - s.xy) * asp; float sl = length(sd), so = (sl - s.z) / (0.014 + s.z * 0.11), bend = exp(-so * so) * s.w; vec2 dir = sd / max(sl, 1e-4) / asp;
            at -= dir * bend * 0.032; split += dir * bend * 0.011; }
          vec3 c = texture2D(tDrawn, at).rgb;
          if (dot(split, split) > 1e-9) c.r = texture2D(tDrawn, at - split).r;
          if (uAO > 0.0) { float ao = texture2D(tAO, at).r, lm = max(c.r, max(c.g, c.b)); ao = mix(ao, 1.0, smoothstep(0.8, 1.3, lm)); c *= mix(vec3(1.0), mix(uAoTint, vec3(1.0), ao), uAO); } // 发亮的东西不压
          c += (texture2DLodEXT(tBright, vUv, 0.0).rgb * 0.4 + glowAt(1.0, 0.6) + glowAt(2.0, 0.75) + glowAt(3.0, 0.8) + glowAt(4.0, 0.7) + glowAt(5.0, 0.45)) * uBloom;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c, c * uDoomCol, uDoom * (1.0 - smoothstep(0.62, 1.15, l)));
          vec3 hi = max(c - 0.8, 0.0); c = min(c, vec3(0.8)) + 0.2 * (1.0 - exp(-hi * 5.0 * 0.62)); // 高光：过了八成亮就渐渐收住，再亮也只是趋近于白
          // 调色：暗部偏冷、亮部偏暖（分离色调），再提一点饱和与反差；四角略压暗；日头那一侧（左上）罩一层淡淡的暖光
          l = dot(c, vec3(0.299, 0.587, 0.114)); c *= mix(uSh, uHi, smoothstep(0.06, 0.72, l));
          l = dot(c, vec3(0.299, 0.587, 0.114)); c = clamp(mix(vec3(l), c, uSat), 0.0, 1.0);
          c = mix(c, c * c * (3.0 - 2.0 * c), uCon);
          c *= 1.0 - uVig * smoothstep(0.36, 0.92, length((vUv - 0.5) * vec2(1.0, 0.86)) * 1.25);
          c += uSunC * (1.0 - c) * uWash * pow(clamp(1.0 - length((vUv - vec2(0.0, 1.0)) * vec2(0.7, 1.0)), 0.0, 1.0), 2.0);
          if (uInk > 0.0) {
            vec2 sd = (vUv - uInkAt) * vec2(uSize.x / uSize.y, 1.0); float sl = length(sd), k = smoothstep(0.3, 0.38, dot(c, vec3(0.299, 0.587, 0.114))), cell = floor(atan(sd.y, sd.x) * 7.0);
            float ray = step(0.7, hash(vec2(cell, 3.0))) * smoothstep(0.1, 0.2, sl - 0.16 * hash(vec2(cell, 9.0)));
            k = max(k, 1.0 - smoothstep(0.0, 0.01, sl - 0.055)); // 落点：一个实心的白点
            k = mix(k, 1.0 - k, ray * 0.9);
            c = mix(c, vec3(k) * vec3(0.97, 0.95, 0.9), uInk);
          }
          if (uAoShow > 0.5) c = vec3(texture2D(tAO, vUv).r);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }` });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fin); quad.frustumCulled = false;
    const stage = new THREE.Scene(); stage.add(quad); const flat = new THREE.Camera();
    renderer.info.autoReset = false;
    let doom = 0, inkT = 0, inkD = 0.08, aoOk = 0;
    post = {
      resize() { renderer.getDrawingBufferSize(sz); rtS.setSize(sz.x, sz.y); rtB.setSize(Math.max(2, sz.x >> 1), Math.max(2, sz.y >> 1)); rtA.setSize(hw(), hh()); rtA2.setSize(hw(), hh()); U.uSize.value.set(sz.x, sz.y); },
      // 每章一套调色（themes.js 的 grade）；洞里不罩暖光
      grade(th, inCave) { const q = Object.assign({}, GRADE, th.grade || {});
        U.uSh.value.fromArray(q.sh); U.uHi.value.fromArray(q.hi); U.uSat.value = q.sat; U.uCon.value = q.con; U.uVig.value = q.vig; U.uWash.value = inCave ? 0 : q.wash; U.uAoTint.value.fromArray(q.ao); U.uSunC.value.set(th.sun[0]); },
      render(dt, inGame) {
        const FXg = G.FX;
        // 压暗：渐入渐出
        const want = inGame && FXg.darkT > 0 ? FXg.darkA * Math.min(1, FXg.darkT / 0.3) * Math.min(1, (FXg.darkD - FXg.darkT) / 0.12 + 0.2) : 0;
        doom += (want - doom) * Math.min(1, dt * 14); U.uDoom.value = doom;
        // 墨帧：按真实时间算（慢动作里也只是一瞬）
        if (inGame && FXg.inkReq) { const q = FXg.inkReq, sp = proj(q.x, q.y, 0); FXg.inkReq = null; inkT = inkD = q.dur; U.uInkAt.value.set(sp.x / W, 1 - sp.y / H); }
        if (inkT > 0) { inkT -= dt; U.uInk.value = inkT > 0 ? Math.min(1, inkT / (inkD * 0.35)) : 0; } else U.uInk.value = 0;
        // 冲击波：最多三圈
        let n = 0;
        if (inGame) for (const q of FXg.parts) {
          if (q.kind !== 'shock' || n >= 3) continue;
          const k = 1 - q.life / q.max, sp = proj(q.x, q.y, 0), sp2 = proj(q.x + q.r, q.y, 0);
          U.uShock.value[n++].set(sp.x / W, 1 - sp.y / H, (Math.abs(sp2.x - sp.x) / H) * (0.12 + 0.88 * Math.pow(k, 0.7)), q.pw * (1 - k) * (1 - k));
        }
        for (; n < 3; n++) U.uShock.value[n].w = 0;
        renderer.info.reset();
        if (hasDepth && aoOk === 0) while (gl.getError() !== gl.NO_ERROR) { /* 清掉旧账：下面只看这一帧汇总深度时出不出错 */ }
        renderer.setRenderTarget(rtS); renderer.render(scene, camera);
        if (hasDepth && aoOk === 0) aoOk = gl.getError() === gl.NO_ERROR ? 1 : -1; // 头一帧查一次：深度汇总不下来的设备就不开环境遮蔽
        const useAO = hasDepth && aoOk === 1 && !R.noAO && qScale > 0.7;
        if (useAO) {
          const th2 = Math.tan((FOV * Math.PI) / 360);
          aoM.uniforms.uPx.value.set(1 / sz.x, 1 / sz.y); aoM.uniforms.uNF.value.set(camera.near, camera.far); aoM.uniforms.uTan.value.set(th2 * camera.aspect, th2);
          quad.material = aoM; renderer.setRenderTarget(rtA); renderer.render(stage, flat);
          aoB.uniforms.uPx.value.set(1 / rtA.width, 1 / rtA.height); quad.material = aoB; renderer.setRenderTarget(rtA2); renderer.render(stage, flat);
        }
        U.uAO.value = useAO ? 0.9 : 0;
        bright.uniforms.uPx.value.set(1 / sz.x, 1 / sz.y); quad.material = bright;
        renderer.setRenderTarget(rtB); renderer.render(stage, flat);
        quad.material = fin; renderer.setRenderTarget(null); renderer.render(stage, flat);
      },
    };
  }
  // 把这一帧画出来：有收尾一趟就走它，没有就直接画
  function present(dt, inGame) { if (post && R.quality !== 'low' && !R.noPost) post.render(dt, inGame); else { if (post) renderer.info.reset(); renderer.render(scene, camera); } }

  R.resize = function () {
    if (!this.ok) return;
    W = Math.max(320, window.innerWidth); H = Math.max(240, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio((R.lite ? Math.min(dpr, 1.5) : dpr) * qScale); renderer.setSize(W, H, false);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); ov.style.width = W + 'px'; ov.style.height = H + 'px';
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (post) post.resize();
  };

  /* 画质自适应：帧率撑不住就降渲染分辨率（一档一成，最低六成），稳住之后再慢慢升回去。
     暂停菜单里可以改成"高"（不降）或"省电"（固定六成） */
  let qScale = 1, qAcc = 0, qN = 0, qCool = 0, qGood = 0;
  R.quality = 'auto';
  R.setQuality = function (q) { this.quality = q; qScale = q === 'low' ? 0.6 : 1; qGood = 0; qAcc = 0; qN = 0; this.resize(); };
  R.adapt = function (raw) {
    if (this.quality !== 'auto' || !this.ok || navigator.webdriver) return; // 自动化测试里不降
    qAcc += raw; qN++;
    if (qAcc < 1.5) return;
    const fps = qN / qAcc; qAcc = 0; qN = 0;
    if (qCool > 0) { qCool--; return; }
    if (fps < 45 && qScale > 0.6) { qScale = Math.max(0.6, qScale - 0.1); qGood = 0; qCool = 1; this.resize(); }
    else if (fps > 57 && qScale < 1) { if (++qGood >= 4) { qScale = Math.min(1, qScale + 0.1); qGood = 0; qCool = 1; this.resize(); } }
    else qGood = 0;
  };
  R.debugAdd = (o) => scene.add(o); // 调试用：往场景里加一个物体（特写截图）
  R.info = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, scale: qScale, quality: R.quality });

  /* 屏幕坐标 → 地面上的游戏坐标 */
  R.toWorld = function (cx, cy) {
    if (!this.ok) return { x: 0, y: 0 };
    v3.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position);
    let k = -camera.position.y / (v3.y || -1e-6);
    const gh = hW(camera.position.x + v3.x * k, camera.position.z + v3.z * k); // 指着台地时，落点按台面的高度再算一次
    if (gh) k = (gh - camera.position.y) / (v3.y || -1e-6);
    return { x: (camera.position.x + v3.x * k) * T, y: (camera.position.z + v3.z * k) * T };
  };
  /* 游戏坐标 → 屏幕坐标（CSS 像素） */
  function proj(x, y, z) { v3.set(x * S, (z || 0) * S + hW(x * S, y * S), y * S).project(camera); return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H }; }
  R.toScreen = (x, y, z) => proj(x, y, z);
  R.updateCam = function (dt, snap) { if (snap) camSnap = true; };

  /* ============================ 房间场景 ============================ */
  function buildRoom(room) {
    padQ.length = 0;
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
    const scnFar = new THREE.Group(); g.add(scnFar); // 林子深处与前景的树：只当背景，不描边、不投影（大图的面数大半花在这上面）
    const rockM = new THREE.MeshLambertMaterial({ vertexColors: true }); rs.mats.push(rockM);
    const sd = (room.gx || 0) * 31 + (room.gy || 0) * 17 + ti * 7;
    // rk：放一块山石，top 是它顶面的高度
    const rockFg = new THREE.MeshLambertMaterial({ vertexColors: true, color: G.PAPER ? new THREE.Color(0.62, 0.6, 0.56) : new THREE.Color(0.5, 0.5, 0.52) }); rs.mats.push(rockFg); // 前景的山石压暗成剪影
    const rk = (x, top, z, s, sy, k, fg, fine) => { // fine：场内近处的石头用细的一档（磨圆了边的石块）；岛缘、山台、远景用粗的，省面
      const geo = Mo.rockGeo((k + sd) % 4, ti, !fine), m = new THREE.Mesh(geo, fg ? rockFg : rockM);
      m.position.set(x, top - geo.userData.h * s * sy, z); m.scale.set(s, s * sy, s * (0.8 + U.hash(k, 3, sd) * 0.4)); m.rotation.y = U.hash(k, 7, sd) * TAU; scn.add(m); return m;
    };
    // 建筑构件（瓦顶、立柱、栏杆、角楼）：同样合并成一个网格
    const archRoot = new THREE.Group(); g.add(archRoot);
    const kit = Mo.archKit(archRoot, ti);
    // 一格山岩：顶面在 top，根部埋进地里
    let wk = 700;
    const crag = (x, z, top, fg) => { wk++; const sc = 0.6 + U.hash(wk, 11, sd) * 0.17; rk(x + (U.hash(wk, 13, sd) - 0.5) * 0.2, top, z + (U.hash(wk, 15, sd) - 0.5) * 0.2, sc, (top + 0.3) / (1.1 * sc), wk, fg, true); return wk; };
    const treeOn = (x, top, z, kind, sc) => { const tr = Mo.tree(wk + sd, ti, kind, sc); tr.g.position.set(x, top - 0.1, z); tr.g.rotation.y = U.hash(wk, 17, sd) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); };

    const lant = [], pens = []; // 灯笼的挂点 [x, y, z]、幡旗的杆顶 [x, 杆脚 y, z, 杆长]（卡通画风）
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
    const open = room.terrain && room.terrain !== 'court', cave = room.terrain === 'cave';
    // 各章户外的树：七玄门是松与桃花，血色禁地是血枫，燕翎堡城外是烧焦的枯树，虚天殿外是压着雪的松
    const woods = (ti < 2 || open) && !cave, treeKind = (r) => (ti === 1 || ti === 2 ? 'round' : ti === 0 && r < 0.2 ? 'bloom' : 'pine'), padKind = ti === 1 || ti === 2 ? 'round' : 'pine';
    if (open) {
      // 山野 / 洞窟：墙格上不立墙。山野是树与山石围出的空地（南面的树矮而暗，是前景）；洞窟四壁都是岩石，越往外越高
      const bark = lm({ color: new THREE.Color(Mo.PAL[ti].trunk) }), leaf = new THREE.MeshLambertMaterial({ vertexColors: true }), barkD = bark.clone(), leafD = new THREE.MeshLambertMaterial({ vertexColors: true, color: G.PAPER ? new THREE.Color(0.84, 0.84, 0.8) : new THREE.Color(0.6, 0.62, 0.68) });
      barkD.color.multiplyScalar(0.6); rs.mats.push(leaf, barkD, leafD);
      // 前景：夹在镜头与场内之间的东西（它的北面几格之内就是空地）。一律压成暗影，不许比场内亮、不许比场内艳
      const leafFg = new THREE.MeshLambertMaterial({ vertexColors: true, color: G.PAPER ? new THREE.Color(0.5, 0.48, 0.45) : new THREE.Color(0.42, 0.42, 0.45) }), barkFg = bark.clone(); barkFg.color.multiplyScalar(G.PAPER ? 0.6 : 0.5); rs.mats.push(leafFg, barkFg);
      const northFloor = (x, y, n) => { for (let k = 1; k <= n; k++) if (y - k >= 0 && tiles[(y - k) * w + x] !== 1) return k; return 0; };
      const taken = new Set(room.deco.map((dd) => Math.floor(dd.y) * w + Math.floor(dd.x)));
      const cliffN = !cave && room.doors.n && room.doors.n.cave; // 北面的出口是洞口
      // 每格离最近的空地有几格远：贴着空地的一圈种整棵的树，往里两圈用简化的树，再深处只放一团团树冠（大图里林子很厚，不能棵棵都画全）
      const far = new Uint8Array(w * h).fill(99), qu = [];
      for (let i = 0; i < w * h; i++) if (tiles[i] !== 1) { far[i] = 0; qu.push(i); }
      for (let qi = 0; qi < qu.length; qi++) { const i = qu[qi], x0 = i % w, y0 = (i / w) | 0; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x0 + ax, yy = y0 + ay; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const k = yy * w + xx; if (far[k] > far[i] + 1) { far[k] = far[i] + 1; qu.push(k); } } }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (at(x, y) !== 1 || taken.has(y * w + x)) continue;
        if (!cave && far[y * w + x] > 3) { // 林子深处：隔一格放一团压暗的树冠
          if ((x + y) % 2) continue;
          const fgc = northFloor(x, y, 8), cs = (fgc ? 1.05 : 1.25) + U.hash(x, y, sd + 64) * 0.6;
          if (G.DH) { scnFar.add(Mo.padMark(x + 0.5, (fgc ? 0.8 : 1.1) + U.hash(x, y, sd + 65) * 0.7, y + 0.5, cs * 0.95, padKind, fgc ? leafFg : leafD, 10, x * 31 + y * 17)); continue; }
          const cm = new THREE.Mesh(Mo.padGeo(x + y, ti, padKind), fgc ? leafFg : leafD);
          cm.position.set(x + 0.5, (fgc ? 0.7 : 1.0) + U.hash(x, y, sd + 65) * 0.7, y + 0.5); cm.scale.set(cs, cs * 0.8, cs); cm.rotation.y = x * 1.3 + y; scnFar.add(cm); continue;
        }
        let edgeT = false;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h && tiles[yy * w + xx] !== 1) edgeT = true; }
        const r1 = U.hash(x, y, sd + 60), r2 = U.hash(x, y, sd + 61), px = x + 0.5 + (U.hash(x, y, sd + 62) - 0.5) * 0.5, pz = y + 0.5 + (U.hash(x, y, sd + 63) - 0.5) * 0.5, north = y < h * 0.42, south = y > h * 0.66;
        if (cliffN && y <= 3) { // 洞口两侧：一整面岩壁，越靠北越高 —— 山洞的外景
          const top = 3.3 - y * 0.55 + r1 * 0.9; crag(px, pz, top); if (y >= 2 && r2 < 0.3) treeOn(px, top, pz, treeKind(r1), 0.8);
          continue;
        }
        if (cave) {
          const top = Math.max(0.35, (edgeT ? 0.85 : 1.7) + r1 * (north ? 1.4 : south ? 0.3 : 0.8) - (south ? 0.45 : 0)); crag(px, pz, top);
          if (edgeT && !south && r2 < 0.2) rk(px + 0.3, top + 0.5 + r2 * 4, pz + 0.2, 0.2, 3.6, x * 37 + y); // 石笋
          continue;
        }
        // 空地南沿：镜头从南面看过来，这里的东西会挡住场内。紧贴空地的一排只放矮石，往外两排的树又小又疏
        let below = 0; for (let k = 1; k <= 3; k++) if (y - k >= 0 && tiles[(y - k) * w + x] !== 1) { below = k; break; }
        const nf = below || northFloor(x, y, 6); // 北面六格之内有空地：这是前景
        if (below === 1) { if (r1 < 0.55) crag(px, pz, 0.2 + r2 * 0.22, true); continue; }
        if (below && r1 > 0.42) { if (r1 < 0.7) crag(px, pz, 0.25 + r2 * 0.3, true); continue; }
        if (r1 < (edgeT ? 0.24 : 0.1)) { crag(px, pz, (south || nf ? 0.3 : 0.5) + r2 * (south || nf ? 0.3 : 0.8), !!nf); continue; }
        if (r1 > (edgeT ? 0.95 : 0.64)) continue; // 林间留一点缝
        const fg = (south && w <= 28) || nf > 0;
        const big = w > 28; // 大图里"南北"是相对空地而言的：只有紧挨空地南沿的才算前景
        if (ti === 2 && r1 > 0.5) continue; // 焦林稀疏
        const tr = Mo.tree(x * 31 + y * 17 + sd, ti, treeKind(r2 * 1.6), (below ? 0.6 : fg && !big ? 0.8 : north || big ? 1.2 : 1.05) + r2 * (below ? 0.2 : 0.35), { lite: !edgeT || fg, bark: fg ? barkFg : bark, leaf: fg ? leafFg : leaf });
        tr.g.position.set(px, -0.04, pz); tr.g.rotation.y = r2 * TAU; (edgeT && !fg ? scn : scnFar).add(tr.g); // 只有紧贴空地、又不是前景的那一圈树才描边投影
      }
      // 路口的火盆
      for (const dd of room.deco) if (dd.kind === 'firebowl') { const f = kit.firebowl(dd.x, dd.y); f.push(dd.d); (rs.bowls || (rs.bowls = [])).push(f); } // 记下这只火盆守着哪个出口
    } else {
    // 北墙。七玄门：粉墙 + 黛瓦坡顶 + 檐柱；血色禁地：一道山岩；燕翎堡：城墙 + 垛口 + 扶壁；虚天殿：玉墙 + 金脊 + 玉柱
    runs(w, (x) => at(x, 0) === 1, (x0, len) => {
      if (ti === 1) { for (let i = 0; i < len; i++) { const top = 1.25 + U.hash(x0 + i, 1, sd) * 0.75; crag(x0 + i + 0.5, 0.5, top); if (U.hash(x0 + i, 2, sd) < 0.2) treeOn(x0 + i + 0.5, top, 0.4, 'round', 1.15); } return; }
      wallBox(x0, 0, len, 1, HN, tx(ctex(Tx.wallFace(ti, x0, len, room.gx * 7 + room.gy))));
      kit.slab(x0 + len / 2, 0.07, 1.1, len, 0.14, 0.22, 'stone'); kit.slab(x0 + len / 2, 0.03, 1.27, len, 0.06, 0.16, 'dark'); // 墙根的台基：两级石条
      // 墙面上的立体构件要让开立轴和壁灯
      const dnF = room.doors.n ? room.doors.n.cells[1] : null, dcF = dnF ? dnF[0] + 0.5 : w / 2;
      const clear = (x, hw) => Math.abs(x - (dcF - 3.5)) > hw + 0.45 && Math.abs(x - (dcF + 3.5)) > hw + 0.45 && !room.lights.some((L) => L.sconce && Math.abs(L.x * S - x) < hw + 0.35);
      if (ti === 0) {
        kit.roofX(x0, len, 0.5, HN, 1.9, 0.52);
        kit.slab(x0 + len / 2, HN - 0.2, 1.05, len, 0.13, 0.1, 'wood');   // 檐下的额枋
        kit.slab(x0 + len / 2, 0.36, 1.03, len, 0.44, 0.06, 'stone');     // 青石墙裙
        for (let cx = x0 + 0.45; cx <= x0 + len - 0.4; cx += 3.05) {
          kit.column(cx, 1.12, HN, 0.1);
          if (cx + 3.05 <= x0 + len - 0.4 && clear(cx + 1.525, 0.34)) kit.lattice(cx + 1.525, HN * 0.62, 1.02, 0.3); // 两柱之间开一扇漏窗
          if (G.DH && cx + 3.05 <= x0 + len - 0.4) for (const q of [0.76, 2.29]) if (clear(cx + q, 0.14)) lant.push([cx + q, HN + 0.03, 1.53]); // 檐口挂一排红灯笼
        }
        if (G.DH && dnF) for (const [ex, sg] of [[x0 + len, -1], [x0, 1]]) if (Math.abs(ex - (dcF + sg * 1.5)) < 0.01 && len > 3.4) pens.push([ex + sg * 2.4, HN + 0.6, 0.5, 1.3]); // 门两侧
        return;
      }
      const cap = lm({ map: topT(len, 1.3) });
      mesh(cap, x0 + len / 2, HN + 0.07, 0.56, len + 0.12, 0.14, 1.3);
      if (ti === 3) {
        mesh(lm({ color: new THREE.Color('#a3a394') }), x0 + len / 2, HN + 0.2, 0.5, len + 0.04, 0.12, 0.22);
        for (let cx = x0 + 0.5; cx <= x0 + len - 0.4; cx += 3.05) {
          kit.column(cx, 1.16, HN + 0.14, 0.14, true);
          if (G.DH && clear(cx + 0.42, 0.14)) lant.push([cx + 0.42, HN + 0.01, 1.25]);
          if (cx + 3.05 <= x0 + len - 0.4 && clear(cx + 1.525, 1.1)) kit.panel(cx + 1.525, HN * 0.56, 1.02, 2.2, HN * 0.5); // 两柱之间一方鎏金的玉板
        }
      } else {
        for (let i = 0; i < len; i++) kit.crenel(x0 + i + 0.5, HN + 0.14, 0.6, 0.5, 1.05);
        kit.slab(x0 + len / 2, HN * 0.5, 1.03, len, 0.1, 0.07, 'stone'); // 腰线
        for (let cx = x0 + 1.5; cx <= x0 + len - 1; cx += 4) { kit.buttress(cx, 1.0, HN); if (cx + 4 <= x0 + len - 1 && clear(cx + 2, 0.2)) kit.slit(cx + 2, HN * 0.74, 1.02); }
        for (let i = 0; i < len; i++) { const hv2 = U.hash(x0 + i, 5, sd); if (hv2 < 0.55) kit.slab(x0 + i + 0.25 + hv2 * 0.6, HN * (hv2 < 0.28 ? 0.28 : 0.86) - hv2 * 0.1, 1.025, 0.44, 0.19, 0.06, hv2 < 0.2 ? 'dark' : 'stone'); } // 几块凸出墙面的城砖
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
      kit.slab(x ? x - 0.08 : 1.08, 0.06, y0 + 1 + len / 2, 0.18, 0.12, len, 'stone'); // 台基
      if (ti === 0) kit.roofZ(x + 0.5, y0 + 1, len, HS, 1.34, 0.3);
      else if (ti === 2) { for (let i = 0; i < len; i += 2) kit.crenel(x + 0.5, HS - 0.02, y0 + 1 + i + 0.5, 1.04, 0.56); }
      else mesh(lm({ color: new THREE.Color('#a3a394') }), x + 0.5, HS + 0.05, y0 + 1 + len / 2, 0.24, 0.1, len + 0.04);
    });
    // 水边的石沿：水面四周围一圈略高出地面的石条，水就像是凹下去的
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (at(x, y) !== 3) continue;
      const mat = ti === 3 ? 'gold' : 'stone';
      if (at(x, y - 1) !== 3) kit.slab(x + 0.5, 0.045, y + 0.03, 1.1, 0.09, 0.13, mat);
      if (at(x, y + 1) !== 3) kit.slab(x + 0.5, 0.045, y + 0.97, 1.1, 0.09, 0.13, mat);
      if (at(x - 1, y) !== 3) kit.slab(x + 0.03, 0.045, y + 0.5, 0.13, 0.09, 1.1, mat);
      if (at(x + 1, y) !== 3) kit.slab(x + 0.97, 0.045, y + 0.5, 0.13, 0.09, 1.1, mat);
    }
    // 四角：角楼（山岩墙没有角楼）
    if (ti !== 1) for (const [cxx, czz, north] of [[0.5, 0.5, 1], [w - 0.5, 0.5, 1], [0.5, h - 0.5, 0], [w - 0.5, h - 0.5, 0]]) {
      if (at(Math.floor(cxx), Math.floor(czz)) !== 1) continue;
      if (north && G.DH) pens.push([cxx, HN + 0.42 + 0.1 + 1.1 * 0.7, czz, 1.15]);
      if (north) kit.tower(cxx, czz, HN + 0.42, 1.1); else kit.tower(cxx, czz, ti === 2 ? 0.95 : 0.72, ti === 2 ? 1.04 : 0.62);
    }
    // 屋内的隔墙。七玄门：假山，山上偶尔立一棵小松；血色禁地：山岩；虚天殿：覆雪的冰岩；燕翎堡：残垣
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (at(x, y) !== 1) continue;
      if (ti === 2) { wallBox(x, y, 1, 1, HI); if (U.hash(x, y, sd) < 0.6) rk(x + 0.5, HI + 0.2 + U.hash(x, y, sd + 1) * 0.16, y + 0.5, 0.42, 0.6, x * 31 + y); continue; }
      const top = 0.72 + U.hash(x, y, sd + 2) * 0.45; crag(x + 0.5, y + 0.5, top);
      if (ti === 0 && U.hash(x, y, sd + 3) < 0.22) treeOn(x + 0.5, top, y + 0.5, 'pine', 0.55);
    }
    } // 院落的墙到此为止

    // 台地：从格点高度生成一张起伏的面（贴图沿用地面那张，所以铺地的纹样一直铺上台去），坡面压暗；
    // 院落里台沿压一圈石条、四角立望柱、台阶是三级石踏步；山野里是土坡，坡上散几块石头
    if (room.hc) {
      const hc = room.hc, w1 = w + 1, pos = [], uv = [], colr = [], cH = (x, y) => hc[y * w1 + x];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const a = cH(x, y), b = cH(x + 1, y), c2 = cH(x, y + 1), d = cH(x + 1, y + 1);
        if (!(a || b || c2 || d)) continue;
        const k = at(x, y) === 5 ? (open ? 0.6 : 0.56) : a === b && b === c2 && c2 === d ? 1 : 0.9; // 坡压暗，台阶略暗，台面原色
        const V = [[x, a, y], [x + 1, b, y], [x, c2, y + 1], [x + 1, d, y + 1]];
        if (open) for (const q of V) if (!q[1]) { const jx = (U.hash(q[0], q[2], sd + 81) - 0.5) * 0.56, jz = (U.hash(q[0], q[2], sd + 82) - 0.5) * 0.56; q[0] += jx; q[2] += jz; } // 土台的坡脚错开一点，轮廓不贴着格子
        for (const j of a + d >= b + c2 ? [0, 2, 1, 1, 2, 3] : [0, 2, 3, 0, 3, 1]) { const q = V[j]; pos.push(q[0], q[1] + 0.004, q[2]); uv.push(q[0] / w, 1 - q[2] / h); colr.push(k, k, k * (open ? 0.94 : 1.04)); }
      }
      const tg = new THREE.BufferGeometry(); rs.geos.push(tg);
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); tg.computeVertexNormals();
      const tm = new THREE.Mesh(tg, lm({ map: floor.material.map, vertexColors: true })); tm.receiveShadow = true; tm.castShadow = true; g.add(tm);
      for (const tr of room.terr || []) {
        const H = tr.H;
        if (open) { // 土台：坡上散石
          for (let y = tr.y0 - 1; y <= tr.y1 + 1; y++) for (let x = tr.x0 - 1; x <= tr.x1 + 1; x++) if (at(x, y) === 5 && U.hash(x, y, sd + 71) < 0.45) crag(x + 0.5 + (U.hash(x, y, sd + 72) - 0.5) * 0.4, y + 0.5 + (U.hash(x, y, sd + 73) - 0.5) * 0.4, H * 0.5 + 0.12 + U.hash(x, y, sd + 74) * 0.2);
          continue;
        }
        for (let y = tr.y0; y <= tr.y1; y++) for (let x = tr.x0; x <= tr.x1; x++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (at(x + dx, y + dy) !== 5) continue; // 邻格是台阶：不压石条
          kit.slab(x + 0.5 + dx * 0.5, H + 0.03, y + 0.5 + dy * 0.5, dx ? 0.16 : 1.02, 0.12, dx ? 1.02 : 0.16, 'stone');
        }
        for (const [px2, pz2] of [[tr.x0, tr.y0], [tr.x1 + 1, tr.y0], [tr.x0, tr.y1 + 1], [tr.x1 + 1, tr.y1 + 1]]) { kit.slab(px2, H + 0.22, pz2, 0.18, 0.44, 0.18, 'stone'); kit.slab(px2, H + 0.47, pz2, 0.24, 0.07, 0.24, 'dark'); } // 四角的望柱
      }
      if (!open) for (const rp of room.ramps || []) { // 台阶：三级石踏步
        const H = hRoom(room, rp.x + 0.5 + rp.dx * 0.49, rp.y + 0.5 + rp.dy * 0.49);
        for (let k = 0; k < 3; k++) { const t2 = (k + 0.5) / 3 - 0.5, sh = H / 3 + 0.03, top = (H * (k + 1)) / 3 + 0.01; kit.slab(rp.x + 0.5 + rp.dx * t2, top - sh / 2, rp.y + 0.5 + rp.dy * t2, rp.dx ? 0.34 : 1.0, sh, rp.dx ? 1.0 : 0.34, k % 2 ? 'stone' : 'dark'); }
      }
    }

    // 门：门楼 / 门柱 / 禁制 / 通路微光
    const postM = lm({ color: new THREE.Color(ti === 3 ? '#a8a07c' : ti === 1 ? '#3a2a26' : ti === 2 ? '#383246' : '#4c4a52') });
    const roofM = lm({ color: new THREE.Color(th.top) }), roofHi = lm({ color: new THREE.Color(th.topHi) });
    for (const d in room.doors) {
      const cells = room.doors[d].cells, cx = cells[1][0] + 0.5, cz = cells[1][1] + 0.5, ns = d === 'n' || d === 's';
      const out = G.World.DIRS[d], dkey = 900 + cells[1][0] * 7 + cells[1][1] * 3;
      if (room.doors[d].cave) { // 洞口：两侧立石、上压洞楣，里面一片漆黑
        const la = ns ? [1, 0] : [0, 1], hm = new THREE.MeshBasicMaterial({ color: 0x030203, side: THREE.DoubleSide }); rs.mats.push(hm);
        if (d !== 's') { // 北、东、西三面：一座完整的洞门，立在岩壁上（东西两侧的略矮，洞楣往外挪，少挡一点场内）
          const side = d !== 'n', hh2 = side ? 0.8 : 1;
          for (const sgn of [-1, 1]) rk(cx + la[0] * sgn * 2.1, (2.3 + U.hash(dkey, sgn + 2, sd) * 0.6) * hh2, cz + la[1] * sgn * 2.1, 0.98, 2.7 * hh2, dkey + sgn);
          rk(cx + out[0] * (side ? 0.9 : 0), 3.2 * hh2, cz + out[1] * (side ? 0.9 : 0), side ? 2.0 : 2.4, 0.42, dkey + 5);
          const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.5 * hh2), hm); rs.geos.push(hole.geometry);
          hole.position.set(cx + out[0] * 0.3, 1.15 * hh2, cz + out[1] * 0.3); hole.rotation.y = d === 'n' ? 0 : d === 'w' ? PI / 2 : -PI / 2; g.add(hole);
        } else { // 南面：镜头从南边看过来，立起来的洞门会挡住场内，所以做成一个向下的洞 —— 地上一口黑洞，洞沿围一圈矮石
          const hole = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), hm); rs.geos.push(hole.geometry);
          hole.rotation.x = -PI / 2; hole.scale.set(ns ? 1 : 0.72, ns ? 0.72 : 1, 1); hole.position.set(cx + out[0] * 0.25, 0.02, cz + out[1] * 0.25); hole.renderOrder = 1; g.add(hole);
          for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3, ex = Math.cos(a) * (ns ? 1.75 : 1.3), ez = Math.sin(a) * (ns ? 1.3 : 1.75); if (ex * -out[0] + ez * -out[1] > 0.7) continue; rk(cx + out[0] * 0.25 + ex, 0.3 + U.hash(dkey, i, sd) * 0.35, cz + out[1] * 0.25 + ez, 0.5, 1.4, dkey + i); } // 朝场内的一侧留出口子
        }
      } else if (open) { // 栈桥：从出口伸向对面的山头
        const L = 5.4, bx = cx + out[0] * 0.5, bz = cz + out[1] * 0.5;
        kit.bridge(bx, bz, out[0], out[1], L);
        for (const sgn of [-1, 1]) { // 地标：桥头两根高出树冠的幡杆，隔着林子也望得见；幡的颜色随"未解 / 可走 / 去过"而变
          const fx = bx + out[1] * sgn * 1.75 + out[0] * 0.3, fz = bz + out[0] * sgn * 1.75 + out[1] * 0.3;
          kit.pole(fx, fz, 4.1);
          const fm = new THREE.MeshBasicMaterial({ color: 0x3a2a2a, side: THREE.DoubleSide }), fl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.7, 2, 9), fm);
          if (G.DH) { // 幡是布：上头钉在横杆上，越往下摆得越大
            fm.onBeforeCompile = (sh) => { sh.uniforms.uT = clothT; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { float k = 1.0 - uv.y, ph = modelMatrix[3][0] * 1.7 + modelMatrix[3][2];\n    transformed.z += (sin(uT * 3.1 + k * 5.5 + ph) * 0.13 + sin(uT * 5.3 + k * 9.0 + position.x * 3.0 + ph) * 0.04) * k;\n    transformed.x += sin(uT * 2.3 + k * 3.0 + ph) * 0.05 * k; }'); };
            fm.customProgramCacheKey = () => 'banner';
          }
          fl.position.set(fx + 0.32, 3.15, fz); g.add(fl); rs.geos.push(fl.geometry); rs.mats.push(fm); (rs.flags || (rs.flags = [])).push({ m: fl, d, x: fx, z: fz, ph: fx * 1.7 + fz });
        }
        rk(bx + out[0] * (L + 1.6), 0.04, bz + out[1] * (L + 1.6), 2.3, 2.0, dkey); rk(bx + out[0] * (L + 2.6) + out[1] * 1.8, 0.7, bz + out[1] * (L + 2.6) + out[0] * 1.8, 1.5, 2.2, dkey + 9);
        if (woods) { const tr = Mo.tree(dkey + sd, ti, treeKind(1), 1.3); tr.g.position.set(bx + out[0] * (L + 2.2) - out[1] * 1.2, -0.06, bz + out[1] * (L + 2.2) - out[0] * 1.2); scn.add(tr.g); rs.mats.push(...tr.mats); }
      } else if (d === 'n') {
        const ag = Mo.archGate(ti); ag.g.position.set(cx, 0, 0.9); g.add(ag.g); rs.mats.push(...ag.mats); rs.tex.push(...ag.tex); // 青铜环门
        kit.slab(cx, 0.05, 1.2, 3.3, 0.1, 0.5, 'stone'); kit.slab(cx, 0.025, 1.62, 3.7, 0.05, 0.42, 'dark'); // 门前两级台阶
        if (G.DH && ti !== 1) { // 牌楼：两根高柱、两道枋、枋间一块匾，顶上压一道飞檐（燕翎堡是城门：石过梁上压垛口），枋下挂一对大灯笼。比院墙高出一头，隔着半个场子就认得出口在哪
          const pz = 1.36, ph = 2.5, beam = ti === 2 ? 'dark' : 'wood';
          for (const sx of [-2.1, 2.1]) kit.column(cx + sx, pz, ph, 0.14, ti === 3);
          kit.slab(cx, ph - 0.09, pz, 4.6, 0.16, 0.15, beam); kit.slab(cx, ph - 0.63, pz, 4.34, 0.1, 0.11, beam);
          if (ti === 2) { kit.slab(cx, ph + 0.1, pz - 0.26, 4.9, 0.22, 0.6, 'stone'); for (let i = -2; i <= 2; i++) kit.crenel(cx + i, ph + 0.2, pz - 0.26, 0.5, 0.56); }
          else kit.roofX(cx - 2.45, 4.9, pz - 0.6, ph + 0.02, 1.2, 0.42); // 屋顶压在墙线上，前檐只比枋探出一点——镜头在南边高处，檐探得多了会把匾挡住
          const pq = Mo.plaque(ti, ['七玄门', '', '燕翎堡', '虚天殿'][ti]); pq.g.position.set(cx, ph - 0.36, pz + 0.09); pq.g.rotation.x = -0.22; g.add(pq.g); rs.mats.push(...pq.mats); rs.tex.push(...pq.tex);
          if (ti !== 2) lant.push([cx - 1.5, ph - 0.68, pz + 0.04, 1.45], [cx + 1.5, ph - 0.68, pz + 0.04, 1.45]);
        }
      } else {
        if (d === 's') { for (const sx of [-1.78, 1.78]) kit.tower(cx + sx, cz, 0.62, 0.52); } // 南门：两只带攒尖顶的门墩，不挡视线
        else { // 东西两侧：门楼 —— 两根立柱托着一道横在门上的屋顶（燕翎堡是城门：石过梁上压垛口）
          for (const sz of [-1.72, 1.72]) kit.column(cx, cz + sz, 1.55, 0.13, ti === 3);
          mesh(postM, cx, 1.5, cz, 0.2, 0.16, 3.7);
          if (ti === 2) { mesh(postM, cx, 1.66, cz, 0.9, 0.2, 3.9); for (let i = -1; i <= 1; i++) kit.crenel(cx, 1.74, cz + i * 1.3, 0.9, 0.6); }
          else { kit.roofZ(cx, cz - 2.05, 4.1, 1.58, 1.3, 0.36); if (G.DH) for (const sz of [-1.15, 1.15]) lant.push([cx + (d === 'w' ? 0.66 : -0.66), 1.57, cz + sz]); }
        }
      }
      const bm = new THREE.MeshBasicMaterial({ color: 0xff4a32, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      const barrier = new THREE.Mesh(boxG, bm); barrier.position.set(cx, 0.66, cz); barrier.scale.set(ns ? 2.9 : 0.16, 1.3, ns ? 0.16 : 2.9); g.add(barrier);
      const gm = new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), gm); rs.geos.push(glyph.geometry);
      glyph.position.set(cx + (d === 'w' ? 0.1 : d === 'e' ? -0.1 : 0), 0.7, cz + (d === 'n' ? 0.1 : d === 's' ? 0.1 : 0));
      if (!ns) glyph.rotation.y = d === 'w' ? PI / 2 : -PI / 2;
      g.add(glyph);
      const sm = Mo.inkBlend(new THREE.MeshBasicMaterial({ color: new THREE.Color(th.lampHex), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(ns ? 2.7 : 0.8, ns ? 0.8 : 2.7), sm); rs.geos.push(strip.geometry);
      strip.rotation.x = -PI / 2; strip.position.set(cx, 0.03, cz); g.add(strip);
      rs.mats.push(bm, gm, sm);
      rs.doors[d] = { barrier, glyph, strip, bm, sm };
    }

    // 场景物件：静态部分合并成一个网格（大幅减少绘制调用），发光 / 透明 / 带动画的部分保留
    const propRoot = new THREE.Group(); g.add(propRoot);
    for (const pp of room.props) {
      const m = Mo.prop(pp.kind, pp.v, ti);
      m.g.position.set(pp.tx + 0.5, hRoom(room, pp.tx + 0.5, pp.ty + 0.5), pp.ty + 0.5);
      if (!['lantern', 'banner', 'pillar', 'statue', 'brazier', 'brazier2'].includes(pp.kind)) m.g.rotation.y = U.hash(pp.tx, pp.ty, 9) * TAU;
      propRoot.add(m.g); rs.mats.push(...m.mats); if (m.anim) rs.anims.push(m.anim);
    }
    // 烛火：屋内四角、北门两侧各一簇；不打架的房间里，地台四周再围一圈
    rs.flames = []; rs.candles = [];
    const candle = (x, z, v) => {
      if (at(Math.floor(x), Math.floor(z)) !== 0) return;
      const cy0 = hRoom(room, x, z), cd = Mo.candles(v, ti); cd.g.position.set(x, cy0, z); propRoot.add(cd.g); rs.mats.push(...cd.mats);
      rs.candles.push([x, z]); for (const f of cd.flames) rs.flames.push([x + f[0], f[1] + cy0, z + f[2]]);
    };
    // （四角的烛火去掉了：暖色的光点只出现在门口和供着东西的台子周围，哪里亮哪里就有事）
    if (room.doors.n) { const dc = room.doors.n.cells[1][0] + 0.5; candle(dc - 2.35, 1.3, 5); candle(dc + 2.35, 1.3, 6); }
    if (['treasure', 'event', 'shop', 'garden', 'start'].includes(room.type)) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.52; candle(w / 2 + Math.cos(a) * 3.35, h / 2 + Math.sin(a) * 3.35, 7 + i); }
    for (const f of rs.bowls || []) { rs.flames.push(f); rs.candles.push([f[0], f[2], f[4]]); }
    for (const dd of room.deco) if (dd.kind === 'lamp') { // 小径旁的石灯
      const m = Mo.stoneLantern(Math.floor(dd.x * 3 + dd.y), ti); m.g.scale.setScalar(0.74); m.g.position.set(dd.x, 0, dd.y); propRoot.add(m.g); rs.mats.push(...m.mats); rs.candles.push([dd.x, dd.y]);
    }
    const merged = mergeStatic(propRoot);
    if (merged) { g.add(merged); rs.geos.push(merged.geometry); rs.mats.push(merged.material); if (!G.DH) inkOutline(merged, 0.022, g, rs, th.ink); }
    // 灯光与光晕
    const glowSprite = (x, y, z, hex, s, op) => {
      const sm = Mo.inkBlend(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, opacity: op * (G.PAPER ? 0.5 : 1), depthWrite: false, blending: THREE.AdditiveBlending }));
      const sp = new THREE.Sprite(sm); sp.position.set(x, y, z); sp.scale.set(s, s, 1); g.add(sp); rs.mats.push(sm); rs.sprites.push(sp); return sp;
    };
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.lampHex) }); rs.mats.push(lampM);
    if (lant.length) { // 灯笼：一种模型画许多盏，各自轻轻地晃
      const lmat = new THREE.MeshBasicMaterial({ vertexColors: true }); lmat.color.setRGB(1.3, 1.3, 1.3); rs.mats.push(lmat);
      const im = new THREE.InstancedMesh(Mo.lanternGeo(ti), lmat, lant.length); im.frustumCulled = false; g.add(im);
      const hex = ti === 3 ? 0x9fd8ff : 0xff7a3a;
      lant.forEach((L) => glowSprite(L[0], L[1] - 0.33 * (L[3] || 1), L[2] + 0.06, hex, 1.15 * (L[3] || 1), 0.2));
      rs.anims.push((t) => { for (let i = 0; i < lant.length; i++) { const L = lant[i]; dummy.position.set(L[0], L[1], L[2]); dummy.rotation.set(Math.sin(t * 1.1 + i * 1.7) * 0.07, 0, Math.sin(t * 1.45 + i * 2.3) * 0.1); dummy.scale.setScalar(L[3] || 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.instanceMatrix.needsUpdate = true; });
    }
    if (pens.length) pennants(pens, rs, g, kit, ti);
    for (const L of room.lights) {
      const x = L.x * S, y = L.z * S, z = L.y * S;
      if (L.sconce) { // 北墙壁灯
        mesh(postM, x, y + 0.28, 1.06, 0.06, 0.06, 0.2, false);
        const lamp = new THREE.Mesh(boxG, lampM); lamp.position.set(x, y + 0.06, 1.14); lamp.scale.set(0.2, 0.3, 0.2); g.add(lamp);
        mesh(roofM, x, y + 0.25, 1.14, 0.3, 0.06, 0.3, false);
        rs.lights.push({ x, y: y + 0.1, z: 1.5, c: L.c, r: L.r * S });
        glowSprite(x, y + 0.06, 1.3, L.c, 1.7, 0.2);
      } else {
        rs.lights.push({ x, y: y + 0.25, z: z + 0.2, c: L.c, r: L.r * S });
        glowSprite(x, y, z + 0.1, L.c, 1.9, 0.16); // 场景里的灯只是一小团淡光，不抢眼
      }
    }
    // 岛缘与远山
    const dz = (d) => (room.doors[d] ? room.doors[d].cells[1] : null), nearDoor = (d, val, axis) => { const c = dz(d); return c && Math.abs(c[axis] + 0.5 - val) < 2.3; };
    let kk = 0; const rv = (i) => U.hash(kk, i, sd);
    // 南缘：贴着矮墙外侧的一排矮石，把浮台的直边裹住
    for (let x = -0.3; x < w + 0.5; x += 1.45) { kk++; if (nearDoor('s', x, 0)) continue; rk(x + rv(1) * 0.5, -0.5 + rv(2) * 0.3, h + 0.55 + rv(3) * 0.35, 0.9 + rv(4) * 0.45, 1.6 + rv(5) * 0.7, kk, true); }
    // 东西两缘
    for (let z = 0.4; z < h; z += 1.55) for (const e of [0, 1]) { kk++; if (nearDoor(e ? 'e' : 'w', z, 1)) continue; rk(e ? w + 0.55 + rv(1) * 0.3 : -0.55 - rv(1) * 0.3, 0.2 + rv(2) * 0.55, z + rv(3) * 0.5, 1.0 + rv(4) * 0.6, 1.7 + rv(5) * 0.7, kk); }
    const plant = (x, top, z, kind, sc, seed, dark) => { if (cave) return; const tr = Mo.tree(seed + sd, ti, kind, sc); if (dark) for (const m of tr.mats) m.color.multiplyScalar(dark); tr.g.position.set(x, top - 0.1, z); tr.g.rotation.y = U.hash(seed, 17, sd) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); };
    // 山台：比岛缘更低、更远的一圈石台，一级一级降进云里，台上偶尔有树
    for (let i = 0; i < 11; i++) {
      kk++; const side = i % 3, u = rv(1); // 0 南 / 1 西 / 2 东
      const tx2 = side === 0 ? -1.5 + u * (w + 3) : side === 1 ? -2.3 - rv(2) * 1.9 : w + 2.3 + rv(2) * 1.9;
      const tz2 = side === 0 ? h + 2.1 + rv(2) * 2.2 : 0.5 + u * (h + 1.5), top = -1.2 - rv(3) * 2.4;
      rk(tx2, top, tz2, 1.5 + rv(4) * 1.1, 1.9 + rv(5) * 0.7, kk, side === 0);
      if (woods && rv(6) < 0.45) plant(tx2, top, tz2, treeKind(rv(7) * 0.6), 1.15, kk, side === 0 ? 0.6 : 0);
    }
    // 前景：南面两角各立一座高石，石上的树探进画面；镜头一动，它和场内就错开了
    [[-1.4, h + 0.75], [w + 1.4, h + 0.75]].forEach(([fx, fz], i) => {
      kk++; const top = 0.45 + rv(1) * 0.5;
      rk(fx, top, fz, 1.25, 2.4, kk, true); rk(fx + (i ? 1 : -1), top - 0.8, fz + 0.5, 0.9, 2.2, kk + 50, true);
      if (woods) plant(fx, top, fz, treeKind(i ? 0 : 1), 1.75, kk, 0.55);
      else rk(fx, top + 1.3 + rv(2) * 0.9, fz, 0.42, 3.6, kk + 80, true); // 围城与古殿没有树：立一根石笋 / 冰笋
    });
    // 贴地的小物：墙根、石根处的草丛（枯草 / 碎砾 / 冰凌），补上最细的一层
    const tuft = new THREE.Group(); g.add(tuft);
    { const bladeG = Mo.geo.cone(4), bm = [lm({ color: new THREE.Color(Mo.PAL[ti].cap) }), lm({ color: new THREE.Color(Mo.PAL[ti].cap2) })], fm = ti === 0 ? lm({ color: new THREE.Color('#f2d6e0') }) : null;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (at(x, y) !== 0 || U.hash(x, y, sd + 40) > 0.6) continue;
        const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => { const tt = at(x + dx, y + dy); return tt === 1 || tt === 2; });
        if (!nb.length) continue;
        const [dx, dy] = nb[Math.floor(U.hash(x, y, sd + 41) * nb.length)], bx = x + 0.5 + dx * 0.38, bz = y + 0.5 + dy * 0.38;
        for (let k = 0; k < 4; k++) {
          const hgt = (ti === 2 ? 0.07 : 0.14) + U.hash(x * 5 + k, y, sd + 42) * (ti === 2 ? 0.08 : 0.2), b = new THREE.Mesh(bladeG, bm[k % 2]);
          b.position.set(bx + (U.hash(x * 5 + k, y, sd + 43) - 0.5) * (dy ? 0.5 : 0.16), hgt / 2, bz + (U.hash(x * 5 + k, y, sd + 44) - 0.5) * (dx ? 0.5 : 0.16));
          b.scale.set(ti === 2 ? 0.14 : 0.06, hgt, ti === 2 ? 0.12 : 0.06); b.rotation.set((U.hash(x * 5 + k, y, sd + 45) - 0.5) * 0.5, U.hash(x * 5 + k, y, sd + 46) * 3, (U.hash(x * 5 + k, y, sd + 47) - 0.5) * 0.5); tuft.add(b);
        }
        if (fm && U.hash(x, y, sd + 48) < 0.3) { const f = new THREE.Mesh(Mo.geo.sph(6), fm); f.position.set(bx + 0.08, 0.12, bz - 0.06); f.scale.setScalar(0.07); tuft.add(f); }
      }
      /* 山野里满地的草（卡通画风）：一撮一撮立着的草叶，是真的立体，不是画在地上的。
         场子中央留空（地台与打斗的地方要看得清），越靠边越密；七玄门有野花，血色禁地有蘑菇 */
      if (G.DH && open && !cave) {
        const GC = [['#5a8a3c', '#7aae52', '#93c466'], ['#8a7a3e', '#a8924a', '#6a6a3a'], ['#4a443c', '#5e564c', '#3a342e'], ['#c8d8e4', '#e4eef6', '#a8c0d4']][ti].map((cc) => lm({ color: new THREE.Color(cc) }));
        const petal = ti === 0 ? ['#fff4e0', '#f6b8cc', '#ffe07a'].map((cc) => lm({ color: new THREE.Color(cc) })) : ti === 1 ? [lm({ color: new THREE.Color('#b84a2e') })] : null, stem = lm({ color: new THREE.Color(ti === 1 ? '#e6dcc8' : '#4e7a36') });
        const skipT = new Set(); for (const d in room.doors || {}) for (const [dx0, dy0] of room.doors[d].cells) for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) skipT.add((dy0 + b2) * w + dx0 + a);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          if (at(x, y) !== 0 || skipT.has(y * w + x)) continue;
          const dc = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2), hv2 = (i) => U.hash(x * 5 + i, y * 3 + i, sd + 60 + i);
          if (dc < 3.4 || hv2(0) > Math.min(0.62, 0.16 + (dc - 3.4) * 0.07) * (ti === 2 ? 0.5 : 1)) continue;
          const bx = x + 0.15 + hv2(1) * 0.7, bz = y + 0.15 + hv2(2) * 0.7, y0 = hRoom(room, bx, bz);
          for (let k = 0; k < 4; k++) {
            const hgt = (ti === 3 ? 0.08 : 0.11) + hv2(3 + k) * 0.14, b = new THREE.Mesh(bladeG, GC[(k + Math.floor(hv2(8) * 3)) % 3]);
            b.position.set(bx + (hv2(9 + k) - 0.5) * 0.24, y0 + hgt / 2, bz + (hv2(13 + k) - 0.5) * 0.24); b.scale.set(0.055, hgt, 0.055); b.rotation.set((hv2(17 + k) - 0.5) * 0.7, hv2(21 + k) * 3, (hv2(25 + k) - 0.5) * 0.7); tuft.add(b);
          }
          if (petal && hv2(30) < (ti === 0 ? 0.3 : 0.14)) { // 花 / 蘑菇：一根细茎，顶上一点颜色
            const fh = ti === 0 ? 0.16 + hv2(31) * 0.08 : 0.09, st = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 6), stem), f = new THREE.Mesh(ti === 0 ? Mo.geo.ico(0) : Mo.geo.cone(6), petal[Math.floor(hv2(32) * petal.length)]);
            st.position.set(bx + 0.09, y0 + fh / 2, bz + 0.05); st.scale.set(ti === 0 ? 0.014 : 0.035, fh, ti === 0 ? 0.014 : 0.035); f.position.set(bx + 0.09, y0 + fh + (ti === 0 ? 0.01 : 0.02), bz + 0.05); f.scale.set(ti === 0 ? 0.075 : 0.13, ti === 0 ? 0.05 : 0.07, ti === 0 ? 0.075 : 0.13); tuft.add(st, f);
          }
        }
      }
    }
    /* 水（卡通画风）：水面是真的面；七玄门的池子里浮着荷叶、开着荷花，虚天殿的寒潭里漂着碎冰 */
    if (G.DH && waterMesh(room, rs, g, th, ti, at)) {
      const padG = Mo.padGeoFlat(), padM = [lm({ color: new THREE.Color('#4f9a52') }), lm({ color: new THREE.Color('#6cb45c') })], flM = new THREE.MeshLambertMaterial({ vertexColors: true }), iceM = lm({ color: new THREE.Color('#e8f4fa') }); rs.mats.push(flM);
      const reedM = [['#5f9440', '#86b85a', '#a8a696'], ['#7a6a3a', '#a08a4a', '#8a8478'], ['#4a443c', '#6a5e4e', '#6a645c'], ['#b8cede', '#e0ecf4', '#c4d0da']][ti].map((cc) => lm({ color: new THREE.Color(cc) }));
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (at(x, y) !== 3) continue;
        const hw = (i) => U.hash(x * 3 + i, y * 5 + i, sd + 90 + i), inner = at(x - 1, y) === 3 && at(x + 1, y) === 3 && at(x, y - 1) === 3 && at(x, y + 1) === 3, k = inner ? 0.36 : 0.16;
        if (open && !cave) [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy], q) => { // 山野里的水没有石沿：岸上长一丛丛芦苇，卧几块卵石
          if (at(x + dx, y + dy) !== 0 || hw(20 + q) > 0.62) return;
          const ex = x + 0.5 + dx * 0.6 + (dx ? 0 : (hw(24 + q) - 0.5) * 0.7), ez = y + 0.5 + dy * 0.6 + (dy ? 0 : (hw(28 + q) - 0.5) * 0.7);
          if (hw(32 + q) < 0.3) { const pb = new THREE.Mesh(Mo.geo.ico(0), reedM[2]); pb.position.set(ex, 0.03, ez); pb.scale.set(0.2 + hw(36 + q) * 0.14, 0.1, 0.16 + hw(40 + q) * 0.1); pb.rotation.y = hw(44 + q) * TAU; tuft.add(pb); return; }
          for (let i = 0; i < 5; i++) { const hgt = (ti === 3 ? 0.2 : 0.3) + hw(48 + q * 5 + i) * 0.28, b = new THREE.Mesh(Mo.geo.cone(4), reedM[i % 2]); b.position.set(ex + (hw(70 + q * 5 + i) - 0.5) * 0.22, hgt / 2, ez + (hw(92 + q * 5 + i) - 0.5) * 0.22); b.scale.set(0.045, hgt, 0.045); b.rotation.set((hw(114 + q * 5 + i) - 0.5) * 0.5, hw(136 + q * 5 + i) * 3, (hw(158 + q * 5 + i) - 0.5) * 0.5); tuft.add(b); }
        });
        if (ti === 0) {
          const n = hw(0) < 0.5 ? (hw(1) < 0.4 ? 2 : 1) : 0;
          for (let i = 0; i < n; i++) {
            const lx = x + 0.5 + (hw(2 + i) - 0.5) * 2 * k, lz = y + 0.5 + (hw(4 + i) - 0.5) * 2 * k, sc = 0.3 + hw(6 + i) * 0.22, pm = new THREE.Mesh(padG, padM[(x + y + i) % 2]);
            pm.position.set(lx, 0.022 + i * 0.004, lz); pm.scale.set(sc, 1, sc); pm.rotation.y = hw(8 + i) * TAU; tuft.add(pm);
            if (!i && hw(10) < 0.42) { const f = new THREE.Mesh(Mo.lotusGeo(), flM); f.position.set(lx + sc * 0.25, 0.02, lz - sc * 0.2); f.scale.setScalar(0.85 + hw(11) * 0.4); f.rotation.y = hw(12) * TAU; tuft.add(f); }
          }
        } else if (ti === 3 && hw(0) < 0.4) {
          const ic = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 6), iceM); ic.position.set(x + 0.5 + (hw(2) - 0.5) * 2 * k, 0.03, y + 0.5 + (hw(4) - 0.5) * 2 * k); ic.scale.set(0.3 + hw(6) * 0.3, 0.035, 0.22 + hw(7) * 0.24); ic.rotation.y = hw(8) * TAU; tuft.add(ic);
        }
      }
    }
    // 北面：高出墙头的一道山脊，脊上有树
    for (let x = -0.9; x < w + 1; x += 1.8) {
      kk++; if (nearDoor('n', x, 0)) continue;
      const top = 1.15 + rv(2) * 1.25, rx = x + rv(1) * 0.6, rz = -0.8 - rv(3) * 0.9;
      rk(rx, top, rz, 1.3 + rv(4) * 0.9, 1.8 + rv(5) * 0.8, kk);
      if (woods && rv(6) < 0.42) { const tr = Mo.tree(kk + sd, ti, treeKind(rv(7) * 0.66), 1.3); tr.g.position.set(rx, top - 0.12, rz); tr.g.rotation.y = rv(8) * TAU; scn.add(tr.g); rs.mats.push(...tr.mats); }
    }
    // 立轴：庭院与古殿的北墙上各挂两幅山水
    if ((ti === 0 || ti === 3) && !open) {
      const dn = dz('n'), dcx = dn ? dn[0] + 0.5 : w / 2;
      for (const off of [-3.5, 3.5]) {
        const sx = dcx + off; if (sx < 1.7 || sx > w - 1.7 || at(Math.floor(sx), 0) !== 1 || room.lights.some((L) => L.sconce && Math.abs(L.x * S - sx) < 0.75)) continue;
        const sc2 = Mo.scroll(ti, Math.floor(sx) * 7 + sd); sc2.g.position.set(sx, HN - 0.03, 1.035); g.add(sc2.g); rs.mats.push(...sc2.mats); rs.tex.push(...sc2.tex); rs.anims.push(sc2.anim);
      }
    }
    /* 层次（卡通画风）：浮台之外一圈圈石峰自雾里拔起，分近、中、远三层——
       空气是有颜色的，隔得越远叠得越厚，所以一层比一层淡、比一层偏雾色、比一层平（空气透视）；
       峰脚隐在贴着谷底的雾里（见 heightMist），峰间浮着成团的云。镜头在南边朝北看，所以正南不立峰，免得挡住场内 */
    function backdrop() {
      const hzC = new THREE.Color(th.fog[0]), bs = (room.gx || 0) * 19 + (room.gy || 0) * 7 + ti * 3 + 5, hb = (i, k) => U.hash(i * 7 + k, k * 3 + 1, bs);
      const cx0 = w / 2, cz0 = h / 2, RX = w / 2, RZ = h / 2;
      [[5, 11, 0.22, 10, 0.6], [13, 24, 0.5, 13, 3], [27, 46, 0.76, 16, 7]].forEach(([d0, d1, hk, n, lift], ri) => {
        const rm = new THREE.MeshLambertMaterial({ vertexColors: true }); rm.userData.hz = [hzC, hk];
        const lf = new THREE.MeshLambertMaterial({ vertexColors: true }); lf.userData.hz = [hzC, hk];
        const bk = new THREE.MeshLambertMaterial({ color: new THREE.Color(Mo.PAL[ti].trunk) }); bk.userData.hz = [hzC, hk];
        rs.mats.push(rm, lf, bk);
        const col = (x, top, z, s, k) => { const geo = Mo.rockGeo(k % 4, ti, true), sy = (top + 13) / (geo.userData.h * s), m = new THREE.Mesh(geo, rm); m.position.set(x, -13, z); m.scale.set(s, s * sy, s * (0.8 + hb(k, 9) * 0.4)); m.rotation.y = hb(k, 8) * TAU; scnFar.add(m); };
        for (let i = 0; i < n; i++) {
          const k = ri * 40 + i, a = (i / n) * TAU + hb(k, 1) * 0.5, d = d0 + hb(k, 2) * (d1 - d0), x = cx0 + Math.cos(a) * (RX + d), z = cz0 + Math.sin(a) * (RZ + d * 0.8);
          if (z > h + 1.5 && Math.abs(x - cx0) < RX + 9) continue;
          const top = lift + hb(k, 3) * (2.6 + ri * 3.4), s = 1.5 + hb(k, 4) * 1.5 + ri * 1.1;
          col(x, top, z, s, k); // 主峰，旁边靠一两根矮的
          col(x + s * (0.7 + hb(k, 5) * 0.4), top - 1.6 - hb(k, 6) * 2.4, z + s * 0.35, s * 0.62, k + 1);
          if (hb(k, 7) < 0.6) col(x - s * 0.75, top - 3 - hb(k, 10) * 2.5, z - s * 0.3, s * 0.5, k + 2);
          const pav = ri < 2 && hb(k, 15) < 0.3 && z < h * 0.7; // 有的峰顶立着一座亭子
          if (pav) { const pv = Mo.pavilion(ti), ps = (1.5 + ri * 0.9) * (0.85 + hb(k, 16) * 0.3); for (const pm of pv.mats) { pm.userData.hz = [hzC, hk]; rs.mats.push(pm); } pv.g.scale.setScalar(ps); pv.g.position.set(x, top - 0.12, z); pv.g.rotation.y = hb(k, 17) * 0.8; scnFar.add(pv.g); }
          else if (woods && ri < 2 && hb(k, 11) < 0.75) { const tr = Mo.tree(k + bs, ti, treeKind(hb(k, 12) * 0.7), (1.5 + hb(k, 13)) * (1 + ri * 0.5), { lite: true, bark: bk, leaf: lf }); tr.g.position.set(x, top - 0.15, z); tr.g.rotation.y = hb(k, 14) * TAU; scnFar.add(tr.g); } // 峰顶的树
          if (ti !== 2 && ri < 2 && hb(k, 18) < 0.34) { // 飞瀑：自峰腰垂进雾里的一道白，由几片细长的面叠成，一明一暗地闪
            const fh = top + 9, fw = 0.5 + hb(k, 19) * 0.4 + ri * 0.3, wm = fallMat(0.9 * (1 - hk * 0.5), fh);
            const wf = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), wm); wf.position.set(x + s * 0.2, top - 0.9 - fh / 2, z + s * 0.62); g.add(wf);
            rs.geos.push(wf.geometry); rs.mats.push(wm);
          }
        }
      });
      // 北面的石壁：紧贴在场子后面的一排高峰，比场子高出许多——打斗时画面上沿看到的就是它的石壁、半腰的树与垂下的瀑布
      { const rm = new THREE.MeshLambertMaterial({ vertexColors: true }), lf = new THREE.MeshLambertMaterial({ vertexColors: true }), bk = new THREE.MeshLambertMaterial({ color: new THREE.Color(Mo.PAL[ti].trunk) }), iceM = new THREE.MeshLambertMaterial({ color: new THREE.Color('#d4ecfa') });
        iceM.userData.hz = [hzC, 0.12]; rs.mats.push(rm, lf, bk, iceM);
        const NW = Math.max(4, Math.round((w + 12) / 6.2));
        for (let i = 0; i < NW; i++) {
          const k = 300 + i * 4, x = -6 + ((i + 0.5) / NW) * (w + 12) + (hb(k, 1) - 0.5) * 2.4, z = -4.6 - hb(k, 2) * 6, top = 5 + hb(k, 3) * 8, s2 = 2.0 + hb(k, 4) * 1.3, hk2 = U.clamp(0.1 + (-z - 4) * 0.035, 0, 0.4);
          rm.userData.hz = lf.userData.hz = bk.userData.hz = [hzC, 0.18];
          const colN = (cx, tp, cz, sc, kk) => { const geo = Mo.rockGeo(kk % 4, ti, true), sy = (tp + 13) / (geo.userData.h * sc), m = new THREE.Mesh(geo, rm); m.position.set(cx, -13, cz); m.scale.set(sc, sc * sy, sc * (0.8 + hb(kk, 9) * 0.4)); m.rotation.y = hb(kk, 8) * TAU; scnFar.add(m); };
          colN(x, top, z, s2, k);
          if (ti < 2) for (let v = 0; v < 2; v++) { // 垂藤：从石棱上挂下来的一串叶，越往下越小
            const vx = x + (hb(k, 40 + v) - 0.5) * s2 * 0.9, vy = top - 0.5 - hb(k, 42 + v) * 2.2, vz = z + s2 * (0.5 + hb(k, 44 + v) * 0.1), nv = 4 + Math.floor(hb(k, 46 + v) * 4);
            for (let i = 0; i < nv; i++) scnFar.add(Mo.padMark(vx + Math.sin(i * 1.3 + k) * 0.12, vy - i * 0.5, vz + 0.06 + i * 0.015, 0.5 - i * 0.045, 'round', lf, 5, (k * 9 + v) * 7 + i));
          }
          else if (ti === 3) for (let v = 0; v < 5; v++) { // 冰凌：石棱下挂着的一排冰锥
            const ic = new THREE.Mesh(Mo.geo.cone(5), iceM), il = 0.5 + hb(k, 50 + v) * 1.0; ic.rotation.x = PI; ic.scale.set(0.11 + hb(k, 56 + v) * 0.07, il, 0.11); ic.position.set(x + (hb(k, 62 + v) - 0.5) * s2 * 0.9, top - 0.9 - hb(k, 68 + v) * 2.4 - il / 2, z + s2 * 0.5); scnFar.add(ic);
          }
          const sh = [[x + s2 * 0.9, 1.6 + hb(k, 5) * 2.2, z + s2 * 0.75, s2 * 0.55], [x - s2 * 0.85, 2.8 + hb(k, 6) * 2.6, z + s2 * 0.5, s2 * 0.5]]; // 两个矮一截的石肩，肩上有树
          sh.forEach(([sx2, st, sz2, ss], q) => { colN(sx2, st, sz2, ss, k + 1 + q);
            if (ti !== 1 && hb(k, 30 + q) < 0.34) { const hl = Mo.hall(ti); for (const pm of hl.mats) { pm.userData.hz = [hzC, 0.14]; rs.mats.push(pm); } hl.g.scale.setScalar(ss * 0.74); hl.g.position.set(sx2, st - 0.1, sz2 + ss * 0.1); hl.g.rotation.y = (hb(k, 32 + q) - 0.5) * 0.5; scnFar.add(hl.g); } // 有的石肩上是一座殿
            else if (woods && hb(k, 10 + q) < 0.8) { const tr = Mo.tree(k + bs + q, ti, treeKind(hb(k, 12 + q) * 0.8), 1.5 + hb(k, 14 + q) * 0.7, { bark: bk, leaf: lf }); tr.g.position.set(sx2, st - 0.12, sz2); tr.g.rotation.y = hb(k, 16 + q) * TAU; scnFar.add(tr.g); } });
          if (ti !== 2 && hb(k, 18) < 0.4) { // 瀑布
            const fw = 0.6 + hb(k, 19) * 0.5, fh = top + 8, wm = fallMat(0.95, fh);
            const wf = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), wm); wf.position.set(x + (hb(k, 20) - 0.5) * s2 * 0.6, top - 1.2 - fh / 2, z + s2 * 0.86); g.add(wf);
            rs.geos.push(wf.geometry); rs.mats.push(wm);
          }
        }
      }
      // 云：一团团的积云，由几只压扁的球攒成，顶上亮、底下偏灰蓝；高低远近都有，缓缓地飘
      const pg = Mo.cloudGeo(), NC = 17, NQ = 11, cm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x303030, color: new THREE.Color(th.sea[0]).lerp(new THREE.Color(0xffffff), 0.45) });
      cm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.34, 0.33, 0.3) * pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.6);'); }; // 云的边是亮的
      cm.customProgramCacheKey = () => 'cloud';
      const im = new THREE.InstancedMesh(pg, cm, NC * NQ); im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; let ci = 0;
      for (let c = 0; c < NC; c++) {
        const a = hb(c, 21) * TAU, d = 11 + hb(c, 22) * 32, x = cx0 + Math.cos(a) * (RX + d), z = cz0 + Math.sin(a) * (RZ + d * 0.8) - 2, y = -4 + hb(c, 23) * 7.5, sc = 2.2 + hb(c, 24) * 3.4;
        if (z > h + 1 && Math.abs(x - cx0) < RX + 10) continue;
        for (let q = 0; q < NQ; q++) { // 中间的团大而高，两边的小而低；底是平的，顶是一个个鼓包
          const u = (q / (NQ - 1)) * 2 - 1, big = 1 - u * u, r = sc * (0.34 + 0.5 * big) * (0.75 + hb(c * 13 + q, 25) * 0.5);
          dummy.position.set(x + u * sc * 1.5 + (hb(c * 13 + q, 26) - 0.5) * sc * 0.3, y + r * 0.42 + hb(c * 13 + q, 27) * sc * 0.28 * big, z + (hb(c * 13 + q, 28) - 0.5) * sc * 0.9); dummy.rotation.set(0, hb(c * 13 + q, 29) * TAU, 0); dummy.scale.set(r, r * 0.72, r * 0.95); dummy.updateMatrix(); im.setMatrixAt(ci++, dummy.matrix);
        }
      }
      im.count = ci; im.instanceMatrix.needsUpdate = true; g.add(im); rs.mats.push(cm); rs.anims.push((t) => { im.position.x = Math.sin(t * 0.021) * 2.6; im.position.z = Math.cos(t * 0.017) * 1.2; });
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
        const wm = new THREE.MeshBasicMaterial({ color: G.PAPER ? 0xffffff : FALL, transparent: true, opacity: G.PAPER ? 0.55 : 0.3, depthWrite: false, blending: G.PAPER ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); // 绢上的瀑布是留白
        const wf = new THREE.Mesh(new THREE.PlaneGeometry(0.34 + hv(5) * 0.3, 11), wm); wf.position.set(sc * 0.36, -5.7, sc * 0.3); isl.add(wf);
        rs.geos.push(wf.geometry); rs.mats.push(wm); rs.anims.push((t) => { wm.opacity = 0.26 + Math.sin(t * 6 + i * 2) * 0.05 + Math.sin(t * 13.7 + i) * 0.03; });
      }
      g.add(isl);
    });
    if (G.DH && !cave) backdrop();
    const mergedScn = mergeStatic(scn);
    if (mergedScn) { g.add(mergedScn); rs.geos.push(mergedScn.geometry); rs.mats.push(mergedScn.material); if (!G.DH) inkOutline(mergedScn, 0.03, g, rs, th.ink); }
    const mergedFar = mergeStatic(scnFar);
    if (mergedFar) { mergedFar.castShadow = false; g.add(mergedFar); rs.geos.push(mergedFar.geometry); rs.mats.push(mergedFar.material); }
    const mergedTuft = mergeStatic(tuft); // 草丛太细，不描线
    if (mergedTuft) { mergedTuft.castShadow = false; g.add(mergedTuft); rs.geos.push(mergedTuft.geometry); rs.mats.push(mergedTuft.material); }
    rs.mats.push(...kit.mats());
    const mergedArch = mergeStatic(archRoot);
    if (mergedArch) { g.add(mergedArch); rs.geos.push(mergedArch.geometry); rs.mats.push(mergedArch.material); if (!G.DH) inkOutline(mergedArch, 0.018, g, rs, th.ink); }
    // 岩浆的光
    // （虚天殿的水面原先是熔池，带一团团橙红的光；现在是寒潭，不发光——橙红只留给敌人）
    if (G.DH) { g.updateMatrixWorld(true); takePads(g); leafCards(room, rs, g); }
    if (G.DH && !cave) ambience(room, rs, g, ti, at);
    return rs;
  }

  /* 笔触：绢本模式下，合并后的场景网格按每个顶点的 brush 加笔墨——
     1 皴：顺着山势的细笔（披麻皴的意思），间杂一些擦笔与苔点；2 点叶：一粒一粒的墨点。
     都是按世界坐标算的，所以相邻的山石、叶团笔触连得上，也不需要任何贴图 */
  const BRUSH_GLSL = `
    float bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float bn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(bh(i), bh(i + vec3(1, 0, 0)), f.x), mix(bh(i + vec3(0, 1, 0)), bh(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(bh(i + vec3(0, 0, 1)), bh(i + vec3(1, 0, 1)), f.x), mix(bh(i + vec3(0, 1, 1)), bh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
  function brushMat(m) {
    if (G.DH) {
      /* 卡通画风：合并后的静态网格按每个顶点的 brush 加细节，都是按世界坐标逐像素算的，不用贴图——
         1 山石：水平的层理线（随位置起伏、时断时续）、层与层之间错开的竖缝、每一小块自己的深浅、顺着石壁流下来的水渍；朝天的面只有细碎的斑；
         3 树皮：顺着树干的沟纹 */
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float brush;\nvarying float vBrush;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBrush = brush; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = mat3(modelMatrix) * objectNormal;');
        sh.fragmentShader = 'varying float vBrush;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + BRUSH_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (vBrush > 0.5 && vBrush < 1.5) {
          vec3 P = vWP, Nw = normalize(vWN); float steep = 1.0 - smoothstep(0.3, 0.7, Nw.y);
          float by = P.y * 2.1 + bn(vec3(P.x, 0.0, P.z) * 0.45) * 1.9 + bn(P * 1.7) * 0.5, row = floor(by);
          float bed = (1.0 - smoothstep(0.0, 0.085, abs(fract(by) - 0.5))) * smoothstep(0.25, 0.55, bn(P * vec3(1.1, 0.25, 1.1) + 3.1));
          float hx = abs(Nw.x) > abs(Nw.z) ? P.z : P.x, jx = hx * 1.1 + bh(vec3(row, 1.0, 2.0)) * 7.0 + bn(P * 1.3) * 0.7;
          float jt = (1.0 - smoothstep(0.0, 0.045, abs(fract(jx) - 0.5))) * step(0.62, bh(vec3(floor(jx), row, 7.0)));
          float blk = bh(vec3(floor(jx + 0.5), row, 3.0)), mott = bn(P * 2.2) * 0.6 + bn(P * 6.5) * 0.4;
          float streak = smoothstep(0.5, 0.85, bn(vec3(P.x * 2.4, P.y * 0.3, P.z * 2.4)));
          diffuseColor.rgb *= mix(1.0, 0.84 + blk * 0.26, steep) * (0.85 + mott * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.74, 0.72), streak * steep * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.41, 0.4), max(bed, jt * 0.8) * steep * 0.7);
        } else if (vBrush > 2.5) {
          float gr = bn(vec3(vWP.x * 15.0, vWP.y * 1.3, vWP.z * 15.0)); diffuseColor.rgb *= 0.72 + gr * 0.56;
        }`);
      };
      m.customProgramCacheKey = () => 'dh-rock';
      return m;
    }
    if (!G.PAPER) return m;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float brush;\nvarying float vBrush;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBrush = brush; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying float vBrush;\nvarying vec3 vWP;\n' + BRUSH_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (vBrush > 0.5) {
          vec3 P = vWP; float ink = 0.0;
          if (vBrush < 1.5) {
            // 披麻皴：顺着山势往下的短线（相位只随水平位置变，所以线是竖着的），被噪声截成一段一段
            float n = bn(P * 1.8), m = smoothstep(0.3, 0.62, bn(P * 0.8 + 7.3));
            float s = abs(sin((P.x * 0.9 + P.z * 0.6) * 7.5 + n * 4.0 + P.y * 0.7));
            float dash = smoothstep(0.42, 0.62, bn(vec3(P.x * 3.0, P.y * 6.5, P.z * 3.0)));
            ink = smoothstep(0.8, 0.97, s) * dash * m * 1.15 + smoothstep(0.7, 0.93, bn(P * 7.0)) * 0.35 * m; // 再点几处苔点
          } else {
            vec3 q = P * 8.0; vec3 f = fract(q) - 0.5;
            ink = step(bh(floor(q)), 0.42) * smoothstep(0.27, 0.15, length(f)) * smoothstep(0.25, 0.55, bn(P * 1.6)); // 点叶聚成几簇，不是满身麻点
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.3, 0.28, 0.25), clamp(ink, 0.0, 1.0) * 0.8);
        }`);
    };
    m.customProgramCacheKey = () => 'brush';
    return m;
  }

  /* ============================ 树叶（卡通画风） ============================
     一团叶 = 十来片"叶枝"：每片是一个四边形，贴着叶枝图集里的一格（一根小枝带着十几片叶），
     自叶团的中心向外、向上张开，大半像真树的枝那样一层层平铺，小半随意——从哪边看、从上往下看都是满的。
     明暗不靠每片自己的朝向（那样会花），而是按它在叶团里的位置：朝外朝上的亮，靠里靠下的暗。
     颜色一棵树一个调子（枫是深红到橘到金，偶尔一棵还绿着），片与片之间再有深浅。
     整间屋子的叶合成一个网格，一次画完；随风轻摆，影子按叶的轮廓投 */
  const padQ = [], pv = new THREE.Vector3(), ps = new THREE.Vector3();
  function takePads(root) {
    const marks = []; root.traverse((o) => { if (o.userData.pad) marks.push(o); });
    for (const o of marks) {
      const d = o.userData.pad, c = d.mat.color, hz = d.mat.userData.hz; o.getWorldPosition(pv); o.getWorldScale(ps);
      padQ.push({ x: pv.x, y: pv.y, z: pv.z, r: d.r * ps.x, kind: d.kind, n: d.n, seed: d.seed, cr: c.r, cg: c.g, cb: c.b, hz });
      o.parent.remove(o);
    }
  }
  // 各章的叶色：每一类叶给几个"调子"（一棵树取一个），每个调子是 [暗处, 亮处]
  const LEAF = [
    { round: [['#2f6a2e', '#7fc24e'], ['#3a7430', '#a2cc56'], ['#27602e', '#62ac4a']], pine: [['#1f4a2e', '#4f9a52'], ['#24543a', '#62a85a']], bloom: [['#d887a4', '#ffd6e2'], ['#e4a0b6', '#fff0f4']] },
    { round: [['#8a2a1a', '#e2642a'], ['#a03a1c', '#f08a34'], ['#b8721e', '#f6c64e'], ['#6a1e1a', '#c8402a'], ['#4a5a26', '#9aa63e']], pine: [['#2a4a30', '#5a8a4e']], bloom: [['#b8721e', '#f6c64e']] },
    { round: [['#2e2a22', '#6a5e48'], ['#3a2e22', '#8a6a44']], pine: [['#2a2a24', '#5a5646']], bloom: [['#3a2e22', '#8a6a44']] },
    { round: [['#4a7a80', '#f4f8fb'], ['#5a8a8e', '#ffffff']], pine: [['#2e5e58', '#f0f6fa'], ['#3a6a66', '#ffffff']], bloom: [['#9ab4c4', '#ffffff']] },
  ];
  let leafTex = null;
  function leafCards(room, rs, g) {
    const n0 = padQ.length; if (!n0) return;
    const ti = room.theme, LP = LEAF[ti], pos = [], nor = [], uv = [], col = [], sw = [], idx = [], c0 = new THREE.Color(), c1 = new THREE.Color(), cc = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), v = new THREE.Vector3(), u = new THREE.Vector3(), nn = new THREE.Vector3(), ce = new THREE.Vector3(), rv = new THREE.Vector3();
    for (const q of padQ) {
      const pine = q.kind === 'pine', bloom = q.kind === 'bloom', fam = LP[q.kind] || LP.round, tree = Math.floor(q.seed / 7), tone = fam[Math.floor(U.hash(tree, 3, ti + 9) * fam.length * 0.999)];
      c0.set(tone[0]); c1.set(tone[1]);
      const cell = bloom ? 3 : pine ? 2 : ti === 0 ? 1 : 0, cx = cell % 2, cy = (cell / 2) | 0, sy = pine ? 0.42 : 0.82, h = (i, k) => U.hash(q.seed * 31 + i, k * 7 + 1, tree + k);
      for (let i = 0; i < q.n; i++) {
        // 自中心向外的方向：偏向上半球
        const a = h(i, 1) * TAU, yy = -0.3 + h(i, 2) * 1.3, rr = Math.sqrt(Math.max(0, 1 - Math.min(1, yy * yy)));
        d.set(Math.cos(a) * rr, yy, Math.sin(a) * rr).normalize();
        const rad = 0.2 + h(i, 3) * 0.55, size = q.r * (pine ? 1.25 : 1.1) * (0.8 + h(i, 4) * 0.45);
        ce.set(q.x + d.x * q.r * rad, q.y + d.y * q.r * rad * sy, q.z + d.z * q.r * rad);
        v.copy(d); v.y = v.y * (pine ? 0.25 : 0.6) + (pine ? 0.06 : 0.22); v.x += (h(i, 5) - 0.5) * 0.5; v.z += (h(i, 6) - 0.5) * 0.5; v.normalize(); // 枝往外、略往上长
        if (h(i, 7) < (pine ? 0.9 : 0.62) && Math.abs(v.y) < 0.9) u.crossVectors(v, up); else { rv.set(h(i, 8) - 0.5, h(i, 9) - 0.5, h(i, 10) - 0.5); u.crossVectors(v, rv); } // 多数平铺成层，少数随意
        if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize().multiplyScalar(size * 0.5); v.multiplyScalar(size);
        nn.copy(d).multiplyScalar(0.55).add(up).normalize(); // 明暗用的法线：朝外、朝上
        const k = pos.length / 3, bx = ce.x - v.x * 0.35, by = ce.y - v.y * 0.35, bz = ce.z - v.z * 0.35;
        pos.push(bx - u.x, by - u.y, bz - u.z, bx + u.x, by + u.y, bz + u.z, bx + u.x + v.x, by + u.y + v.y, bz + u.z + v.z, bx - u.x + v.x, by - u.y + v.y, bz - u.z + v.z);
        const fl = h(i, 11) < 0.5, u0 = (cx + (fl ? 1 : 0)) / 2, u1 = (cx + (fl ? 0 : 1)) / 2, vb = (cy + 1) / 2 - 0.004, vt = cy / 2 + 0.004;
        uv.push(u0, vb, u1, vb, u1, vt, u0, vt);
        // 颜色：靠外靠上的亮，靠里靠下的暗；片与片再有深浅；跟着材质的颜色（前景压暗）与空气透视（远处褪色）
        const lit = U.clamp(0.25 + d.y * 0.45 + rad * 0.45 + (h(i, 12) - 0.5) * 0.3, 0, 1), shade = (0.62 + 0.38 * U.clamp(d.y * 0.6 + 0.5, 0, 1)) * (0.9 + h(i, 13) * 0.2);
        cc.copy(c0).lerp(c1, lit); let r2 = cc.r * shade * q.cr, g2 = cc.g * shade * q.cg, b2 = cc.b * shade * q.cb;
        if (q.hz) { r2 += (q.hz[0].r - r2) * q.hz[1]; g2 += (q.hz[0].g - g2) * q.hz[1]; b2 += (q.hz[0].b - b2) * q.hz[1]; }
        for (let m = 0; m < 4; m++) { nor.push(nn.x, nn.y, nn.z); col.push(r2, g2, b2); }
        sw.push(0.35, 0.35, 1, 1); idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
    }
    padQ.length = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('sway', new THREE.Float32BufferAttribute(sw, 1)); geo.setIndex(idx);
    if (!leafTex) leafTex = Mo.leafAtlas();
    const uT = { value: 0 }, sway = (sh) => { sh.uniforms.uT = uT; sh.vertexShader = 'attribute float sway;\nuniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { float ph = position.x * 0.9 + position.z * 0.7; transformed.x += sway * (sin(uT * 1.1 + ph) * 0.05 + sin(uT * 3.7 + ph * 2.3) * 0.012); transformed.y += sway * sin(uT * 1.7 + ph * 1.3) * 0.02; }'); };
    const mat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.42, vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => { sway(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '')); }; // 背面不翻法线：明暗只看它在叶团里的位置
    mat.customProgramCacheKey = () => 'leaf';
    const dep = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide }); dep.onBeforeCompile = sway; dep.customProgramCacheKey = () => 'leaf-d';
    const m = new THREE.Mesh(geo, mat); m.customDepthMaterial = dep; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; g.add(m);
    rs.geos.push(geo); rs.mats.push(mat, dep); rs.anims.push((t) => { uT.value = t; });
    rs.leafN = idx.length / 6;
  }

  /* 把一组静态网格烘焙成单个带顶点色的网格 */
  /* 瀑布（卡通画风）：一片细长的面，水是一道道往下淌的——每一竖条各有各的快慢；两边、上头、底下都化开（底下化进雾里） */
  function fallMat(op, len) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = clothT; sh.uniforms.uLen = { value: len };
      sh.vertexShader = 'varying vec2 vFuv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFuv = uv;');
      sh.fragmentShader = 'varying vec2 vFuv;\nuniform float uT;\nuniform float uLen;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { float col = floor(vFuv.x * 9.0), n1 = fract(sin(col * 91.7 + 3.1) * 43758.5), n2 = fract(sin(col * 37.3 + 1.7) * 24634.6);
    float run = sin((vFuv.y * uLen * 0.55 + uT * (1.1 + n1 * 1.3)) * 6.2832 + n2 * 40.0) * 0.5 + 0.5;
    float fine = sin((vFuv.y * uLen * 1.9 + uT * (2.4 + n2 * 1.5)) * 6.2832 + n1 * 17.0 + vFuv.x * 30.0) * 0.5 + 0.5;
    float edge = smoothstep(0.0, 0.22, vFuv.x) * smoothstep(1.0, 0.78, vFuv.x) * smoothstep(1.0, 0.95, vFuv.y) * smoothstep(0.0, 0.3, vFuv.y);
    diffuseColor.a *= edge * (0.4 + 0.42 * run + 0.18 * fine); }`);
    };
    m.customProgramCacheKey = () => 'fall';
    return m;
  }

  /* 活物与飘落物（卡通画风）——让场子"活"起来的小东西，都不参与玩法：
     飘落物：七玄门落花、血色禁地落枫叶、燕翎堡飘灰、虚天殿下雪。一片片真的薄片，边落边翻；
     飞鸟：七玄门与虚天殿是鹤，另两章是鸦。几只一队，绕着北墙外的山谷盘旋，翅膀在顶点着色器里扇；
     锦鲤：七玄门的池子里，一尾尾兜着小圈游 */
  function ambience(room, rs, g, ti, at) {
    const w = room.w, h = room.h; let seed = ((room.gx || 0) * 97 + (room.gy || 0) * 31 + ti * 7 + 11) >>> 0;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; // 自己的随机数：不去动玩法用的那一串
    { const N = [34, 46, 24, 54][ti], size = [0.2, 0.3, 0.14, 0.11][ti], fall = [0.5, 0.6, 0.38, 0.85][ti];
      const cols = [['#ffd6e4', '#fff2f6', '#f8b4ca'], ['#d8402a', '#ec8a2c', '#f2bc3c', '#b83424'], ['#3a3634', '#58524e', '#2a2624'], ['#ffffff', '#eaf4ff']][ti].map((c) => new THREE.Color(c));
      const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }); rs.mats.push(mat);
      const im = new THREE.InstancedMesh(Mo.flakeGeo(ti), mat, N); im.frustumCulled = false; g.add(im);
      const F = [];
      for (let i = 0; i < N; i++) { F.push({ x: -2 + rnd() * (w + 4), y: rnd() * 5.5, z: -1 + rnd() * (h + 2), ph: rnd() * TAU, v: 0.7 + rnd() * 0.6, s: size * (0.75 + rnd() * 0.5), sx: 1 + rnd() * 2, sz: 1 + rnd() * 2 }); im.setColorAt(i, cols[i % cols.length]); }
      im.instanceColor.needsUpdate = true;
      let last = -1;
      rs.anims.push((t) => {
        const dt = last < 0 ? 0 : Math.min(0.05, Math.max(0, t - last)); last = t;
        for (let i = 0; i < N; i++) { const f = F[i];
          f.y -= fall * f.v * dt; f.x += (0.3 + Math.sin(t * 0.9 + f.ph) * 0.5) * dt; f.z += Math.cos(t * 0.7 + f.ph * 1.7) * 0.3 * dt;
          if (f.y < 0.03 || f.x > w + 3) { f.y = 4.5 + rnd() * 1.5; f.x = -3 + rnd() * (w + 4); f.z = -1 + rnd() * (h + 2); }
          dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(t * f.sx * 0.9 + f.ph, f.ph * 2 + t * 0.3, t * f.sz * 0.7 + f.ph * 3); dummy.scale.setScalar(f.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
        im.instanceMatrix.needsUpdate = true;
      });
    }
    { const crow = ti === 1 || ti === 2, flocks = ti === 2 ? [[6, 1]] : [[5, 1], [4, -1]], NB = flocks.reduce((a, f) => a + f[0], 0);
      const bg = Mo.birdGeo(crow).clone(), phA = new Float32Array(NB); rs.geos.push(bg);
      const bm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); rs.mats.push(bm);
      bm.onBeforeCompile = (sh) => { sh.uniforms.uT = clothT; sh.uniforms.uFlap = { value: crow ? 8.5 : 5.2 };
        sh.vertexShader = 'attribute float wing;\nattribute float ph;\nuniform float uT;\nuniform float uFlap;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { float fl = sin(uT * uFlap + ph); transformed.y += fl * wing * (0.22 + wing * 0.3); transformed.z *= 1.0 - 0.1 * fl * step(0.01, wing); }'); };
      bm.customProgramCacheKey = () => 'bird';
      const B = []; let bi = 0;
      const open = room.terrain && room.terrain !== 'court';
      flocks.forEach(([n, dir], fi) => { // 一队一个扁圈，绕着北墙（山野里是北面的树梢）：镜头是俯视的，飞高了、飞远了都出画，所以压得低、贴着墙头
        const rx = w / 2 + 5 + fi * 3 + rnd() * 2, rz = 2.05 - fi * 0.5, cz = 0.55 - fi * 1.1, y0 = (open ? 3.7 : 3.3) + fi * 0.9 + rnd() * 0.3, a0 = rnd() * TAU, om = (0.1 + rnd() * 0.03) * dir;
        for (let j = 0; j < n; j++) { const k = j - (n - 1) / 2; B.push({ rx, rz, cz, y0: y0 + Math.abs(k) * 0.1, a0, om, dir, back: Math.abs(k) * 0.7, side: k * 0.62, fi }); phA[bi++] = rnd() * TAU; } // 人字形：越靠边越落后
      });
      bg.setAttribute('ph', new THREE.InstancedBufferAttribute(phA, 1));
      const bim = new THREE.InstancedMesh(bg, bm, NB); bim.frustumCulled = false; bim.castShadow = true; g.add(bim);
      rs.anims.push((t) => {
        for (let i = 0; i < NB; i++) { const b = B[i], a = b.a0 + t * b.om - (b.back / b.rx) * b.dir;
          let tx = -Math.sin(a) * b.rx * b.dir, tz = Math.cos(a) * b.rz * b.dir; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          dummy.position.set(w / 2 + Math.cos(a) * b.rx - tz * b.side, b.y0 + Math.sin(a * 2 + b.fi) * 0.25 + Math.sin(t * 0.8 + i) * 0.07, b.cz + Math.sin(a) * b.rz + tx * b.side);
          dummy.rotation.set(0, Math.atan2(-tz, tx), 0); dummy.scale.setScalar(crow ? 0.6 : 0.64); dummy.updateMatrix(); bim.setMatrixAt(i, dummy.matrix); }
        bim.instanceMatrix.needsUpdate = true;
      });
    }
    if (ti === 0) { const K = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (at(x, y) !== 3 || rnd() > 0.5) continue;
        const inner = at(x - 1, y) === 3 && at(x + 1, y) === 3 && at(x, y - 1) === 3 && at(x, y + 1) === 3;
        K.push({ x: x + 0.5, z: y + 0.5, r: inner ? 0.26 + rnd() * 0.08 : 0.12, s: inner ? 0.36 + rnd() * 0.1 : 0.28, a0: rnd() * TAU, om: (0.5 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1) });
      }
      if (K.length) {
        const km = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }); rs.mats.push(km);
        km.onBeforeCompile = (sh) => { sh.uniforms.uT = clothT; sh.vertexShader = 'attribute float tail;\nuniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.z += sin(uT * 7.0 + instanceMatrix[3][0] * 5.0 + instanceMatrix[3][2] * 3.0) * tail * tail * 0.16;'); };
        km.customProgramCacheKey = () => 'koi';
        const kim = new THREE.InstancedMesh(Mo.koiGeo(), km, K.length); kim.frustumCulled = false; kim.renderOrder = 1; g.add(kim);
        rs.anims.push((t) => {
          for (let i = 0; i < K.length; i++) { const k = K[i], a = k.a0 + t * k.om, sg = k.om > 0 ? 1 : -1;
            dummy.position.set(k.x + Math.cos(a) * k.r, 0.0165, k.z + Math.sin(a) * k.r); dummy.rotation.set(0, Math.atan2(-Math.cos(a) * sg, -Math.sin(a) * sg), 0); dummy.scale.setScalar(k.s); dummy.updateMatrix(); kim.setMatrixAt(i, dummy.matrix); }
          kim.instanceMatrix.needsUpdate = true;
        });
      }
    }
  }

  /* 幡旗（卡通画风）：屋脊、角楼顶上的三角旗。一根细杆、一面顺风飘的旗——旗面是一张细分过的三角片，
     顶点着色器里让它离杆越远摆得越大，明暗跟着布的起伏走。整间屋子的旗合成一个网格 */
  const clothT = { value: 0 }; // 布料摆动的钟：所有幡共用
  const PEN = [['#f2bc3c', '#c8402a'], ['#b8402c', '#3a2a26'], ['#8a2e28', '#2c2624'], ['#e6f2fa', '#6aa2cc']]; // 各章的旗色：旗面、镶边
  function pennants(list, rs, g, kit, ti) {
    const pos = [], nor = [], colr = [], wv = [], NX = 8, L = 1.2, H = 0.5, cb = new THREE.Color(PEN[ti][0]), ce = new THREE.Color(PEN[ti][1]);
    list.forEach(([px, py, pz, len], fi) => {
      kit.slab(px, py + len / 2, pz, 0.045, len, 0.045, 'dark'); kit.slab(px, py + len + 0.04, pz, 0.1, 0.1, 0.1, 'gold'); // 杆与杆头
      const cy = py + len - H / 2 - 0.02, hh = (u) => (H / 2) * (1 - 0.82 * u), ph = px * 1.7 + pz * 0.9 + fi;
      const V = (u, k, c) => { pos.push(px + 0.02 + u * L, cy + k * hh(u), pz); nor.push(0, 0, 1); colr.push(c.r, c.g, c.b); wv.push(u, ph); };
      for (let i = 0; i < NX; i++) {
        const u0 = i / NX, u1 = (i + 1) / NX;
        for (const [k0, k1, c] of [[1, 0.62, ce], [0.62, -0.62, cb], [-0.62, -1, ce]]) { V(u0, k0, c); V(u0, k1, c); V(u1, k0, c); V(u1, k0, c); V(u0, k1, c); V(u1, k1, c); } // 上镶边、旗面、下镶边
      }
    });
    const geo = new THREE.BufferGeometry(); rs.geos.push(geo);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); geo.setAttribute('wv', new THREE.Float32BufferAttribute(wv, 2));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), uT = { value: 0 }; rs.mats.push(mat);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uT;
      sh.vertexShader = 'attribute vec2 wv;\nuniform float uT;\n' + sh.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= 0.86 + 0.26 * cos(uT * 5.0 - wv.x * 6.5 + wv.y) * min(1.0, wv.x * 3.0);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.z += (sin(uT * 5.0 - wv.x * 6.5 + wv.y) * 0.1 + sin(uT * 3.1 - wv.x * 3.0 + wv.y * 1.7) * 0.06) * wv.x;\n  transformed.y += sin(uT * 4.2 - wv.x * 5.0 + wv.y) * 0.035 * wv.x - wv.x * wv.x * 0.07;');
    };
    mat.customProgramCacheKey = () => 'pennant';
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; g.add(m);
    rs.anims.push((t) => { uT.value = t; });
  }

  /* 水面（卡通画风）：水格上铺一张真的面，不再只是地上画的一块颜色。
     每个像素算自己离岸多远（岸角是圆的）：近岸浅而亮、离岸深；岸边一圈白沫，一道细浪往岸上涌；
     水里游着一张亮线织的网（两层大小不同的胞格，各自慢慢游走），水面的法线跟着细波起伏，所以日头的高光是碎的；会接影子 */
  function waterMesh(room, rs, g, th, ti, at) {
    const w = room.w, h = room.h, pos = [], nor = [], tuv = [], em = [], cm = [], Y = 0.014, w3 = (x, y) => at(x, y) === 3;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!w3(x, y)) continue;
      const W = !w3(x - 1, y), E = !w3(x + 1, y), N = !w3(x, y - 1), S2 = !w3(x, y + 1);
      const e4 = [W ? 1 : 0, E ? 1 : 0, N ? 1 : 0, S2 ? 1 : 0];
      const c4 = [!W && !N && !w3(x - 1, y - 1) ? 1 : 0, !E && !N && !w3(x + 1, y - 1) ? 1 : 0, !W && !S2 && !w3(x - 1, y + 1) ? 1 : 0, !E && !S2 && !w3(x + 1, y + 1) ? 1 : 0]; // 只有斜对角是岸：凹角
      for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) { pos.push(x + u, Y, y + v); nor.push(0, 1, 0); tuv.push(u, v); em.push(...e4); cm.push(...c4); }
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry(); rs.geos.push(geo);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('tuv', new THREE.Float32BufferAttribute(tuv, 2)); geo.setAttribute('em', new THREE.Float32BufferAttribute(em, 4)); geo.setAttribute('cm', new THREE.Float32BufferAttribute(cm, 4));
    const deep = new THREE.Color(th.water), hi = new THREE.Color(th.waterHi), shal = deep.clone().lerp(hi, 0.26), sky = new THREE.Color(th.sky || 0x88aacc);
    const U2 = { uT: { value: 0 }, uDeep: { value: deep }, uShal: { value: shal }, uHi: { value: hi }, uSky: { value: sky }, uWeb: { value: [1, 0.8, 0.35, 0.9][ti] } }; // 燕翎堡的水是死水：水纹淡
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: new THREE.Color(0.5, 0.5, 0.48), shininess: 90 }); rs.mats.push(mat);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U2);
      sh.vertexShader = 'attribute vec2 tuv;\nattribute vec4 em;\nattribute vec4 cm;\nvarying vec2 vTuv;\nvarying vec4 vEm;\nvarying vec4 vCm;\nvarying vec2 vWp;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTuv = tuv; vEm = em; vCm = cm; vWp = position.xz;');
      // wShore：这个像素离岸多远（格），负的在岸上；wCell：离最近的胞心多远，胞心自己在慢慢游
      sh.fragmentShader = `uniform float uT; uniform float uWeb; uniform vec3 uDeep; uniform vec3 uShal; uniform vec3 uHi; uniform vec3 uSky;
varying vec2 vTuv; varying vec4 vEm; varying vec4 vCm; varying vec2 vWp;
float wShore() {
  const float R = 0.3333; const float BIG = 9.0;
  float u = vTuv.x, v = vTuv.y;
  float d = min(min(vEm.x > 0.5 ? u : BIG, vEm.y > 0.5 ? 1.0 - u : BIG), min(vEm.z > 0.5 ? v : BIG, vEm.w > 0.5 ? 1.0 - v : BIG));
  if (vEm.x > 0.5 && vEm.z > 0.5 && u < R && v < R) d = R - length(vec2(R - u, R - v));
  if (vEm.y > 0.5 && vEm.z > 0.5 && u > 1.0 - R && v < R) d = R - length(vec2(u - 1.0 + R, R - v));
  if (vEm.x > 0.5 && vEm.w > 0.5 && u < R && v > 1.0 - R) d = R - length(vec2(R - u, v - 1.0 + R));
  if (vEm.y > 0.5 && vEm.w > 0.5 && u > 1.0 - R && v > 1.0 - R) d = R - length(vec2(u - 1.0 + R, v - 1.0 + R));
  if (vCm.x > 0.5) d = min(d, length(vec2(u, v)));
  if (vCm.y > 0.5) d = min(d, length(vec2(1.0 - u, v)));
  if (vCm.z > 0.5) d = min(d, length(vec2(u, 1.0 - v)));
  if (vCm.w > 0.5) d = min(d, length(vec2(1.0 - u, 1.0 - v)));
  return min(d, 1.0);
}
vec2 wHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec2 wCell(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 q = vec2(float(x), float(y)); vec2 o = 0.5 + 0.38 * sin(t + 6.2831 * wHash(i + q)); float d = length(q + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2 - d1);
}
` + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  float wd = wShore(); if (wd < 0.0) discard;
  vec2 wob = vec2(sin(vWp.y * 2.3 + uT * 0.9) + 0.5 * sin(vWp.y * 6.1 - vWp.x * 2.0 + uT * 1.3), cos(vWp.x * 2.1 - uT * 0.8) + 0.5 * cos(vWp.x * 5.7 + vWp.y * 2.4 - uT * 1.1)) * 0.11;
  vec2 c1 = wCell(vWp * 1.5 + wob + vec2(uT * 0.05, uT * 0.03), uT * 0.6);
  vec2 c2 = wCell(vWp * 2.9 - wob * 1.6 - vec2(uT * 0.04, -uT * 0.06), uT * 0.9 + 2.0);
  float web = (1.0 - smoothstep(0.025, 0.09, c1.y)) * 0.42 + (1.0 - smoothstep(0.02, 0.1, c2.y)) * 0.2;
  float dep = smoothstep(0.0, 0.5, wd);
  vec3 wc = mix(uShal, uDeep, dep);
  wc *= 0.9 + 0.2 * smoothstep(0.1, 0.6, c1.x);
  wc = mix(wc, uSky, 0.1);
  float foam = 1.0 - smoothstep(0.02, 0.05, wd + (c2.x - 0.3) * 0.05);
  float surf = smoothstep(0.016, 0.0, abs(wd - 0.15 - 0.04 * sin(uT * 1.2 + vWp.x * 2.6 + vWp.y * 1.9))) * 0.4;
  diffuseColor.rgb = mix(wc + uHi * web * uWeb * (0.25 + 0.2 * dep), uHi, clamp(foam + surf, 0.0, 1.0) * 0.9);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec2 rp = vec2(cos(vWp.x * 5.1 + uT * 1.7) + cos(vWp.x * 2.3 - vWp.y * 3.7 + uT * 1.1), cos(vWp.y * 4.7 - uT * 1.4) + cos(vWp.y * 2.9 + vWp.x * 3.1 + uT * 0.9)) * 0.06;
    normal = normalize((viewMatrix * vec4(normalize(vec3(rp.x, 1.0, rp.y)), 0.0)).xyz); }`);
    };
    mat.customProgramCacheKey = () => 'water';
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
    rs.anims.push((t) => { U2.uT.value = t; });
    return m;
  }

  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    takePads(root);
    const pos = [], nor = [], colr = [], brush = [], dead = [], v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (Array.isArray(m) || m.map || m.transparent || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial) || m.emissive.getHex() !== 0 || m.side === THREE.DoubleSide) return;
      let q = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (m.flatShading) q.computeVertexNormals();
      const P2 = q.attributes.position, N2 = q.attributes.normal, C2 = m.vertexColors ? q.attributes.color : null; // 山石、叶团的颜色烘在顶点上
      nm.getNormalMatrix(o.matrixWorld);
      const B = o.geometry.userData.brush || 0, hz = m.userData.hz; // hz = [雾色, 几成]：空气透视
      for (let i = 0; i < P2.count; i++) {
        brush.push(B);
        v.fromBufferAttribute(P2, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(N2, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
        let cr = m.color.r, cg = m.color.g, cb = m.color.b; if (C2) { cr *= C2.getX(i); cg *= C2.getY(i); cb *= C2.getZ(i); }
        if (hz) { cr += (hz[0].r - cr) * hz[1]; cg += (hz[0].g - cg) * hz[1]; cb += (hz[0].b - cb) * hz[1]; }
        colr.push(cr, cg, cb);
      }
      q.dispose(); o.visible = false; dead.push(o);
    });
    // 合并进去的原件从场景树上摘掉（连同摘空了的组）：一张大图有两千多个，留着的话每帧都要遍历、更新矩阵
    for (const o of dead) if (!o.children.length && o.parent) o.parent.remove(o);
    const prune = (o) => { for (let i = o.children.length - 1; i >= 0; i--) { const c = o.children[i]; if (c.type !== 'Group' && c.type !== 'Object3D') continue; prune(c); if (!c.children.length) o.remove(c); } };
    prune(root);
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('brush', new THREE.Float32BufferAttribute(brush, 1));
    const mesh = new THREE.Mesh(geo, brushMat(new THREE.MeshLambertMaterial({ vertexColors: true })));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  /* 墨线：把合并后的网格沿平滑法线外扩一圈、只画背面，轮廓处就露出一道墨色的边，像勾过线的画。
     削面网格每个面各有法线，直接外扩会裂开，所以先把位置相同的顶点的法线取平均 */
  const vh = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
  function vnoise(x, y, z) { // 三维值噪声，0..1
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t;
    return L(L(L(vh(ix, iy, iz), vh(ix + 1, iy, iz), sx), L(vh(ix, iy + 1, iz), vh(ix + 1, iy + 1, iz), sx), sy), L(L(vh(ix, iy, iz + 1), vh(ix + 1, iy, iz + 1), sx), L(vh(ix, iy + 1, iz + 1), vh(ix + 1, iy + 1, iz + 1), sx), sy), sz);
  }
  function inkOutline(mesh, w, parent, rs, ink) {
    const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal, acc = new Map(), keys = new Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const k = (Math.round(P.getX(i) * 160) * 73856093) ^ (Math.round(P.getY(i) * 160) * 19349663) ^ (Math.round(P.getZ(i) * 160) * 83492791); keys[i] = k;
      let a = acc.get(k); if (!a) acc.set(k, (a = [0, 0, 0])); a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
    }
    const out = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1, x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const ww = G.PAPER ? w * (0.25 + 1.6 * vnoise(x * 1.4, y * 1.4, z * 1.4)) : w; // 笔线有提按：粗细随位置起伏
      out[i * 3] = x + (a[0] / l) * ww; out[i * 3 + 1] = y + (a[1] / l) * ww; out[i * 3 + 2] = z + (a[2] / l) * ww;
    }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(out, 3));
    const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide }));
    parent.add(m2); rs.geos.push(g2); rs.mats.push(m2.material);
  }

  /* 人物的墨线：角色、妖兽、灵宠也描一道边，和场景统一。
     做法同样是"外扩一圈、只画背面"，但外扩放在屏幕空间里做（投影之后沿法线方向挪几个像素），
     这样不管模型多大、带不带骨骼，线都一样粗 */
  /* 描边的颜色就是身份（631 的"一"）：敌人一圈朱红，能交互的东西一圈金，自己人是墨色。
     不用看清模型，只看那一圈线的颜色就知道它是什么 */
  const INKS = G.PAPER ? { ink: [0x2a2218, 0.0062], foe: [0xde341e, 0.0085], gold: [0xc8860c, 0.0078] } : { ink: [0x0a0c10, 0.003], foe: [0xd42c18, 0.0044], gold: [0xd8ac54, 0.0042] }, actorInks = {}; // 卡通画风：线很细，身份主要靠轮廓光
  /* 卡通画风里人物与妖兽的材质：
     1. 一层皮毛 / 鳞 / 皮革 / 甲壳的细节——按模型自己的坐标三向投影，贴在它身上跟着它动（坐标乘上模型的缩放，疏密才一致）；
     2. 一圈轮廓光：越是侧对镜头的面越亮。敌人是朱红的，像身上腾着煞气；自己人是冷白的；能交互的是金的。
     3. 朝下的面压暗：肚腹、腋下、下巴底下比背上暗，模型才有分量（相当于一层很便宜的环境光遮蔽）。
     三样都只是在原有材质上加几行着色器，模型、动画都不动 */
  const RIMS = { foe: [1.0, 0.13, 0.06, 0.62], ink: [0.6, 0.8, 0.76, 0.22], gold: [1.0, 0.7, 0.2, 0.6] };
  /* 卡通画风里，还用朗伯 / 冯氏材质的模型（墨蛟、交互物、傀儡）加两样：
     一圈轮廓光——越是侧对镜头的面越亮（敌人朱红、自己人冷白、能交互的金）；朝下的面压暗——肚腹比背上暗，模型才有分量。
     人物与妖兽用的是卡通材质（Mo.toonMat），不走这里 */
  function dress(m, kind) {
    const R4 = RIMS[kind] || RIMS.ink, rim = new THREE.Vector3(R4[0] * R4[3], R4[1] * R4[3], R4[2] * R4[3]);
    for (const mt of m.mats || []) {
      if (!mt || mt.userData.dressed || !(mt.isMeshLambertMaterial || mt.isMeshPhongMaterial || mt.isMeshStandardMaterial) || mt.blending !== THREE.NormalBlending) continue;
      mt.userData.dressed = true;
      const prev = mt.onBeforeCompile;
      mt.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uRim = { value: rim };
        sh.vertexShader = 'varying float vUpN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUpN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz).y;');
        sh.fragmentShader = 'varying float vUpN;\nuniform vec3 uRim;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.5, 1.04, smoothstep(-0.75, 0.55, vUpN));')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0); totalEmissiveRadiance += uRim * rimF; }');
      };
      const ck = mt.customProgramCacheKey ? mt.customProgramCacheKey() : '';
      mt.customProgramCacheKey = () => 'dress|' + ck;
      mt.needsUpdate = true;
    }
  }
  function inkMaterial(kind = 'ink') {
    if (actorInks[kind]) return actorInks[kind];
    const [hex, wid] = INKS[kind];
    const actorInk = (actorInks[kind] = new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide }));
    actorInk.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_SKINNING
          vec3 inkN = normalize( transformedNormal );
        #else
          vec3 inkN = normalize( normalMatrix * normal );
        #endif
        vec2 inkO = ( projectionMatrix * vec4( inkN, 0.0 ) ).xy;
        inkO = normalize( inkO + vec2( 1e-6 ) );
        inkO.x *= projectionMatrix[0][0] / projectionMatrix[1][1];
        gl_Position.xy += inkO * ${wid.toFixed(4)} * gl_Position.w;`);
    };
    actorInk.customProgramCacheKey = () => 'actor-ink-' + kind;
    return actorInk;
  }
  function inkActor(m, kind) {
    if (G.DH) dress(m, kind || 'ink');
    const list = [], mat = inkMaterial(kind);
    m.g.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.normal || o.userData.ink) return;
      const mt = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!mt || mt.transparent || mt.blending === THREE.AdditiveBlending || mt.blending === THREE.SubtractiveBlending || mt.isMeshBasicMaterial || mt.side === THREE.DoubleSide) return; // 发光的、半透明的部件不描
      list.push(o);
    });
    m.inks = [];
    for (const o of list) {
      const k = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
      if (o.isSkinnedMesh) { k.bind(o.skeleton, o.bindMatrix); k.frustumCulled = false; }
      k.userData.ink = true; o.add(k); m.inks.push(k);
    }
    if (m.setAlpha) { // 半透明时（出场渐显）先不显示墨线
      const sa = m.setAlpha;
      m.setAlpha = function (a) { sa.call(this, a); const v = a > 0.7; if (this._inkV !== v) { this._inkV = v; for (const k of this.inks) k.visible = v; } };
    }
    return m;
  }
  const NO_INK = { ghost: 1, flame: 1, skull: 1, crystal: 1 }; // 鬼物、火灵、晶石本身就是一团光，不描线

  function disposeRoom(rs) {
    for (const t of rs.tex) t.dispose();
    for (const m of rs.mats) m.dispose();
    for (const q of rs.geos) q.dispose();
    if (rs.g) rs.g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); // 实例化网格（灯笼、飘落物、飞鸟、锦鲤、云）各有一份自己的缓冲
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
    if (room.hc) { if (!cur.hTex) { cur.hTex = heightTex(room); cur.tex.push(cur.hTex); } HU.map.value = cur.hTex; HU.size.value.set(room.w + 1, room.h + 1); }
    else { HU.map.value = zeroTex; HU.size.value.set(1, 1); }
    const th = G.Themes[room.theme], w = room.w, h = room.h;
    scene.background = new THREE.Color(th.bg);
    scene.fog.color.set(th.fog[0]); scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2] * 0.88;
    sun.color.set(th.sun[0]); sun.intensity = th.sun[1];
    sun.position.set(w / 2 - 7, 15, h / 2 + 5); sun.target.position.set(w / 2, 0, h / 2);
    const e = Math.max(w, h) / 2 + 3, sc = sun.shadow.camera;
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const L = cur.lights[i], pl = roomLights[i];
      if (L) { pl.color.set(L.c); pl.intensity = G.PAPER ? 0.35 : 1.05; pl.distance = L.r; pl.position.set(L.x, L.y, L.z); } else pl.intensity = 0;
    }
    glows.mat.uniforms.uK.value = th.glowK || 1;
    const mc = rgb(th.mist).col;
    for (const s of mists) s.material.color.copy(mc);
    for (const s of wisps) s.material.color.copy(mc);
    inkMaterial().color.setHex(th.ink);
    const inCave = room.terrain === 'cave';
    for (const m of seas) m.visible = !inCave; for (const s of mists) s.visible = !inCave; cshadow.visible = !inCave;
    if (inCave) { scene.background = new THREE.Color(0x050304); scene.fog.color.set(0x140a0b); hemi.intensity *= 0.72; }
    if (post) post.grade(th, inCave);
    if (sky) { sky.visible = !inCave; sky.position.set(w / 2, 0, h / 2); sky.material.uniforms.uTop.value.set(th.sky || th.bg); sky.material.uniforms.uHor.value.set(th.fog[0]); sky.material.uniforms.uSunC.value.set(th.sun[0]); }
    seas[0].material.color.setHex(th.sea[2]); seas[0].material.opacity = th.sea[3]; seas[0].position.set(w / 2, -11, h / 2);
    seas[1].material.color.setHex(th.sea[0]); seas[1].material.opacity = th.sea[1]; seas[1].position.set(w / 2, -6.5, h / 2);
    cshadow.position.set(w / 2, 0.012, h / 2); cshadow.scale.set(w - 1.2, h - 1.2, 1); cshadow.material.opacity = th.cloudShadow[0]; cshadow.material.map.repeat.set(w / th.cloudShadow[1], h / th.cloudShadow[1]);
    shafts.forEach((m, i) => {
      m.visible = !!th.shaft && !inCave; if (!m.visible) return;
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
    const ty = hW(px, pz);
    if (camSnap) { camT.set(tx, ty, tz); camSnap = false; }
    else { const q = 1 - Math.exp(-7 * dt); camT.x += (tx - camT.x) * q; camT.z += (tz - camT.z) * q; camT.y += (ty - camT.y) * q * 0.6; }
    const sx = shake ? U.rand(-shake, shake) * 0.02 : 0, sz = shake ? U.rand(-shake, shake) * 0.02 : 0;
    const dc = R.debugCam; // 仅供截图调试：拉近相机
    if (dc) { camera.position.set(dc.x, dc.dist * Math.sin(PITCH), dc.z + dc.dist * Math.cos(PITCH)); camera.lookAt(dc.x, 0.4, dc.z); camera.updateMatrixWorld(); return; }
    camera.position.set(camT.x + sx, camT.y + dist * Math.sin(PITCH), camT.z + dist * Math.cos(PITCH) + sz);
    camera.lookAt(camT.x + sx, camT.y, camT.z + sz);
    camera.updateMatrixWorld();
  }

  /* ============================ 每帧同步：静态场景动效 ============================ */
  function animateRoom(room, t) {
    clothT.value = t;
    for (const a of cur.anims) a(t);
    const th = G.Themes[room.theme];
    for (const f of cur.flags || []) { // 幡：未解时暗沉，可走而没去过的是亮金色，去过的是褪色的青灰
      const fresh = !room.doors[f.d].to.visited;
      f.m.material.color.setHex(room.locked ? 0x3a2828 : fresh ? 0xf6dc9a : 0x62746e);
      f.m.rotation.y = Math.sin(t * 2.1 + f.ph) * 0.35; f.m.position.x = f.x + 0.3 + Math.sin(t * 2.1 + f.ph) * 0.05;
      if (!room.locked && fresh) glows.push(f.x + 0.3, 3.2, f.z, WAYGOLD, 0.28 + Math.sin(t * 3 + f.ph) * 0.06, 2.2);
    }
    for (const d in cur.doors) { // 没去过的出口上方有一道淡淡的光柱
      if (room.locked || room.doors[d].to.visited) continue;
      const c0 = room.doors[d].cells[1], bm = P.beam.get(); bm.position.set(c0[0] + 0.5, 3.4, c0[1] + 0.5); bm.rotation.set(0, t * 0.6, 0); bm.scale.set(0.7, 6.8, 0.7); bm.material.color.setRGB(WAYGOLD[0], WAYGOLD[1], WAYGOLD[2]); bm.material.opacity = 0.075 + Math.sin(t * 2.4) * 0.02;
    }
    for (const d in cur.doors) {
      const o = cur.doors[d], locked = !!room.locked;
      o.barrier.visible = o.glyph.visible = locked; o.strip.visible = !locked;
      if (locked) o.bm.opacity = 0.13 + Math.sin(t * 6) * 0.04; else o.sm.opacity = 0.16 + Math.sin(t * 3) * 0.08;
    }
    for (let i = 0; i < cur.sprites.length; i++) { const sp = cur.sprites[i]; sp.material.rotation = 0; sp.scale.x = sp.scale.y = sp.userData.s0 || (sp.userData.s0 = sp.scale.x); sp.scale.multiplyScalar(1 + Math.sin(t * 9 + i * 2.1) * 0.05); sp.scale.z = 1; }
    for (let i = 0; i < MAX_LIGHTS; i++) if (cur.lights[i]) roomLights[i].intensity = (G.PAPER ? 0.35 : 1.05) + Math.sin(t * 9 + i * 2.1) * 0.03;
    // 云海
    for (const s of mists) { const u = s.userData; u.a += u.sp * 0.016; s.position.set(room.w / 2 + Math.cos(u.a) * (u.r + room.w * 0.35), u.y, room.h / 2 + Math.sin(u.a) * (u.r * 0.6 + room.h * 0.35)); }
    { const lc = rgb(th.lamp); // 烛火：每支一个跳动的光点，每簇一团暖晕
      for (let i = 0; i < cur.flames.length; i++) {
        const f = cur.flames[i], fl = Math.sin(t * 17 + i * 2.3) * 0.5 + Math.sin(t * 29 + i) * 0.5;
        if (f[4]) { // 出口的火盆：禁制未解时是熄的，只剩一点余烬；解开后点燃，通往没去过的地方的烧得更旺、火星升得更高
          if (room.locked) { glows.push(f[0], f[1], f[2], FLAME, 0.3, 0.07); continue; }
          const fresh = !room.doors[f[4]].to.visited, sz = f[3] * (fresh ? 1.3 : 0.8);
          glows.push(f[0], f[1] + fl * 0.01, f[2], FLAME, 0.85, sz * (1 + fl * 0.16)); glows.push(f[0], f[1] + 0.18 + fl * 0.03, f[2], FLAME, 0.5, sz * 0.6);
          for (let j = 0, n = fresh ? 6 : 2; j < n; j++) { const k = (t * 0.45 + j / n + i * 0.17) % 1; glows.push(f[0] + Math.sin(t * 2 + j * 2.1) * 0.12, f[1] + 0.2 + k * (fresh ? 3.2 : 1.4), f[2] + Math.cos(t * 1.7 + j) * 0.1, FLAME, 0.7 * (1 - k), 0.13); }
          continue;
        }
        glows.push(f[0], f[1] + fl * 0.008, f[2], FLAME, 0.8, (f[3] || 0.085) * (1 + fl * 0.16)); if (f[3]) glows.push(f[0], f[1] + 0.16 + fl * 0.03, f[2], FLAME, 0.5, f[3] * 0.6); }
      for (let i = 0; i < cur.candles.length; i++) { const cd = cur.candles[i]; if (cd[2] && room.locked) continue; glows.push(cd[0], 0.3, cd[1], lc, 0.13 + Math.sin(t * 9 + i * 1.7) * 0.025, 1.9); } }
    seas[0].material.map.offset.set(t * 0.0016, t * 0.0007); seas[1].material.map.offset.set(-t * 0.004, t * 0.0022);
    cshadow.material.map.offset.set(t * 0.006, t * 0.0035);
    shafts.forEach((m, i) => { if (m.visible) m.material.opacity = m.userData.o * (0.75 + Math.sin(t * 0.6 + i * 1.9) * 0.25); });
    wisps.forEach((s, i) => { const u = s.userData, k = (t * u.v + u.ph) % 1; s.position.set(-2 + k * (room.w + 4), 0.45 + (i % 2) * 0.35, i < 3 ? 1.6 + i * 0.5 : room.h - 2 - (i - 3) * 0.6); s.material.opacity = 0.085 * Math.sin(k * PI); });
    // 氛围微粒
    const kind = th.mote, w = room.w, h = room.h, wind = G.Game.guide && G.Game.guide.wx !== undefined ? G.Game.guide : null; // 风向：朝要去的方向
    for (const m of motes) {
      let c, a = 0.6, size = 0.12;
      if (kind === 'firefly' && m.ph < 2.3) { // 落英：花瓣是凡尘之物，不发光
        m.y -= 0.0015 * m.v; m.x += Math.sin(t * 0.7 + m.ph * 3) * 0.0007; if (m.y < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); }
        if (wind) { m.x += (wind.wx * 0.06) / (w + 4); m.z += (wind.wy * 0.06) / (h + 4); if (m.x < 0) m.x += 1; else if (m.x > 1) m.x -= 1; if (m.z < 0) m.z += 1; else if (m.z > 1) m.z -= 1; }
        dusts.push(m.x * (w + 4) - 2, 0.15 + m.y * 3.2, m.z * (h + 4) - 2, rgb('224,230,234'), 0.6, 0.07); continue; // 白梅的落瓣
      }
      if (kind === 'firefly') { m.x += Math.sin(t * 0.5 * m.v + m.ph) * 0.0006; m.z += Math.cos(t * 0.4 * m.v + m.ph * 2) * 0.0006; a = 0.18 + Math.sin(t * 2 * m.v + m.ph) * 0.16; c = rgb('232,234,204'); size = 0.12; }
      else if (kind === 'spore') { m.y += 0.0018 * m.v; if (m.y > 1) { m.y = 0; m.x = Math.random(); m.z = Math.random(); } c = rgb('214,196,186'); a = 0.3; } // 孢子是淡的：红色只留给敌人
      else if (kind === 'ash') { m.y -= 0.0022 * m.v; if (m.y < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); } c = rgb('150,145,160'); a = 0.36; }
      else { m.y -= 0.004 * m.v; m.x -= 0.0008 * m.v; if (m.y < 0 || m.x < 0) { m.y = 1; m.x = Math.random(); m.z = Math.random(); } c = rgb('230,240,250'); a = 0.5; size = 0.09; }
      if (wind) { m.x += (wind.wx * 0.045) / (w + 4); m.z += (wind.wy * 0.045) / (h + 4); if (m.x < 0) m.x += 1; else if (m.x > 1) m.x -= 1; if (m.z < 0) m.z += 1; else if (m.z > 1) m.z -= 1; }
      if (a > 0.02) glows.push(m.x * (w + 4) - 2, 0.2 + m.y * 3.4, m.z * (h + 4) - 2, c, a, size);
    }
  }

  /* ============================ 每帧同步：动态物体 ============================ */
  function place(o, x, y, z) { o.position.set(x * S, (z || 0) * S, y * S); }
  /* 地面高度（世界单位）。有台地的房间里，所有动态的东西都要按脚下的高度抬起来：
     - dyn 里的物体（角色、池子里的网格、交互物）在 liftDyn 里统一抬；
     - 光点、拖尾、屏幕投影在各自的入口处抬；实例化的弹幕在 liftDyn 里改矩阵。
     这样几十处"在某处画个东西"的代码都不用知道有高差这回事 */
  function hRoom(room, x, z) {
    const hc = room && room.hc; if (!hc || x < 0 || z < 0 || x >= room.w || z >= room.h) return 0;
    const ix = x | 0, iz = z | 0, fx = x - ix, fz = z - iz, w1 = room.w + 1, i = iz * w1 + ix, a = hc[i], b = hc[i + 1], c = hc[i + w1], d = hc[i + w1 + 1];
    return a || b || c || d ? (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz : 0;
  }
  const hW = (x, z) => (curRoom && curRoom.hc ? hRoom(curRoom, x, z) : 0);
  // 高度图：给贴地图形的着色器用。没有台地的房间用一张 1×1 的零图
  const zeroTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); zeroTex.needsUpdate = true;
  const HU = { map: { value: zeroTex }, size: { value: new THREE.Vector2(1, 1) } };
  function heightTex(room) {
    const w1 = room.w + 1, h1 = room.h + 1, d = new Uint8Array(w1 * h1 * 4);
    for (let i = 0; i < w1 * h1; i++) { d[i * 4] = Math.round(Math.min(1, room.hc[i]) * 255); d[i * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, w1, h1); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  }
  function liftDyn() {
    const on = !!(curRoom && curRoom.hc);
    for (const o of dyn.children) {
      const u = o.userData;
      if (u.ly !== undefined) { if (o.position.y === u.ly) o.position.y -= u.lh; u.ly = undefined; } // 上一帧抬过、之后没人重设位置：先还原
      if (!on || !o.visible || u.drape) continue; // 贴地图形自己在着色器里按地形起伏
      const k = hRoom(curRoom, o.position.x, o.position.z);
      if (k) { o.position.y += k; u.ly = o.position.y; u.lh = k; }
    }
    if (on) for (const m of [orbs, orbRims, shards, shardRims, fySw, bugs]) { const a = m.instanceMatrix.array; for (let i = 0, n = m.count; i < n; i++) { const q = i * 16; a[q + 13] += hRoom(curRoom, a[q + 12], a[q + 14]); } }
  }
  function flatAt(pool, x, y, r, c, op, yy, order) {
    const m = pool.get(); m.position.set(x * S, yy, y * S); m.scale.set(r * S, r * S, 1); m.material.color.copy(c.col); m.material.opacity = op; m.renderOrder = order || 2; return m;
  }
  function bandAt(x1, y1, x2, y2, w, c, op, yy, order) {
    const m = P.band.get(), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    m.position.set(((x1 + x2) / 2) * S, yy, ((y1 + y2) / 2) * S); m.rotation.set(-PI / 2, -Math.atan2(dy, dx), 0); m.scale.set(len * S, w * S, 1);
    m.material.color.copy(c.col); m.material.opacity = op; m.material.blending = THREE.NormalBlending; m.renderOrder = order || 2; return m;
  }

  /* 隐式的引导（没有小地图、箭头或带路的角色）：
     · 流光 —— 一缕光点顺着小径往目标飘，金色是去路，红色是敌人；
     · 煞气 —— 还有埋伏的空地上，一股黑烟夹着红色火星往上冒，隔着林子也看得见 */
  const MIASMA = [0.035, 0.015, 0.03], EMBER = [0.95, 0.2, 0.16], WAYGOLD = [1, 0.88, 0.56], WAYRED = [1, 0.34, 0.2];
  function syncGuide(Gm, room, t) {
    if (room.zones && room.locked) for (const z of room.zones) {
      if (z.done) continue;
      // 一股黑烟夹着红色的火星往上冒：黑烟在哪一章的底色上都看得见
      flatAt(P.circ, z.x * T, z.y * T, 54, rgb('10,4,8'), 0.2 + Math.sin(t * 2.2) * 0.05, 0.02, 2);
      for (let i = 0; i < 18; i++) { const k = (t * 0.26 + i / 18) % 1, a = i * 2.4 + t * 0.6, r = 0.5 * (1 - k * 0.3) + Math.sin(k * 9 + i) * 0.12; dusts.push(z.x + Math.cos(a) * r, 0.12 + k * 4.4, z.y + Math.sin(a) * r, MIASMA, 0.62 * (1 - k * 0.85), 0.17 + k * 0.3); } // 一缕细烟，不是一团团黑斑
      for (let i = 0; i < 5; i++) { const k = (t * 0.5 + i / 5) % 1, a = i * 1.9 + t; glows.push(z.x + Math.cos(a) * 0.7, 0.2 + k * 3.4, z.y + Math.sin(a) * 0.7, EMBER, 0.85 * (1 - k), 0.13); }
      glows.push(z.x, 0.3, z.y, EMBER, 0.14 + Math.sin(t * 3) * 0.04, 2.6);
    }
    const g = Gm.guide; if (!g || !g.on || !g.motes || Gm.state !== 'play') return;
    const col = g.foe ? WAYRED : WAYGOLD;
    for (const m of g.motes) {
      if (!(m.life > 0)) continue;
      const k = m.life / m.max, a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 5), y = 0.3 + Math.sin(m.life * 4 + m.ph) * 0.1 + (1 - k) * 0.3;
      glows.push(m.x * S, y, m.y * S, col, 0.85 * a, 0.12); glows.push(m.x * S, y, m.y * S, col, 0.2 * a, 0.5);
    }
  }

  /* 战斗留痕：0 血（暗绛，比预警的朱砂暗得多、也不闪）/ 1 鬼物的墨 / 2 碎屑 */
  const STAIN = [['26,22,26', 0.4], ['16,14,24', 0.44], ['30,28,26', 0.38]]; // 地上的痕迹是淡墨，不是血红：红色只留给还活着的敌人
  function syncStains(Gm, room) {
    const L = room.stains; if (!L) return;
    for (const st of L) {
      const k = Math.min(1, (Gm.stats.time - st.t) / 0.22), S0 = STAIN[st.kind], m = P['stain' + st.v].get(), r = st.r * (0.5 + 0.5 * k) * 2.3;
      m.position.set(st.x * S, 0.014, st.y * S); m.scale.set(r * S, r * S, 1); m.rotation.z = st.rot; m.material.color.copy(rgb(S0[0]).col); m.material.opacity = S0[1] * k; m.renderOrder = 1;
    }
  }

  function syncHazards(Gm, t) {
    for (const h of Gm.haz) {
      // c 是招式本身的颜色（流派色）；wc 是预警色：敌方一律朱砂
      const foe = h.from === 1, c = rgb(foe ? ZHU : h.c), wc = c; // 敌方的一切——预警也好、招式本身也好——都是朱砂色；我方的才按流派着色
      if (h.type === 'zone') { syncZone(h, c, t); continue; }
      if (h.type === 'circle' || h.type === 'lob') {
        const k = Math.min(1, h.t / (h.type === 'lob' ? h.dur : h.delay));
        if (h.kind === 'giant') { // 巨剑术：阵图 + 光柱 + 自天而降的巨剑
          const m = P.arr.get(); m.position.set(h.x * S, 0.045, h.y * S); m.scale.set(h.r * S, h.r * S, 1); m.rotation.z = t * 2.2; m.material.color.copy(c.col); m.material.opacity = 0.35 + k * 0.6; m.renderOrder = 5;
          flatAt(P.circ, h.x, h.y, Math.max(1, h.r * k), c, 0.16, 0.025, 3);
          if (FXT) for (let i = 1; i <= 2; i++) { // 半空里再叠两层阵图，一层比一层小、反着转；巨剑穿过哪一层，哪一层就亮一下
            const m2 = P.arr.get(), hy = i * 1.5, rr = h.r * S * (1 - i * 0.27), pass = (520 * (1 - k * k)) * S < hy ? 1 : 0;
            m2.position.set(h.x * S, 0.045 + hy, h.y * S); m2.scale.set(rr, rr, 1); m2.rotation.z = (i % 2 ? -1 : 1) * t * (2.4 + i); m2.material.color.copy(c.col); m2.material.opacity = Math.min(1, 0.22 + k * 0.4 + pass * 0.5); m2.renderOrder = 6;
          }
          const b = P.beam.get(); b.position.set(h.x * S, 4, h.y * S); b.rotation.set(0, t * 3, 0); b.scale.set(0.2 + k * 0.5, 8, 0.2 + k * 0.5); b.material.color.copy(c.col); b.material.opacity = 0.1 + k * 0.22;
          const gsw = P.giant.get(); place(gsw, h.x, h.y, 520 * (1 - k * k)); gsw.rotation.y = t * 1.5;
          for (const mt of gsw.userData.mats) mt.opacity = mt.userData.o0 * (0.3 + k * 0.7);
          glows.push(gsw.position.x, gsw.position.y + 1.4, gsw.position.z, c, 0.5, 4);
          if (FXT) { const zp = 520 * (1 - k * k);
            for (let i = 0; i < 3; i++) { const z0 = zp + 30 + Math.random() * 170, dx = U.rand(-26, 26); boltQuad([h.x + dx, h.y, z0], [h.x + dx + U.rand(-34, 34), h.y + U.rand(-8, 8), z0 + U.rand(-70, 70)], GOLD_COL, 0.85, 0.32, i % 2 ? 1 : -1); }
            for (let i = 0; i < 7; i++) { const a2 = i * 0.9 + t * 2.2, rr = (1 - ((t * 1.4 + i * 0.143) % 1)) * 120; glows.push((h.x + Math.cos(a2) * rr) * S, (zp + 40 + i * 26) * S, (h.y + Math.sin(a2) * rr) * S, c, 0.75, 0.45); } }
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
        if (FXT) { const m = flatAt(P.warn, h.x, h.y, h.r / 0.93, wc, 0.5 + k * 0.5, 0.032, 4); m.rotation.z = t * 0.9 + h.x * 0.01; } // 卡通画风：一圈带齿的预警纹，越近落下越亮
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
          if (FXT) { // 卡通画风：一道流光，不是一块板
            lightLine(h.x1, h.y1, h.x2, h.y2, h.w * (0.55 + f * 0.45), c, Math.min(1, f * 1.6), 20, foe ? c.col : h.kind === 'rift' ? c.col : null);
          } else {
          bandAt(h.x1, h.y1, h.x2, h.y2, h.w, c, 0.55 + f * 0.3, 0.02, 2);
          const b = P.beam.get(), dx = h.x2 - h.x1, dy = h.y2 - h.y1, len = Math.hypot(dx, dy);
          b.position.set(((h.x1 + h.x2) / 2) * S, 0.45, ((h.y1 + h.y2) / 2) * S); b.rotation.set(0, -Math.atan2(dy, dx), 0);
          b.scale.set(len * S, 0.9, h.w * S * 0.8); b.material.color.copy(c.col); b.material.opacity = 0.3 + f * 0.25;
          }
          if (h.kind === 'rift') bandAt(h.x1, h.y1, h.x2, h.y2, h.w * 0.45, rgb('8,4,20'), 0.92 * f, 0.03, 5);          // 空间裂缝：漆黑的缝
          if (h.kind === 'xuantian' && !FXT) bandAt(h.x1, h.y1, h.x2, h.y2, h.w * 0.3, rgb('255,255,255'), 0.9 * f, 0.03, 5); // 玄天剑光：白炽的芯
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
          if (FXT) lightLine(o.x, o.y, x2, y2, h.w * (0.9 + Math.sin(t * 40) * 0.1), c, f, 16, foe ? c.col : null);
          else for (let i = 0; i < 2; i++) {
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
  const MIASMA_C = [0.3, 0.42, 0.1];
  const WUXING = ['255,240,200', '110,255,170', '110,160,255', '255,120,60', '208,168,88']; // 金 木 水 火 土
  function syncZone(h, c, t) {
    const f = Math.min(1, h.t / 0.35) * Math.min(1, h.life / 0.4), grow = 0.25 + 0.75 * Math.min(1, h.t / 0.35), r = h.r * grow;
    const arr = (rr, rot, col, op, pool) => { const m = (pool || P.arr).get(); m.position.set(h.x * S, 0.045, h.y * S); m.scale.set(rr * S, rr * S, 1); m.rotation.z = rot; m.material.color.copy(col.col); m.material.opacity = op; m.renderOrder = 5; };
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
      arr(r, t * 0.6, c, (FXT ? 0.85 : 0.6) * f, P.bagua); flatAt(P.ring, h.x, h.y, r, c, 0.6 * f, 0.035, 4); flatAt(P.circ, h.x, h.y, r, c, 0.05 * f, 0.02, 2);
      for (let i = 0; i < 5; i++) {
        const a = t * 0.8 + (i / 5) * TAU, ec = rgb(WUXING[i]), x = h.x + Math.cos(a) * r * 0.82, y = h.y + Math.sin(a) * r * 0.82;
        flatAt(P.circ, x, y, 9, ec, 0.5 * f, 0.03, 4);
        glows.push(x * S, 0.3 + Math.sin(t * 3 + i) * 0.08, y * S, ec, 0.8 * f, 1.1); glows.push(x * S, 0.9, y * S, ec, 0.3 * f, 0.6);
      }
    } else if (h.kind === 'miasma') { // 毒瘴：一片翻滚的黄绿雾气，边上一圈淡淡的线
      flatAt(P.circ, h.x, h.y, r, c, 0.1 * f, 0.02, 2); flatAt(P.ring, h.x, h.y, r, c, 0.4 * f, 0.035, 4);
      const n = Math.min(14, 6 + Math.round(h.r / 26)); // 雾要淡：瘴里的敌人和预警都得看得清
      for (let i = 0; i < n; i++) {
        const a = i * 2.4 + t * (0.25 + (i % 3) * 0.12), rr = r * (0.2 + ((i * 37) % 80) / 100), x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
        glows.push(x * S, 0.25 + ((i * 13) % 5) * 0.1 + Math.sin(t * 1.7 + i) * 0.08, y * S, c, 0.11 * f, 1.3 + (i % 4) * 0.4);
        if (FXT && i < 8) smokes.push(x * S, 0.22 + (i % 3) * 0.14, y * S, MIASMA_C, 0.1 * f, 1.5 + (i % 4) * 0.5, i % 4, t * 0.3 * (i % 2 ? 1 : -1) + i); // 贴地翻滚的毒雾
      }
      if (FXT) for (let j = 0; j < 2; j++) { const m = flatAt(P.swirl, h.x, h.y, r * (j ? 0.72 : 1.08), c, (j ? 0.17 : 0.13) * f, 0.03 + j * 0.004, 4); m.rotation.z = t * (j ? -0.9 : 0.5) + j * 2; } // 两层反着转的漩涡
    } else if (h.kind === 'tulao') { // 一圈石柱拔地而起
      const k = Math.min(1, h.t / 0.14) * Math.min(1, h.life / 0.25);
      flatAt(P.ring, h.x, h.y, h.r, c, 0.6 * f, 0.035, 4); flatAt(P.circ, h.x, h.y, h.r, c, 0.08 * f, 0.02, 2);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU, m = P.rock.get(), hh = 1.0 + (i % 3) * 0.16;
        if (m.userData.rockH) { const sy = hh * 1.3; m.position.set((h.x + Math.cos(a) * h.r) * S, sy * (k - 1), (h.y + Math.sin(a) * h.r) * S); m.rotation.set(0, a + i, 0); m.scale.set(0.27, sy, 0.25); if (h.t < 0.3 && i % 3 === 0) dusts.push(m.position.x, 0.1, m.position.z, rgb('150,128,96'), 0.6, 0.5); } // 卡通画风：拔地而起的山石
        else { m.position.set((h.x + Math.cos(a) * h.r) * S, hh * (k - 0.5), (h.y + Math.sin(a) * h.r) * S); m.rotation.set(0, a + i, 0); m.scale.set(0.42, hh, 0.36); }
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
      const foe = pr.from === 1, c = rgb(foe ? ZHU : pr.c || '255,255,255'), x = pr.x * S, y = pr.z * S, z = pr.y * S, a = Math.atan2(pr.vy, pr.vx), r = pr.r * S, ry = PI / 2 - a; // 敌方弹幕不分流派，一律朱砂
      if (pr.kind === 'sword') { // 飞剑：按功法进境换形，带拖尾
        const s = (pr.mini ? P.mini : pr.style === 2 ? P.sw2 : pr.style === 1 ? P.sw1 : P.sw0).get(); s.position.set(x, y, z); s.rotation.set(0, ry, 0);
        glows.push(x, y, z, c, pr.style ? 0.5 : 0.32, pr.mini ? 0.7 : 1.0);
        trail(pr, x, y, z, c, pr.mini ? 0.05 : pr.style ? 0.1 : 0.07, pr.style ? 0.95 : 0.55);
        if (G.DH && !pr.mini) trail(pr, x, y, z, rgb('255,255,255'), pr.style ? 0.03 : 0.022, pr.style ? 0.9 : 0.6); // 卡通画风：剑光中间一线白炽的芯
        if (pr.style === 2 && !pr.mini && FXT && ((pr.t * 30 + pr.x * 0.3) | 0) % 5 === 0) { const a2 = a + U.rand(-0.7, 0.7), l2 = U.rand(16, 30); boltQuad([pr.x - Math.cos(a) * 12, pr.y - Math.sin(a) * 12, pr.z + U.rand(-4, 6)], [pr.x + Math.cos(a2) * l2, pr.y + Math.sin(a2) * l2, pr.z + U.rand(-6, 10)], GOLD_COL, 0.9, 0.36, Math.random() < 0.5 ? 1 : -1); } // 辟邪神雷：淡金的电芒
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
        if ((pr.kind === 'fire' || pr.kind === 'flame' || pr.kind === 'ghostfire') && fires !== NOFX) for (let i = 0; i < 3; i++) { const bk = i * 0.9; fires.push(x - Math.cos(a) * r * bk, y + (i ? 0.03 * i : 0), z - Math.sin(a) * r * bk, c, foe ? 0.8 - i * 0.2 : 1 - i * 0.25, r * (big ? 4.4 : 3) * (1 - i * 0.18), (((pr.t || 0) * 14 + i) | 0) % 4, (pr.t || 0) * (i % 2 ? 5 : -4) + i * 2); } // 一团翻卷的火
        if (big || pr.kind === 'spirit' || pr.kind === 'flame') trail(pr, x, y, z, c, r * (big ? 1.3 : 0.9), big ? 0.8 : 0.6);
        else if (pr.kind === 'ghostfire' || pr.kind === 'skullp') glows.push(x - Math.cos(a) * r * 2.4, y, z - Math.sin(a) * r * 2.4, c, 0.3, r * 3.4);
      }
    }
    orbs.count = orbRims.count = no; shards.count = shardRims.count = ns; fySw.count = nf; bugs.count = nb;
    for (const m of [orbs, orbRims, shards, shardRims, fySw, bugs]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  const WHITE = new THREE.Color(0xffffff), GOLD = [1, 0.92, 0.5], WHITE3 = [1, 1, 1], FLAME = [1, 0.62, 0.22];

  const GOLD_COL = new THREE.Color(1, 0.9, 0.55);
  const WHITE_C = [1, 1, 1], SMOKE_C = [0.1, 0.09, 0.085], bA = new THREE.Vector3(), bB = new THREE.Vector3(), bS = new THREE.Vector3(), bV = new THREE.Vector3();
  // 一条正对镜头的带子，从 A 拉到 B（游戏坐标 [x, y, z]）；wk 是宽度占长度的几成
  function boltQuad(A, B, col, op, wk, flip, pool, hw) { // pool：贴哪张图（默认电光）；hw：直接给半宽（格），不按长度算
    const m = (pool || P.boltq).get(), P3 = m.geometry.attributes.position;
    bA.set(A[0] * S, A[2] * S + hW(A[0] * S, A[1] * S), A[1] * S); bB.set(B[0] * S, B[2] * S + hW(B[0] * S, B[1] * S), B[1] * S);
    camera.getWorldDirection(bV); bS.subVectors(bB, bA); const len = bS.length(); bS.cross(bV).normalize().multiplyScalar((hw || Math.min(1.3, Math.max(0.22, len * wk))) * flip);
    P3.setXYZ(0, bA.x - bS.x, bA.y - bS.y, bA.z - bS.z); P3.setXYZ(1, bB.x - bS.x, bB.y - bS.y, bB.z - bS.z); P3.setXYZ(2, bB.x + bS.x, bB.y + bS.y, bB.z + bS.z); P3.setXYZ(3, bA.x + bS.x, bA.y + bS.y, bA.z + bS.z);
    P3.needsUpdate = true; m.material.color.copy(col); m.material.opacity = op;
  }
  function lightLine(x1, y1, x2, y2, w, c, f, z, core) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, hw = Math.max(0.26, w * S * 0.46), cc = core || WHITE;
    for (const [ax, ay, bx, by] of [[mx, my, x2, y2], [mx, my, x1, y1]]) { // 从中间往两头各拉一条，亮头朝外
      boltQuad([ax, ay, z], [bx, by, z], c.col, 0.6 * f, 0, 1, P.beamq, hw); boltQuad([ax, ay, z], [bx, by, z], cc, 0.85 * f, 0, 1, P.beamq, hw * 0.3);
      const m = P.streakF.get(), dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      m.position.set(((ax + bx) / 2) * S, 0.03, ((ay + by) / 2) * S); m.rotation.set(-PI / 2, -Math.atan2(dy, dx), 0); m.scale.set(len * S, w * S * 1.5, 1); m.material.color.copy(c.col); m.material.opacity = 0.5 * f; m.renderOrder = 4;
    }
    const n = Math.min(14, Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 70)));
    for (let i = 0; i <= n; i++) { const u = i / n; glows.push(U.lerp(x1, x2, u) * S, z * S, U.lerp(y1, y2, u) * S, c, 0.13 * f, w * S * 1.9); }
  }
  function syncFx(t) {
    for (const p of G.FX.parts) {
      const k = p.life / p.max;
      if (p.kind === 'dot') {
        const c = rgb(p.c), size = p.size * S * (0.5 + k * 0.7) * (p.add ? 3.2 : 2.2);
        (p.add ? glows : dusts).push(p.x * S, p.z * S + 0.03, p.y * S, c, Math.min(1, k * 1.6) * (p.add ? 0.9 : 0.8), size);
      } else if (p.kind === 'ring') {
        const r = U.lerp(p.r1, p.r0, k), c = rgb(p.c);
        if (FXT) { const m = P.shock.get(), sc = Math.max(0.02, (r * S) / 0.8); m.position.set(p.x * S, 0.06, p.y * S); m.scale.set(sc, sc, 1); m.rotation.z = p.x * 0.13 + p.y * 0.07; m.material.color.copy(c.col); m.material.opacity = Math.min(1, k * 1.5); m.renderOrder = 6; } // 卡通画风：带着散逸光丝的冲击波
        else { const m = P.fxring.get(); m.position.set(p.x * S, 0.06, p.y * S); m.scale.set(Math.max(0.02, r * S), Math.max(0.02, r * S), 1); m.material.color.copy(c.col); m.material.opacity = k * 0.9; m.renderOrder = 6; }
      } else if (p.kind === 'boom') { // 爆炸：一闪、一团火、几缕烟
        const q = 1 - k, c = rgb(p.foe ? ZHU : p.c), R = p.r * S, cx = p.x * S, cz = p.y * S, by = p.z * S, sd = p.seed, hv = (i) => { const n = Math.sin(sd * 12.9898 + i * 78.233) * 43758.5453; return n - Math.floor(n); };
        if (q < 0.3) sparks.push(cx, by + 0.3, cz, WHITE_C, 1 - q / 0.3, R * (1.6 + q * 5), 0, sd);
        const nf = p.zap ? 0 : Math.min(9, 4 + Math.round(p.r / 22));
        if (p.zap && k > 0.35) for (let i = 0; i < 4; i++) { const a = sd + i * 1.57 + hv(i) * 0.8, L = p.r * (0.7 + hv(i + 2) * 0.7); boltQuad([p.x, p.y, 4], [p.x + Math.cos(a) * L, p.y + Math.sin(a) * L, 2 + hv(i + 4) * 14], c.col, (k - 0.35) * 1.5, 0.3, i % 2 ? 1 : -1); }
        for (let i = 0; i < nf; i++) {
          const a = sd + i * 2.4, d = R * 0.5 * Math.sqrt(q) * (0.25 + hv(i) * 0.9), sz = R * (0.75 + q * 1.1) * (0.55 + hv(i + 9) * 0.6);
          fires.push(cx + Math.cos(a) * d, by + 0.18 + q * (0.35 + hv(i + 3) * 0.6), cz + Math.sin(a) * d, c, Math.pow(k, 1.4), sz, i % 4, sd * (i + 1) + q * (hv(i + 5) - 0.5) * 3);
        }
        if (p.smoke && q > 0.18) for (let i = 0; i < 4; i++) {
          const a = sd * 2 + i * 1.7, u = (q - 0.18) / 0.82, d = R * 0.35 * (0.3 + hv(i + 20));
          smokes.push(cx + Math.cos(a) * d, by + 0.3 + u * (0.7 + hv(i + 23) * 0.6), cz + Math.sin(a) * d, SMOKE_C, 0.42 * Math.sin(Math.min(1, u * 1.15) * PI), R * (0.8 + u * 1.3), i % 4, sd + i + u * 0.8);
        }
        glows.push(cx, by + 0.3, cz, c, 0.5 * k * k, R * 5);
      } else if (p.kind === 'scorch') { // 炸过的地方：焦黑的裂纹，起初缝里还有余烬
        if (FXT) {
          const R = p.r, a = Math.min(1, k * 3) * 0.78, m = P.crackD.get(); m.position.set(p.x * S, 0.03, p.y * S); m.scale.set(R * S, R * S, 1); m.rotation.z = p.seed; m.material.opacity = a; m.renderOrder = 2;
          const e = (k - 0.72) / 0.28; if (e > 0) { const g2 = P.crackG.get(), c = rgb(p.foe ? ZHU : p.c); g2.position.set(p.x * S, 0.035, p.y * S); g2.scale.set(R * S, R * S, 1); g2.rotation.z = p.seed; g2.material.color.copy(c.col); g2.material.opacity = e * 0.9; g2.renderOrder = 3; }
        }
      } else if (p.kind === 'spark') { // 命中的星芒
        const c = rgb(p.c), q = 1 - k;
        sparks.push(p.x * S, p.z * S + 0.05, p.y * S, c, Math.min(1, k * 2), p.size * S * (1.6 + q * 2.4), 0, p.rot);
      } else if (p.kind === 'slash' && FXT) { // 剑气：一弯月牙顺着出手的方向扫过去
        const c = rgb(p.c), q = 1 - k, m = P.slash.get(), sz = p.r * S * 2 * (0.95 + q * 0.25) * (0.85 + Math.min(2.4, p.arc || 1.3) * 0.12), a = p.ang + (q - 0.5) * 0.7;
        m.position.set((p.x + Math.cos(a) * p.r * 0.34) * S, p.z * S + 0.1, (p.y + Math.sin(a) * p.r * 0.34) * S); m.rotation.set(-PI / 2, 0, -a); m.scale.set(sz, sz, 1);
        m.material.color.copy(c.col).lerp(WHITE, 0.35); m.material.opacity = Math.min(1, k * 2.2);
      } else if (p.kind === 'bolt' && FXT) { // 闪电：贴图的电光，每隔一两帧翻一下，像在抖
        const c = rgb(p.c), A = p.pts[0], B = p.pts[p.pts.length - 1], flip = (((t * 28) | 0) + ((p.x * 7) | 0)) & 1 ? 1 : -1;
        boltQuad(A, B, c.col, Math.min(1, k * 1.6), 0.17, flip); boltQuad(A, B, WHITE, Math.min(1, k * 1.3) * 0.7, 0.085, -flip);
        glows.push(p.x * S, p.z * S + 0.15, p.y * S, c, 0.9 * k, 2.4);
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
      if (!m) { m = Mo.forEnemy(e); if (!m.world && !m.gl) m.g.scale.multiplyScalar(ACTOR); dyn.add(m.g); actors.set(e, m); if (!NO_INK[e.def.draw]) inkActor(m, 'foe'); }
      m.seen = frame;
      if (!m.world) { m.g.position.set(e.x * S, e.z * S, e.y * S); m.g.rotation.y = PI / 2 - e.face; }
      m.update(e);
      m.setFlash(e.flash);
      let alpha = e.st === 'spawn' ? U.clamp(1 - e.stT / 0.25, 0, 1) : e.alpha === undefined ? 1 : e.alpha;
      if (e.invT > 0) alpha *= 0.6 + Math.sin(t * 30) * 0.3;
      m.setAlpha(alpha); m.g.visible = alpha > 0.03;
      if (e.elite) { const gc = rgb('255,200,80'); flatAt(P.ring, e.x, e.y, e.r * 1.6, gc, 0.6 + Math.sin(t * 5) * 0.2, 0.03, 4); flatAt(P.circ, e.x, e.y, e.r * 1.6, gc, 0.12, 0.02, 2); }
      if (G.DH && alpha > 0.3 && !NO_INK[e.def.draw]) glows.push(e.x * S, (e.z || 0) * S + 0.42, e.y * S, rgb(ZHU), 0.2 + Math.sin(t * 2.3 + e.x * 0.05) * 0.04, e.r * S * 5.2); // 卡通画风：身上腾着一团淡淡的朱红煞气
      if (alpha > 0.3) flatAt(P.ring, e.x, e.y, e.r * 1.12 + 3, rgb(ZHU), G.PAPER ? 0.8 : 0.55, 0.03, 3); // 脚下一圈朱红：和主角脚下那圈青色对应，一眼分清敌我（鬼物、火灵这些不描边的也靠它）
      if (e.slowT > 0) flatAt(P.ring, e.x, e.y, e.r * 1.25, rgb('140,220,255'), 0.7, 0.035, 4);
      if (e.psn > 0) { const pc = rgb('154,200,50'); flatAt(P.circ, e.x, e.y, e.r * 1.15, pc, 0.1 + Math.min(0.2, e.psn * 0.02), 0.028, 3); if (((t * 9 + e.t * 3) | 0) % 3 === 0) glows.push(e.x * S + U.rand(-0.2, 0.2), e.z * S + U.rand(0.2, 0.9), e.y * S + U.rand(-0.15, 0.15), pc, 0.6, 0.5); } // 中毒：脚下一摊毒绿，身上冒泡
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
      if (heroOwner !== p) { if (heroM) { dyn.remove(heroM.g); heroM.dispose(); } heroM = (Mo.toon && Mo.toon('hero')) || Mo.hero(p.look); if (!heroM.gl) heroM.g.scale.multiplyScalar(ACTOR); heroS0 = heroM.g.scale.x; inkActor(heroM); dyn.add(heroM.g); heroOwner = p; }
      heroM.g.scale.setScalar(heroS0 * (p.apeT > 0 ? 1.3 * Math.min(1, 0.8 + (p.apeT > 0.3 ? 0.2 : 0)) : 1)); // 惊蛰十二变：身形暴涨
      heroM.g.visible = !p.dead && !(p.inv > 0 && p.dashing <= 0 && Math.floor(t * 20) % 2 === 0);
      place(heroM.g, p.x, p.y, 0); heroM.g.rotation.y = PI / 2 - p.face;
      heroM.update({ t: p.t, moving: p.moving, atk: p.atkAnim, dashing: p.dashing > 0 });
      heroM.setFlash(p.flash);
      pLight.position.set(p.x * S, 1.9, p.y * S + 0.7);
      if (!p.dead) flatAt(P.ring, p.x, p.y, 17, rgb(QING), G.PAPER ? 0.75 : 0.4, 0.03, 4);
      if (p.fy && p.sp >= 100 && !p.dead) { flatAt(P.ring, p.x, p.y, 24 + Math.sin(t * 6) * 3, rgb('200,255,120'), 0.7, 0.035, 5); glows.push(p.x * S, 0.5, p.y * S, rgb('200,255,120'), 0.22, 2.4); }
      const tier = p.fy ? 2 : p.qy ? 1 : 0, swPool = P['sw' + tier], swC = rgb(p.du ? '186,226,84' : tier === 2 ? '170,255,110' : tier === 1 ? '110,255,170' : '150,255,220'); // 淬了毒的飞剑拖一道黄绿的光
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
      if (!m) { m = (Mo.toon && Mo.toon('pet_' + pt.id)) || Mo.pet(pt.id); if (!m.gl) m.g.scale.multiplyScalar(ACTOR); dyn.add(m.g); petM.set(pt, m); inkActor(m); }
      m.seen = frame; m.g.visible = !(pt.hide > 0);
      const fly = pt.z ? pt.z + Math.sin(t * 3 + pt.slot) * 4 : 0;
      place(m.g, pt.x, pt.y, fly); m.g.rotation.y = PI / 2 - pt.face;
      m.update({ t: pt.t, moving: pt.moving || !!pt.z, atk: pt.atk, charge: pt.charge, wind: pt.atk > 0.5 ? 1 : 0 });
      if (pt.hide > 0) continue;
      const pc = rgb(E_PET_C[pt.id] || '127,224,192'), x = pt.x * S, z = pt.y * S;
      flatAt(P.ring, pt.x, pt.y, 11, rgb(QING), G.PAPER ? 0.7 : 0.4, 0.03, 4); // 与主角脚下同色的环：这是自己人
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
      if (!m) { m = Mo.puppet({ body: '#d9b06a', dark: '#7a5a2a', eye: '#7dffea' }, { scale: 0.92 * ACTOR }); dyn.add(m.g); allyM.set(a, m); inkActor(m); }
      m.seen = frame; place(m.g, a.x, a.y, 0); m.g.rotation.y = PI / 2 - a.face; m.update({ t: a.t, moving: false, atk: Math.max(0, a.atk || 0) });
    }
    for (const [a, m] of allyM) if (m.seen !== frame) { dyn.remove(m.g); m.dispose(); allyM.delete(a); }

    // 交互物
    const th = G.Themes[room.theme];
    for (const it of room.interact) {
      let m = inters.get(it);
      if (!m) {
        m = it.kind === 'chest' ? Mo.chest() : it.kind === 'garden' ? Mo.herbField() : it.kind === 'event' ? Mo.shrine() : it.kind === 'shop' ? Mo.shop() : Mo.portal(th.lampHex);
        place(m.g, it.x, it.y, 0); dyn.add(m.g); inters.set(it, m); if (it.kind !== 'portal') inkActor(m, 'gold'); // 宝匣、药园、石碑、摊子描一圈金：能交互
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
  const HGT = { human: 57, brute: 68, wolf: 32, bat: 18, toad: 28, centipede: 24, flower: 50, ghost: 54, skull: 20, crystal: 50, flame: 44, puppet: 50, jiao: 70 };

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
        if (FXT && (q.kind === 'bolt' || q.kind === 'slash')) continue; // 卡通画风：闪电与剑气在三维里用贴图画
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
    if (world && p && room.theme !== undefined) { // 黑暗里的一圈光：离主角越远越暗
      const dk = Math.min(0.86, G.Themes[room.theme].dark * (room.terrain === 'cave' ? 1.35 : 1)), s = proj(p.x, p.y, 24), g = c.createRadialGradient(s.x, s.y, H * 0.3, s.x, s.y, Math.max(W, H) * 0.8);
      const dc = G.PAPER ? '84,62,36' : '2,4,10';
      g.addColorStop(0, `rgba(${dc},0)`); g.addColorStop(0.5, `rgba(${dc},${dk * 0.5})`); g.addColorStop(1, `rgba(${dc},${dk})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.55; c.drawImage(vignette, 0, 0, W, H); c.globalAlpha = 1;
    } else c.drawImage(vignette, 0, 0, W, H);
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

  function beginPools() { for (const k in P) P[k].begin(); glows.n = 0; dusts.n = 0; fires.n = 0; smokes.n = 0; sparks.n = 0; trQ = 0; fyN = 0; }
  function endPools() {
    for (const k in P) P[k].end(); glows.end(); dusts.end(); fires.end(); smokes.end(); sparks.end();
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
    syncStains(Gm, room);
    syncHazards(Gm, t);
    syncActors(Gm, room, p, t);
    syncGuide(Gm, room, t);
    syncProjs(Gm, t);
    syncFx(t);
    endPools();
    liftDyn();
    present(dt, true);
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
    if (!menuHero && G.Assets.settled) { menuHero = (Mo.toon && Mo.toon('hero', { scale: ACTOR })) || Mo.hero({ robe: '#3f8f86', trim: '#d9f2e6', skin: '#f2d2b0', hat: 'player', backSword: true, weapon: 'none' }); inkActor(menuHero); scene.add(menuHero.g); }
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
    const a = Math.sin(t * 0.13) * 0.55 + 0.25, wide = W / H < 1 ? 1.7 : 1, d = 12.5 * wide, low = G.DH ? 1 : 0; // 卡通画风：镜头压低、略仰，看得见天、云与一根根石峰
    camera.position.set(cx + Math.sin(a) * d, (low ? 3.5 : 5.6) * wide, cz + Math.cos(a) * d);
    camera.lookAt(cx - 2.2 * Math.cos(a) * (W / H > 1.2 ? 1 : 0), low ? 2.5 : 1.6, cz);
    camera.updateMatrixWorld();
    present(dt, false);
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
