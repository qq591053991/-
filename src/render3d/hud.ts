import { RARITY_COLORS } from '../data/rarity';
import { STAGES, TOTAL_WAVES, WAVES } from '../data/waves';
import { WEAPONS } from '../data/weapons';
import { PRESETS } from '../game/camera';
import { GLYPH_FONT, H, HUD_H, UI_FONT, W } from '../game/constants';
import type { Game } from '../game/game';
import type { Renderer3D } from './scene';

/** 叠在 3D 画面上的 2D 界面层：状态栏、伤害数字、血条、演出黑边与字幕。 */
export class Hud {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private presetToast = 0;
  private lastPreset = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly view: Renderer3D) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = W * this.dpr;
    this.canvas.height = H * this.dpr;
  }

  draw(g: Game, realDt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (g.state === 'title' || g.state === 'select') return;

    if (g.camPreset !== this.lastPreset) {
      this.lastPreset = g.camPreset;
      this.presetToast = 1.6;
    }
    this.presetToast = Math.max(0, this.presetToast - realDt);

    const cine = g.cine;
    const hudAlpha = 1 - cine.letterbox;

    this.drawWorldOverlays(g, hudAlpha);
    if (hudAlpha > 0.01) {
      ctx.globalAlpha = hudAlpha;
      this.drawStatusBar(g);
      this.drawBanner(g);
      ctx.globalAlpha = 1;
    }
    this.drawCinematic(g);
    if (this.presetToast > 0) this.drawToast(`视角：${PRESETS[g.camPreset].name}（V 切换）`, Math.min(1, this.presetToast * 2));
    if (g.state === 'playing' && !cine.active) this.drawCrosshair(g);
  }

  private drawWorldOverlays(g: Game, alpha: number): void {
    const ctx = this.ctx;
    const v = this.view;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 敌人血条
    if (alpha > 0.01) {
      ctx.globalAlpha = alpha;
      for (const e of g.enemies) {
        if (e.boss || e.hp >= e.maxHp || e.maxHp <= 20) continue;
        const s = v.worldToScreen(e.x, e.y, e.r * 2.6);
        if (!s.visible) continue;
        const w = e.r * 1.8;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(s.x - w / 2, s.y - 4, w, 4);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(s.x - w / 2, s.y - 4, (w * Math.max(0, e.hp)) / e.maxHp, 4);
      }
      ctx.globalAlpha = 1;
    }
    // 伤害数字
    for (const t of g.texts) {
      const s = v.worldToScreen(t.x, t.y, 30 + (0.6 - Math.min(0.6, t.life)) * 40);
      if (!s.visible) continue;
      ctx.globalAlpha = Math.min(1, t.life * 2.5);
      ctx.font = `bold ${t.size}px ${UI_FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(244,239,225,0.9)';
      ctx.strokeText(t.text, s.x, s.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  private bar(x: number, y: number, w: number, h: number, k: number, fg: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
    ctx.strokeStyle = 'rgba(244,239,225,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawStatusBar(g: Game): void {
    const ctx = this.ctx;
    const p = g.player;
    ctx.fillStyle = 'rgba(28,26,22,0.85)';
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = 'rgba(201,162,39,0.6)';
    ctx.fillRect(0, HUD_H - 2, W, 2);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    this.bar(20, 12, 260, 18, p.hp / g.stats.maxHp, '#b8322a');
    ctx.font = `bold 13px ${UI_FONT}`;
    ctx.fillStyle = '#f4efe1';
    ctx.fillText(`气血 ${Math.ceil(p.hp)} / ${g.stats.maxHp}`, 28, 22);
    this.bar(20, 38, 260, 10, g.exp / g.expNeed(), '#3fb68b');
    ctx.font = `14px ${UI_FONT}`;
    ctx.fillStyle = '#d9cfa8';
    ctx.fillText(g.realm(), 290, 43);
    ctx.fillText(p.dashCd > 0 ? `罗烟步 ${p.dashCd.toFixed(1)}s` : '罗烟步 就绪', 290, 21);

    const def = WAVES[g.wave - 1];
    const stage = STAGES[g.stageIndex()];
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efe1';
    ctx.font = `16px ${UI_FONT}`;
    ctx.fillText(`第 ${g.wave} / ${TOTAL_WAVES} 波 · ${stage.name}`, W / 2, 18);
    if (def.duration > 0) {
      const t = Math.max(0, Math.ceil(g.waveTime));
      ctx.font = `bold 26px ${UI_FONT}`;
      ctx.fillStyle = t <= 5 ? '#ff7a5c' : '#f4efe1';
      ctx.fillText(String(t), W / 2, 44);
    } else {
      ctx.fillStyle = '#ff7a5c';
      ctx.font = `bold 18px ${UI_FONT}`;
      ctx.fillText('首领战', W / 2, 44);
    }

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

    ctx.textAlign = 'left';
    ctx.font = `bold 15px ${UI_FONT}`;
    ctx.fillStyle = '#3fb68b';
    ctx.fillText(`◆ 灵石 ${Math.floor(g.gold)}`, 1050, 22);
    ctx.fillStyle = '#7fe0a0';
    ctx.fillText(`♦ 掌天瓶灵液 ${g.lingye}`, 1050, 44);

    if (g.boss && !g.boss.dead) {
      const b = g.boss;
      const bw = 560;
      const bx = W / 2 - bw / 2;
      const by = HUD_H + 14;
      this.bar(bx, by, bw, 14, b.hp / b.maxHp, b.enraged ? '#b0102a' : '#8a6d1d');
      ctx.textAlign = 'center';
      ctx.font = `bold 13px ${UI_FONT}`;
      ctx.fillStyle = '#f4efe1';
      ctx.fillText(b.def.name, W / 2, by + 7);
    }

    ctx.textAlign = 'left';
    ctx.font = `12px ${UI_FONT}`;
    ctx.fillStyle = 'rgba(28,26,22,0.6)';
    ctx.fillRect(0, H - 22, W, 22);
    ctx.fillStyle = 'rgba(244,239,225,0.75)';
    ctx.fillText(
      `WASD 移动 · 左键 青元剑芒 · 空格/右键 罗烟步 · F 自动施法${g.autoFire ? '【开】' : ''} · V 切换视角 · Esc 暂停 · M 静音${g.audio.muted ? '【静】' : ''}`,
      12,
      H - 11,
    );
  }

  private drawBanner(g: Game): void {
    const b = g.banner;
    if (!b) return;
    const ctx = this.ctx;
    const a = Math.max(0, Math.min(Math.min(1, b.t / 0.3), Math.min(1, (b.dur - b.t) / 0.4)));
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * a;
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
    ctx.globalAlpha = base;
  }

  private drawCinematic(g: Game): void {
    const ctx = this.ctx;
    const c = g.cine;
    // 闪白
    if (c.flash > 0) {
      ctx.fillStyle = `rgba(255,250,240,${c.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (c.letterbox <= 0.001) return;
    const bh = 78 * c.letterbox;
    ctx.fillStyle = '#0d0c0a';
    ctx.fillRect(0, 0, W, bh);
    ctx.fillRect(0, H - bh, W, bh);

    const shot = c.shot;
    if (!shot || c.letterbox < 0.5) return;
    const fadeIn = Math.min(1, c.t / 0.35);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.textBaseline = 'middle';
    if (shot.title) {
      // 竖排大字题名，偏左
      ctx.textAlign = 'center';
      const chars = [...shot.title.replace(/\s·\s/g, '·')];
      const size = Math.min(64, Math.floor((H - bh * 2 - 40) / chars.length));
      ctx.font = `${size}px ${GLYPH_FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(13,12,10,0.7)';
      ctx.fillStyle = '#f4efe1';
      const x = 120;
      let y = H / 2 - ((chars.length - 1) * size) / 2;
      for (const ch of chars) {
        ctx.strokeText(ch, x, y);
        ctx.fillText(ch, x, y);
        y += size;
      }
      ctx.fillStyle = '#b0102a';
      ctx.fillRect(x + size * 0.7, H / 2 - 50, 6, 100);
    }
    if (shot.subtitle) {
      ctx.textAlign = 'center';
      ctx.font = `22px ${UI_FONT}`;
      ctx.fillStyle = '#e8dfc4';
      ctx.fillText(shot.subtitle, W / 2, H - bh / 2);
    }
    ctx.restore();
    if (shot.timeScale < 1 && c.shots.length > 1 && c.idx < c.shots.length - 1) {
      ctx.textAlign = 'right';
      ctx.font = `13px ${UI_FONT}`;
      ctx.fillStyle = 'rgba(244,239,225,0.5)';
      ctx.fillText('空格 / 回车 跳过', W - 20, bh / 2);
    }
  }

  private drawToast(text: string, a: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `16px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 32;
    ctx.fillStyle = 'rgba(28,26,22,0.8)';
    ctx.fillRect(W / 2 - w / 2, HUD_H + 40, w, 32);
    ctx.fillStyle = '#f4efe1';
    ctx.fillText(text, W / 2, HUD_H + 56);
    ctx.restore();
  }

  private drawCrosshair(g: Game): void {
    const ctx = this.ctx;
    const { x, y } = g.input.mouse;
    ctx.save();
    ctx.strokeStyle = 'rgba(42,140,122,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
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
}
