'use strict';
/* 凡人问道 —— 核心：命名空间、工具函数、输入 */
(function () {
  const G = (window.G = {});

  /* 画风：dh = 写实贴图（地面、岩石、草木用生成的贴图，暗一些的环境托住发光的法术）；ink = 青绿山水（绢本设色）。
     网址带 ?style=ink 或 ?style=dh 可以切换，选择会记住 */
  G.STYLE = (() => {
    let s = null;
    try { s = new URLSearchParams(location.search).get('style'); if (s === 'ink' || s === 'dh') localStorage.setItem('fr_style', s); else s = localStorage.getItem('fr_style'); } catch (e) { /* 读不到就用默认 */ }
    return s === 'ink' ? 'ink' : 'dh';
  })();
  G.PAPER = G.STYLE === 'ink'; G.DH = !G.PAPER;
  document.documentElement.classList.add(G.PAPER ? 'paper' : 'dh');

  G.TILE = 48;        // 逻辑坐标：一格边长（渲染时 1 格 = 1 个三维单位）
  G.TAU = Math.PI * 2;

  const U = (G.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
    ang: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    angDiff(a, b) {
      let d = (b - a) % G.TAU;
      if (d > Math.PI) d -= G.TAU;
      if (d < -Math.PI) d += G.TAU;
      return d;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    // 确定性哈希噪声（用于贴图烘焙，保证同一格每次画出来一样）
    hash(x, y, s = 0) {
      let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
      h = (h ^ (h >>> 13)) * 1274126177;
      h = h ^ (h >>> 16);
      return ((h >>> 0) % 100000) / 100000;
    },
    // 点到线段距离
    segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    },
    weighted(items, wf) {
      let tot = 0;
      for (const it of items) tot += wf(it);
      let r = Math.random() * tot;
      for (const it of items) {
        r -= wf(it);
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
    fmtTime(s) {
      const m = Math.floor(s / 60), ss = Math.floor(s % 60);
      return m + ':' + (ss < 10 ? '0' : '') + ss;
    },
  });

  /* ---------------- 输入 ---------------- */
  const Input = (G.Input = {
    keys: {},
    pressed: {},
    mouse: { x: 0, y: 0, down: false, rdown: false, moved: false },
    touchMode: false,
    stick: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 },
    btn: {},        // 触屏按钮按住状态
    btnPressed: {}, // 触屏按钮本帧按下

    init(canvas) {
      const kd = (e) => {
        const k = e.code;
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
        if (this.touchMode && k !== 'Unidentified') this.setTouchMode(false);
      };
      const ku = (e) => { this.keys[e.code] = false; };
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup', ku);
      window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; this.mouse.rdown = false; });

      canvas.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true;
      });
      canvas.addEventListener('mousedown', (e) => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (e.button === 0) { this.mouse.down = true; this.pressed.Mouse0 = true; }
        if (e.button === 2) { this.mouse.rdown = true; this.pressed.Mouse2 = true; }
        if (this.touchMode) this.setTouchMode(false);
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.down = false;
        if (e.button === 2) this.mouse.rdown = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // 触屏：左半屏虚拟摇杆
      const ts = (e) => {
        if (!this.touchMode) this.setTouchMode(true);
        for (const t of e.changedTouches) {
          if (!this.stick.active && t.clientX < window.innerWidth * 0.5) {
            this.stick.active = true; this.stick.id = t.identifier;
            this.stick.ox = t.clientX; this.stick.oy = t.clientY;
            this.stick.dx = 0; this.stick.dy = 0;
          }
        }
        this.pressed.Touch = true;
        e.preventDefault();
      };
      const tm = (e) => {
        for (const t of e.changedTouches) {
          if (this.stick.active && t.identifier === this.stick.id) {
            let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
            const l = Math.hypot(dx, dy), max = 56;
            if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
            this.stick.dx = dx / max; this.stick.dy = dy / max;
          }
        }
        e.preventDefault();
      };
      const te = (e) => {
        for (const t of e.changedTouches) {
          if (this.stick.active && t.identifier === this.stick.id) {
            this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
          }
        }
        e.preventDefault();
      };
      canvas.addEventListener('touchstart', ts, { passive: false });
      canvas.addEventListener('touchmove', tm, { passive: false });
      canvas.addEventListener('touchend', te, { passive: false });
      canvas.addEventListener('touchcancel', te, { passive: false });
    },

    setTouchMode(on) {
      this.touchMode = on;
      document.body.classList.toggle('touch', on);
    },

    // 归一化移动向量
    moveVec() {
      let x = 0, y = 0;
      const k = this.keys;
      if (k.KeyA || k.ArrowLeft) x -= 1;
      if (k.KeyD || k.ArrowRight) x += 1;
      if (k.KeyW || k.ArrowUp) y -= 1;
      if (k.KeyS || k.ArrowDown) y += 1;
      if (this.stick.active) { x += this.stick.dx; y += this.stick.dy; }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      return { x, y, l: Math.min(1, l) };
    },

    hit(name) { return !!(this.pressed[name] || this.btnPressed[name]); },
    held(name) { return !!(this.keys[name] || this.btn[name]); },

    endFrame() {
      this.pressed = {};
      this.btnPressed = {};
      this.mouse.moved = false;
    },
  });
})();
