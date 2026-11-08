import * as THREE from 'three';
import { TAU, rand } from '../core/math';
import { STAGES } from '../data/waves';
import { ARENA } from '../game/constants';

/** 所有贴图都由 Canvas 现画，不需要任何图片素材。字体加载完成后可整体重绘。 */
interface Entry {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const cache = new Map<string, Entry>();

function make(key: string, w: number, h: number, draw: Entry['draw']): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit.tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const e = { canvas, tex, draw };
  cache.set(key, e);
  paint(e);
  return tex;
}

function paint(e: Entry): void {
  const g = e.canvas.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, e.canvas.width, e.canvas.height);
  e.draw(g, e.canvas.width, e.canvas.height);
  e.tex.needsUpdate = true;
}

/** 字体加载完成后调用：重绘所有含文字的贴图。 */
export function repaintAll(): void {
  for (const e of cache.values()) paint(e);
}

export function glowTexture(): THREE.CanvasTexture {
  return make('glow', 64, 64, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

export function shadowTexture(): THREE.CanvasTexture {
  return make('shadow', 64, 64, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

/** 剑芒：朝 +x 方向的细长剑气。 */
export function swordTexture(): THREE.CanvasTexture {
  return make('sword', 128, 32, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(111,211,192,0)');
    grd.addColorStop(0.6, 'rgba(111,211,192,0.7)');
    grd.addColorStop(1, 'rgba(42,140,122,1)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w * 0.7, h * 0.2);
    g.lineTo(w, h / 2);
    g.lineTo(w * 0.7, h * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = '#e9fff9';
    g.fillRect(w * 0.55, h / 2 - 1.5, w * 0.4, 3);
  });
}

export function windTexture(): THREE.CanvasTexture {
  return make('wind', 64, 64, (g, w) => {
    g.strokeStyle = '#4fb39a';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(w * 0.35, w / 2, w * 0.38, -1.1, 1.1);
    g.stroke();
    g.strokeStyle = 'rgba(220,255,245,0.9)';
    g.lineWidth = 2.5;
    g.stroke();
  });
}

export function bugTexture(): THREE.CanvasTexture {
  return make('bug', 64, 64, (g, w) => {
    const c = w / 2;
    g.fillStyle = 'rgba(230,220,160,0.6)';
    g.beginPath();
    g.ellipse(c - 6, c - 12, 12, 6, -0.6, 0, TAU);
    g.ellipse(c - 6, c + 12, 12, 6, 0.6, 0, TAU);
    g.fill();
    g.fillStyle = '#c7b14a';
    g.beginPath();
    g.ellipse(c, c, 16, 9, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#5a4d14';
    g.beginPath();
    g.arc(c + 13, c, 5, 0, TAU);
    g.fill();
  });
}

export function crossTexture(): THREE.CanvasTexture {
  return make('cross', 64, 64, (g, w) => {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(w - 10, w - 10);
    g.moveTo(w - 10, 10);
    g.lineTo(10, w - 10);
    g.stroke();
  });
}

/** 预警带：从起点（左）渐隐到终点（右）。 */
export function telegraphTexture(): THREE.CanvasTexture {
  return make('telegraph', 128, 32, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(176,30,30,0.75)');
    grd.addColorStop(1, 'rgba(176,30,30,0.05)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,10,10,0.8)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  });
}

/** 竞技场地面：宣纸 + 墨迹 + 每张地图的纹样。 */
export function groundTexture(stage: number): THREE.CanvasTexture {
  const st = STAGES[stage];
  const W = 2048;
  const H = Math.round((W * ARENA.h) / ARENA.w);
  return make(`ground:${stage}`, W, H, (g, w, h) => {
    g.fillStyle = st.paper;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${rand(0.01, 0.04)})`;
      g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 3));
    }
    // 石砖缝
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    g.lineWidth = 2;
    const tile = 128;
    for (let y = 0; y < h; y += tile) {
      const off = (y / tile) % 2 ? tile / 2 : 0;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      for (let x = off; x < w; x += tile) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + tile);
        g.stroke();
      }
    }
    // 墨晕
    for (let i = 0; i < 26; i++) {
      g.fillStyle = st.mist;
      g.beginPath();
      g.ellipse(rand(0, w), rand(0, h), rand(60, 260), rand(30, 120), rand(0, TAU), 0, TAU);
      g.fill();
    }
    g.save();
    g.translate(w / 2, h / 2);
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    g.lineWidth = 6;
    if (stage === 0) {
      // 七玄门：八卦阵纹
      for (let r = 120; r <= 360; r += 120) {
        g.beginPath();
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * TAU + Math.PI / 8;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.stroke();
      }
    } else if (stage === 1) {
      // 血色禁地：血迹
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(140,20,20,${rand(0.04, 0.12)})`;
        g.beginPath();
        g.arc(rand(-w / 2, w / 2), rand(-h / 2, h / 2), rand(6, 40), 0, TAU);
        g.fill();
      }
    } else {
      // 乱星海：浪纹
      g.strokeStyle = 'rgba(20,60,90,0.08)';
      for (let y = -h / 2; y < h / 2; y += 60) {
        g.beginPath();
        for (let x = -w / 2; x <= w / 2; x += 20) g.lineTo(x, y + Math.sin(x / 40) * 10);
        g.stroke();
      }
    }
    g.restore();
  });
}
