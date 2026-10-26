import { el, fmtGold } from './dom.js';
import type { RunReward } from '@combat-strike/shared';
import type { ChapterDef } from '@combat-strike/shared';
import type { RunSummary } from '../game/gameloop.js';

/** 战局结算界面 */
export function showResults(
  parent: HTMLElement,
  summary: RunSummary,
  chapter: ChapterDef,
  reward: RunReward,
  onRetry: () => void,
  onMenu: () => void,
): void {
  const victory = summary.success;
  const badges: HTMLElement[] = [];
  if (reward.firstClear) badges.push(el('span', { class: 'res-badge unlock' }, '★ 首次通关'));
  if (reward.dailyFirst) badges.push(el('span', { class: 'res-badge' }, '每日首通 +50%'));
  if (reward.levelUp) badges.push(el('span', { class: 'res-badge unlock' }, `⬆ 等级提升 → LV.${reward.newLevel}`));
  if (reward.unlockedChapter) badges.push(el('span', { class: 'res-badge unlock' }, `解锁 第${reward.unlockedChapter}章`));

  const box = el('div', { class: 'results-box' },
    el('div', { class: `res-title ${victory ? 'victory' : 'defeat'}` }, victory ? '作 战 胜 利' : '任 务 失 败'),
    el('div', { class: 'res-chapter' }, `第 ${chapter.id} 章 · ${chapter.name}`),
    el('div', { class: 'res-badges' }, ...badges),
    el('div', { class: 'res-stats' },
      resStat('击杀', String(summary.kills)),
      resStat('波次', `${summary.wave}/${chapter.waves}`),
      resStat('用时', `${Math.floor(summary.timeSec / 60)}:${String(summary.timeSec % 60).padStart(2, '0')}`),
      resStat('金币', `+${fmtGold(reward.gold)}`),
    ),
    el('div', { class: 'res-rewards' },
      el('div', { class: 'rr' }, '经验收益 ', el('span', { class: 'xp' }, `+${fmtGold(reward.xp)} XP`)),
    ),
    el('div', { class: 'res-actions' },
      el('button', { class: 'btn', onclick: onMenu }, '返回基地'),
      victory ? el('button', { class: 'btn primary', onclick: onRetry }, '再次出击') : el('button', { class: 'btn primary', onclick: onRetry }, '重整旗鼓'),
    ),
  );

  const screen = el('div', { class: 'screen results-screen' },
    el('div', { class: 'screen-bg' }),
    box,
  );
  parent.appendChild(screen);
}

function resStat(k: string, v: string): HTMLElement {
  return el('div', { class: 'res-stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
}
