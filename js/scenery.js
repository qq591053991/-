'use strict';
/* 凡人问道 —— 场景造型：山石、松与花树、石灯、青铜环门、立轴。
   造型语言只有三条，所有场景物件共用：
   1. 削面 —— 块体不做圆滑，每个面都是一刀切出来的；
   2. 自下而上由暗到亮 —— 颜色烘在顶点上，一块石头自带光影；
   3. 朝上的面有"盖" —— 苔、落叶、灰、雪，随章节而变。一块石头就是一座山。 */
(function () {
  const G = window.G, U = G.U, TAU = G.TAU, PI = Math.PI, Mo = G.Models;
  const GEO = {}, gg = (k, f) => GEO[k] || (GEO[k] = f());
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0), D = new V3();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });
  const vcol = () => new THREE.MeshLambertMaterial({ vertexColors: true });

  // 四章的石、盖、木、叶、花
  const PAL = (Mo.PAL = [
    // capK：顶面有几成覆着"盖"。苔与枯苔只是零星几片，雪盖得满
    { rock: '#99a2ad', dark: '#353c48', cap: '#4c7650', cap2: '#648f5c', capK: 0.38, trunk: '#4b392e', leaf: '#629c62', leafD: '#214a36', bloom: '#f2ccd8', bloomD: '#b9708f' }, // 青石、苔、松、桃
    { rock: '#93766a', dark: '#2e1e1c', cap: '#5c5a38', cap2: '#77703f', capK: 0.3, trunk: '#231818', leaf: '#8c3038', leafD: '#38101a', bloom: '#c87060', bloomD: '#7c2832' },  // 赭石、枯苔、血枫
    { rock: '#6c6a84', dark: '#222030', cap: '#3a3848', cap2: '#48465a', capK: 0.5, trunk: '#1e1c24', leaf: '#4c485a', leafD: '#22202a', bloom: '#9affc0', bloomD: '#2a7a50' },  // 玄石、灰
    { rock: '#9ab2c8', dark: '#3f5678', cap: '#e6f1fa', cap2: '#ffffff', capK: 0.85, trunk: '#3c4a60', leaf: '#d4ecfa', leafD: '#6490b6', bloom: '#eef8ff', bloomD: '#9ccaea' }, // 寒石、雪
  ]);

  const n3 = (x, y, z, s) => U.hash(Math.round(x * 997) + s * 57, Math.round(y * 991) + Math.round(z * 983) * 3, s);

  /* 削面块体：二十面体细分一次，顶点沿径向伸缩（位置相同的顶点结果相同，面不会裂开），压平顶与底 */
  function lump(key, seed, o) {
    return gg(key, () => {
      const g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const n = 1 - o.rough / 2 + n3(x, y, z, seed) * o.rough;
        x *= n; y *= n; z *= n;
        if (y > o.top) y = o.top + (y - o.top) * o.flat;
        if (y < -o.bot) y = -o.bot + (y + o.bot) * 0.25;
        P.setXYZ(i, x, y * o.sy, z);
      }
      g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
      g.computeVertexNormals(); g.computeBoundingBox(); // 非索引几何体：每个面一个法线，即削面
      const N = g.attributes.normal, H = g.boundingBox.max.y, col = new Float32Array(P.count * 3), t = new THREE.Color();
      const a = new THREE.Color(o.dark), b = new THREE.Color(o.lite), c1 = new THREE.Color(o.cap || o.lite), c2 = new THREE.Color(o.cap2 || o.cap || o.lite);
      for (let f = 0; f < P.count; f += 3) {
        const ny = N.getY(f), cy = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3, cx = P.getX(f), cz = P.getZ(f);
        if (o.capAt !== undefined && ny > o.capAt && n3(cx * 0.5, 0, cz * 0.5, 5) < o.capK) t.copy(c1).lerp(c2, n3(cx, cy, cz, 7));
        else if (o.byNormal) t.copy(a).lerp(b, U.clamp(ny * 0.55 + 0.5, 0, 1)).multiplyScalar(0.92 + n3(cx, cy, cz, 9) * 0.16);
        else { t.copy(a).lerp(b, Math.min(1, 0.08 + (cy / H) * 0.98)).multiplyScalar(0.9 + n3(cx, cy, cz, 9) * 0.2); if (o.capAt !== undefined && ny > 0.4 && cy > H * 0.6 && n3(cx, 1, cz, 6) < o.capK) t.lerp(c1, 0.3); }
        for (let k = 0; k < 3; k++) { col[(f + k) * 3] = t.r; col[(f + k) * 3 + 1] = t.g; col[(f + k) * 3 + 2] = t.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.userData.h = H;
      return g;
    });
  }
  // 山石（四种形状 × 四章配色）；g.userData.h 是它的高
  const rockGeo = (Mo.rockGeo = (vr, ti) => { const p = PAL[ti]; return lump(`rk${vr}_${ti}`, vr * 17 + ti + 1, { rough: 0.58, top: 0.34, flat: 0.38, bot: 0.3, sy: 1, dark: p.dark, lite: p.rock, cap: p.cap, cap2: p.cap2, capAt: 0.66, capK: p.capK }); });
  // 叶团：松是扁的云片，花树是圆的团
  const padGeo = (vr, ti, kind) => { const p = PAL[ti], bl = kind === 'bloom'; return lump(`pad${vr % 3}_${ti}_${kind}`, (vr % 3) * 29 + ti + 3, { rough: 0.36, top: 0.5, flat: 0.7, bot: 0.22, sy: kind === 'pine' ? 0.5 : 0.8, dark: bl ? p.bloomD : p.leafD, lite: bl ? p.bloom : p.leaf, byNormal: true }); };

  function stick(parent, a, b, r, mat) { // 一截上细下粗的枝干，从 a 到 b
    const m = new THREE.Mesh(gg('stk', () => new THREE.CylinderGeometry(0.38, 0.5, 1, 6)), mat);
    D.subVectors(b, a); const len = D.length();
    m.position.copy(a).addScaledVector(D, 0.5); m.quaternion.setFromUnitVectors(UP, D.normalize()); m.scale.set(r * 2, len * 1.06, r * 2); m.castShadow = true;
    parent.add(m); return m;
  }

  /* 一丛山石 */
  Mo.crag = function (v, ti, s = 1) {
    const g = new THREE.Group(), m = vcol(), h = (i) => U.hash(v * 11 + i, i * 5 + 1, ti + 9);
    const put = (x, z, sc, sy, vr) => { const r = new THREE.Mesh(rockGeo(vr % 4, ti), m); r.position.set(x, -0.03, z); r.scale.set(sc, sc * sy, sc * (0.8 + h(vr + 3) * 0.35)); r.rotation.y = h(vr + 7) * TAU; r.castShadow = r.receiveShadow = true; g.add(r); };
    put(0, 0, 0.42 * s, 0.85 + h(1) * 0.6, v);
    put(0.3 * s, 0.17 * s, 0.24 * s, 0.75 + h(2) * 0.4, v + 1);
    put(-0.27 * s, 0.2 * s, 0.18 * s, 0.7, v + 2);
    if (h(3) < 0.55) put(-0.1 * s, -0.27 * s, 0.2 * s, 1.25, v + 3);
    return { g, mats: [m], anim: null };
  };

  /* 树：主干是几截渐细的枝干连成的一条歪线，侧枝末端各托一团叶。
     kind：pine 松（扁云片）/ round 阔叶 / bloom 花树 */
  Mo.tree = function (v, ti, kind = 'pine', scale = 1) {
    const pal = PAL[ti], g = new THREE.Group(), h = (i) => U.hash(v * 13 + i, i * 7 + 3, ti + 5), pine = kind === 'pine';
    const bark = lam(pal.trunk), leaf = vcol();
    const H = (pine ? 1.85 : 1.55) * (0.85 + h(1) * 0.35), segs = 4, pts = [new V3(0, 0, 0)], lean = (pine ? 0.36 : 0.2) * (H / segs);
    let a = h(2) * TAU, x = 0, z = 0;
    for (let i = 1; i <= segs; i++) { a += (h(3 + i) - 0.5) * 2.4; x += Math.cos(a) * lean; z += Math.sin(a) * lean; pts.push(new V3(x, (i / segs) * H, z)); }
    for (let i = 0; i < segs; i++) stick(g, pts[i], pts[i + 1], 0.135 * (1 - i * 0.17), bark);
    for (let i = 0; i < 3; i++) { const ra = h(20 + i) * TAU; stick(g, new V3(Math.cos(ra) * 0.3, -0.03, Math.sin(ra) * 0.3), new V3(0, 0.22, 0), 0.06, bark); } // 露出地面的根
    const pad = (c, s, vr) => { const m = new THREE.Mesh(padGeo(vr, ti, kind), leaf); m.position.copy(c); m.scale.set(s, s * 0.95, s * (0.8 + h(vr + 30) * 0.3)); m.rotation.y = h(vr + 40) * TAU; m.castShadow = true; g.add(m); };
    const top = pts[segs]; pad(new V3(top.x, top.y - 0.02, top.z), pine ? 0.64 : 0.5, 0);
    const nB = pine ? 4 : 5;
    for (let j = 0; j < nB; j++) {
      const t = 0.42 + (j / nB) * 0.52, k = Math.min(segs - 1, Math.floor(t * segs)), base = pts[k].clone().lerp(pts[k + 1], t * segs - k);
      const ba = h(50 + j) * TAU + j * 2.4, bl = (pine ? 0.66 : 0.42) * (1.12 - t * 0.5) * (0.8 + h(60 + j) * 0.5);
      const end = new V3(base.x + Math.cos(ba) * bl, base.y + (pine ? 0.05 : 0.26), base.z + Math.sin(ba) * bl);
      stick(g, base, end, 0.045, bark);
      pad(new V3(end.x, end.y + 0.02, end.z), (pine ? 0.52 : 0.36) * (1.12 - t * 0.38), j + 1);
    }
    g.scale.setScalar(scale);
    return { g, mats: [bark, leaf], anim: null };
  };

  /* 石灯笼：六角座、收腰的柱、灯室、四角起翘的顶、宝珠 */
  Mo.stoneLantern = function (v, ti) {
    const g = new THREE.Group(), st = lam(ti === 3 ? '#a8bccd' : ti === 1 ? '#8a7468' : '#8d939b'), dk = lam(ti === 3 ? '#6c84a0' : '#585e68'), cap = lam(PAL[ti].cap), lit = new THREE.MeshBasicMaterial({ color: 0xffdc8a });
    const hex = gg('hex6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6)), waist = gg('waist', () => new THREE.CylinderGeometry(0.34, 0.5, 1, 6)), box = Mo.geo.box(), pyr = Mo.geo.cone(4);
    const add = (geo, m, y, sx, sy, sz, ry) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); if (ry) o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
    add(hex, dk, 0.06, 0.56, 0.12); add(hex, st, 0.16, 0.42, 0.08);
    add(waist, st, 0.36, 0.24, 0.34); add(hex, st, 0.56, 0.5, 0.07); add(hex, dk, 0.61, 0.42, 0.04);
    add(box, lit, 0.76, 0.25, 0.25).castShadow = false;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = add(box, st, 0.76, 0.055, 0.27); p.position.x = sx * 0.14; p.position.z = sz * 0.14; }
    add(pyr, dk, 1.02, 0.86, 0.26, 0.86, PI / 4); add(hex, st, 0.9, 0.5, 0.035);
    for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2, t = add(pyr, dk, 0.95, 0.1, 0.2); t.position.x = Math.cos(a) * 0.45; t.position.z = Math.sin(a) * 0.45; t.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); } // 起翘的角
    add(Mo.geo.sph(8), st, 1.19, 0.11);
    if (ti !== 2) { const m = add(Mo.geo.sph(8), cap, 1.0, 0.3, 0.08, 0.24); m.position.x = 0.14; m.position.z = 0.1; } // 顶上的一片苔 / 雪
    g.rotation.y = U.hash(v, 3, ti) * 0.6;
    return { g, mats: [st, dk, cap, lit], anim: null };
  };

  /* 青铜环门：立在北门上的半环，环身满布云雷纹，两脚落在山石上 */
  const ARCH = [
    { base: '#2c5650', hi: '#4c887e', line: '#dcbe6c' }, // 绿锈青铜 + 旧金
    { base: '#463028', hi: '#6c4a3c', line: '#cfae7c' }, // 沁色古铜
    { base: '#2e2c3a', hi: '#4a4862', line: '#93bea4' }, // 玄铁
    { base: '#b89444', hi: '#ecd28a', line: '#fff4c8' }, // 鎏金
  ];
  function archCanvas(ti) {
    const A = ARCH[ti], cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
    const c = cv.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, A.hi); gr.addColorStop(0.5, A.base); gr.addColorStop(1, A.hi); c.fillStyle = gr; c.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + U.hash(i, 3, ti) * 0.12})`; c.fillRect(U.hash(i, 5, ti) * 512, U.hash(i, 7, ti) * 64, 6 + U.hash(i, 9, ti) * 22, 2 + U.hash(i, 11, ti) * 5); } // 锈斑
    c.fillStyle = A.line; c.globalAlpha = 0.9; c.fillRect(0, 0, 512, 4); c.fillRect(0, 60, 512, 4); c.fillRect(0, 29, 512, 6);
    c.strokeStyle = A.line; c.lineWidth = 2.2; c.lineJoin = 'miter'; c.globalAlpha = 0.85;
    for (const cy of [16.5, 47.5]) for (let i = 0; i < 16; i++) { // 云雷纹：一正一反的回字
      const cx = i * 32 + 16, q = 9.5, f = i % 2 ? -1 : 1;
      c.beginPath(); c.moveTo(cx - q * f, cy + q); c.lineTo(cx - q * f, cy - q); c.lineTo(cx + q * f, cy - q); c.lineTo(cx + q * f, cy + q * 0.5); c.lineTo(cx - q * 0.42 * f, cy + q * 0.5); c.lineTo(cx - q * 0.42 * f, cy - q * 0.4); c.lineTo(cx + q * 0.4 * f, cy - q * 0.4); c.stroke();
    }
    return cv;
  }
  Mo.archGate = function (ti) {
    const tex = new THREE.CanvasTexture(archCanvas(ti)); tex.encoding = THREE.sRGBEncoding; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ map: tex }), st = vcol();
    const ring = new THREE.Mesh(gg('arch', () => new THREE.TorusGeometry(1.76, 0.23, 6, 32, PI)), m); ring.position.y = 0.34; ring.castShadow = true; g.add(ring);
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(rockGeo(sx > 0 ? 1 : 2, ti), st); r.position.set(sx * 1.76, -0.03, 0); r.scale.set(0.5, 0.7, 0.44); r.rotation.y = sx; r.castShadow = true; g.add(r); }
    return { g, mats: [m, st], tex: [tex] };
  };

  /* 立轴：挂在北墙上的一幅山水，随风轻摆。画是程序画的：纸、远山三重、云气、一轮日、一方印 */
  function scrollCanvas(ti, seed) {
    const cold = ti === 3, cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const c = cv.getContext('2d'), hh = (i) => U.hash(seed, i, 71);
    c.fillStyle = cold ? '#24384e' : '#27423f'; c.fillRect(0, 0, 128, 256);                    // 绫边
    c.fillStyle = cold ? '#dfe9f1' : '#e9dfc6'; c.fillRect(10, 24, 108, 208);                  // 画心
    const gr = c.createLinearGradient(0, 24, 0, 232); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(120,100,70,0.18)'); c.fillStyle = gr; c.fillRect(10, 24, 108, 208);
    c.fillStyle = cold ? '#e8c860' : '#c8443a'; c.beginPath(); c.arc(86 - hh(1) * 40, 58 + hh(2) * 14, 8, 0, TAU); c.fill(); // 日
    c.save(); c.beginPath(); c.rect(10, 24, 108, 208); c.clip();
    const ink = cold ? '40,70,110' : '50,74,78';
    for (let L = 0; L < 3; L++) { // 远山三重，越近越浓
      const base = 120 + L * 42, amp = 46 - L * 8;
      c.fillStyle = `rgba(${ink},${0.28 + L * 0.24})`; c.beginPath(); c.moveTo(10, 232);
      for (let x = 10; x <= 118; x += 9) { const k = (x - 10) / 9; c.lineTo(x, base - Math.abs(Math.sin(k * (0.7 + hh(10 + L) * 0.8) + hh(20 + L) * 6)) * amp - hh(30 + L * 13 + k) * 10); }
      c.lineTo(118, 232); c.closePath(); c.fill();
      const mg = c.createLinearGradient(0, base - 6, 0, base + 30); mg.addColorStop(0, 'rgba(255,255,255,0)'); mg.addColorStop(1, cold ? 'rgba(223,233,241,0.85)' : 'rgba(233,223,198,0.85)');
      c.fillStyle = mg; c.fillRect(10, base - 6, 108, 36);                                      // 山腰的云气
    }
    c.restore();
    c.fillStyle = '#b8342c'; c.fillRect(16, 212, 11, 11); c.fillStyle = 'rgba(255,240,220,0.8)'; c.fillRect(19, 215, 5, 5); // 印
    c.fillStyle = cold ? '#e8c860' : '#c9ab62'; c.fillRect(0, 20, 128, 2); c.fillRect(0, 234, 128, 2);
    return cv;
  }
  Mo.scroll = function (ti, seed) {
    const tex = new THREE.CanvasTexture(scrollCanvas(ti, seed)); tex.encoding = THREE.sRGBEncoding;
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), wood = lam('#3a2a22');
    const p = new THREE.Mesh(gg('scrollp', () => new THREE.PlaneGeometry(0.62, 1.2)), m); p.position.set(0, -0.64, 0.02); g.add(p);
    for (const [y, r, l] of [[-0.03, 0.045, 0.78], [-1.25, 0.06, 0.74]]) { const rod = new THREE.Mesh(Mo.geo.cyl(0.5, 0.5, 6), wood); rod.rotation.z = PI / 2; rod.scale.set(r, l, r); rod.position.set(0, y, 0.02); rod.castShadow = true; g.add(rod); }
    return { g, mats: [m, wood], tex: [tex], anim: (t) => { g.rotation.x = Math.sin(t * 1.3 + seed) * 0.035; g.rotation.z = Math.sin(t * 0.9 + seed * 2) * 0.012; } };
  };

  /* ============================ 建筑构件 ============================
     瓦顶、立柱、栏杆、角楼、扶壁。所有构件都加进同一个组，由渲染层合并成一个网格。 */
  const gableGeo = () => gg('gable', () => { // 人字坡屋顶：宽 1（X）、进深 1（Z）、高 1，屋脊沿 X
    const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], Dv = [-0.5, 0, 0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([Dv, C, F, Dv, F, E, B, A, E, B, E, F, A, Dv, E, C, B, F, A, B, C, A, C, Dv].flat(), 3));
    g.computeVertexNormals(); return g;
  });
  const KIT = [
    { tile: '#353c4a', ridge: '#566174', wood: '#5a3d2c', stone: '#8f959d', dark: '#5b616b', gold: '#b99a58' },  // 黛瓦、朱木、青石
    { tile: '#3a2a26', ridge: '#54403a', wood: '#2a1c1a', stone: '#8a7468', dark: '#4a3832', gold: '#b08a60' },
    { tile: '#2b2934', ridge: '#474456', wood: '#262230', stone: '#5c5a6a', dark: '#3a3846', gold: '#6f9a84' },  // 玄瓦、黑铁、城砖
    { tile: '#8ea4b4', ridge: '#d9b45a', wood: '#d2e0ec', stone: '#b4c6d6', dark: '#7e96ae', gold: '#d9b45a' },  // 寒玉、鎏金
  ];
  Mo.archKit = function (root, ti) {
    const K = KIT[ti], mats = {}, M = (n) => mats[n] || (mats[n] = lam(K[n]));
    const box = Mo.geo.box(), gable = gableGeo(), pyr = Mo.geo.cone(4), con = Mo.geo.cone(6);
    const col8 = gg('col8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), hex = gg('hex6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
    const put = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; root.add(m); return m; };
    const kit = {
      mats: () => Object.values(mats),
      /* 沿 X 的瓦顶：屋脊从 x0 到 x0+len，z 是屋脊所在，y 是檐口高度 */
      roofX(x0, len, z, y, depth, hgt) {
        const cx = x0 + len / 2, sl = Math.hypot(hgt, depth / 2), ang = Math.atan2(hgt, depth / 2);
        put(gable, M('tile'), cx, y, z, len + 0.5, hgt, depth);
        put(box, M('ridge'), cx, y + hgt + 0.03, z, len + 0.34, 0.11, 0.17);                       // 正脊
        put(box, M('ridge'), cx, y + 0.035, z + depth / 2 - 0.03, len + 0.5, 0.07, 0.1);           // 檐口
        for (let x = x0 - 0.1; x <= x0 + len + 0.1; x += 0.34) put(box, M('ridge'), x, y + hgt / 2 + 0.035, z + depth / 4, 0.07, 0.05, sl).rotation.x = ang; // 瓦垄
        for (const e of [-1, 1]) {
          put(con, M('ridge'), cx + e * (len / 2 + 0.24), y + hgt + 0.16, z, 0.16, 0.42, 0.16).rotation.z = -e * 0.75;                 // 鸱吻
          const t = put(con, M('ridge'), cx + e * (len / 2 + 0.3), y + 0.1, z + depth / 2 - 0.02, 0.12, 0.34, 0.12); t.rotation.z = -e * 1.0; t.rotation.x = 0.5; // 翘起的檐角
        }
      },
      /* 沿 Z 的墙帽：院墙上的一道小瓦顶 */
      roofZ(x, z0, len, y, width, hgt) {
        const m = put(gable, M('tile'), x, y, z0 + len / 2, len + 0.16, hgt, width); m.rotation.y = PI / 2;
        put(box, M('ridge'), x, y + hgt + 0.02, z0 + len / 2, 0.13, 0.09, len + 0.1);
        for (let z = z0 + 0.17; z < z0 + len; z += 0.5) for (const e of [-1, 1]) { const r = put(box, M('ridge'), x + e * width / 4, y + hgt / 2 + 0.03, z, Math.hypot(hgt, width / 2), 0.04, 0.06); r.rotation.z = -e * Math.atan2(hgt, width / 2); }
      },
      /* 立柱：柱础、柱身、柱头；rings 为真时柱身上箍两道金环 */
      column(x, z, hgt, r, rings) {
        put(hex, M('stone'), x, 0.06, z, r * 3.2, 0.12, r * 3.2);
        put(col8, M('wood'), x, hgt / 2, z, r * 2, hgt, r * 2);
        put(box, M(rings ? 'gold' : 'dark'), x, hgt - 0.05, z, r * 3.2, 0.1, r * 3.2);
        if (rings) for (const k of [0.16, 0.8]) put(col8, M('gold'), x, hgt * k, z, r * 2.35, 0.06, r * 2.35);
      },
      /* 栏杆：沿 X（alongX）或沿 Z 的一排望柱与寻杖 */
      balustrade(a0, len, c, alongX) {
        const P = (u, y, v, su, sy, sv) => (alongX ? put(box, M('stone'), u, y, v, su, sy, sv) : put(box, M('stone'), v, y, u, sv, sy, su));
        P(a0 + len / 2, 0.07, c, len, 0.14, 0.34);
        P(a0 + len / 2, 0.34, c, len, 0.05, 0.08); P(a0 + len / 2, 0.47, c, len, 0.06, 0.1);
        for (let u = a0; u <= a0 + len + 0.01; u += 1) {
          const px = alongX ? u : c, pz = alongX ? c : u;
          put(box, M('dark'), px, 0.31, pz, 0.16, 0.5, 0.16);
          put(pyr, M('gold'), px, 0.63, pz, 0.26, 0.14, 0.26).rotation.y = PI / 4;
          if (u + 0.5 < a0 + len) { const mx = alongX ? u + 0.5 : c, mz = alongX ? c : u + 0.5; put(box, M('stone'), mx, 0.24, mz, alongX ? 0.07 : 0.07, 0.2, 0.07); }
        }
      },
      /* 角楼：一截方墩，上面是四角攒尖顶 */
      tower(x, z, hgt, size) {
        put(box, M('stone'), x, hgt / 2, z, size, hgt, size);
        put(box, M('dark'), x, hgt + 0.04, z, size * 1.12, 0.08, size * 1.12);
        put(pyr, M('tile'), x, hgt + 0.08 + size * 0.3, z, size * 1.75, size * 0.6, size * 1.75).rotation.y = PI / 4;
        put(Mo.geo.sph(8), M('gold'), x, hgt + 0.1 + size * 0.62, z, size * 0.2, size * 0.2, size * 0.2);
        for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2, t = put(con, M('ridge'), x + Math.cos(a) * size * 0.84, hgt + 0.16, z + Math.sin(a) * size * 0.84, size * 0.13, size * 0.3, size * 0.13); t.rotation.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95); }
      },
      /* 扶壁：城墙外一道上窄下宽的斜撑 */
      buttress(x, z, hgt) {
        put(box, M('stone'), x, hgt * 0.36, z + 0.12, 0.5, hgt * 0.72, 0.34);
        put(box, M('dark'), x, hgt * 0.16, z + 0.3, 0.6, hgt * 0.32, 0.3);
        put(box, M('dark'), x, hgt * 0.74, z + 0.1, 0.56, 0.06, 0.4);
      },
      /* 垛口：城墙顶上的一排齿 */
      crenel(x, y, z, sx, sz) { put(box, M('stone'), x, y + 0.17, z, sx, 0.34, sz); },
    };
    return kit;
  };

  /* 接管几样场景物件：山石、松（偶尔是一树桃花）、血枫、石灯 */
  const prop0 = Mo.prop;
  Mo.prop = function (kind, v, ti) {
    if (kind === 'rock') return Mo.crag(v + ti * 5, ti);
    if (kind === 'pine') return Mo.tree(v * 3 + ti, ti, v === 2 ? 'bloom' : 'pine', 1.05);
    if (kind === 'deadtree') return Mo.tree(v * 3 + ti + 1, ti, 'round', 1.1);
    if (kind === 'lantern') return Mo.stoneLantern(v, ti);
    return prop0(kind, v, ti);
  };
})();
