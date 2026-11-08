import { TAU, rand } from '../core/math';
import { RARITY_COLORS } from '../data/rarity';
import { STAGES, TOTAL_WAVES, WAVES } from '../data/waves';
import { WEAPONS } from '../data/weapons';
import { ARENA, GLYPH_FONT, H, HUD_H, UI_FONT, W } from './constants';
import { isTelegraphing } from './enemyAI';
import type { Game } from './game';
import type { Enemy } from './types';
import { orbitRadius } from './weaponsys';

const bgCache = new Map<string, HTMLCanvasElement>();

/** 预渲染宣纸底 + 远山水墨背景。 */
function background(stage: number, dpr: number): HTMLCanvasElement {
  const key = `${stage}@${dpr}`;
  const cached = bgCache.get(key);
  if (cached) return cached;
  const st = STAGES[stage];
  const c = document.createElement('canvas');
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(dpr, dpr);
  g.fillStyle = st.paper;
  g.fillRect(0, 0, W, H);
  // 纸纹
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${rand(0.01, 0.035)})`;
    g.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 2));
  }
  // 远山 / 波涛
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = st.mist;
    g.beginPath();
    const base = H - 40 - layer * 60;
    g.moveTo(0, H);
    g.lineTo(0, base);
    let x = 0;
    while (x < W) {
      const w = rand(120, 260);
      const peak = stage === 2 ? rand(10, 30) : rand(60, 180);
      g.quadraticCurveTo(x + w / 2, base - peak, x + w, base - rand(0, 20));
      x += w;
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  // 墨点
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(20,20,20,0.018)';
    g.beginPath();
    g.ellipse(rand(0, W), rand(HUD_H, H), rand(30, 120), rand(6, 18), rand(-0.3, 0.3), 0, TAU);
    g.fill();
  }
  bgCache.set(key, c);
  return c;
}

export function render(g: Game): void {
  const ctx = g.ctx;
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  const stage = g.stageIndex();
  ctx.drawImage(background(g.state === 'title' || g.state === 'select' ? 0 : stage, g.dpr), 0, 0, W, H);

  if (g.state === 'title' || g.state === 'select') return;

  ctx.save();
  if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake) * 0.5, rand(-g.shake, g.shake) * 0.5);

  drawArenaFrame(ctx, STAGES[stage].ink);
  drawSpawns(g);
  drawPickups(g);
  for (const e of g.enemies) drawEnemy(g, e);
  drawTrail(g);
  drawPlayer(g);
  drawOrbit(g);
  drawProjectiles(g);
  drawBullets(g);
  drawBolts(g);
  drawParticles(g);
  drawTexts(g);
  ctx.restore();

  drawHud(g);
  drawBanner(g);
  if (g.state === 'playing') drawCrosshair(g);
}

function drawArenaFrame(ctx: CanvasRenderingContext2D, ink: string): void {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 8;
  ctx.strokeRect(ARENA.x - 5, ARENA.y - 5, ARENA.w + 10, ARENA.h + 10);
  ctx.restore();
}

function drawSpawns(g: Game): void {
  const ctx = g.ctx;
  for (const s of g.spawns) {
    const k = Math.max(0, Math.min(1, 1 - s.t));
    ctx.save();
    ctx.strokeStyle = s.boss ? '#8b0000' : '#b03a2e';
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(g.time * 20);
    ctx.lineWidth = s.boss ? 4 : 2;
    const r = s.def.r * (0.6 + k * 0.6);
    ctx.beginPath();
    ctx.moveTo(s.x - r, s.y - r);
    ctx.lineTo(s.x + r, s.y + r);
    ctx.moveTo(s.x + r, s.y - r);
    ctx.lineTo(s.x - r, s.y + r);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPickups(g: Game): void {
  const ctx = g.ctx;
  for (const pk of g.pickups) {
    const s = 4 + Math.min(4, pk.value);
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.rotate(g.time * 2 + pk.x);
    ctx.fillStyle = '#3fb68b';
    ctx.strokeStyle = '#1d5e47';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(g: Game, e: Enemy): void {
  const ctx = g.ctx;
  ctx.save();
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.35, 0, 0, TAU);
  ctx.fill();

  if (isTelegraphing(e)) {
    ctx.strokeStyle = 'rgba(176,30,30,0.5)';
    ctx.lineWidth = e.r * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    const len = e.boss ? 260 : 220;
    ctx.lineTo(e.x + e.dirX * len, e.y + e.dirY * len);
    ctx.stroke();
  }

  if (e.def.behavior === 'ghost') ctx.globalAlpha = 0.75;
  // 墨团
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.def.color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, TAU);
  ctx.fill();
  if (e.boss) {
    ctx.strokeStyle = e.enraged ? '#b0102a' : '#c9a227';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 5 + Math.sin(g.time * 6) * 2, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = e.flash > 0 ? e.def.color : '#f4efe1';
  ctx.font = `${Math.round(e.r * 1.25)}px ${GLYPH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.def.glyph, e.x, e.y + 1);

  if (!e.boss && e.hp < e.maxHp && e.maxHp > 20) {
    const w = e.r * 2;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 4);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 9, (w * Math.max(0, e.hp)) / e.maxHp, 4);
  }
  ctx.restore();
}

