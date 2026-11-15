'use strict';
/* 凡人问道 —— 人物造型（卡通画风下的卡通人物）。
   人物是一块块建出来的：先出卡通风格的设定图当参考（大头小身、圆润的简单形体、平涂的颜色），
   再照着用球、柱、锥、旋转体把头、发、衣、袖、腿、兵器拼成模型。模型上没有任何图片——颜色都烘在顶点上，
   明暗是分成几档的卡通光照，外面一道描边。
   一个人分成七块来动：身子（躯干）、头、两臂、两腿，下摆单独一块；走路、蓄力、出手都只是转这几块。
   所有人物共用一个造型函数 build(spec)，每个人只是一张"长什么样"的单子（TOON）。 */
(function () {
  const G = window.G, U = G.U, PI = Math.PI, Mo = G.Models;
  const { box, sph, cyl, cone, ico, dome, tor } = Mo.geo;
  const V3 = THREE.Vector3, WHITE = new THREE.Color(0xffffff);
  const tint = (hex, k) => { const c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(WHITE, k); return '#' + c.getHexString(); };

  /* ---------- 烘焙 ----------
     put(几何体, 颜色, 位置, 缩放, 旋转, 法线)：往这一块里添一个形体。
     法线默认按"椭球"算（从形体中心向外）——方块因此也是圆润的明暗，描边外扩时不会在棱上裂开；
     旋转体（下摆）传 'geo'，用它自己的法线 */
  const BK = {}, M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E3 = new THREE.Euler(), Pv = new V3(), Sv = new V3(), vv = new V3(), nn = new V3(), Cc = new THREE.Color();
  function bake(key, build, lo = 0.86, hi = 1.04) {
    if (BK[key]) return BK[key];
    const pos = [], nor = [], col = [];
    const put = (geo, color, p, s, r, mode) => {
      Pv.set(p[0], p[1], p[2]);
      if (typeof s === 'number') Sv.set(s, s, s); else Sv.set(s[0], s[1], s[2]);
      E3.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); Q4.setFromEuler(E3); M4.compose(Pv, Q4, Sv);
      Cc.set(color);
      const A = geo.attributes.position, N = geo.attributes.normal, I = geo.index, cnt = I ? I.count : A.count;
      for (let i = 0; i < cnt; i++) {
        const k = I ? I.getX(i) : i;
        vv.fromBufferAttribute(A, k);
        if (mode === 'geo' && N) nn.fromBufferAttribute(N, k); else nn.copy(vv);
        nn.set(nn.x / Sv.x, nn.y / Sv.y, nn.z / Sv.z); if (nn.lengthSq() < 1e-10) nn.set(0, 1, 0); nn.normalize().applyQuaternion(Q4);
        vv.applyMatrix4(M4);
        pos.push(vv.x, vv.y, vv.z); nor.push(nn.x, nn.y, nn.z); col.push(Cc.r, Cc.g, Cc.b);
      }
    };
    build(put);
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
    for (let i = 0; i < pos.length; i += 3) { const k = lo + (hi - lo) * ((pos[i + 1] - y0) / (y1 - y0 || 1)); col[i] *= k; col[i + 1] *= k; col[i + 2] *= k; } // 自下而上略微提亮：脚下暗一点，人就站得住
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return (BK[key] = g);
  }
  const LG = {};
  // 旋转体：pts 是一串 [半径, 高度]，自上而下
  const lathe = (key, pts, seg = 14) => LG[key] || (LG[key] = new THREE.LatheGeometry(pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), seg)); // 旋转体要自下而上给点，面才朝外
  const PUT_Z = [PI / 2, 0, 0]; // 沿 Y 的柱 / 锥转成沿 Z

  const toonMat = Mo.toonMat; // 分三档的卡通光照（定义在 beasts.js，妖兽也用）
  const mesh = (geo, mat, parent, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow !== false; parent.add(m); return m; };

  /* ---------- 身形 ----------
     高度以 1 为准（渲染时再整体放大）。大头小身，约两个半到三个头高：
     腿 0.24，躯干到 0.55，头的中心 0.72、半径 0.185 */
  const HIP = 0.25, NECK = 0.58, HC = 0.16, EYE = '#1c1418', HS = 0.92; // HS：头整体的大小

  /* 头：h 是这个人的单子。返回 [头的几何体, 发光的眼（没有就是 null）] */
  function headGeo(key, h) {
    const skin = h.skin, hair = h.hair || '#1e1c24', st = h.head || 'bun', puppet = st === 'puppet';
    let glowG = null;
    const g = bake(key + ':head', (put) => {
      put(ico(2), h.face || skin, [0, HC, 0], [0.37, 0.36, 0.35]);                                         // 脑袋
      if (!h.eyeGlow && st !== 'helmMask') for (const sx of [-1, 1]) {
        if (puppet) put(box(), EYE, [sx * 0.065, HC - 0.005, 0.17], [0.03, 0.085, 0.02]);                  // 傀儡：两道竖缝
        else put(sph(8), h.eye || EYE, [sx * 0.07, HC - 0.012, 0.162], [0.052, 0.088, 0.034]);             // 两点黑豆眼
        if (h.brow) put(box(), h.browC || EYE, [sx * 0.072, HC + 0.064, 0.166], [0.075, 0.014, 0.016], [0, 0, -sx * (h.brow === 'angry' ? 0.42 : 0.1)]);
      }
      const cap = (c, sc = 1, tilt = -0.32, dy = 0.005) => put(dome(), c, [0, HC + dy, -0.012], [0.4 * sc, 0.4 * sc, 0.39 * sc], [tilt, 0, 0]); // 一顶盖住头顶与后脑的帽 / 发
      const fringe = (c) => { put(ico(1), c, [0, HC + 0.118, 0.125], [0.2, 0.09, 0.1]); for (const sx of [-1, 1]) { put(ico(1), c, [sx * 0.125, HC + 0.075, 0.105], [0.11, 0.14, 0.1], [0, 0, sx * 0.3]); put(ico(1), c, [sx * 0.176, HC - 0.02, 0.02], [0.05, 0.17, 0.11]); } }; // 刘海与鬓角
      const bun = (c, y = 0.235, r = 0.13) => put(sph(10), c, [0, HC + y, -0.03], r);                                                      // 发髻
      const tails = (c, y, z, len = 0.15) => { for (const sx of [-1, 1]) put(box(), c, [sx * 0.035, HC + y, z], [0.04, len, 0.014], [0.5, 0, sx * 0.25]); }; // 两条飘带
      if (st === 'bun' || st === 'crown' || st === 'elder') {
        cap(hair); fringe(hair); bun(hair);
        put(cyl(0.5, 0.5, 10), h.ribbon || tint(hair, 0.3), [0, HC + 0.178, -0.03], [0.1, 0.035, 0.1]);     // 束发的带子
        if (h.ribbon) tails(h.ribbon, 0.13, -0.15);
        if (st === 'crown') { for (let i = -1; i <= 1; i++) put(cone(4), '#e0b84a', [i * 0.04, HC + 0.2, 0.06 - Math.abs(i) * 0.02], [0.045, 0.1 - Math.abs(i) * 0.03, 0.03]); put(sph(6), '#c8324a', [0, HC + 0.175, 0.085], 0.03); } // 金冠
      } else if (st === 'tail') { // 高马尾：长发垂到腰
        cap(hair); fringe(hair);
        put(ico(1), hair, [0, HC + 0.16, -0.14], [0.13, 0.13, 0.13]);
        put(ico(1), hair, [0, HC - 0.1, -0.2], [0.14, 0.44, 0.11], [0.12, 0, 0]);
        for (const sx of [-1, 1]) put(ico(1), hair, [sx * 0.172, HC - 0.12, 0.05], [0.06, 0.3, 0.08]);      // 垂在胸前的两绺
        put(cyl(0.5, 0.5, 8), h.ribbon || '#c8d4e8', [0, HC + 0.19, -0.1], [0.075, 0.04, 0.075], [0.6, 0, 0]);
        if (h.ribbon) tails(h.ribbon, 0.08, -0.24, 0.2);
      } else if (st === 'long') { // 披散的长发（老怪）
        cap(hair); fringe(hair);
        put(ico(1), hair, [0, HC - 0.1, -0.13], [0.34, 0.46, 0.14]);
        for (const sx of [-1, 1]) put(ico(1), hair, [sx * 0.17, HC - 0.13, 0.04], [0.07, 0.34, 0.1]);
      } else if (st === 'band') { // 头巾：盖住头顶，结打在一侧
        put(ico(1), hair, [0, HC - 0.03, -0.06], [0.39, 0.26, 0.32]); fringe(hair);
        cap(h.hat, 1.04, -0.14, 0.02);
        put(ico(0), h.hat, [0.17, HC + 0.04, -0.1], 0.085);
        put(cone(4), h.hat, [0.24, HC + 0.0, -0.13], [0.07, 0.17, 0.03], [0, 0, -2.1]); put(cone(4), h.hat, [0.22, HC - 0.07, -0.14], [0.06, 0.15, 0.03], [0, 0, -2.7]);
      } else if (st === 'hood') { // 兜帽：比头大一圈，脸在帽檐的影里
        put(ico(2), h.hat, [0, HC + 0.015, -0.055], [0.46, 0.45, 0.42]);
        put(tor(0.045), tint(h.hat, -0.25), [0, HC + 0.005, 0.1], [0.37, 0.39, 0.3]);                       // 帽檐
        put(cone(8), h.hat, [0, HC + 0.21, -0.13], [0.2, 0.22, 0.2], [-0.75, 0, 0]);                        // 帽尖
        if (h.hair) put(ico(1), hair, [0, HC + 0.1, 0.125], [0.22, 0.09, 0.08]);
      } else if (st === 'helm' || st === 'helmMask') { // 盔
        cap(h.hat, 1.06, -0.12, 0.0);
        put(tor(0.045), h.hat2 || tint(h.hat, -0.3), [0, HC + 0.045, 0], [0.42, 0.42, 0.42], [PI / 2, 0, 0]); // 盔沿
        put(cyl(0.5, 0.4, 10), h.hat, [0, HC - 0.07, -0.06], [0.42, 0.2, 0.34]);                            // 护颈
        if (h.plume) { put(cone(6), h.plume, [0, HC + 0.27, -0.02], [0.08, 0.16, 0.08]); put(ico(1), h.plume, [0, HC + 0.3, -0.1], [0.09, 0.14, 0.2], [0.5, 0, 0]); } // 盔缨
        else put(cone(6), h.hat2 || h.hat, [0, HC + 0.25, 0], [0.07, 0.14, 0.07]);
        if (h.horn) for (const sx of [-1, 1]) put(cone(5), h.hat2 || h.hat, [sx * 0.2, HC + 0.16, 0], [0.07, 0.2, 0.07], [0, 0, -sx * 0.7]);
        if (st === 'helmMask') put(ico(1), h.mask || '#2a2226', [0, HC - 0.035, 0.115], [0.3, 0.22, 0.16]);  // 面甲
      } else if (st === 'qing') { // 僵尸的官帽，额上一张黄符
        put(cyl(0.44, 0.5, 12), '#16181e', [0, HC + 0.185, 0], [0.4, 0.1, 0.4]);
        put(cyl(0.5, 0.42, 12), '#16181e', [0, HC + 0.125, 0], [0.5, 0.05, 0.5]);
        put(cyl(0.4, 0.5, 12), '#b02a2a', [0, HC + 0.245, 0], [0.3, 0.05, 0.3]); put(sph(8), '#e0b84a', [0, HC + 0.285, 0], 0.06);
        put(box(), '#e8c84a', [0, HC + 0.035, 0.182], [0.075, 0.18, 0.012], [0.08, 0, 0]); put(box(), '#b02a2a', [0, HC + 0.035, 0.19], [0.02, 0.12, 0.008], [0.08, 0, 0]);
      } else if (st === 'bamboo') { // 斗笠
        put(cone(14), h.hat, [0, HC + 0.19, 0], [0.7, 0.2, 0.7]); put(cyl(0.5, 0.5, 14), tint(h.hat, -0.25), [0, HC + 0.092, 0], [0.71, 0.014, 0.71]);
      } else if (st === 'bald') {
        if (h.muzzle) { put(cyl(0.5, 0.5, 12), h.muzzle, [0, HC - 0.075, 0.01], [0.385, 0.13, 0.375]); for (let i = -1; i <= 1; i++) put(box(), tint(h.muzzle, -0.35), [i * 0.05, HC - 0.075, 0.185], [0.018, 0.1, 0.02]); } // 铁口罩
        if (h.scar) put(box(), h.scar, [0.05, HC + 0.13, 0.12], [0.02, 0.1, 0.02], [0.5, 0, 0.5]);
      } else if (puppet) { // 傀儡：木头脑袋，顶上一个木髻，两耳是铜盘
        put(cyl(0.5, 0.5, 10), h.hair, [0, HC + 0.2, -0.02], [0.13, 0.1, 0.13]); put(cyl(0.5, 0.5, 10), h.metal, [0, HC + 0.26, -0.02], [0.18, 0.03, 0.06]);
        cap(h.hair, 1.0, -0.5, 0.0);
        for (const sx of [-1, 1]) put(cyl(0.5, 0.5, 10), h.metal, [sx * 0.185, HC, 0], [0.11, 0.035, 0.11], [0, 0, PI / 2]);
      }
      if (h.beard) { put(cone(8), h.beard, [0, HC - 0.2, 0.105], [0.15, 0.24, 0.1], [PI + 0.15, 0, 0]); for (const sx of [-1, 1]) put(ico(0), h.beard, [sx * 0.05, HC - 0.085, 0.165], [0.085, 0.035, 0.04], [0, 0, sx * 0.3]); } // 须
      if (h.hatTop) put(box(), h.hatTop, [0, HC + 0.215, 0.0], [0.13, 0.07, 0.1]);                          // 小冠
      if (h.pin) put(ico(0), h.pin, [0.06, HC + 0.2, -0.06], [0.06, 0.05, 0.03]);                           // 发饰
    }, 0.94, 1.03);
    if (h.eyeGlow) glowG = bake(key + ':eyes', (put) => { for (const sx of [-1, 1]) put(sph(8), h.eyeGlow, [sx * 0.07, HC - 0.012, 0.166], [0.058, puppet ? 0.085 : 0.05, 0.03]); }, 1, 1);
    return [g, glowG];
  }

  /* 躯干（原点在胯）：衣身、领、腰带，以及背在身上的东西 */
  function torsoGeo(key, h) {
    const b = h.bulk || 1, c1 = h.c1, c2 = h.c2, c3 = h.c3 || tint(c1, -0.4), top = h.top || 'robe';
    return bake(key + ':torso', (put) => {
      if (top === 'bare') { // 赤膊
        put(ico(2), h.skin, [0, 0.16, 0], [0.33 * b, 0.34, 0.25 * b]);
        for (const sx of [-1, 1]) put(ico(1), tint(h.skin, 0.08), [sx * 0.075 * b, 0.21, 0.085 * b], [0.14 * b, 0.11, 0.08]); // 胸
        if (h.scar) { put(box(), h.scar, [-0.06 * b, 0.2, 0.125 * b], [0.02, 0.13, 0.015], [0, 0, 0.6]); put(box(), h.scar, [0.08 * b, 0.12, 0.118 * b], [0.02, 0.09, 0.015], [0, 0, -0.5]); }
        if (h.collar) put(cyl(0.5, 0.5, 12), h.collar, [0, 0.305, 0], [0.24, 0.055, 0.23]);
      } else if (top === 'armor') { // 甲：深色的衬里外面一副胸甲与背甲，领口、护心镜是缘边的颜色，两肩有披膊
        const un = h.under || tint(c1, -0.55);
        put(cyl(0.44, 0.5, 12), un, [0, 0.15, 0], [0.28 * b, 0.3, 0.21 * b]);
        put(sph(10), un, [0, 0.27, 0], [0.31 * b, 0.12, 0.21 * b]);
        for (const sz of [-1, 1]) put(ico(1), c1, [0, 0.165, sz * 0.03 * b], [0.275 * b, 0.25, 0.19 * b]);       // 胸甲、背甲
        put(cyl(0.5, 0.5, 12), c2, [0, 0.288, 0], [0.2 * b, 0.028, 0.17 * b]);                                  // 领口
        put(sph(10), h.buckle || c2, [0, 0.185, 0.118 * b], [0.1, 0.1, 0.035]);                                 // 护心镜
        for (const sx of [-1, 1]) { put(ico(1), c1, [sx * 0.18 * b, 0.272, 0], [0.15, 0.1, 0.165]); put(cyl(0.5, 0.5, 10), c2, [sx * 0.18 * b, 0.236, 0], [0.153, 0.016, 0.168]); } // 披膊
        if (h.moss) { put(ico(0), h.moss, [-0.17 * b, 0.325, 0.02], [0.12, 0.05, 0.12]); put(ico(0), h.moss, [0.1 * b, 0.2, 0.1 * b], [0.09, 0.06, 0.05]); }
      } else if (top === 'puppet') { // 木头身子，铜箍
        put(ico(1), c1, [0, 0.16, 0], [0.27 * b, 0.32, 0.21 * b]);
        put(cyl(0.5, 0.5, 10), c2, [0, 0.27, 0], [0.2 * b, 0.03, 0.17 * b]); put(sph(8), c2, [0, 0.16, 0.1 * b], [0.07, 0.07, 0.03]);
      } else { // 袍 / 短衣：交领
        put(cyl(0.42, 0.5, 12), c1, [0, 0.15, 0], [0.275 * b, 0.3, 0.205 * b]);
        put(sph(10), c1, [0, 0.27, 0], [0.31 * b, 0.12, 0.21 * b]);                                         // 肩
        put(ico(1), h.inner || '#efe9dc', [0, 0.275, 0.062 * b], [0.11, 0.09, 0.07]);                       // 领口露出的中衣
        put(box(), c2, [0.028, 0.2, 0.098 * b], [0.042, 0.2, 0.022], [0.06, 0, 0.5]);                       // 右衽：一条斜的领缘
        put(box(), c2, [-0.05, 0.25, 0.092 * b], [0.04, 0.1, 0.022], [0.1, 0, -0.5]);
        if (h.patch) put(box(), h.patch, [-0.07 * b, 0.13, 0.1 * b], [0.07, 0.06, 0.012], [0, 0, 0.2]);     // 补丁
      }
      if (h.sash !== false) { // 腰带，前面打个结、垂下一截
        put(cyl(0.5, 0.5, 12), c3, [0, 0.05, 0], [(top === 'bare' ? 0.31 : 0.283) * b, 0.06, (top === 'bare' ? 0.24 : 0.212) * b]);
        if (top !== 'armor' && top !== 'puppet') { put(box(), c3, [0.035, 0.045, 0.108 * b], [0.065, 0.055, 0.03]); put(box(), c3, [0.035, -0.045, 0.113 * b], [0.038, 0.14, 0.016], [-0.12, 0, 0]); }
        else put(sph(8), h.buckle || c2, [0, 0.05, 0.108 * b], [0.07, 0.06, 0.03]);
      }
      if (h.back === 'sword') { // 背上的剑：斜插，剑柄露在右肩上
        put(box(), '#3a2c22', [0.01, 0.15, -0.125 * b], [0.045, 0.44, 0.03], [0, 0, 0.62]);
        put(box(), '#c8a858', [-0.105, 0.305, -0.125 * b], [0.1, 0.022, 0.035], [0, 0, 0.62]);
        put(cyl(0.5, 0.5, 6), '#2a2422', [-0.155, 0.375, -0.125 * b], [0.03, 0.13, 0.03], [0, 0, 0.62]);
        put(box(), '#5a4634', [0.02, 0.2, 0.0], [0.022, 0.3, 0.212 * b * 1.03], [0, 0, -0.62]);              // 斜挎的带子
      } else if (h.back === 'quiver') { // 箭囊
        put(cyl(0.5, 0.42, 8), '#5a4030', [0.07, 0.17, -0.13 * b], [0.085, 0.26, 0.085], [0.1, 0, -0.35]);
        for (let i = 0; i < 3; i++) put(box(), '#e6dcc0', [0.11 + i * 0.022, 0.32 + i * 0.008, -0.14 * b], [0.012, 0.09, 0.012], [0.1, 0, -0.35]);
      } else if (h.back === 'cape') { // 披风：高领，垂到小腿
        put(ico(1), h.cape, [0, 0.02, -0.14 * b], [0.4 * b, 0.56, 0.12], [0.13, 0, 0]);
        put(cyl(0.5, 0.42, 10), h.cape, [0, 0.305, -0.04], [0.27, 0.11, 0.2]);
      }
      if (h.chain) for (const sx of [-1, 1]) put(cyl(0.5, 0.5, 6), h.chain, [sx * 0.11, 0.26, 0.1], [0.03, 0.1, 0.03], [0.3, 0, sx * 0.9]);
    });
  }

  /* 下摆（原点在脚下，不随躯干俯仰）：长袍到小腿，短衣到大腿，甲裙 */
  function skirtGeo(key, h) {
    const b = h.bulk || 1, lo = h.lower || 'robe';
    if (lo === 'none') return null;
    const hem = lo === 'robe' ? 0.075 : lo === 'tunic' ? 0.15 : 0.165, flare = lo === 'robe' ? 0.205 : lo === 'tunic' ? 0.172 : 0.178, c = h.skirt || h.c1;
    return bake(key + ':skirt', (put) => {
      put(lathe(`sk${lo}`, [[0.128, HIP + 0.07], [0.142, HIP + 0.02], [0.142 + (flare - 0.142) * 0.55, (HIP + hem) / 2], [flare, hem + 0.012], [flare * 0.985, hem], [flare * 0.8, hem + 0.004]]), c, [0, 0, 0], [b, 1, b * 0.84], null, 'geo');
      put(lathe(`hm${lo}`, [[flare * 0.992, hem + 0.05], [flare * 1.02, hem + 0.022], [flare * 1.02, hem - 0.004], [flare * 0.9, hem - 0.004]]), h.hemC || h.c2, [0, 0, 0], [b, 1, b * 0.84], null, 'geo'); // 下摆的缘边
      if (lo !== 'tasset') put(box(), h.c2, [0, (HIP + 0.04 + hem) / 2, (0.142 + flare) / 2 * b * 0.84 + 0.004], [0.045, HIP + 0.04 - hem, 0.014], [-Math.atan2((flare - 0.142) * 0.84 * b, HIP - hem), 0, 0]); // 前襟
      else put(lathe('tb0', [[0.152, HIP + 0.01], [0.16, HIP - 0.012], [0.152, HIP - 0.018]]), h.c2, [0, 0, 0], [b, 1, b * 0.84], null, 'geo');
    }, 0.8, 1.02);
  }

  /* 腿（原点在胯，向下）：裤、靴 */
  function legGeo(key, h) {
    const lg = h.leg || 'pants', c4 = h.c4 || tint(h.c1, -0.45), boot = h.boot || '#2a2428', k = h.bulk ? 1 + (h.bulk - 1) * 0.6 : 1;
    return bake(key + ':leg', (put) => {
      if (lg === 'baggy') { put(ico(1), c4, [0, -0.085, 0], [0.135 * k, 0.19, 0.145 * k]); put(cyl(0.5, 0.5, 8), h.wrap || '#d8c8a8', [0, -0.165, 0], [0.085 * k, 0.05, 0.085 * k]); } // 灯笼裤，扎着绑腿
      else if (lg === 'armor') { put(cyl(0.5, 0.44, 8), h.under || tint(h.c1, -0.55), [0, -0.085, 0], [0.11 * k, 0.17, 0.11 * k]); put(cyl(0.44, 0.5, 8), h.c1, [0, -0.125, 0], [0.125 * k, 0.09, 0.125 * k]); put(cyl(0.5, 0.5, 8), h.c2, [0, -0.085, 0], [0.128 * k, 0.016, 0.128 * k]); } // 胫甲
      else if (lg === 'puppet') { put(cyl(0.5, 0.5, 8), h.c1, [0, -0.085, 0], [0.07, 0.15, 0.07]); put(sph(8), h.c2, [0, -0.01, 0], 0.085); }
      else if (lg === 'bare') put(cyl(0.5, 0.42, 8), h.skin, [0, -0.09, 0], [0.13 * k, 0.17, 0.13 * k]);
      else put(cyl(0.5, 0.44, 8), c4, [0, -0.09, 0], [0.11 * k, 0.17, 0.115 * k]);
      put(ico(1), boot, [0, -0.2, 0.022], [0.108 * k, 0.085, 0.165 * k]);                                   // 靴
      if (lg !== 'puppet') put(cyl(0.5, 0.5, 8), tint(boot, 0.18), [0, -0.165, 0], [0.1 * k, 0.03, 0.1 * k]);
    }, 0.8, 1.0);
  }

  /* 臂（原点在肩，向下垂；sx = -1 左，1 右）：袖、手，手里的兵器另算 */
  function armGeo(key, h, sx) {
    const sl = h.sleeve || 'wide', b = h.bulk || 1, hand = sx > 0 && h.handR ? h.handR : h.hand || h.skin;
    return bake(key + ':arm' + sx, (put) => {
      if (sl === 'wide') { // 宽袖：越往下越宽，袖口一道缘边
        put(cyl(0.36, 0.5, 10), h.c1, [0, -0.085, 0], [0.135, 0.19, 0.125]);
        put(cyl(0.5, 0.5, 10), h.cuff || h.c2, [0, -0.172, 0], [0.14, 0.03, 0.13]);
        put(ico(1), hand, [0, -0.2, 0], 0.075);
      } else if (sl === 'bare') { // 赤膊：粗胳膊，铁拳套
        put(ico(1), h.skin, [0, -0.075, 0], [0.125 * b, 0.19, 0.125 * b]);
        if (h.fist) { put(ico(1), h.fist, [0, -0.195, 0], [0.16 * b, 0.15, 0.16 * b]); put(cyl(0.5, 0.5, 8), tint(h.fist, 0.25), [0, -0.165, 0], [0.165 * b, 0.025, 0.165 * b]); put(cyl(0.5, 0.5, 8), tint(h.fist, 0.25), [0, -0.225, 0], [0.165 * b, 0.025, 0.165 * b]); }
        else put(ico(1), hand, [0, -0.19, 0], 0.1 * b);
      } else if (sl === 'armor') {
        put(cyl(0.5, 0.44, 8), h.under || tint(h.c1, -0.55), [0, -0.085, 0], [0.095 * b, 0.17, 0.095 * b]); put(cyl(0.44, 0.5, 8), h.c1, [0, -0.13, 0], [0.112 * b, 0.075, 0.112 * b]); put(cyl(0.5, 0.5, 8), h.c2, [0, -0.095, 0], [0.115 * b, 0.014, 0.115 * b]); // 护臂
        put(ico(1), hand, [0, -0.195, 0], 0.085 * b);
      } else if (sl === 'puppet') {
        put(sph(8), h.c2, [0, -0.01, 0], 0.085); put(cyl(0.5, 0.5, 8), h.c1, [0, -0.09, 0], [0.06, 0.15, 0.06]); put(sph(8), h.c2, [0, -0.1, 0], 0.07); put(ico(1), hand, [0, -0.19, 0], 0.075);
      } else { // 窄袖，腕上缠着布
        put(cyl(0.5, 0.42, 8), h.c1, [0, -0.08, 0], [0.095, 0.17, 0.095]);
        put(cyl(0.5, 0.5, 8), h.wrap || tint(h.c1, -0.35), [0, -0.15, 0], [0.085, 0.05, 0.085]);
        put(ico(1), hand, [0, -0.195, 0], 0.075);
      }
      if (h.claw) for (let i = -1; i <= 1; i++) put(cone(4), '#1c1a20', [i * 0.03, -0.245, 0.02], [0.022, 0.06, 0.022], [PI, 0, 0]);
    }, 0.9, 1.02);
  }

  /* 兵器。hand：握在手里的（原点在手心，刃朝 +Z）；side：立在身侧的长家伙（原点在脚边的地上）。glow 是另一块发光的 */
  function weaponGeo(key, h) {
    const w = h.weapon; let hand = null, side = null, glow = null;
    const STEEL = '#cfd6de', WOOD = '#5a4030';
    if (w === 'saber' || w === 'sword' || w === 'bronze') {
      const bc = w === 'bronze' ? '#7c9a6c' : STEEL, wide = w === 'saber';
      hand = bake(key + ':wp', (put) => {
        put(cyl(0.5, 0.5, 6), WOOD, [0, 0, 0], [0.035, 0.13, 0.035], PUT_Z);
        put(box(), h.guard || '#a8853c', [0, 0, 0.075], [0.04, wide ? 0.1 : 0.12, 0.022]);
        if (wide) { put(box(), bc, [0, 0.005, 0.25], [0.016, 0.075, 0.33]); put(box(), bc, [0, 0.026, 0.4], [0.016, 0.105, 0.1], [0.5, 0, 0]); put(box(), tint(bc, -0.3), [0, -0.03, 0.26], [0.018, 0.016, 0.36]); } // 刀：前宽后窄，刀背一道暗
        else { put(box(), bc, [0, 0, 0.29], [0.014, 0.05, 0.42]); put(cone(4), bc, [0, 0, 0.53], [0.05, 0.07, 0.014], PUT_Z); }
      }, 1, 1);
    } else if (w === 'glaive') { // 长柄刀
      hand = bake(key + ':wp', (put) => { put(cyl(0.5, 0.5, 6), '#3a2a22', [0, 0, 0.12], [0.03, 0.7, 0.03], PUT_Z); put(box(), STEEL, [0, 0.02, 0.6], [0.016, 0.1, 0.3]); put(box(), STEEL, [0, 0.045, 0.74], [0.016, 0.12, 0.1], [0.55, 0, 0]); put(box(), '#a8853c', [0, 0, 0.44], [0.05, 0.07, 0.03]); }, 1, 1);
    } else if (w === 'bow') {
      hand = bake(key + ':wp', (put) => { put(tor(0.035, PI), h.bowC || '#7a4f2a', [0, 0, 0.03], [0.46, 0.36, 0.46], [0, PI / 2, PI / 2]); put(box(), '#e6dcc0', [0, 0, 0.03], [0.006, 0.44, 0.006]); put(cyl(0.5, 0.5, 6), '#3a2a22', [0, 0, 0.2], [0.04, 0.07, 0.04]); }, 1, 1);
    } else if (w === 'crossbow') {
      hand = bake(key + ':wp', (put) => { put(box(), WOOD, [0, 0, 0.12], [0.05, 0.05, 0.3]); put(box(), '#a8853c', [0, 0.01, 0.24], [0.34, 0.03, 0.035]); for (const sx of [-1, 1]) put(box(), '#a8853c', [sx * 0.18, 0.01, 0.2], [0.03, 0.03, 0.1], [0, sx * 0.5, 0]); put(cone(4), STEEL, [0, 0.03, 0.3], [0.03, 0.08, 0.03], PUT_Z); }, 1, 1);
    } else if (w === 'banner') { // 魂幡：黑幡破破烂烂
      side = bake(key + ':wp', (put) => {
        put(cyl(0.5, 0.5, 6), '#1c1a20', [0, 0.47, 0], [0.028, 0.94, 0.028]); put(cone(4), '#2a2a30', [0, 0.98, 0], [0.06, 0.1, 0.02]);
        put(box(), '#1c1a20', [0, 0.86, -0.11], [0.02, 0.02, 0.24]);
        put(box(), h.flag || '#15171c', [0, 0.69, -0.12], [0.016, 0.32, 0.2]);
        for (let i = 0; i < 3; i++) put(cone(4), h.flag || '#15171c', [0, 0.49 - (i % 2) * 0.03, -0.05 - i * 0.07], [0.016, 0.12 + (i % 2) * 0.05, 0.07], [PI, 0, 0]);
        put(tor(0.1), h.c2, [0.011, 0.72, -0.12], [0.1, 0.1, 0.1], [0, PI / 2, 0]);
      }, 1, 1);
    } else if (w === 'staff') { // 骷髅杖
      side = bake(key + ':wp', (put) => { put(cyl(0.44, 0.5, 6), '#1c1a1e', [0, 0.42, 0], [0.04, 0.84, 0.04]); put(tor(0.09, PI * 1.4), '#1c1a1e', [0, 0.89, 0.0], [0.14, 0.14, 0.14], [0, PI / 2, 0.4]); put(ico(1), '#e8e4d4', [0, 0.87, 0.02], [0.1, 0.105, 0.1]); for (const sx of [-1, 1]) put(sph(6), '#1c1a1e', [sx * 0.022, 0.875, 0.062], 0.026); }, 1, 1);
    } else if (w === 'halberd') { // 石戟
      side = bake(key + ':wp', (put) => { put(cyl(0.5, 0.5, 6), h.c2, [0, 0.55, 0], [0.045, 1.1, 0.045]); put(cone(4), h.c1, [0, 1.2, 0], [0.09, 0.22, 0.03]); put(ico(0), h.c1, [0, 1.02, 0.09], [0.03, 0.26, 0.2]); put(box(), h.c1, [0, 1.02, -0.06], [0.03, 0.08, 0.1]); }, 1, 1);
    } else if (w === 'flame') { // 掌心一团火
      glow = bake(key + ':wpg', (put) => { put(cone(6), h.flame, [0, 0.07, 0.0], [0.1, 0.2, 0.1]); put(sph(8), tint(h.flame, 0.45), [0, 0.02, 0], 0.08); put(cone(5), h.flame, [0.035, 0.05, 0.02], [0.05, 0.12, 0.05], [0, 0, -0.4]); }, 1, 1);
    }
    return { hand, side, glow };
  }

  /* 一个人。key 是单子的名字，o.scale 是整体的大小 */
  function build(key, o = {}) {
    const h = TOON[key]; if (!h) return null;
    const c = Mo._ctx(), g = c.g, mat = toonMat(c), glo = h.eyeGlow || h.weapon === 'flame' ? c.glow('#ffffff', { vertexColors: true }) : null, b = h.bulk || 1;
    const body = c.grp([0, 0, 0]);
    const sk = skirtGeo(key, h); if (sk) mesh(sk, mat, body);
    const legs = [-1, 1].map((sx) => { const lg = c.grp([sx * 0.068 * b, HIP, 0], body); mesh(legGeo(key, h), mat, lg); return lg; });
    const torso = c.grp([0, HIP, 0], body); mesh(torsoGeo(key, h), mat, torso);
    const head = c.grp([0, NECK - HIP, 0], torso), [hg, eg] = headGeo(key, h);
    mesh(hg, mat, head); if (eg) mesh(eg, glo, head, false);
    head.scale.setScalar(HS * (h.headS || 1));
    const ax = 0.135 * b + 0.025, ay = NECK - HIP - 0.055;
    const arms = [-1, 1].map((sx) => { const a = c.grp([sx * ax, ay, 0], torso); mesh(armGeo(key, h, sx), mat, a); return a; });
    const W = weaponGeo(key, h), wr = c.grp([0, -0.2, 0], arms[1]);
    if (W.hand) mesh(W.hand, mat, wr); if (W.glow) mesh(W.glow, glo, wr, false);
    if (W.side) { const sd = c.grp([(ax + 0.085) * 1, -HIP, 0.09], torso); mesh(W.side, mat, sd); }
    const sc = (h.s || 1) * (o.scale || 1); g.scale.setScalar(sc);
    const act = h.act || 'chop', rest = h.rest !== undefined ? h.rest : W.side ? -0.75 : W.hand ? -0.3 : 0, spread = 0.2 + (b - 1) * 0.25, ph = Math.random() * 6.28;
    return Mo._finish(c, 1.02 * sc, function (e) {
      const t = (e.t || 0) + ph, mv = e.moving ? 1 : 0, wind = Math.min(1, e.wind || 0), atk = Math.min(1, e.atk || 0), dash = e.charge || e.dashing ? 1 : 0;
      const sp = dash ? 17 : 11, s = mv ? Math.sin(t * sp) : 0, br = Math.sin(t * 2.2);
      if (h.stiff) { // 僵尸：两臂平举，一蹦一蹦
        body.position.y = mv ? Math.abs(Math.sin(t * 7)) * 0.075 : 0; legs[0].rotation.x = legs[1].rotation.x = 0;
        arms[0].rotation.set(-1.45 + br * 0.03, 0, 0.08); arms[1].rotation.set(-1.45 - br * 0.03 - atk * 0.5 + wind * 0.3, 0, -0.08);
        torso.rotation.x = atk * 0.25 - wind * 0.1; head.rotation.x = 0; return;
      }
      legs[0].rotation.x = s * 0.75; legs[1].rotation.x = -s * 0.75;
      body.position.y = mv ? Math.abs(Math.cos(t * sp)) * 0.022 : br * 0.004;
      body.rotation.z = s * 0.035;
      let wx; // 出手的那只手
      if (act === 'cast') wx = atk > 0.02 ? U.lerp(rest, -1.5, Math.min(1, atk * 1.4)) : wind > 0 ? U.lerp(rest, -1.2, wind) : rest - s * 0.5;                    // 抬手一指
      else if (act === 'shoot') wx = wind > 0 || atk > 0.02 ? -1.45 : rest - s * 0.3;                                                                                // 举起来瞄
      else wx = wind > 0 ? U.lerp(rest, -2.5, wind) : atk > 0.02 ? U.lerp(rest, 0.75, atk) : rest - s * (W.side ? 0.1 : 0.5);                                         // 抡起来，劈下去
      arms[1].rotation.set(wx, 0, -spread * (1 - Math.min(1, Math.abs(wx) * 0.6)));
      arms[0].rotation.set(s * 0.6 + (act === 'shoot' && (wind > 0 || atk > 0.02) ? -1.2 : 0) + (dash ? 0.6 : 0), 0, spread);
      torso.rotation.x = dash ? 0.38 : wind > 0 && act === 'chop' ? -0.14 * wind : atk > 0.02 && act === 'chop' ? 0.26 * atk : mv * 0.1 + br * 0.012;
      torso.rotation.y = act === 'chop' ? (wind > 0 ? -0.35 * wind : atk > 0.02 ? 0.4 * atk : 0) : 0;
      head.rotation.x = -torso.rotation.x * 0.55 + br * 0.02; head.rotation.y = -torso.rotation.y * 0.6;
    });
  }

  /* ---------- 每个人长什么样 ----------
     c1 衣 / c2 缘边 / c3 腰带 / c4 裤；head 头上的样式；top 上身 / lower 下摆 / leg 腿 / sleeve 袖；
     weapon 兵器；act 出手的样子（chop 抡劈 / cast 抬手 / shoot 举着瞄）；bulk 身宽；s 整体大小 */
  const SK = '#f4d4b6', TAN = '#e0a878';
  const TOON = {
    hero: { skin: SK, hair: '#1e1c24', head: 'bun', ribbon: '#cfe6d4', c1: '#3f8f86', c2: '#e3f1e6', c3: '#2b3338', c4: '#30383c', lower: 'robe', sleeve: 'wide', back: 'sword', act: 'cast' },
    thug: { skin: TAN, hair: '#5a3a26', head: 'band', hat: '#b83228', brow: 'angry', c1: '#8a5a3a', c2: '#5a3a26', c3: '#b83228', c4: '#4a3428', lower: 'tunic', leg: 'baggy', sleeve: 'narrow', wrap: '#d8c8a8', patch: '#6a4630', weapon: 'saber' },
    archer: { skin: TAN, hair: '#2a2420', head: 'hood', hat: '#6a6252', face: '#c89a70', brow: 'flat', c1: '#74705c', c2: '#4a4638', c3: '#3a3028', c4: '#4a4438', lower: 'tunic', leg: 'baggy', sleeve: 'narrow', back: 'quiver', weapon: 'bow', act: 'shoot', rest: -0.5 },
    ironslave: { skin: '#9a969c', head: 'bald', muzzle: '#4a474e', scar: '#b04038', brow: 'angry', top: 'bare', collar: '#4a474e', chain: '#5a575e', c1: '#5a4e4a', c2: '#3a3432', c3: '#6a5a4a', lower: 'none', leg: 'pants', c4: '#4a4244', sleeve: 'bare', fist: '#4a474e', bulk: 1.45, s: 1.22, headS: 0.86 },
    disciple: { skin: '#f8dccc', hair: '#3a2c30', head: 'tail', ribbon: '#8fb4ee', pin: '#c8d8f4', c1: '#eef0fa', c2: '#8fb0e8', c3: '#7a9ae0', c4: '#d8dcec', boot: '#e8ecf6', lower: 'robe', sleeve: 'wide', weapon: 'sword', guard: '#c8d8f4', act: 'cast', rest: -0.2 },
    ghostcult: { skin: '#c4d0c0', face: '#9aa898', head: 'hood', hat: '#232a26', c1: '#2a332e', c2: '#5fd898', c3: '#141a16', c4: '#1c221e', lower: 'robe', sleeve: 'wide', weapon: 'banner', act: 'cast' },
    bloodguard: { skin: '#c8a090', head: 'helmMask', hat: '#8a2428', hat2: '#c8a04a', plume: '#c83030', mask: '#3a2a2a', top: 'armor', c1: '#9a262c', c2: '#d0a84a', c3: '#2a1214', under: '#2c1418', lower: 'tasset', leg: 'armor', sleeve: 'armor', hand: '#3a2a2a', weapon: 'glaive', bulk: 1.08, s: 1.06 },
    flamecult: { skin: '#ecd0c4', hair: '#2c2238', head: 'bun', ribbon: '#a060f0', brow: 'angry', c1: '#2e2640', c2: '#a060f0', c3: '#6a3ab0', c4: '#201a2c', lower: 'robe', sleeve: 'wide', weapon: 'flame', flame: '#b070ff', act: 'cast', rest: -0.9 },
    ironcorpse: { skin: '#8e9cac', head: 'qing', eye: '#f4f4f4', c1: '#2a3350', c2: '#c8a04a', c3: '#a83030', c4: '#1e2438', lower: 'robe', sleeve: 'wide', hand: '#8e9cac', claw: 1, stiff: 1, bulk: 1.15, s: 1.18 },
    puppetarcher: { skin: '#c8a070', hair: '#6a4a30', metal: '#b08a4a', head: 'puppet', eyeGlow: '#6affea', top: 'puppet', c1: '#5a4030', c2: '#b08a4a', c3: '#a83030', lower: 'tunic', skirt: '#4a3428', leg: 'puppet', sleeve: 'puppet', hand: '#b08a4a', weapon: 'crossbow', act: 'shoot', rest: -0.6 },
    golem: { skin: '#9aa4b0', head: 'helm', hat: '#8a94a2', hat2: '#6a7482', horn: 1, eyeGlow: '#6ad0ff', face: '#7a8492', top: 'armor', moss: '#6a8a54', c1: '#98a2b0', c2: '#5a6472', c3: '#4a5462', under: '#727c8a', lower: 'tasset', leg: 'armor', sleeve: 'armor', hand: '#7a8492', boot: '#6a7482', weapon: 'halberd', bulk: 1.4, s: 1.42, headS: 0.82 },
    corpse: { skin: '#9aa884', head: 'helm', hat: '#6a8a5c', hat2: '#a8904a', eyeGlow: '#b8ff7a', face: '#7c8a68', top: 'armor', c1: '#6f9a64', c2: '#b89a4a', c3: '#3c4a30', under: '#38442e', lower: 'tasset', leg: 'armor', sleeve: 'armor', hand: '#7c8a68', boot: '#4a5a3c', weapon: 'bronze', guard: '#a8904a', bulk: 1.15, s: 1.12 },
    modaifu: { skin: '#e4d0b8', hair: '#a8a8ac', head: 'elder', ribbon: '#3a3a40', beard: '#b8b8bc', brow: 'flat', browC: '#a8a8ac', c1: '#5a5e68', c2: '#c9ccd4', c3: '#2e3038', c4: '#3a3c44', lower: 'robe', sleeve: 'wide', handR: '#dfe6f0', act: 'chop', rest: -0.2 },
    wangchan: { skin: '#f2dcd4', hair: '#261a1e', head: 'tail', ribbon: '#c83040', hatTop: '#e0b84a', brow: 'angry', c1: '#8a1a26', c2: '#e0b84a', c3: '#1e1214', c4: '#2a1418', lower: 'robe', sleeve: 'wide', back: 'cape', cape: '#3a1218', act: 'cast' },
    jiyin: { skin: '#b8c6b4', hair: '#e8ece8', head: 'long', beard: '#e8ece8', hatTop: '#2a332e', brow: 'angry', browC: '#e8ece8', c1: '#24322c', c2: '#6ae89a', c3: '#141c18', c4: '#1a221e', lower: 'robe', sleeve: 'wide', weapon: 'staff', act: 'cast' },
    pet_quhun: { skin: '#8a7a70', head: 'bamboo', hat: '#c8a468', brow: 'flat', c1: '#2a282c', c2: '#3a383c', c3: '#1a181c', c4: '#222024', lower: 'tunic', leg: 'baggy', wrap: '#2a282c', sleeve: 'narrow', bulk: 1.32, s: 1.2, headS: 0.88 },
    pet_renxing: { skin: '#eadcc0', hair: '#6a4a34', metal: '#c8a058', head: 'puppet', top: 'puppet', c1: '#e6d8b8', c2: '#c8a058', c3: '#7ab0a8', lower: 'tunic', skirt: '#efe6d0', leg: 'puppet', sleeve: 'puppet', hand: '#c8a058', weapon: 'bow', bowC: '#c8a058', act: 'shoot', rest: -0.5, s: 0.96 },
  };
  Mo.toon = (key, o) => (G.DH ? build(key, o) : null);
  Mo.toonFor = (e, o) => (G.DH && TOON[e.key] ? build(e.key, o) : null);
})();
