const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'];
const MAJORS = ['筑基', '结丹', '元婴', '化神'];
const STAGES = ['初期', '中期', '后期'];

/** 境界等级：0~12 为炼气一至十三层，之后每个大境界分初/中/后期。 */
export function realmName(level: number): string {
  if (level < 13) return `炼气${CN[level]}层`;
  const idx = level - 13;
  const major = Math.floor(idx / 3);
  if (major >= MAJORS.length) return '化神大圆满';
  return MAJORS[major] + STAGES[idx % 3];
}

/** 是否刚踏入新的大境界（筑基、结丹、元婴、化神）。 */
export function majorBreakthrough(level: number): string | null {
  if (level < 13) return null;
  const idx = level - 13;
  if (idx % 3 !== 0) return null;
  return MAJORS[idx / 3] ?? null;
}

/** 升到下一级所需修为。 */
export function expToNext(level: number): number {
  return Math.round(8 + level * 5 + level * level * 0.6);
}