function drawTrail(g: Game): void {
  const ctx = g.ctx;
  for (const t of g.trail) {
    ctx.fillStyle = `rgba(42,140,122,${t.life * 1.2})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, g.player.r * 0.9, 0, TAU);
    ctx.fill();
  }
}

function drawPlayer(g: Game): void {
  const ctx = g.ctx;
  const p = g.player;
  const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(g.time * 20) % 2 === 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.r * 0.85, p.r, p.r * 0.38, 0, 0, TAU);
  ctx.fill();
  if (blink) ctx.globalAlpha = 0.4;

  // 手中剑（指向鼠标）
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.aim);
  ctx.strokeStyle = '#6fd3c0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.r - 2, 0);
  ctx.lineTo(p.r + 18, 0);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#2a8c7a';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#f4efe1';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f4efe1';
  ctx.font = `${p.r * 1.3}px ${GLYPH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('韩', p.x, p.y + 1);

  // 遁术冷却环
  if (p.dashCd > 0) {
    const k = 1 - p.dashCd / g.dashCooldown();
    ctx.strokeStyle = 'rgba(42,140,122,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrbit(g: Game): void {
  const w = g.weapons.find((x) => x.id === 'fengyun');
  if (!w) return;
  const ctx = g.ctx;
  const n = WEAPONS.fengyun.extra[w.tier];
  const rad = orbitRadius(n);
  for (let i = 0; i < n; i++) {
    const a = g.orbitAngle + (i * TAU) / n;
    const x = g.player.x + Math.cos(a) * rad;
    const y = g.player.y + Math.sin(a) * rad;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = RARITY_COLORS[w.tier] === RARITY_COLORS[0] ? '#3aa76d' : RARITY_COLORS[w.tier];
    ctx.strokeStyle = '#1e5e3c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(4, 6);
    ctx.lineTo(0, 10);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawProjectiles(g: Game): void {
  const ctx = g.ctx;
  for (const pr of g.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    const a = Math.atan2(pr.vy, pr.vx);
    switch (pr.kind) {
      case 'sword':
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(42,140,122,0.35)';
        ctx.fillRect(-18, -3, 18, 6);
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -4);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        break;
      case 'fire':
        ctx.fillStyle = 'rgba(232,88,42,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, pr.r + 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(0, 0, pr.r, 0, TAU);
        ctx.fill();
        break;
      case 'wind':
        ctx.rotate(a);
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-4, 0, 10, -1.1, 1.1);
        ctx.stroke();
        break;
      case 'blade':
        ctx.rotate(g.time * 18);
        ctx.fillStyle = pr.color;
        ctx.strokeStyle = '#6b4e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const b = (k * TAU) / 4;
          ctx.lineTo(Math.cos(b) * 11, Math.sin(b) * 11);
          ctx.lineTo(Math.cos(b + 0.4) * 4, Math.sin(b + 0.4) * 4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'bug':
        ctx.rotate(a);
        ctx.fillStyle = '#c7b14a';
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 4, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,70,20,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const flap = Math.sin(g.time * 50) * 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(-3, -6 - flap);
        ctx.moveTo(0, 0);
        ctx.lineTo(-3, 6 + flap);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }
}

function drawBullets(g: Game): void {
  const ctx = g.ctx;
  for (const b of g.bullets) {
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6ea';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
    ctx.fill();
  }
}

function drawBolts(g: Game): void {
  const ctx = g.ctx;
  ctx.save();
  for (const b of g.bolts) {
    ctx.globalAlpha = Math.min(1, b.life / 0.15);
    for (const [color, width] of [['rgba(122,124,255,0.4)', 8], ['#e8e8ff', 2.5]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < b.points.length - 1; i++) {
        const a = b.points[i];
        const c = b.points[i + 1];
        ctx.moveTo(a.x, a.y);
        const segs = 5;
        for (let s = 1; s <= segs; s++) {
          const t = s / segs;
          const j = s === segs ? 0 : 10;
          ctx.lineTo(a.x + (c.x - a.x) * t + rand(-j, j), a.y + (c.y - a.y) * t + rand(-j, j));
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawParticles(g: Game): void {
  const ctx = g.ctx;
  for (const pt of g.particles) {
    const k = pt.life / pt.maxLife;
    if (pt.color.startsWith('ring:')) {
      ctx.strokeStyle = pt.color.slice(5);
      ctx.globalAlpha = k;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1.2 - k * 0.4), 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (0.5 + k * 0.5), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts(g: Game): void {
  const ctx = g.ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2.5);
    ctx.font = `bold ${t.size}px ${UI_FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(244,239,225,0.9)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, fg: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
  ctx.strokeStyle = 'rgba(244,239,225,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawHud(g: Game): void {
  const ctx = g.ctx;
  const p = g.player;
  ctx.save();
  ctx.fillStyle = 'rgba(28,26,22,0.88)';
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = 'rgba(201,162,39,0.6)';
  ctx.fillRect(0, HUD_H - 2, W, 2);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // 气血
  bar(ctx, 20, 12, 260, 18, p.hp / g.stats.maxHp, '#b8322a');
  ctx.font = `bold 13px ${UI_FONT}`;
  ctx.fillStyle = '#f4efe1';
  ctx.fillText(`气血 ${Math.ceil(p.hp)} / ${g.stats.maxHp}`, 28, 22);
  // 修为
  bar(ctx, 20, 38, 260, 10, g.exp / g.expNeed(), '#3fb68b');
  ctx.font = `14px ${UI_FONT}`;
  ctx.fillStyle = '#d9cfa8';
  ctx.fillText(g.realm(), 290, 43);
  // 遁术
  ctx.fillText(p.dashCd > 0 ? `罗烟步 ${p.dashCd.toFixed(1)}s` : '罗烟步 就绪', 290, 21);

  // 波次与计时
  const def = WAVES[g.wave - 1];
  const stage = STAGES[g.stageIndex()];
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4efe1';
  ctx.font = `16px ${UI_FONT}`;
  ctx.fillText(`第 ${g.wave} / ${TOTAL_WAVES} 波 · ${stage.name}`, W / 2, 18);
  ctx.font = `bold 26px ${UI_FONT}`;
  if (def.duration > 0) {
    const t = Math.max(0, Math.ceil(g.waveTime));
    ctx.fillStyle = t <= 5 ? '#ff7a5c' : '#f4efe1';
    ctx.fillText(String(t), W / 2, 44);
  } else {
    ctx.fillStyle = '#ff7a5c';
    ctx.font = `bold 18px ${UI_FONT}`;
    ctx.fillText('首领战', W / 2, 44);
  }

  // 法宝栏
  const slotX = 790;
  for (let i = 0; i < 6; i++) {
    const x = slotX + i * 40;
    const w = g.weapons[i];
    ctx.strokeStyle = w ? RARITY_COLORS[w.tier] : 'rgba(244,239,225,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 14, 34, 34);
    if (w) {
      ctx.fillStyle = WEAPONS[w.id].color;
      ctx.font = `22px ${GLYPH_FONT}`;
      ctx.fillText(WEAPONS[w.id].glyph, x + 17, 32);
    }
  }

  // 灵石 / 灵液
  ctx.textAlign = 'left';
  ctx.font = `bold 15px ${UI_FONT}`;
  ctx.fillStyle = '#3fb68b';
  ctx.fillText(`◆ 灵石 ${Math.floor(g.gold)}`, 1050, 22);
  ctx.fillStyle = '#7fe0a0';
  ctx.fillText(`♦ 掌天瓶灵液 ${g.lingye}`, 1050, 44);

  // Boss 血条
  if (g.boss && !g.boss.dead) {
    const b = g.boss;
    const bw = 560;
    const bx = W / 2 - bw / 2;
    const by = HUD_H + 18;
    bar(ctx, bx, by, bw, 14, b.hp / b.maxHp, b.enraged ? '#b0102a' : '#8a6d1d');
    ctx.textAlign = 'center';
    ctx.font = `bold 13px ${UI_FONT}`;
    ctx.fillStyle = '#f4efe1';
    ctx.fillText(b.def.name, W / 2, by + 7);
  }

  // 底部提示
  ctx.textAlign = 'left';
  ctx.font = `12px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(40,36,30,0.65)';
  ctx.fillText(
    `WASD 移动 · 左键 青元剑芒 · 空格/右键 罗烟步 · F 自动施法${g.autoFire ? '【开】' : ''} · Esc 暂停 · M 静音${g.audio.muted ? '【静】' : ''}`,
    ARENA.x + 6,
    H - 12,
  );
  ctx.restore();
}

function drawBanner(g: Game): void {
  const b = g.banner;
  if (!b) return;
  const ctx = g.ctx;
  const fadeIn = Math.min(1, b.t / 0.3);
  const fadeOut = Math.min(1, (b.dur - b.t) / 0.4);
  const a = Math.max(0, Math.min(fadeIn, fadeOut));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(28,26,22,0.55)';
  ctx.fillRect(0, H / 2 - 70, W, 120);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4efe1';
  ctx.font = `52px ${GLYPH_FONT}`;
  ctx.fillText(b.text, W / 2, H / 2 - 22);
  ctx.font = `18px ${UI_FONT}`;
  ctx.fillStyle = '#d9cfa8';
  ctx.fillText(b.sub, W / 2, H / 2 + 28);
  ctx.restore();
}

function drawCrosshair(g: Game): void {
  const ctx = g.ctx;
  const { x, y } = g.input.mouse;
  ctx.save();
  ctx.strokeStyle = 'rgba(42,140,122,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
  ctx.restore();
}
