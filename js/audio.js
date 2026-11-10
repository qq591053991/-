'use strict';
/* 凡人问道 —— 音频：全部由 WebAudio 实时合成，无任何音频素材 */
(function () {
  const G = window.G, U = G.U;

  const A = (G.Audio = {
    ctx: null, master: null, sfxBus: null, musBus: null, delay: null,
    muted: false, _last: {}, theme: null, timer: null, nextT: 0, step: 0, noiseBuf: null,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = (this.ctx = new AC());
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(ctx.destination);
        this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
        this.musBus = ctx.createGain(); this.musBus.gain.value = 0.36; this.musBus.connect(this.master);
        // 简易回声，给拨弦一点空间感
        const d = (this.delay = ctx.createDelay(1.0)); d.delayTime.value = 0.33;
        const fb = ctx.createGain(); fb.gain.value = 0.32;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.musBus);
        // 噪声缓冲
        const len = ctx.sampleRate;
        const buf = (this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate));
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        if (this.theme) this._startLoop();
      } catch (e) { this.ctx = null; }
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
      return this.muted;
    },

    tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, bus, when = 0) {
      const ctx = this.ctx; if (!ctx) return;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || this.sfxBus);
      o.start(t); o.stop(t + dur + 0.02);
    },

    noise(dur, vol = 0.3, f0 = 1200, f1 = 0, ftype = 'bandpass', q = 1, bus, when = 0) {
      const ctx = this.ctx; if (!ctx) return;
      const t = ctx.currentTime + when;
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
      s.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    },

    /* 拨弦（类古筝）：起音略高再滑落，快速衰减 */
    pluck(freq, vol = 0.25, dur = 1.6, when = 0, type = 'triangle') {
      const ctx = this.ctx; if (!ctx) return;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 6, t); lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur * 0.6);
      o.type = type; o2.type = 'sine';
      o.frequency.setValueAtTime(freq * 1.025, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      o2.frequency.setValueAtTime(freq * 2.003, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      g.connect(this.musBus); g.connect(this.delay);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    sfx(name) {
      if (!this.ctx || this.muted) return;
      const now = performance.now();
      if (now - (this._last[name] || 0) < 45) return;
      this._last[name] = now;
      const r = U.rand;
      switch (name) {
        case 'sword': this.noise(0.09, 0.16, 2400 + r(600), 5200, 'bandpass', 3); break;
        case 'hit': this.noise(0.08, 0.28, 900, 300, 'lowpass', 1); this.tone(180 + r(40), 0.07, 'square', 0.08, -90); break;
        case 'crit': this.noise(0.12, 0.35, 1600, 400, 'bandpass', 1); this.tone(880, 0.12, 'triangle', 0.16, 500); break;
        case 'kill': this.noise(0.2, 0.28, 700, 120, 'lowpass', 1); this.tone(140, 0.2, 'sawtooth', 0.1, -80); break;
        case 'hurt': this.tone(220, 0.22, 'sawtooth', 0.26, -140); this.noise(0.16, 0.3, 500, 150, 'lowpass'); break;
        case 'dash': this.noise(0.2, 0.2, 500, 3000, 'bandpass', 1.5); break;
        case 'fire': this.noise(0.22, 0.24, 500, 1600, 'bandpass', 0.8); this.tone(160, 0.2, 'sawtooth', 0.08, 120); break;
        case 'boom': this.noise(0.5, 0.5, 900, 60, 'lowpass', 0.7); this.tone(90, 0.4, 'sine', 0.4, -50); break;
        case 'ice': this.tone(1500 + r(300), 0.16, 'triangle', 0.14, 900); this.noise(0.12, 0.14, 5000, 7000, 'highpass'); break;
        case 'thunder': this.noise(0.42, 0.5, 3000, 90, 'lowpass', 0.5); this.tone(70, 0.35, 'sawtooth', 0.25, -30); break;
        case 'bigsword': this.noise(0.4, 0.3, 300, 2600, 'bandpass', 2); break;
        case 'bugs': for (let i = 0; i < 5; i++) this.tone(1800 + r(900), 0.05, 'square', 0.04, 300, null, i * 0.035); break;
        case 'shield': this.tone(520, 0.4, 'sine', 0.2, 260); this.tone(780, 0.4, 'sine', 0.1, 260); break;
        case 'block': this.tone(1200, 0.12, 'triangle', 0.2, -500); this.noise(0.1, 0.2, 3000, 1000, 'bandpass', 4); break;
        case 'coin': this.tone(1320 + r(200), 0.09, 'triangle', 0.1, 400); break;
        case 'pickup': this.tone(660, 0.1, 'sine', 0.16); this.tone(990, 0.16, 'sine', 0.16, 0, null, 0.07); break;
        case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.14, 0, null, i * 0.08)); break;
        case 'levelup': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.38, 'triangle', 0.16, 0, null, i * 0.07)); break;
        case 'break': [196, 294, 392, 587, 784, 1175].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.18, 0, null, i * 0.11));
          this.noise(1.2, 0.2, 400, 6000, 'bandpass', 0.6); break;
        case 'ui': this.tone(740, 0.06, 'triangle', 0.12); break;
        case 'pick': this.tone(587, 0.12, 'triangle', 0.16); this.tone(880, 0.2, 'triangle', 0.14, 0, null, 0.08); break;
        case 'deny': this.tone(160, 0.14, 'square', 0.1, -40); break;
        case 'door': this.noise(0.3, 0.2, 200, 900, 'bandpass', 1); this.tone(330, 0.3, 'sine', 0.1, 200); break;
        case 'warn': this.tone(440, 0.1, 'square', 0.07); break;
        case 'shoot': this.tone(520 + r(80), 0.08, 'square', 0.05, -200); break;
        case 'spawn': this.tone(110, 0.3, 'sine', 0.14, 200); break;
        case 'roar': this.tone(80, 0.9, 'sawtooth', 0.34, -30); this.noise(0.9, 0.36, 300, 80, 'lowpass', 2); break;
        case 'death': [392, 330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.2, 0, null, i * 0.16)); break;
        case 'portal': this.tone(220, 0.8, 'sine', 0.18, 660); this.noise(0.8, 0.12, 800, 5000, 'bandpass', 1); break;
      }
    },

    /* -------- 生成式配乐：五声音阶即兴 -------- */
    THEMES: {
      menu:  { root: 196.0, scale: [0, 2, 4, 7, 9], bpm: 60, dens: 0.42, drum: 0, bass: 1 },
      ch0:   { root: 220.0, scale: [0, 2, 4, 7, 9], bpm: 78, dens: 0.55, drum: 0, bass: 1 },
      ch1:   { root: 185.0, scale: [0, 3, 5, 7, 10], bpm: 88, dens: 0.6, drum: 0.5, bass: 1 },
      ch2:   { root: 164.8, scale: [0, 1, 5, 7, 8], bpm: 92, dens: 0.55, drum: 0.7, bass: 1 },
      ch3:   { root: 207.6, scale: [0, 2, 5, 7, 9], bpm: 74, dens: 0.6, drum: 0.3, bass: 1 },
      boss:  { root: 146.8, scale: [0, 3, 5, 7, 10], bpm: 138, dens: 0.8, drum: 1, bass: 2 },
    },

    music(name) {
      if (this.theme === name) return;
      this.theme = name;
      this.step = 0; this.deg = 5;
      if (this.ctx) this._startLoop();
    },

    _startLoop() {
      if (this.timer) clearInterval(this.timer);
      if (!this.theme) return;
      this.nextT = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this._tick(), 90);
    },

    _tick() {
      const ctx = this.ctx; if (!ctx || !this.theme) return;
      const th = this.THEMES[this.theme]; if (!th) return;
      const spb = 60 / th.bpm / 2; // 八分音符
      while (this.nextT < ctx.currentTime + 0.3) {
        const when = Math.max(0, this.nextT - ctx.currentTime);
        const s = this.step;
        const strong = s % 4 === 0;
        // 旋律：音阶内随机游走
        if (Math.random() < (strong ? th.dens + 0.2 : th.dens * 0.6)) {
          this.deg += U.pick([-2, -1, -1, 0, 1, 1, 2]);
          this.deg = U.clamp(this.deg, 0, 12);
          const oct = Math.floor(this.deg / 5), d = th.scale[this.deg % 5];
          const f = th.root * Math.pow(2, oct + d / 12);
          this.pluck(f, strong ? 0.2 : 0.13, 1.5, when);
          if (Math.random() < 0.12) this.pluck(f * 1.5, 0.07, 1.0, when + spb * 0.5);
        }
        // 低音
        if (s % (th.bass === 2 ? 4 : 8) === 0) {
          const d = th.scale[U.pick([0, 0, 3, 2])];
          this.pluck((th.root / 2) * Math.pow(2, d / 12), 0.2, 2.2, when, 'sine');
        }
        // 鼓点
        if (th.drum && Math.random() < th.drum) {
          if (s % 4 === 0) { this.tone(70, 0.18, 'sine', 0.3, -30, this.musBus, when); }
          else if (s % 4 === 2 && th.drum >= 0.7) { this.noise(0.06, 0.1, 2500, 1200, 'bandpass', 1, this.musBus, when); }
        }
        this.step++;
        this.nextT += spb;
      }
    },
  });
})();
