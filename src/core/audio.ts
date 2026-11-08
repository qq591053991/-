/** 极简 WebAudio 合成音效，无需任何音频素材。 */
type Sfx = 'shoot' | 'hit' | 'kill' | 'pickup' | 'hurt' | 'dash' | 'levelup' | 'buy' | 'boom' | 'thunder' | 'boss';

export class Audio {
  private ctx: AudioContext | null = null;
  private last: Partial<Record<Sfx, number>> = {};
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  play(name: Sfx): void {
    if (this.muted) return;
    const now = performance.now();
    const gap = name === 'shoot' || name === 'hit' || name === 'pickup' ? 60 : 30;
    if ((this.last[name] ?? 0) + gap > now) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(880, 0.06, 'triangle', 0.03, 400); break;
      case 'hit': this.tone(220, 0.05, 'square', 0.025, -80); break;
      case 'kill': this.tone(160, 0.12, 'sawtooth', 0.04, -100); break;
      case 'pickup': this.tone(1200, 0.05, 'sine', 0.03, 300); break;
      case 'hurt': this.tone(120, 0.25, 'sawtooth', 0.08, -60); break;
      case 'dash': this.tone(500, 0.12, 'sine', 0.04, -300); break;
      case 'levelup': this.tone(523, 0.12, 'triangle', 0.06); setTimeout(() => this.tone(784, 0.2, 'triangle', 0.06), 100); break;
      case 'buy': this.tone(660, 0.08, 'triangle', 0.05, 200); break;
      case 'boom': this.tone(90, 0.25, 'sawtooth', 0.06, -50); break;
      case 'thunder': this.tone(1500, 0.08, 'square', 0.03, -1300); break;
      case 'boss': this.tone(70, 0.8, 'sawtooth', 0.09, 30); break;
    }
  }
}
