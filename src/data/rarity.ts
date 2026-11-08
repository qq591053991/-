import type { Rarity } from '../game/types';

export const RARITY_NAMES = ['凡品', '灵品', '玄品', '天品'] as const;
export const TIER_NAMES = ['下品', '中品', '上品', '极品'] as const;
export const RARITY_COLORS = ['#cfc8b8', '#5aa0ff', '#b678ff', '#ff9a3c'] as const;

/**
 * 按进度与机缘抽取稀有度。progress 为波数或境界等级，scale 控制成长速度。
 */
export function rollRarity(progress: number, luck: number, scale = 1): Rarity {
  const l = 1 + luck / 100;
  const p = progress * scale;
  const p3 = Math.max(0, (p - 8) * 0.012) * l;
  const p2 = Math.max(0, (p - 3) * 0.03) * l;
  const p1 = Math.min(0.6, 0.1 + p * 0.04) * l;
  const r = Math.random();
  if (r < p3) return 3;
  if (r < p3 + p2) return 2;
  if (r < p3 + p2 + p1) return 1;
  return 0;
}
