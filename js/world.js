'use strict';
/* 凡人问道 —— 世界：楼层房间图生成、单间地形生成、碰撞与寻路 */
(function () {
  const G = window.G, U = G.U, T = G.TILE;
  const W = (G.World = {});

  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
  W.DIRS = DIRS; W.OPP = OPP;

  /* ---------------- 楼层：房间图 ---------------- */
  W.genFloor = function (chIdx) {
    const ch = G.Chapters[chIdx];
    for (let attempt = 0; attempt < 40; attempt++) {
      const f = tryFloor(chIdx, ch);
      if (f) return f;
    }
    return tryFloor(chIdx, ch, true);
  };

  function tryFloor(chIdx, ch, force) {
    const map = {};
    const key = (x, y) => x + ',' + y;
    const mk = (x, y) => (map[key(x, y)] = { gx: x, gy: y, type: 'combat', links: {}, cleared: false, visited: false, seen: false, theme: ch.theme, chapter: chIdx });
    const nb = (x, y) => Object.values(DIRS).filter(([dx, dy]) => map[key(x + dx, y + dy)]).length;
    const start = mk(0, 0); start.type = 'start';
    const list = [start];
    let guard = 0;
    while (list.length < ch.rooms && guard++ < 2000) {
      const base = U.pick(list);
      const [dx, dy] = U.pick(Object.values(DIRS));
      const x = base.gx + dx, y = base.gy + dy;
      if (map[key(x, y)]) continue;
      if (Math.abs(x) > 4 || Math.abs(y) > 3) continue;
      if (nb(x, y) > 1 && !U.chance(0.08)) continue;
      list.push(mk(x, y));
    }
    // 追加特殊房（都做成尽头房）
    const specials = ['boss', 'treasure', 'shop', 'garden', 'event'];
    const added = [];
    guard = 0;
    while (added.length < specials.length && guard++ < 3000) {
      const base = U.pick(list);
      if (added.includes(base)) continue;
      const [dx, dy] = U.pick(Object.values(DIRS));
      const x = base.gx + dx, y = base.gy + dy;
      if (map[key(x, y)] || Math.abs(x) > 5 || Math.abs(y) > 4) continue;
      if (nb(x, y) !== 1) continue;
      if (base === start && added.length === 0) continue;
      const r = mk(x, y); added.push(r);
    }
    if (added.length < specials.length && !force) return null;
    const all = Object.values(map);
    // 连接
    for (const r of all) for (const d in DIRS) {
      const o = map[key(r.gx + DIRS[d][0], r.gy + DIRS[d][1])];
      if (o) r.links[d] = o;
    }
    // BFS 距离
    const dist = new Map([[start, 0]]); const q = [start];
    while (q.length) { const r = q.shift(); for (const d in r.links) { const o = r.links[d]; if (!dist.has(o)) { dist.set(o, dist.get(r) + 1); q.push(o); } } }
    for (const r of all) r.depth = dist.get(r) || 0;
    // 最远的尽头房 = 首领
    added.sort((a, b) => b.depth - a.depth);
    if (added[0] && added[0].depth < 3 && !force) return null;
    const rest = U.shuffle(specials.slice(1));
    added.forEach((r, i) => { r.type = i === 0 ? 'boss' : rest[i - 1]; });
    // 精英房
    const combats = all.filter((r) => r.type === 'combat' && r.depth >= 2);
    U.shuffle(combats);
    const nElite = chIdx === 0 ? 1 : 2;
    for (let i = 0; i < Math.min(nElite, combats.length); i++) combats[i].type = 'elite';
    return { rooms: all, start, chapter: chIdx };
  }

  /* ---------------- 单间地形 ---------------- */
  const SIZES = {
    start: [[15, 11]], treasure: [[13, 9]], shop: [[15, 9]], garden: [[15, 11]], event: [[13, 9]],
    combat: [[17, 11], [19, 13], [21, 13], [21, 15], [23, 13], [19, 15]],
    elite: [[21, 15], [23, 15]], boss: [[27, 19]],
    big: [[33, 19], [37, 17], [29, 23], [39, 19], [35, 21], [31, 21]], // 山野的大图：两到三屏
  };

  W.buildRoom = function (room) {
    if (room.built) return;
    /* 地形：不是每张图都是"四面墙 + 四扇门"。
       court 院落 —— 有墙有门，七玄门的屋舍、燕翎堡、虚天殿；
       wild  山野 —— 林木与山石围出的一片不规则空地，出口是土路接栈桥；
       cave  洞窟 —— 四壁都是岩石，没有天。
       血色禁地整章是山野，墨蛟的巢穴是洞窟；七玄门是院落与山谷相间；燕翎堡、虚天殿是殿宇城池与户外相间 */
    const ch = room.chapter || 0, fight = room.type === 'combat' || room.type === 'elite';
    room.terrain = ch === 1 ? (room.type === 'boss' ? 'cave' : 'wild')
      : ch === 0 ? (room.type === 'garden' || (fight && U.chance(0.6)) ? 'wild' : 'court')
      : fight && U.chance(0.5) ? 'wild' : 'court'; // 燕翎堡：一半的险地在城外的焦土战场；虚天殿：一半在殿外的雪原松林
    const big = room.terrain === 'wild' && fight; // 山野里的险地是大图：几片空地由小径连着，要走上两三屏
    let [w, h] = U.pick(big ? SIZES.big : SIZES[room.type]);
    if (room.terrain !== 'court' && room.type !== 'boss' && !big) { w += 4; h += 2; } // 边界会吃掉一圈，山野的小图也放大一点
    room.w = w; room.h = h;
    const tiles = (room.tiles = new Uint8Array(w * h));
    for (let x = 0; x < w; x++) { tiles[x] = 1; tiles[(h - 1) * w + x] = 1; }
    for (let y = 0; y < h; y++) { tiles[y * w] = 1; tiles[y * w + w - 1] = 1; }
    const cx = w >> 1, cy = h >> 1;
    room.doors = {};
    for (const d in room.links) {
      const cells = [];
      for (let i = -1; i <= 1; i++) {
        if (d === 'n') cells.push([cx + i, 0]);
        if (d === 's') cells.push([cx + i, h - 1]);
        if (d === 'w') cells.push([0, cy + i]);
        if (d === 'e') cells.push([w - 1, cy + i]);
      }
      for (const [x, y] of cells) tiles[y * w + x] = 4;
      room.doors[d] = { cells, to: room.links[d] };
    }
    room.props = []; room.lights = []; room.interact = []; room.deco = [];
    room.enemies = []; room.pickups = []; room.puddles = [];
    for (const d in room.doors) room.doors[d].cave = room.terrain === 'cave' || (ch === 1 && room.links[d].type === 'boss'); // 通往洞窟的出口是洞口

    const reserve = new Set(); // 禁止放障碍的格
    const res = (x, y) => reserve.add(y * w + x);
    for (const d in room.doors) for (const [x, y] of room.doors[d].cells) {
      for (let k = 1; k <= 3; k++) for (let j = -1; j <= 1; j++) {
        const dx = DIRS[OPP[d]][0], dy = DIRS[OPP[d]][1];
        res(x + dx * k + (dx ? 0 : j), y + dy * k + (dy ? 0 : j));
      }
    }
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) res(cx + i, cy + j);

    if (big) {
      // 大图：先全填成林子，再挖出几片空地，用小径把它们连起来
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) tiles[y * w + x] = 1;
      const open = (x, y) => { if (x >= 1 && y >= 1 && x <= w - 2 && y <= h - 2) tiles[y * w + x] = 0; };
      // 布局：中央一片，四周环绕四五片，铺满整张图
      const zones = (room.zones = [{ x: cx + 0.5, y: cy + 0.5, rx: U.rand(4.6, 5.8), ry: U.rand(3.4, 4.2) }]);
      for (let n = U.randi(5, 6), i = 0, a0 = U.rand(G.TAU); i < n; i++) {
        const a = a0 + (i / n) * G.TAU + U.rand(-0.2, 0.2), rx = U.rand(4.0, 5.4), ry = U.rand(3.0, 4.0);
        zones.push({ x: U.clamp(cx + 0.5 + Math.cos(a) * w * 0.34, rx + 1.6, w - rx - 1.6), y: U.clamp(cy + 0.5 + Math.sin(a) * h * 0.3, ry + 1.6, h - ry - 1.6), rx, ry });
      }
      for (const z of zones) { // 空地：边缘起伏的椭圆
        const ph = [U.rand(G.TAU), U.rand(G.TAU)];
        for (let y = Math.floor(z.y - z.ry - 1); y <= z.y + z.ry + 1; y++) for (let x = Math.floor(z.x - z.rx - 1); x <= z.x + z.rx + 1; x++) {
          const nx = (x + 0.5 - z.x) / z.rx, ny = (y + 0.5 - z.y) / z.ry, a = Math.atan2(ny, nx);
          if (Math.hypot(nx, ny) < 0.88 + 0.12 * (Math.sin(a * 3 + ph[0]) * 0.6 + Math.sin(a * 5 + ph[1]) * 0.4)) open(x, y);
        }
      }
      room.paths = [];
      const path = (ax, ay, bx, by) => { // 小径：一条略弯的线，沿线挖出三格宽
        const l = Math.hypot(bx - ax, by - ay) || 1, k = U.rand(-0.22, 0.22) * l, mx = (ax + bx) / 2 - ((by - ay) / l) * k, my = (ay + by) / 2 + ((bx - ax) / l) * k;
        room.paths.push([ax, ay, mx, my, bx, by]);
        for (let t = 0; t <= 1.001; t += 0.4 / l) {
          const u = 1 - t, px = u * u * ax + 2 * u * t * mx + t * t * bx, py = u * u * ay + 2 * u * t * my + t * t * by;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) open(Math.floor(px) + i, Math.floor(py) + j);
        }
      };
      for (let i = 1; i < zones.length; i++) { // 每片都连到中央；相邻的两片之间有六成也连上，形成可以兜圈的环路
        path(zones[i].x, zones[i].y, zones[0].x, zones[0].y);
        const nx2 = zones[i === zones.length - 1 ? 1 : i + 1]; if (U.chance(0.6)) path(zones[i].x, zones[i].y, nx2.x, nx2.y);
      }
      for (const d in room.doors) { // 每个出口连到离它最近的那片空地
        const [mx, my] = room.doors[d].cells[1], [dx, dy] = DIRS[OPP[d]], sx = mx + 0.5 + dx * 2, sy = my + 0.5 + dy * 2;
        let b = zones[0]; for (const z of zones) if (Math.hypot(z.x - sx, z.y - sy) < Math.hypot(b.x - sx, b.y - sy)) b = z;
        path(sx, sy, b.x, b.y);
      }
    }
    if (room.terrain !== 'court') {
      // 空地的边界：一圈起伏的曲线（超椭圆 × 随方向变化的半径），线外都是林木 / 岩壁
      const ph = [U.rand(G.TAU), U.rand(G.TAU), U.rand(G.TAU)], amp = room.type === 'boss' ? 0.06 : 0.11;
      const edge = (a) => 0.97 - amp + amp * (Math.sin(a * 2 + ph[0]) * 0.5 + Math.sin(a * 3 + ph[1]) * 0.3 + Math.sin(a * 5 + ph[2]) * 0.2);
      if (!big) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const nx = (x + 0.5 - w / 2) / (w / 2 - 1), ny = (y + 0.5 - h / 2) / (h / 2 - 1);
        if (Math.pow(Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(ny), 2.6), 1 / 2.6) > edge(Math.atan2(ny, nx))) tiles[y * w + x] = 1;
      }
      // 每个出口向内清出一条路，直通空地；路口两侧各立一只火盆
      for (const d in room.doors) {
        const [dx, dy] = DIRS[OPP[d]], cells = room.doors[d].cells;
        for (const [x0, y0] of cells) for (let k = 1; k < Math.max(w, h); k++) {
          const x = x0 + dx * k, y = y0 + dy * k;
          if (x < 1 || y < 1 || x > w - 2 || y > h - 2 || (tiles[y * w + x] === 0 && k > 3)) break;
          tiles[y * w + x] = 0; res(x, y);
        }
        const [mx, my] = cells[1];
        for (const s of [-1, 1]) {
          const fx = mx + 0.5 + dx * 1.6 + (dx ? 0 : s * 2.15), fy = my + 0.5 + dy * 1.6 + (dy ? 0 : s * 2.15);
          room.deco.push({ kind: 'firebowl', x: fx, y: fy, d });
          room.lights.push({ x: fx * T, y: fy * T, z: 30, r: 300, c: 0xffb060 });
        }
      }
    }

    const th = G.Themes[room.theme];
    const put = (x, y, t) => {
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) return false;
      if (reserve.has(y * w + x) || tiles[y * w + x] !== 0) return false;
      // 山野 / 洞窟：障碍不许紧贴林子、岩壁，否则会夹出进不去、打不到的死角
      if (room.terrain !== 'court') for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (tiles[(y + j) * w + x + i] === 1) return false;
      tiles[y * w + x] = t; return true;
    };
    const prop = (x, y, kind) => {
      if (!put(x, y, 2)) return;
      room.props.push({ tx: x, ty: y, kind, v: U.randi(0, 2) });
    };
    const pk = () => U.pick(th.props);

    if (room.type === 'combat' || room.type === 'elite') {
      const snapshot = tiles.slice();
      for (let tryN = 0; tryN < 8; tryN++) {
        tiles.set(snapshot); room.props.length = 0;
        const pat = U.pick(['pillars', 'pond', 'scatter', 'scatter', 'blocks', 'twin', 'ring', 'mix']);
        if (pat === 'pillars') {
          const ox = U.randi(3, 5), oy = U.randi(2, 3), k = pk();
          for (const [x, y] of [[ox, oy], [w - 1 - ox, oy], [ox, h - 1 - oy], [w - 1 - ox, h - 1 - oy]]) prop(x, y, k);
          if (w >= 21) { prop(cx, oy, pk()); prop(cx, h - 1 - oy, pk()); }
        } else if (pat === 'pond') {
          const rx = U.rand(1.6, 3), ry = U.rand(1.2, 2);
          const px = cx + U.randi(-3, 3), py = cy + U.randi(-1, 1);
          for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
            const dx = (x - px) / rx, dy = (y - py) / ry;
            if (dx * dx + dy * dy < 1 + U.rand(-0.15, 0.15)) put(x, y, 3);
          }
          for (let i = 0; i < 4; i++) prop(U.randi(2, w - 3), U.randi(2, h - 3), pk());
        } else if (pat === 'scatter') {
          const n = U.randi(6, 10);
          for (let i = 0; i < n; i++) prop(U.randi(2, w - 3), U.randi(2, h - 3), pk());
        } else if (pat === 'blocks') {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const bx = cx + sx * U.randi(4, 6), by = cy + sy * U.randi(2, 3);
            put(bx, by, 1); if (U.chance(0.6)) put(bx + sx, by, 1); if (U.chance(0.4)) put(bx, by + sy, 1);
          }
          for (let i = 0; i < 3; i++) prop(U.randi(2, w - 3), U.randi(2, h - 3), pk());
        } else if (pat === 'twin') {
          for (const sx of [-1, 1]) {
            const px = cx + sx * U.randi(4, 6), py = cy + U.randi(-1, 1);
            for (let y = py - 1; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++) if (U.chance(0.85)) put(x, y, 3);
          }
          prop(cx, 2, pk()); prop(cx, h - 3, pk());
        } else if (pat === 'ring') {
          const k = pk();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * G.TAU + 0.39;
            prop(Math.round(cx + Math.cos(a) * (w * 0.28)), Math.round(cy + Math.sin(a) * (h * 0.3)), k);
          }
        } else {
          for (let i = 0; i < 4; i++) prop(U.randi(2, w - 3), U.randi(2, h - 3), pk());
          const px = U.randi(4, w - 5), py = U.randi(3, h - 4);
          for (let y = py - 1; y <= py; y++) for (let x = px - 1; x <= px + 1; x++) put(x, y, 3);
          put(U.randi(3, w - 4), U.randi(3, h - 4), 1);
        }
        if (big) for (let i = 0, n = Math.round((w * h) / 60); i < n; i++) prop(U.randi(2, w - 3), U.randi(2, h - 3), pk()); // 大图：各片空地里再散些树石
        if (connected(room)) break;
        if (tryN === 7) { tiles.set(snapshot); room.props.length = 0; }
      }
    } else if (room.type === 'boss') {
      const k = th.props[2];
      for (const [x, y] of [[4, 3], [w - 5, 3], [4, h - 4], [w - 5, h - 4]]) prop(x, y, k);
      if (room.chapter === 1) { // 墨蛟的湖：四汪深潭
        for (const [ox, oy] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) {
          for (let y = cy + oy - 2; y <= cy + oy + 2; y++) for (let x = cx + ox - 3; x <= cx + ox + 3; x++) {
            const dx = (x - cx - ox) / 2.4, dy = (y - cy - oy) / 1.5;
            if (dx * dx + dy * dy < 1.05) put(x, y, 3);
          }
        }
      }
    } else {
      // 安全房：四角点缀
      const k1 = th.props[2], k2 = th.props[0];
      prop(2, 2, k1); prop(w - 3, 2, k1);
      if (room.type !== 'shop') { prop(2, h - 3, k2); prop(w - 3, h - 3, k2); }
    }

    // 小径旁的石灯：每条路的中段立一盏，夜里顺着灯就能看出路往哪里通
    for (const q of room.paths || []) {
      const mx = 0.25 * q[0] + 0.5 * q[2] + 0.25 * q[4], my = 0.25 * q[1] + 0.5 * q[3] + 0.25 * q[5], l = Math.hypot(q[4] - q[0], q[5] - q[1]) || 1;
      for (const s of [1.25, -1.25]) {
        const lx = Math.floor(mx - ((q[5] - q[1]) / l) * s), ly = Math.floor(my + ((q[4] - q[0]) / l) * s);
        if (lx < 2 || ly < 2 || lx > w - 3 || ly > h - 3 || tiles[ly * w + lx] !== 0 || room.deco.some((dd) => Math.abs(dd.x - lx - 0.5) < 5.5 && Math.abs(dd.y - ly - 0.5) < 4)) continue; // 灯与灯、灯与火盆之间隔开些
        room.deco.push({ kind: 'lamp', x: lx + 0.5, y: ly + 0.5 });
        room.lights.push({ x: (lx + 0.5) * T, y: (ly + 0.5) * T, z: 30, r: 190, c: th.lampHex });
        break;
      }
    }
    // 物件光源
    for (const p of room.props) {
      const L = G.PROP_LIGHT[p.kind];
      if (L) room.lights.push({ x: (p.tx + 0.5) * T, y: (p.ty + 0.5) * T, z: L.z, r: L.r, c: L.c });
    }
    // 北墙壁灯（只有院落才有墙）
    for (let x = 3; x < w - 2 && room.terrain === 'court'; x += 5) {
      if (tiles[x] !== 1) continue;
      room.lights.push({ x: (x + 0.5) * T, y: T * 1.0, z: 40, r: 280, c: th.lampHex, sconce: true });
    }

    // 交互物
    const mid = { x: (cx + 0.5) * T, y: (cy + 0.5) * T };
    if (room.type === 'treasure') room.interact.push({ kind: 'chest', x: mid.x, y: mid.y, r: 46, label: '开启机缘宝匣' });
    if (room.type === 'shop') room.interact.push({ kind: 'shop', x: mid.x, y: mid.y - T, r: 56, label: '坊市 · 交易' });
    if (room.type === 'garden') room.interact.push({ kind: 'garden', x: mid.x, y: mid.y, r: 56, label: '药园 · 以灵露催熟灵药' });
    if (room.type === 'event') room.interact.push({ kind: 'event', x: mid.x, y: mid.y, r: 50, label: '探查' });
    if (room.type === 'start' || room.type === 'treasure' || room.type === 'shop' || room.type === 'garden' || room.type === 'event') room.cleared = true;

    room.built = true; // 三维场景由渲染器在进入房间时按需搭建
  };

  function connected(room) {
    const { w, h, tiles } = room;
    let startI = -1, total = 0;
    for (let i = 0; i < w * h; i++) if (tiles[i] === 0) { total++; if (startI < 0) startI = i; }
    if (startI < 0) return false;
    const seen = new Uint8Array(w * h); seen[startI] = 1;
    const q = [startI]; let n = 1;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && tiles[j] === 0) { seen[j] = 1; n++; q.push(j); }
      }
    }
    return n === total;
  }

  /* ---------------- 碰撞 ----------------
     mode: 0 玩家(地面)  1 敌人(地面)  2 飞行  3 飞行道具 */
  W.solid = function (room, tx, ty, mode) {
    if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return true;
    const t = room.tiles[ty * room.w + tx];
    if (t === 0) return false;
    if (t === 1) return true;
    if (t === 2) return mode !== 2;
    if (t === 3) return mode === 0 || mode === 1;
    if (t === 4) return mode === 0 ? room.locked : true;
    return false;
  };

  W.blocked = function (room, x, y, r, mode) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (W.solid(room, tx, ty, mode)) return true;
    return false;
  };

  // 分轴移动，返回是否撞墙
  W.move = function (room, e, dx, dy, mode) {
    const r = e.r * 0.8;
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (T * 0.4)));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) { if (!W.blocked(room, e.x + sx, e.y, r, mode)) e.x += sx; else hit = true; }
      if (sy) { if (!W.blocked(room, e.x, e.y + sy, r, mode)) e.y += sy; else hit = true; }
    }
    return hit;
  };

  W.los = function (room, ax, ay, bx, by, mode = 3) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / (T * 0.45));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (W.solid(room, Math.floor((ax + (bx - ax) * t) / T), Math.floor((ay + (by - ay) * t) / T), mode)) return false;
    }
    return true;
  };

  /* 以玩家为源的流场（BFS），供地面敌人绕障 */
  W.flow = function (room, px, py) {
    const { w, h } = room;
    if (!room.flowD || room.flowD.length !== w * h) room.flowD = new Int16Array(w * h);
    const D = room.flowD; D.fill(-1);
    const sx = U.clamp(Math.floor(px / T), 0, w - 1), sy = U.clamp(Math.floor(py / T), 0, h - 1);
    const q = [sy * w + sx]; D[sy * w + sx] = 0;
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++], x = i % w, y = (i / w) | 0, d = D[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (D[j] >= 0 || room.tiles[j] !== 0) continue;
        D[j] = d + 1; q.push(j);
      }
    }
  };

  W.flowDir = function (room, x, y) {
    const D = room.flowD; if (!D) return null;
    const { w, h } = room, tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    let best = D[ty * w + tx], bx = 0, by = 0;
    if (best < 0) best = 9999;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const d = D[ny * w + nx];
      if (d < 0) continue;
      if (dx && dy && (D[ty * w + nx] < 0 || D[ny * w + tx] < 0)) continue; // 不穿角
      if (d < best) { best = d; bx = dx; by = dy; }
    }
    if (!bx && !by) return null;
    // 朝目标格中心走，避免蹭墙
    const gx = (tx + bx + 0.5) * T - x, gy = (ty + by + 0.5) * T - y, l = Math.hypot(gx, gy) || 1;
    return { x: gx / l, y: gy / l };
  };

  W.randomFloor = function (room, awayX, awayY, minD) {
    for (let i = 0; i < 80; i++) {
      const tx = U.randi(2, room.w - 3), ty = U.randi(2, room.h - 3);
      if (room.tiles[ty * room.w + tx] !== 0) continue;
      const x = (tx + 0.5) * T, y = (ty + 0.5) * T;
      if (awayX !== undefined && U.dist(x, y, awayX, awayY) < minD) continue;
      return { x, y };
    }
    return { x: (room.w / 2) * T, y: (room.h / 2) * T };
  };

  /* 进门位置 */
  /* 从 (px, py) 出发的步数场：每格记下走到那里要几步（走不到的是 -1）。引路用 */
  W.distField = function (room, px, py) {
    const { w, h } = room, D = new Int16Array(w * h).fill(-1), s = U.clamp(Math.floor(py / T), 0, h - 1) * w + U.clamp(Math.floor(px / T), 0, w - 1), q = [s];
    D[s] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx, t = room.tiles[j];
        if (D[j] >= 0 || (t !== 0 && t !== 4)) continue;
        D[j] = D[i] + 1; q.push(j);
      }
    }
    return D;
  };

  /* 在 (cx, cy) 周围 rad 像素内找一格空地；找不到就退回全图随机 */
  W.randomFloorNear = function (room, cx, cy, rad, awayX, awayY, minD) {
    for (let i = 0; i < 60; i++) {
      const a = U.rand(G.TAU), r = Math.sqrt(Math.random()) * rad, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75, tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 1 || ty < 1 || tx > room.w - 2 || ty > room.h - 2 || room.tiles[ty * room.w + tx] !== 0) continue;
      const gx = (tx + 0.5) * T, gy = (ty + 0.5) * T; // 落在格子正中，免得半个身子嵌进林子里动不了
      if (U.dist(gx, gy, awayX, awayY) < minD) continue;
      return { x: gx, y: gy };
    }
    return W.randomFloor(room, awayX, awayY, minD);
  };

  W.entryPos = function (room, fromDir) {
    const d = room.doors[fromDir];
    if (!d) return { x: (room.w / 2) * T, y: (room.h / 2) * T };
    const [x, y] = d.cells[1];
    const o = DIRS[OPP[fromDir]];
    return { x: (x + 0.5 + o[0] * 1.6) * T, y: (y + 0.5 + o[1] * 1.6) * T };
  };
})();
