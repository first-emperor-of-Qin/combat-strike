import { el, clear, fmtGold } from './dom.js';
import { api, isOffline } from '../api.js';
import {
  WEAPON_CLASS_LABELS, TIER_LABELS, TIER_COLORS,
  firstClearGold, replayClearGold, clearXp, tierDps,
} from '@combat-strike/shared';
import type { Profile, WeaponDef, ChapterDef } from '@combat-strike/shared';
import type { Settings } from '../config.js';
import { saveSettings, loadSettings } from '../config.js';

/** 卡片内联错误提示（替代 alert） */
function showCardError(card: HTMLElement, msg: string): void {
  let tip = card.querySelector('.w-error') as HTMLElement | null;
  if (!tip) {
    tip = el('div', { class: 'w-error' });
    card.appendChild(tip);
  }
  tip.textContent = msg;
  tip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
  setTimeout(() => tip?.remove(), 3200);
}


export interface MenuCallbacks {
  onStartChapter(chapter: ChapterDef): void;
  onLogout(): void;
  onSettingsChanged(s: Settings): void;
}

/** 主菜单：战役 / 军械库 / 商城 / 设置 */
export class MainMenu {
  root: HTMLElement;
  private profile: Profile;
  private weapons: WeaponDef[];
  private chapters: ChapterDef[];
  private bosses: Record<string, string>;
  private xpNeeded: number;
  private cb: MenuCallbacks;
  private settings: Settings;

  private body: HTMLElement;
  private goldEl: HTMLElement;
  private xpFill: HTMLElement;
  private levelEl: HTMLElement;

  constructor(
    parent: HTMLElement,
    profile: Profile,
    catalog: { weapons: WeaponDef[]; chapters: ChapterDef[]; bosses: Record<string, string> },
    xpNeeded: number,
    settings: Settings,
    cb: MenuCallbacks,
  ) {
    this.profile = profile;
    this.weapons = catalog.weapons;
    this.chapters = catalog.chapters;
    this.bosses = catalog.bosses;
    this.xpNeeded = xpNeeded;
    this.cb = cb;
    this.settings = settings;

    this.root = el('div', { class: 'screen menu-screen' },
      el('div', { class: 'screen-bg' }),
      el('div', { class: 'menu-inner' },
        this.buildHeader(),
        this.buildTabs(),
        this.body = el('div', { class: 'menu-body' }),
      ),
    );
    parent.appendChild(this.root);
    this.goldEl = this.root.querySelector('.mp-gold .g1') as HTMLElement;
    this.xpFill = this.root.querySelector('.mp-xp-fill') as HTMLElement;
    this.levelEl = this.root.querySelector('.mp-level') as HTMLElement;
    this.renderTab('campaign');
  }

  destroy(): void { this.root.remove(); }

  updateProfile(p: Profile, xpNeeded: number): void {
    this.profile = p;
    this.xpNeeded = xpNeeded;
    this.goldEl.textContent = fmtGold(p.gold);
    this.levelEl.textContent = `LV.${p.level} · ${p.xp}/${xpNeeded} XP`;
    this.xpFill.style.width = `${Math.min(100, (p.xp / xpNeeded) * 100)}%`;
  }

