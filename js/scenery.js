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
    // 青绿山水：山脚赭石（dark）→ 山头石绿（rock），朝天的面点石青（cap）；树是汁绿、石绿，花是淡粉。
    // 这些都是"辅色"：画面里最鲜的朱红只给敌人，金只给能交互的东西
    { rock: '#6c9c7c', dark: '#a8804e', cap: '#2f6f8e', cap2: '#3f8698', capK: 0.5, trunk: '#4a3626', leaf: '#4c8c6a', leafD: '#2a5444', bloom: '#f0d8d0', bloomD: '#c8a09c' }, // 七玄门：青绿
    { rock: '#94a074', dark: '#9c6c42', cap: '#6c7e5c', cap2: '#7c8a64', capK: 0.35, trunk: '#3a2a1e', leaf: '#a87a52', leafD: '#6a4a34', bloom: '#b88c64', bloomD: '#7a5a40' },  // 血色禁地：浅绛，赭色的枫（不艳：画面里最艳的红只给敌人）
    { rock: '#a29e92', dark: '#7a6a52', cap: '#6c766e', cap2: '#7c847a', capK: 0.35, trunk: '#2e2a24', leaf: '#6c6a5a', leafD: '#3c3a32', bloom: '#9a948a', bloomD: '#5c584e' },  // 燕翎堡：墨灰
    { rock: '#c8d6d8', dark: '#5a8494', cap: '#f6f6f0', cap2: '#ffffff', capK: 0.82, trunk: '#3c4a50', leaf: '#dce6e4', leafD: '#6a8a94', bloom: '#eef2f0', bloomD: '#a8bcc0' }, // 虚天殿：石青与雪
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
      g.computeVertexNormals(); g.computeBoundingBox();
      const N = g.attributes.normal, H = g.boundingBox.max.y, col = new Float32Array(P.count * 3), t = new THREE.Color();
      const a = new THREE.Color(o.dark), b = new THREE.Color(o.lite), c1 = new THREE.Color(o.cap || o.lite), c2 = new THREE.Color(o.cap2 || o.cap || o.lite);
      if (G.PAPER) {
        /* 绢本设色：不要削面。位置相同的顶点把法线取平均（光照是软的），颜色按顶点算（深浅是晕开的）——
           山脚赭石、山头石绿、朝天的面点石青，正是青绿山水"先赭后青绿"的染法 */
        const acc = new Map(), key2 = (i) => Math.round(P.getX(i) * 997) + ',' + Math.round(P.getY(i) * 997) + ',' + Math.round(P.getZ(i) * 997);
        for (let i = 0; i < P.count; i++) { const k = key2(i), v = acc.get(k) || [0, 0, 0]; v[0] += N.getX(i); v[1] += N.getY(i); v[2] += N.getZ(i); acc.set(k, v); }
        for (let i = 0; i < P.count; i++) { const v = acc.get(key2(i)), l = Math.hypot(v[0], v[1], v[2]) || 1; N.setXYZ(i, v[0] / l, v[1] / l, v[2] / l); }
        for (let i = 0; i < P.count; i++) {
          const ny = N.getY(i), x = P.getX(i), y = P.getY(i), z = P.getZ(i), nz = n3(x, y, z, 9);
          if (o.byNormal) t.copy(a).lerp(b, U.clamp(ny * 0.6 + 0.45, 0, 1));
          else t.copy(a).lerp(b, U.clamp(Math.pow(y / H, 0.8) * 1.15 - 0.05, 0, 1));
          if (o.capAt !== undefined) { const cw = U.clamp((ny - o.capAt + 0.3) / 0.4, 0, 1) * (n3(x * 0.6, 0, z * 0.6, 5) < o.capK ? 1 : 0.25); t.lerp(c1.clone().lerp(c2, n3(x, y, z, 7)), cw * 0.85); }
          t.multiplyScalar(0.94 + nz * 0.12);
          col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
        }
      } else for (let f = 0; f < P.count; f += 3) { // 非索引几何体：每个面一个法线，即削面
        const ny = N.getY(f), cy = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3, cx = P.getX(f), cz = P.getZ(f);
        if (o.capAt !== undefined && ny > o.capAt && n3(cx * 0.5, 0, cz * 0.5, 5) < o.capK) t.copy(c1).lerp(c2, n3(cx, cy, cz, 7));
        else if (o.byNormal) t.copy(a).lerp(b, U.clamp(ny * 0.55 + 0.5, 0, 1)).multiplyScalar(0.92 + n3(cx, cy, cz, 9) * 0.16);
        else { t.copy(a).lerp(b, Math.min(1, 0.08 + (cy / H) * 0.98)).multiplyScalar(0.9 + n3(cx, cy, cz, 9) * 0.2); if (o.capAt !== undefined && ny > 0.4 && cy > H * 0.6 && n3(cx, 1, cz, 6) < o.capK) t.lerp(c1, 0.3); }
        for (let k = 0; k < 3; k++) { col[(f + k) * 3] = t.r; col[(f + k) * 3 + 1] = t.g; col[(f + k) * 3 + 2] = t.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.userData.h = H; g.userData.brush = o.brush || 0; // 合并成静态网格后，着色器按它加笔触：1 皴（山石）、2 点叶（叶团）
      return g;
    });
  }

  // 山石（四种形状 × 四章配色）；g.userData.h 是它的高
  const rockGeo = (Mo.rockGeo = (vr, ti) => { const p = PAL[ti]; return lump(`rk${vr}_${ti}`, vr * 17 + ti + 1, { rough: 0.58, top: 0.34, flat: 0.38, bot: 0.3, sy: 1, dark: p.dark, lite: p.rock, cap: p.cap, cap2: p.cap2, capAt: 0.66, capK: p.capK, brush: 1 }); });
  // 叶团：松是扁的云片，花树是圆的团
  const padGeo = (vr, ti, kind) => { const p = PAL[ti], bl = kind === 'bloom'; return lump(`pad${vr % 3}_${ti}_${kind}`, (vr % 3) * 29 + ti + 3, { rough: 0.36, top: 0.5, flat: 0.7, bot: 0.22, sy: kind === 'pine' ? 0.5 : 0.8, dark: bl ? p.bloomD : p.leafD, lite: bl ? p.bloom : p.leaf, byNormal: true, brush: 2 }); };

  Mo.padGeo = padGeo;
  function stick(parent, a, b, r, mat) { // 一截上细下粗的枝干，从 a 到 b
    const m = new THREE.Mesh(gg('stk', () => { const q = new THREE.CylinderGeometry(0.38, 0.5, 1, 6, 1, true); q.userData.brush = 1; return q; }), mat); // 两端不封口：接缝被下一截或叶团盖住，省一半的面
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
  Mo.tree = function (v, ti, kind = 'pine', scale = 1, o = {}) { // o.lite：林子深处的树，省掉根与一半的枝；o.bark / o.leaf：整片林子共用的材质
    const pal = PAL[ti], g = new THREE.Group(), h = (i) => U.hash(v * 13 + i, i * 7 + 3, ti + 5), pine = kind === 'pine';
    const bark = o.bark || lam(pal.trunk), leaf = o.leaf || vcol();
    const H = (pine ? 1.85 : 1.55) * (0.85 + h(1) * 0.35), segs = o.lite ? 3 : 4, pts = [new V3(0, 0, 0)], lean = (pine ? 0.36 : 0.2) * (H / segs);
    let a = h(2) * TAU, x = 0, z = 0;
    for (let i = 1; i <= segs; i++) { a += (h(3 + i) - 0.5) * 2.4; x += Math.cos(a) * lean; z += Math.sin(a) * lean; pts.push(new V3(x, (i / segs) * H, z)); }
    for (let i = 0; i < segs; i++) stick(g, pts[i], pts[i + 1], 0.135 * (1 - i * 0.17), bark);
    if (!o.lite) for (let i = 0; i < 3; i++) { const ra = h(20 + i) * TAU; stick(g, new V3(Math.cos(ra) * 0.3, -0.03, Math.sin(ra) * 0.3), new V3(0, 0.22, 0), 0.06, bark); } // 露出地面的根
    const pad = (c, s, vr) => { const m = new THREE.Mesh(padGeo(vr, ti, kind), leaf); m.position.copy(c); m.scale.set(s, s * 0.95, s * (0.8 + h(vr + 30) * 0.3)); m.rotation.y = h(vr + 40) * TAU; m.castShadow = true; g.add(m); };
    const top = pts[segs]; pad(new V3(top.x, top.y - 0.02, top.z), pine ? 0.64 : 0.5, 0);
    const nB = o.lite ? 2 : pine ? 4 : 5;
    for (let j = 0; j < nB; j++) {
      const t = 0.42 + (j / nB) * 0.52, k = Math.min(segs - 1, Math.floor(t * segs)), base = pts[k].clone().lerp(pts[k + 1], t * segs - k);
      const ba = h(50 + j) * TAU + j * 2.4, bl = (pine ? 0.66 : 0.42) * (1.12 - t * 0.5) * (0.8 + h(60 + j) * 0.5);
      const end = new V3(base.x + Math.cos(ba) * bl, base.y + (pine ? 0.05 : 0.26), base.z + Math.sin(ba) * bl);
      stick(g, base, end, 0.045, bark);
      pad(new V3(end.x, end.y + 0.02, end.z), (pine ? 0.52 : 0.36) * (1.12 - t * 0.38), j + 1);
    }
    g.scale.setScalar(scale);
    return { g, mats: o.bark ? [] : [bark, leaf], anim: null };
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
    { base: '#5a8a90', hi: '#86b0b2', line: '#2c4448' }, // 石青
    { base: '#8a6a4c', hi: '#ac8a64', line: '#4a3424' }, // 赭
    { base: '#6c6860', hi: '#8c887e', line: '#34322c' }, // 墨灰
    { base: '#6c94a4', hi: '#a2c0c8', line: '#2c4a56' },
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
    { tile: '#2f5a6a', ridge: '#4a7480', wood: '#8e5a3c', stone: '#d8ccac', dark: '#9a8a6a', gold: '#a89a70' },  // 石青瓦、赭木、白墙下的青石
    { tile: '#6a4a36', ridge: '#8a6448', wood: '#7a5038', stone: '#c8b48e', dark: '#8a7254', gold: '#a08a62' },
    { tile: '#3a3834', ridge: '#58554e', wood: '#4a4038', stone: '#b8ae98', dark: '#7c7466', gold: '#9a9078' },  // 墨瓦、焦木、城砖
    { tile: '#7c9aa4', ridge: '#b8ccd0', wood: '#c8d4d6', stone: '#cfd4cc', dark: '#5c7c88', gold: '#a8a890' },  // 雪覆的瓦、玉柱
  ];
  Mo.archKit = function (root, ti) {
    const K = KIT[ti], mats = {}, M = (n) => mats[n] || (mats[n] = lam(K[n] || n)); // 名字不在色表里时，当作颜色直接用
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
      /* 栈桥：从 (x, z) 沿 (dx, dz) 伸出去的一道索桥 —— 木板、立柱、两道绳，中间微微下垂 */
      bridge(x, z, dx, dz, len) {
        const sag = (t) => -0.24 * Math.sin((PI * t) / len), lx = dz, lz = dx; // 横向
        for (let t = 0.18; t < len; t += 0.42) put(box, M(((t * 10) | 0) % 3 ? 'wood' : 'dark'), x + dx * t, sag(t) - 0.02, z + dz * t, dx ? 0.34 : 2.5, 0.07, dx ? 2.5 : 0.34);
        for (const s of [-1, 1]) {
          let prev = null;
          for (let t = 0; t <= len + 0.01; t += len / 4) {
            const px = x + dx * t + lx * s * 1.32, pz = z + dz * t + lz * s * 1.32, top = sag(t) + 0.62;
            put(box, M('dark'), px, top - 0.3, pz, 0.12, 0.66, 0.12);
            if (prev) for (const yy of [0, -0.26]) put(box, M('wood'), (px + prev[0]) / 2, (top + prev[1]) / 2 + yy, (pz + prev[2]) / 2, dx ? len / 4 : 0.05, 0.05, dx ? 0.05 : len / 4);
            prev = [px, top, pz];
          }
        }
      },
      /* 幡杆：一根高杆，顶上一截横木（幡布由渲染层挂上去，因为它要变色、要飘） */
      pole(x, z, hgt) { put(box, M('dark'), x, hgt / 2, z, 0.11, hgt, 0.11); put(box, M('wood'), x + 0.3, hgt - 0.08, z, 0.75, 0.07, 0.07); put(pyr, M('gold'), x, hgt + 0.1, z, 0.2, 0.22, 0.2); },
      /* 火盆：三足架上的一只铁盆。返回火苗的位置 */
      firebowl(x, z) {
        for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5, l = put(box, M('dark'), x + Math.cos(a) * 0.12, 0.26, z + Math.sin(a) * 0.12, 0.05, 0.56, 0.05); l.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32); }
        put(gg('bowl', () => new THREE.CylinderGeometry(0.5, 0.3, 1, 8)), M('dark'), x, 0.58, z, 0.52, 0.2, 0.52);
        put(hex, M('gold'), x, 0.69, z, 0.56, 0.04, 0.56);
        return [x, 0.84, z, 0.34];
      },
      /* 北墙墙面上的立体构件：漏窗、箭孔、鎏金框。墙面不再只是一张贴图 */
      lattice(x, y, z, r) { // 七玄门的漏窗：一圈木框、深色的窗洞、米字棂
        const d = put(gg('oct8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), M('#262a33'), x, y, z, r * 2, 0.05, r * 2); d.rotation.x = PI / 2; d.rotation.y = PI / 8; d.castShadow = false;
        put(Mo.geo.tor(0.06), M('wood'), x, y, z + 0.03, r * 2.12, r * 2.12, 1.3);
        put(box, M('wood'), x, y, z + 0.035, r * 2, 0.045, 0.04); put(box, M('wood'), x, y, z + 0.035, 0.045, r * 2, 0.04);
        for (const s of [-1, 1]) put(box, M('wood'), x, y, z + 0.03, r * 1.9, 0.03, 0.03).rotation.z = (s * PI) / 4;
      },
      slit(x, y, z) { // 燕翎堡的箭孔：一道竖缝，上下各压一块条石
        put(box, M('#15131c'), x, y, z, 0.13, 0.52, 0.05).castShadow = false;
        put(box, M('stone'), x, y + 0.31, z + 0.015, 0.34, 0.09, 0.09); put(box, M('stone'), x, y - 0.31, z + 0.015, 0.34, 0.09, 0.09);
      },
      panel(x, y, z, pw, ph) { // 虚天殿的玉墙：一方凸起的玉板，四边鎏金，板心一枚菱花
        put(box, M('wood'), x, y, z, pw - 0.1, ph - 0.1, 0.05);
        for (const s of [-1, 1]) { put(box, M('gold'), x, y + (s * ph) / 2, z + 0.02, pw, 0.05, 0.08); put(box, M('gold'), x + (s * pw) / 2, y, z + 0.02, 0.05, ph + 0.05, 0.08); }
        put(Mo.geo.oct(), M('gold'), x, y, z + 0.03, 0.34, 0.34, 0.07);
        for (const s of [-1, 1]) put(Mo.geo.oct(), M('gold'), x + s * pw * 0.3, y, z + 0.03, 0.14, 0.14, 0.05);
      },
      /* 石条：台阶、台基、水沿都用它 */
      slab(x, y, z, sx, sy, sz, m) { return put(box, M(m || 'stone'), x, y, z, sx, sy, sz); },
      /* 垛口：城墙顶上的一排齿 */
      crenel(x, y, z, sx, sz) { put(box, M('stone'), x, y + 0.17, z, sx, 0.34, sz); },
    };
    return kit;
  };

  /* 一簇蜡烛：高矮不一的几支，底下一摊蜡泪。烛身会被合并进静态网格，火苗的位置记在 flames 里，由渲染层画成光点 */
  const WAX = ['#d8d4c8', '#b8a89c', '#8a8498', '#cfdae4'];
  Mo.candles = function (v, ti) {
    const g = new THREE.Group(), wax = lam(WAX[ti]), flames = [], cyl = gg('hex6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6)), h = (i) => U.hash(v * 9 + i, i * 3 + 1, ti + 21);
    const n = 3 + Math.floor(h(0) * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + h(i + 1) * 2, r = i ? 0.1 + h(i + 6) * 0.1 : 0, hgt = 0.12 + h(i + 11) * 0.22, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const c = new THREE.Mesh(cyl, wax); c.position.set(x, hgt / 2, z); c.scale.set(0.07, hgt, 0.07); g.add(c);
      flames.push([x, hgt + 0.06, z]);
    }
    const pool = new THREE.Mesh(cyl, wax); pool.position.y = 0.012; pool.scale.set(0.42, 0.024, 0.36); g.add(pool);
    return { g, mats: [wax], flames };
  };

  /* 瓦砾：一丛碎石里夹着几块断砖 */
  Mo.rubble = function (v, ti) {
    const m = Mo.crag(v + 3, ti, 0.78), brick = lam(KIT[ti].stone), h = (i) => U.hash(v * 7 + i, i + 2, ti + 31);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(Mo.geo.box(), brick); b.position.set((h(i) - 0.5) * 0.8, 0.05 + h(i + 5) * 0.1, (h(i + 9) - 0.5) * 0.7); b.scale.set(0.24, 0.1, 0.13); b.rotation.set(h(i + 13) * 0.5, h(i + 17) * 3, h(i + 21) * 0.5); b.castShadow = true; m.g.add(b); }
    m.mats.push(brick); return m;
  };
  /* 残柱：一截断了的殿柱，柱身箍金环，断口参差；旁边倒着一节柱鼓 */
  Mo.brokenPillar = function (v, ti) {
    const g = new THREE.Group(), K = KIT[ti], st = lam(K.wood), dk = lam(K.dark), gd = lam(K.gold), cap = lam(PAL[ti].cap), h = (i) => U.hash(v * 5 + i, i + 1, ti + 41);
    const col = gg('col8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)), hex = gg('hex6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6)), H = 0.85 + h(1) * 0.75;
    const add = (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    add(hex, dk, 0, 0.07, 0, 0.62, 0.14, 0.62); add(col, st, 0, 0.14 + H / 2, 0, 0.36, H, 0.36);
    add(col, gd, 0, 0.3, 0, 0.42, 0.06, 0.42); add(col, gd, 0, 0.14 + H * 0.8, 0, 0.42, 0.06, 0.42);
    const top = add(rockGeo(v % 4, ti), cap, 0, 0.14 + H - 0.06, 0, 0.2, 0.22, 0.2); top.material = vcol(); // 断口：一块参差的石头
    const drum = add(col, st, 0.42, 0.16, 0.2 - h(2) * 0.4, 0.34, 0.34, 0.34); drum.rotation.set(Math.PI / 2, 0, h(3) * 3);
    return { g, mats: [st, dk, gd, cap, top.material], anim: null };
  };

  const HEX = () => gg('hex6', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
  const adder = (g) => (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); o.castShadow = true; g.add(o); return o; };

  /* 一丛竹：每竿三截、节上一圈深色的箍，越往上越向外弯；叶是一片片下垂的扁叶团 */
  Mo.bamboo = function (v, ti) {
    const g = new THREE.Group(), h = (i) => U.hash(v * 9 + i, i * 3 + 2, ti + 23), add = adder(g);
    const s1 = lam('#6a9a78'), s2 = lam('#558a6a'), nd = lam('#2e5444'), leaf = vcol(), rk = vcol(); // 竹：石绿
    const lg = (k) => lump('bleaf' + k, 71 + k * 13, { rough: 0.3, top: 0.4, flat: 0.5, bot: 0.3, sy: 0.3, dark: '#2e5a48', lite: '#7cb08e', byNormal: true, brush: 2 });
    const n = 5 + ((h(0) * 2) | 0);
    for (let i = 0; i < n; i++) {
      const a = h(i + 1) * TAU, r = 0.07 + h(i + 11) * 0.27, H = 1.45 + h(i + 21) * 1.0, bend = 0.1 + h(i + 31) * 0.26, mat = i % 2 ? s1 : s2;
      const at = (t) => new V3(Math.cos(a) * (r + bend * t * t), H * t, Math.sin(a) * (r + bend * t * t));
      const pts = [at(0), at(0.36), at(0.7), at(1)];
      for (let k = 0; k < 3; k++) {
        stick(g, pts[k], pts[k + 1], 0.046 - k * 0.009, mat);
        if (k) add(HEX(), nd, pts[k].x, pts[k].y, pts[k].z, 0.115 - k * 0.014, 0.03, 0.115 - k * 0.014).castShadow = false;
      }
      for (let k = 0; k < 3; k++) {
        const c = at(0.6 + k * 0.19), la = a + (k - 1) * 2.0 + (h(i * 3 + k + 40) - 0.5) * 1.4, s = 0.3 - k * 0.04;
        const m = add(lg((i + k) % 3), leaf, c.x + Math.cos(la) * 0.2, c.y - 0.05, c.z + Math.sin(la) * 0.2, s, s, s * 0.42);
        m.rotation.set(0, -la, -0.42 - h(i + k * 7 + 50) * 0.3);
      }
    }
    add(rockGeo(v % 4, ti), rk, 0.2, -0.03, 0.16, 0.2, 0.16, 0.17); add(rockGeo((v + 2) % 4, ti), rk, -0.24, -0.03, 0.1, 0.14, 0.11, 0.14);
    return { g, mats: [s1, s2, nd, leaf, rk], anim: null };
  };

  /* 灵菇：骨白的伞盖、伞底泛着暗紫，伞沿缀几点灵光。不用红——朱砂只留给敌人的预警 */
  Mo.shroom = function (v, ti) {
    const g = new THREE.Group(), h = (i) => U.hash(v * 7 + i, i * 5 + 4, ti + 31), add = adder(g);
    const stem = lam('#b8ac9c'), cap = vcol(), rim = lam('#4a3c5c'), dot = new THREE.MeshBasicMaterial({ color: 0x9fffe0 });
    const cg = (k) => lump('shcap' + k, 91 + k * 7, { rough: 0.24, top: 0.2, flat: 0.5, bot: 0.02, sy: 0.75, dark: '#6a5a78', lite: '#bfb3a4' }); // 伞顶骨白
    const one = (x, z, s, k) => {
      const lean = (h(k) - 0.5) * 0.26, tx = x + lean * s;
      stick(g, new V3(x, -0.02, z), new V3(tx, 0.44 * s, z), 0.062 * s, stem);
      const ry = h(k + 5) * TAU, c = add(cg(k % 3), cap, tx, 0.37 * s, z, 0.25 * s, 0.3 * s, 0.25 * s); c.rotation.y = ry;
      const sk = add(cg(k % 3), rim, tx, 0.34 * s, z, 0.31 * s, 0.17 * s, 0.31 * s); sk.rotation.y = ry; // 底下再垫一层大一圈的暗紫伞沿
      for (let i = 0; i < 4; i++) { // 伞面上的几点灵光
        const a = (i / 4) * TAU + h(k * 4 + i + 9) * 1.2, rho = 0.34 + h(k * 4 + i + 19) * 0.34, r = rho * 0.25 * s;
        const y = 0.37 * s + 0.3 * s * (0.2 + 0.75 * (0.2 + (Math.sqrt(1 - rho * rho) - 0.2) * 0.5)) + 0.012 * s;
        add(Mo.geo.sph(6), dot, tx + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.075 * s, 0.04 * s, 0.075 * s).castShadow = false;
      }
    };
    one(-0.1, 0, 1.15, 1); one(0.27, 0.15, 0.8, 2); one(-0.33, 0.2, 0.58, 3);
    return { g, mats: [stem, cap, rim, dot], anim: null };
  };

  /* 鼎式火盆：三足撑着一只束腰的铜盆，盆沿一圈金，两只立耳；火是两片削面的焰。blue：虚天殿的寒焰 */
  Mo.cauldron = function (v, ti, blue) {
    const g = new THREE.Group(), K = KIT[ti], add = adder(g), dk = lam(ti === 3 ? '#4f6076' : K.dark), gd = lam(K.gold), st = lam(K.stone);
    const fc = blue ? [0xa8c8e4, 0xeaf4fc] : [0xb4a8dc, 0xece6fa]; // 场景里的火是淡的冷焰：鲜艳的颜色不给摆设
    const m1 = new THREE.MeshBasicMaterial({ color: fc[0], transparent: true, opacity: 0.88, depthWrite: false }), m2 = new THREE.MeshBasicMaterial({ color: fc[1] });
    const bowl = gg('bowl', () => new THREE.CylinderGeometry(0.5, 0.3, 1, 8)), flame = gg('flame5', () => new THREE.ConeGeometry(0.5, 1, 5));
    add(HEX(), st, 0, 0.05, 0, 0.84, 0.1, 0.84);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; stick(g, new V3(Math.cos(a) * 0.31, 0.08, Math.sin(a) * 0.31), new V3(Math.cos(a) * 0.15, 0.62, Math.sin(a) * 0.15), 0.046, dk); }
    add(HEX(), dk, 0, 0.56, 0, 0.32, 0.07, 0.32); add(bowl, dk, 0, 0.73, 0, 0.64, 0.3, 0.64); add(HEX(), gd, 0, 0.9, 0, 0.7, 0.05, 0.7);
    for (const sx of [-1, 1]) add(Mo.geo.box(), gd, sx * 0.34, 1.0, 0, 0.05, 0.18, 0.17);
    const em = add(HEX(), m2, 0, 0.925, 0, 0.5, 0.02, 0.5), f1 = add(flame, m1, 0, 1.2, 0, 0.36, 0.62, 0.36), f2 = add(flame, m2, 0, 1.1, 0, 0.19, 0.36, 0.19);
    em.castShadow = f1.castShadow = f2.castShadow = false;
    const anim = (t) => { f1.scale.y = 0.62 + Math.sin(t * 11 + v) * 0.1; f1.rotation.y = t * 1.4 + v; f1.rotation.z = Math.sin(t * 7 + v) * 0.1; f2.scale.y = 0.36 + Math.sin(t * 14 + v) * 0.07; f2.rotation.y = -t * 2 + v; f1.position.y = 0.92 + f1.scale.y * 0.5; f2.position.y = 0.92 + f2.scale.y * 0.5; };
    return { g, mats: [dk, gd, st, m1, m2], anim };
  };

  /* 魔道战幡：斜插在乱石里的一杆破幡。幡面墨紫、镶暗金边，下摆撕成几绺、还烧出两个洞（同样不用红） */
  const bannerTex = () => gg('bannerT', () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 224; const x = c.getContext('2d');
    x.beginPath(); x.moveTo(4, 2); x.lineTo(124, 2); x.lineTo(124, 172);
    for (const q of [[112, 198], [100, 176], [86, 216], [72, 182], [58, 221], [44, 186], [30, 207], [16, 178], [4, 199]]) x.lineTo(q[0], q[1]);
    x.closePath();
    const gr = x.createLinearGradient(0, 0, 0, 224); gr.addColorStop(0, '#3c2b50'); gr.addColorStop(1, '#1d1429'); x.fillStyle = gr; x.fill();
    x.save(); x.clip();
    x.strokeStyle = '#9a8248'; x.lineWidth = 5; x.strokeRect(10, 8, 108, 240);
    x.fillStyle = '#dccb96'; x.font = '900 80px "Noto Serif SC","Songti SC","STSong","SimSun",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('魔', 64, 88);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(12,8,18,${0.1 + U.hash(i, 3, 61) * 0.2})`; x.beginPath(); x.ellipse(U.hash(i, 1, 61) * 128, U.hash(i, 2, 61) * 224, 4 + U.hash(i, 4, 61) * 12, 3 + U.hash(i, 5, 61) * 8, U.hash(i, 6, 61) * 3, 0, TAU); x.fill(); } // 污迹
    x.restore();
    x.globalCompositeOperation = 'destination-out';
    for (const q of [[97, 138, 7, 11], [31, 46, 4, 6], [70, 160, 3, 5]]) { x.beginPath(); x.ellipse(q[0], q[1], q[2], q[3], 0.4, 0, TAU); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  });
  Mo.warBanner = function (v, ti) {
    const g = new THREE.Group(), K = KIT[ti], add = adder(g), dk = lam('#2c2630'), gd = lam(K.gold), rk = vcol(), h = (i) => U.hash(v * 5 + i, i + 3, 67);
    const cloth = new THREE.MeshLambertMaterial({ map: bannerTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    add(rockGeo(v % 4, ti), rk, 0, -0.03, 0, 0.26, 0.2, 0.24); add(rockGeo((v + 1) % 4, ti), rk, 0.22, -0.03, 0.12, 0.15, 0.12, 0.15); add(rockGeo((v + 2) % 4, ti), rk, -0.2, -0.03, 0.14, 0.13, 0.1, 0.13);
    const lean = (h(1) - 0.5) * 0.3, top = new V3(lean, 2.15, -0.05);
    stick(g, new V3(0, 0.05, 0), top, 0.04, dk);
    add(Mo.geo.box(), dk, top.x + 0.3, top.y - 0.12, top.z, 0.78, 0.06, 0.06); add(Mo.geo.cone(4), gd, top.x, top.y + 0.12, top.z, 0.16, 0.26, 0.16);
    const piv = new THREE.Group(); piv.position.set(top.x + 0.34, top.y - 0.15, top.z); g.add(piv);
    const fl = new THREE.Mesh(gg('plane1', () => new THREE.PlaneGeometry(1, 1)), cloth); fl.position.y = -0.56; fl.scale.set(0.64, 1.12, 1); fl.castShadow = true; piv.add(fl);
    const anim = (t) => { piv.rotation.x = Math.sin(t * 1.7 + v) * 0.1; piv.rotation.y = Math.sin(t * 1.1 + v * 2) * 0.16; };
    return { g, mats: [dk, gd, rk, cloth], anim };
  };

  /* 石像：拄剑而立的守殿人。两层石座、收腰的袍身，肩与头是削面的石块——苔与雪自然落在肩头 */
  Mo.guardian = function (v, ti) {
    const g = new THREE.Group(), add = adder(g), st = lam(ti === 3 ? '#a8bccd' : ti === 1 ? '#8a7468' : '#8d939b'), dk = lam(ti === 3 ? '#6c84a0' : '#585e68'), rk = vcol();
    const waist = gg('waist', () => new THREE.CylinderGeometry(0.34, 0.5, 1, 6)), box = Mo.geo.box();
    add(HEX(), dk, 0, 0.08, 0, 0.86, 0.16, 0.72); add(HEX(), st, 0, 0.21, 0, 0.68, 0.1, 0.56);
    add(waist, st, 0, 0.63, 0, 0.52, 0.74, 0.4);                                  // 袍身
    add(rockGeo(v % 4, ti), rk, 0, 0.9, 0, 0.3, 0.2, 0.19);                       // 肩
    add(rockGeo((v + 1) % 4, ti), rk, 0, 1.09, 0, 0.125, 0.17, 0.125);            // 头
    add(Mo.geo.cone(4), dk, 0, 1.36, 0, 0.11, 0.18, 0.11);                        // 冠
    add(box, st, 0, 0.86, 0.19, 0.3, 0.12, 0.13);                                 // 合在身前的双手
    add(box, dk, 0, 0.58, 0.25, 0.055, 0.7, 0.03); add(box, dk, 0, 0.92, 0.25, 0.22, 0.04, 0.05); add(box, dk, 0, 1.02, 0.25, 0.04, 0.16, 0.04); // 拄在身前的剑
    for (const sx of [-1, 1]) { const sl = add(box, st, sx * 0.2, 0.8, 0.08, 0.1, 0.3, 0.14); sl.rotation.z = sx * 0.3; } // 垂下的袖
    return { g, mats: [st, dk, rk], anim: null };
  };

  /* 冰晶簇：几根六棱的冰锥从一块雪石里斜长出来，根上深蓝、尖上发白。整簇是一个几何体 */
  const shardGeo = (k) => gg('shard' + k, () => {
    const pos = [], col = [], lo = new THREE.Color('#3b78b8'), hi = new THREE.Color('#e9f8ff'), t = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new V3(), A = new V3(), B = new V3(), C = new V3(), N = new V3();
    const hh = (i) => U.hash(k * 31 + i, i * 3 + 7, 77), n = 4 + (k % 2);
    for (let s = 0; s < n; s++) {
      const main = s === 0, H = main ? 1.2 + hh(1) * 0.35 : 0.5 + hh(s + 2) * 0.5, R = main ? 0.21 : 0.1 + hh(s + 8) * 0.07;
      const a = (s / n) * TAU + hh(s + 14) * 1.2, d = main ? 0 : 0.2 + hh(s + 20) * 0.13, tilt = main ? 0.07 : 0.32 + hh(s + 26) * 0.36, off = hh(s + 30) * TAU;
      q.setFromAxisAngle(ax.set(Math.sin(a), 0, -Math.cos(a)), tilt); m.makeRotationFromQuaternion(q); m.setPosition(Math.cos(a) * d, -0.05, Math.sin(a) * d);
      const ring = (y, r) => Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TAU + off) * r, y, Math.sin((i / 6) * TAU + off) * r]);
      const b = ring(0, R * 0.7), sh = ring(H * 0.68, R), apex = [0, H, 0];
      const tri = (p0, p1, p2) => {
        A.fromArray(p0); B.fromArray(p1); C.fromArray(p2); N.subVectors(B, A).cross(ax.subVectors(C, A));
        if (N.x * (A.x + B.x + C.x) + N.z * (A.z + B.z + C.z) < 0) { const w = p1; p1 = p2; p2 = w; } // 让面朝外
        for (const p of [p0, p1, p2]) { const ty = p[1] / H; t.copy(lo).lerp(hi, ty * ty); A.fromArray(p).applyMatrix4(m); pos.push(A.x, A.y, A.z); col.push(t.r, t.g, t.b); }
      };
      for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(b[i], sh[i], sh[j]); tri(b[i], sh[j], b[j]); tri(sh[i], apex, sh[j]); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    return geo;
  });
  Mo.iceCluster = function (v, ti) {
    const g = new THREE.Group(), add = adder(g), rk = vcol();
    const ice = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.9, emissive: 0x143a58, shininess: 90 });
    add(shardGeo(v % 3), ice, 0, 0, 0, 1);
    add(rockGeo(v % 4, 3), rk, 0.05, -0.04, 0.05, 0.34, 0.15, 0.3); add(rockGeo((v + 1) % 4, 3), rk, -0.26, -0.03, 0.16, 0.14, 0.1, 0.14);
    return { g, mats: [ice, rk], anim: null };
  };

  /* 骸骨与拒马：用妖兽那套"雕塑"做，一样一个几何体 */
  const carved = (geo) => { const g = new THREE.Group(), m = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 5 }), o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); return { g, mats: [m], anim: null }; };
  /* 骸骨：一副肋骨拱在地上，旁边滚着颅骨和一根腿骨 */
  Mo.bones = function (v) {
    const c4 = Mo.geo.cyl(0.5, 0.5, 4), k4 = Mo.geo.cone(4), B = '#d6ccba', D = '#a89c88';
    return carved(Mo.sculpt('bones' + (v % 2), (put) => {
      Mo.span(put, c4, D, [-0.38, 0.05, 0], [0.2, 0.05, 0], 0.055);
      for (let i = 0; i < 5; i++) { const x = -0.32 + i * 0.12, h = 0.31 - Math.abs(i - 2) * 0.045; for (const sz of [-1, 1]) { Mo.span(put, c4, B, [x, 0.05, 0], [x, h * 0.82, sz * 0.17], 0.038); Mo.span(put, k4, B, [x, h * 0.82, sz * 0.17], [x, h, sz * 0.04], 0.038); } }
      const sx0 = v % 2 ? -1 : 1;
      put(Mo.geo.ico(1), B, [0.38, 0.12, 0.14 * sx0], [0.26, 0.24, 0.28], [0, 0.5 * sx0, 0.2]); put(Mo.geo.box(), D, [0.42, 0.035, 0.2 * sx0], [0.16, 0.06, 0.14], [0, 0.5 * sx0, 0]);
      for (const e of [-1, 1]) put(Mo.geo.ico(0), '#1c1416', [0.44 + e * 0.05, 0.15, (0.14 + 0.11) * sx0 - e * 0.03 * sx0], 0.085);
      Mo.span(put, c4, D, [-0.14, 0.035, -0.32 * sx0], [0.2, 0.035, -0.4 * sx0], 0.05); put(Mo.geo.ico(0), B, [-0.14, 0.04, -0.32 * sx0], 0.09); put(Mo.geo.ico(0), B, [0.2, 0.04, -0.4 * sx0], 0.09);
    }, 0.7, 1.08));
  };
  /* 拒马：一根横木上交叉绑着几对削尖的木桩，尖上包铁 */
  Mo.barricade = function () {
    const c6 = Mo.geo.cyl(0.5, 0.5, 6), k5 = Mo.geo.cone(5), W1 = '#5c4636', W2 = '#4a382c', FE = '#aeb2ba';
    return carved(Mo.sculpt('barricade', (put) => {
      Mo.span(put, c6, W2, [-0.48, 0.17, 0.02], [0.48, 0.17, 0.02], 0.12);
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24;
        for (const sz of [-1, 1]) {
          const a = [x + sz * 0.03, 0, -sz * 0.26], b = [x + sz * 0.03, 0.66, sz * 0.34];
          Mo.span(put, k5, i % 2 ? W1 : W2, a, b, 0.1);
          Mo.span(put, k5, FE, [a[0], 0.5, a[2] + (b[2] - a[2]) * 0.76], [b[0], 0.7, b[2] + sz * 0.02], 0.055);
        }
        put(Mo.geo.box(), '#2c2218', [x, 0.2, 0.02], [0.09, 0.09, 0.14]); // 绑绳
      }
    }, 0.7, 1.08));
  };

  /* 接管场景物件：山石、松（偶尔是一树桃花）、血枫、石灯、瓦砾、残柱、竹、灵菇、火盆、战幡、石像、冰晶、骸骨、拒马 */
  const prop0 = Mo.prop;
  Mo.prop = function (kind, v, ti) {
    if (kind === 'rock') return Mo.crag(v + ti * 5, ti);
    if (kind === 'pine') return Mo.tree(v * 3 + ti, ti, v === 2 ? 'bloom' : 'pine', 1.05);
    if (kind === 'deadtree') return Mo.tree(v * 3 + ti + 1, ti, 'round', 1.1);
    if (kind === 'lantern') return Mo.stoneLantern(v, ti);
    if (kind === 'rubble') return Mo.rubble(v, ti);
    if (kind === 'pillar') return Mo.brokenPillar(v, ti);
    if (kind === 'bamboo') return Mo.bamboo(v, ti);
    if (kind === 'mushroom') return Mo.shroom(v, ti);
    if (kind === 'brazier' || kind === 'brazier2') return Mo.cauldron(v, ti, kind === 'brazier2');
    if (kind === 'banner') return Mo.warBanner(v, ti);
    if (kind === 'statue') return Mo.guardian(v, ti);
    if (kind === 'icecrystal') return Mo.iceCluster(v, ti);
    if (kind === 'bones') return Mo.bones(v);
    if (kind === 'barricade') return Mo.barricade();
    return prop0(kind, v, ti);
  };
})();
