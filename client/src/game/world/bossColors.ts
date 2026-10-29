import type { BossInfo } from '@combat-strike/shared';

/** BOSS 元素主题色（模型发光与弹幕颜色） */
export const BOSS_ELEMENT_COLORS: Record<BossInfo['element'], string> = {
  none: '#ff5c5c',
  fire: '#ff6a2a',
  ice: '#6fd8ff',
  lightning: '#ffe95c',
  void: '#b26bff',
  holy: '#ffd75c',
};