  // ---------------- 头部 ----------------
  private buildHeader(): HTMLElement {
    const p = this.profile;
    const initial = p.username.slice(0, 1).toUpperCase();
    return el('div', { class: 'menu-header' },
      el('div', { class: 'menu-logo' }, '枪战', el('b', {}, '突击'), el('span', { style: 'font-size:11px;color:var(--text-2);letter-spacing:3px;margin-left:10px' }, isOffline() ? '离线试玩' : 'ONLINE')),
      el('div', { class: 'menu-player' },
        el('div', { class: 'mp-avatar' }, initial),
        el('div', { class: 'mp-info' },
          el('div', { class: 'mp-name-row' },
            el('span', { class: 'mp-name' }, p.username),
            el('span', { class: 'mp-level' }, `LV.${p.level} · ${p.xp}/${this.xpNeeded} XP`),
          ),
          el('div', { class: 'mp-xp-bar' }, this.xpFill = el('div', { class: 'mp-xp-fill', style: `width:${Math.min(100, (p.xp / this.xpNeeded) * 100)}%` })),
        ),
        el('div', { class: 'mp-gold' },
          el('div', { class: 'g1' }, fmtGold(p.gold)),
          el('div', { class: 'g2' }, 'GOLD 金币'),
        ),
      ),
      el('button', { class: 'btn ghost menu-logout', onclick: () => this.cb.onLogout() }, '退出登录'),
    );
  }

