import { TAU, clamp, lerp } from '../core/math';
import { ARENA } from './constants';

/**
 * 摄像机姿态（与渲染库无关）。
 * 目标点用游戏坐标 (x, y) + 离地高度 h 表示；yaw=0 表示镜头位于目标“南侧”（屏幕下方）向北看。
 */
export interface CamPose {
  x: number;
  y: number;
  h: number;
  yaw: number;
  pitch: number; // 弧度，0 = 平视，π/2 = 正俯视
  dist: number;
  fov: number; // 垂直视角（度）
  roll: number; // 荷兰角（弧度）
}

export interface CamPreset {
  name: string;
  pitch: number;
  dist: number;
  fov: number;
  follow: number; // 0 = 固定看竞技场中心，1 = 完全跟随玩家
}

const deg = (d: number): number => (d * Math.PI) / 180;

/** 玩家可用 V 键切换的战斗视角。 */
export const PRESETS: CamPreset[] = [
  { name: '标准斜俯视', pitch: deg(54), dist: 640, fov: 40, follow: 0.65 },
  { name: '高空俯视', pitch: deg(82), dist: 900, fov: 45, follow: 0.15 },
  { name: '近景追身', pitch: deg(38), dist: 430, fov: 42, follow: 1 },
];

export function gameplayPose(preset: CamPreset, px: number, py: number): CamPose {
  const cx = ARENA.x + ARENA.w / 2;
  const cy = ARENA.y + ARENA.h / 2;
  return {
    x: lerp(cx, px, preset.follow),
    // 斜视时把注视点略微下移，让玩家处在画面偏下的位置，前方视野更多
    y: lerp(cy, py, preset.follow) - (preset.pitch < deg(70) ? 30 : 0),
    h: 0,
    yaw: 0,
    pitch: preset.pitch,
    dist: preset.dist,
    fov: preset.fov,
    roll: 0,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function lerpPose(a: CamPose, b: CamPose, t: number): CamPose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    h: lerp(a.h, b.h, t),
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    dist: lerp(a.dist, b.dist, t),
    fov: lerp(a.fov, b.fov, t),
    roll: lerpAngle(a.roll, b.roll, t),
  };
}

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ───────────────────────── 演出导演 ─────────────────────────

export interface Focus {
  x: number;
  y: number;
  h: number;
}

export interface Shot {
  /** 镜头时长（秒，真实时间） */
  dur: number;
  /** 从上一个镜头过渡的时长；0 为硬切 */
  blend: number;
  /** t ∈ [0,1] 为镜头内进度；game 为当前战斗视角（用于“回到战斗”镜头） */
  pose: (f: Focus, t: number, game: CamPose) => CamPose;
  /** 游戏时间流速：0 = 定格，0.25 = 慢动作 */
  timeScale: number;
  title?: string;
  subtitle?: string;
  /** 镜头开始时的屏幕震动强度 */
  shake?: number;
  /** 镜头开始时的闪白强度 0..1 */
  flash?: number;
  /** 是否显示黑边 */
  letterbox?: boolean;
}

export class Director {
  active = false;
  shots: Shot[] = [];
  idx = 0;
  t = 0;
  focus: Focus = { x: 0, y: 0, h: 0 };
  /** 当前黑边比例 0..1（平滑过渡） */
  letterbox = 0;
  flash = 0;
  private from: CamPose | null = null;
  private last: CamPose | null = null;
  private onEvent: (shot: Shot) => void = () => {};

  setListener(fn: (shot: Shot) => void): void {
    this.onEvent = fn;
  }

  play(shots: Shot[], focus: Focus): void {
    if (!shots.length) return;
    this.shots = shots;
    this.focus = { ...focus };
    this.idx = 0;
    this.t = 0;
    this.active = true;
    this.from = this.last;
    this.enterShot();
  }

  stop(): void {
    this.active = false;
    this.shots = [];
  }

  get shot(): Shot | null {
    return this.active ? this.shots[this.idx] : null;
  }

  get timeScale(): number {
    return this.shot?.timeScale ?? 1;
  }

  /** 跳过：直接进入最后一个镜头（通常是回到战斗视角）。 */
  skip(): void {
    if (!this.active) return;
    if (this.idx < this.shots.length - 1) {
      this.idx = this.shots.length - 1;
      this.t = 0;
      this.from = this.last;
      this.enterShot();
    }
  }

  private enterShot(): void {
    const s = this.shots[this.idx];
    if (s.flash) this.flash = Math.max(this.flash, s.flash);
    this.onEvent(s);
  }

  update(realDt: number): void {
    this.flash = Math.max(0, this.flash - realDt * 2.5);
    const wantBox = this.active && (this.shot?.letterbox ?? true) ? 1 : 0;
    this.letterbox += clamp(wantBox - this.letterbox, -realDt * 3, realDt * 3);
    if (!this.active) return;
    this.t += realDt;
    const s = this.shots[this.idx];
    if (this.t >= s.dur) {
      this.t -= s.dur;
      this.idx++;
      if (this.idx >= this.shots.length) {
        this.active = false;
        this.shots = [];
        return;
      }
      this.from = this.last;
      this.enterShot();
    }
  }

  /** 输入当前战斗视角，输出演出中的实际镜头。 */
  pose(game: CamPose): CamPose {
    if (!this.active) {
      this.last = game;
      return game;
    }
    const s = this.shots[this.idx];
    const k = s.dur > 0 ? clamp(this.t / s.dur, 0, 1) : 1;
    let p = s.pose(this.focus, k, game);
    if (s.blend > 0 && this.from && this.t < s.blend) {
      p = lerpPose(this.from, p, easeInOut(this.t / s.blend));
    }
    this.last = p;
    return p;
  }
}