  // ---------------- 页签 ----------------
  private buildTabs(): HTMLElement {
    const tabs = [
      ['campaign', '战 役'],
      ['arsenal', '军械库'],
      ['shop', '商 城'],
      ['settings', '设 置'],
    ] as const;
    const bar = el('div', { class: 'menu-tabs' });
    for (const [key, label] of tabs) {
      bar.appendChild(el('button', {
        class: 'menu-tab',
        onclick: (e) => {
          bar.querySelectorAll('.menu-tab').forEach((t) => t.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
          this.renderTab(key);
        },
      }, label));
    }
    bar.querySelector('.menu-tab')!.classList.add('active');
    return bar;
  }

  private renderTab(tab: 'campaign' | 'arsenal' | 'shop' | 'settings'): void {
    clear(this.body);
    if (tab === 'campaign') this.renderCampaign();
    else if (tab === 'arsenal') this.renderArsenal();
    else if (tab === 'shop') this.renderShop();
    else this.renderSettings();
  }

  // ---------------- 战役 ----------------
  private renderCampaign(): void {
    const grid = el('div', { class: 'chapter-grid' });
    for (const ch of this.chapters) {
      const cleared = this.profile.chapterCleared.includes(ch.id);
      const locked = ch.id > this.profile.chapterUnlocked;
      const isNext = ch.id === this.profile.chapterUnlocked && !cleared;
      const boss = this.bosses[String(ch.id)];
      const reward = cleared ? replayClearGold(ch.id) : firstClearGold(ch.id);

      const card = el('div', {
        class: `chapter-card ${locked ? 'locked' : ''}`,
        onclick: () => {
          if (locked) return;
          this.cb.onStartChapter(ch);
        },
      },
        el('div', { class: 'cc-stripe', style: `background:linear-gradient(90deg, ${ch.accentColor}, transparent)` }),
        el('div', { class: 'cc-num' }, `CHAPTER ${String(ch.id).padStart(2, '0')} · ${ch.waves} 波`),
        el('div', { class: 'cc-name' }, locked ? '？？？' : ch.name),
        el('div', { class: 'cc-en' }, ch.enName),
        el('div', { class: 'cc-sub' }, locked ? `需要先通关 第 ${ch.id - 1} 章` : ch.subtitle),
        el('div', { class: 'cc-meta' },
          cleared ? el('span', { class: 'cc-tag done' }, '已通关') : null,
          isNext ? el('span', { class: 'cc-tag next' }, '当前目标') : null,
          boss ? el('span', { class: 'cc-tag boss' }, `BOSS · ${boss}`) : null,
          el('span', { class: 'cc-tag' }, `建议 LV.${ch.suggestedLevel}`),
        ),
        el('div', { class: 'cc-reward' },
          cleared ? `重复通关 ¥${fmtGold(reward)} + 击杀金币` : `首次通关 ¥${fmtGold(reward)} + ${clearXp(ch.id)} XP`),
      );
      grid.appendChild(card);
    }
    this.body.append(
      grid,
      el('div', { class: 'chapter-hint' },
        '章节随通关顺序解锁。敌人强度与武器品级同步成长 —— 挑战更高章节获取更多金币，解锁 9 级传说武器。'),
    );
  }

  // ---------------- 军械库 ----------------
  private renderArsenal(): void {
    const layout = el('div', { class: 'arsenal-layout' });

    // 左侧配装
    const loadoutPanel = el('div', { class: 'loadout-panel' });
    for (const [slotKey, label] of [['primary', '主武器 SLOT 1'], ['secondary', '副武器 SLOT 2']] as const) {
      const wid = this.profile.loadout[slotKey];
      const w = wid ? this.weapons.find((x) => x.id === wid) : null;
      const color = w ? TIER_COLORS[w.tier] : '#333';
      loadoutPanel.appendChild(el('div', { class: 'loadout-slot' },
        el('div', { class: 'slot-label' }, label),
        el('div', { class: 'slot-weapon', style: `color:${color}` }, w?.name ?? '— 空 —'),
        w ? el('div', { class: 'slot-tier', style: `color:${color}` }, `${TIER_LABELS[w.tier]} · ${WEAPON_CLASS_LABELS[w.class]}`) : null,
      ));
    }
    const equippedPrimary = this.weapons.find((w) => w.id === this.profile.loadout.primary);
    const kills = this.profile.stats;
    loadoutPanel.appendChild(el('div', { class: 'loadout-stats' },
      el('h4', {}, '作战档案'),
      this.statRow('总击杀', String(kills.kills)),
      this.statRow('出击次数', String(kills.runs)),
      this.statRow('最高波次', String(kills.bestWave)),
      this.statRow('阵亡', String(kills.deaths)),
      this.statRow('战斗时长', `${Math.floor(kills.playtimeSec / 60)} 分钟`),
      equippedPrimary ? this.statRow('主武器 DPS(理论)', String(Math.round(tierDps(equippedPrimary.tier)))) : null,
    ));
    layout.appendChild(loadoutPanel);

    // 右侧武器库
    const gridWrap = el('div', { class: 'weapon-grid' });
    const byTier = new Map<number, WeaponDef[]>();
    for (const w of this.weapons) {
      if (!byTier.has(w.tier)) byTier.set(w.tier, []);
      byTier.get(w.tier)!.push(w);
    }
    for (const [tier, list] of [...byTier.entries()].sort((a, b) => a[0] - b[0])) {
      const color = TIER_COLORS[tier as 1];
      const section = el('div', { class: 'tier-section' },
        el('div', { class: 'tier-title', style: `color:${color}` },
          el('span', {}, `${tier} 级 · ${TIER_LABELS[tier as 1]}`),
          el('span', { class: 'line' }),
        ),
      );
      const cards = el('div', { class: 'weapon-cards' });
      for (const w of list) cards.appendChild(this.weaponCard(w, 'arsenal'));
      section.appendChild(cards);
      gridWrap.appendChild(section);
    }
    layout.appendChild(gridWrap);
    this.body.appendChild(layout);
  }

  private statRow(k: string, v: string): HTMLElement {
    return el('div', { class: 'stat-row' }, el('span', {}, k), el('b', {}, v));
  }

  private weaponCard(w: WeaponDef, context: 'arsenal' | 'shop'): HTMLElement {
    const owned = this.profile.ownedWeapons.includes(w.id);
    const equippedPrimary = this.profile.loadout.primary === w.id;
    const equippedSecondary = this.profile.loadout.secondary === w.id;
    const color = TIER_COLORS[w.tier];

    const actions = el('div', { class: 'w-actions' });
    if (owned) {
      const equipBtn = el('button', {
        class: 'btn',
        onclick: async (e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.disabled = true;
          try {
            const slot = context === 'arsenal' && equippedSecondary ? 'secondary' : (w.tier >= 1 ? 'primary' : 'primary');
            const isPrimaryPick = slot === 'primary';
            const nextPrimary = isPrimaryPick ? w.id : this.profile.loadout.primary;
            const nextSecondary = isPrimaryPick ? this.profile.loadout.secondary : w.id;
            const r = await api.saveLoadout(nextPrimary, nextSecondary);
            this.updateProfile(r.profile, this.xpNeeded);
            this.renderTab('arsenal');
          } catch (err) {
            showCardError(card, err instanceof Error ? err.message : '配装失败');
          } finally {
            btn.disabled = false;
          }
        },
      }, equippedPrimary ? '已装备 · 主' : equippedSecondary ? '已装备 · 副' : '装备为主武器');
      const equipSub = el('button', {
        class: 'btn ghost',
        onclick: async (e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.disabled = true;
          try {
            const r = await api.saveLoadout(this.profile.loadout.primary, w.id);
            this.updateProfile(r.profile, this.xpNeeded);
            this.renderTab('arsenal');
          } catch (err) {
            showCardError(card, err instanceof Error ? err.message : '配装失败');
          } finally { btn.disabled = false; }
        },
      }, '装备为副武器');
      actions.append(equipBtn, equipSub);
    } else if (context === 'shop') {
      actions.appendChild(el('button', {
        class: 'btn primary',
        onclick: async (e) => {
          const btn = e.currentTarget as HTMLButtonElement;
          btn.disabled = true;
          try {
            const r = await api.purchase(w.id);
            this.profile = r.profile;
            this.updateProfile(r.profile, this.xpNeeded);
            this.renderTab('shop');
          } catch (err) {
            showCardError(card, err instanceof Error ? err.message : '购买失败');
          } finally { btn.disabled = false; }
        },
      }, `购买 ¥${fmtGold(w.price)}`));
    }

    const card = el('div', { class: `weapon-card tier-${w.tier} ${owned ? 'owned' : ''} ${equippedPrimary || equippedSecondary ? 'equipped' : ''}` },
      el('span', { class: 'w-badge' }, `${TIER_LABELS[w.tier]} · ${w.tier}级`),
      el('div', { class: 'w-name', style: `color:${color}` }, w.name),
      el('div', { class: 'w-class' }, `${WEAPON_CLASS_LABELS[w.class]} · ${w.enName}`),
      el('div', { class: 'w-desc' }, w.desc),
      el('div', { class: 'w-stats' },
        el('span', {}, '伤害 ', el('b', {}, String(w.damage), w.pellets > 1 ? ` ×${w.pellets}` : '')),
        el('span', {}, '射速 ', el('b', {}, `${w.rpm}/分`)),
        el('span', {}, '弹匣 ', el('b', {}, String(w.mag))),
        el('span', {}, '换弹 ', el('b', {}, `${w.reloadTime}s`)),
        el('span', {}, '爆头 ', el('b', {}, `×${w.headshotMult}`)),
        el('span', {}, '移速 ', el('b', {}, `×${w.moveMult}`)),
      ),
      !owned && context === 'shop' ? el('div', { class: 'w-price' }, `¥ ${fmtGold(w.price)} · 需要 LV.${w.reqLevel}`) : null,
      actions,
    );
    return card;
  }

  // ---------------- 商城 ----------------
  private renderShop(): void {
    const gridWrap = el('div', { class: 'weapon-grid' });
    const byTier = new Map<number, WeaponDef[]>();
    for (const w of this.weapons) {
      if (this.profile.ownedWeapons.includes(w.id)) continue;
      if (!byTier.has(w.tier)) byTier.set(w.tier, []);
      byTier.get(w.tier)!.push(w);
    }
    if (byTier.size === 0) {
      gridWrap.appendChild(el('div', { style: 'color:var(--text-1);padding:30px;text-align:center;letter-spacing:2px' }, '军械已全部收入囊中 —— 传奇！'));
    }
    for (const [tier, list] of [...byTier.entries()].sort((a, b) => a[0] - b[0])) {
      const color = TIER_COLORS[tier as 1];
      const section = el('div', { class: 'tier-section' },
        el('div', { class: 'tier-title', style: `color:${color}` },
          el('span', {}, `${tier} 级 · ${TIER_LABELS[tier as 1]}`),
          el('span', { class: 'line' }),
        ),
      );
      const cards = el('div', { class: 'weapon-cards' });
      for (const w of list) cards.appendChild(this.weaponCard(w, 'shop'));
      section.appendChild(cards);
      gridWrap.appendChild(section);
    }
    this.body.append(
      el('div', { style: 'font-size:13px;color:var(--text-2);margin-bottom:16px;letter-spacing:1px' },
        `当前金币 ¥${fmtGold(this.profile.gold)} · 击杀敌人与通关章节获取金币，等级越高可购买的品级越高`),
      gridWrap,
    );
  }

  // ---------------- 设置 ----------------
  private renderSettings(): void {
    const panel = el('div', { class: 'settings-panel' });
    const s = this.settings;

    const slider = (label: string, key: 'sensitivity' | 'fov' | 'masterVolume' | 'sfxVolume' | 'musicVolume', min: number, max: number, step: number, fmt: (v: number) => string) => {
      const val = el('span', { class: 'val' }, fmt(s[key]));
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]) }) as HTMLInputElement;
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        val.textContent = fmt(s[key]);
        saveSettings(s);
        this.cb.onSettingsChanged(s);
      });
      panel.appendChild(el('div', { class: 'setting-row' }, el('label', {}, label), input, val));
    };

    slider('鼠标灵敏度', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
    slider('视场角 FOV', 'fov', 60, 110, 1, (v) => `${v}°`);
    slider('主音量', 'masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('音效音量', 'sfxVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('音乐音量', 'musicVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

    // 画质
    const qualitySel = el('select', {},
      el('option', { value: 'low' }, '流畅（无阴影/低分辨率）'),
      el('option', { value: 'medium' }, '均衡'),
      el('option', { value: 'high' }, '高清（阴影 + Bloom）'),
    ) as HTMLSelectElement;
    qualitySel.value = s.quality;
    qualitySel.addEventListener('change', () => {
      s.quality = qualitySel.value as Settings['quality'];
      saveSettings(s);
      this.cb.onSettingsChanged(s);
    });
    panel.appendChild(el('div', { class: 'setting-row' }, el('label', {}, '画质等级'), qualitySel));

    // 伤害数字
    const dmgCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
    dmgCheck.checked = s.showDamage;
    dmgCheck.addEventListener('change', () => {
      s.showDamage = dmgCheck.checked;
      saveSettings(s);
      this.cb.onSettingsChanged(s);
    });
    // 反转Y轴
    const invCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
    invCheck.checked = s.invertY;
    invCheck.addEventListener('change', () => {
      s.invertY = invCheck.checked;
      saveSettings(s);
      this.cb.onSettingsChanged(s);
    });
    panel.appendChild(el('div', { class: 'setting-row' }, el('label', {}, '伤害数字'), el('div', { class: 'setting-check' }, dmgCheck, el('span', { style: 'font-size:13px;color:var(--text-1)' }, '显示浮动伤害'))));
    panel.appendChild(el('div', { class: 'setting-row' }, el('label', {}, 'Y 轴反转'), el('div', { class: 'setting-check' }, invCheck, el('span', { style: 'font-size:13px;color:var(--text-1)' }, '鼠标上下反转'))));

    panel.appendChild(el('div', { style: 'color:var(--text-2);font-size:12.5px;line-height:1.8;letter-spacing:1px' },
      '操作：WASD 移动 · Shift 冲刺 · Ctrl/C 蹲伏 · 空格 跳跃 · R 换弹 · 1/2/Q/滚轮 切枪 · 左键 射击 · 右键 开镜 · ESC 暂停'));
    this.body.appendChild(panel);
  }
}
