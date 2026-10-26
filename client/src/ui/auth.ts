import { el } from './dom.js';
import { api, isOffline } from '../api.js';
import type { AuthResponse } from '@combat-strike/shared';

/** 登录 / 注册界面 */
export function showAuthScreen(
  parent: HTMLElement,
  onAuthed: (resp: AuthResponse) => void,
): void {
  const err = el('div', { class: 'auth-error' });
  let mode: 'login' | 'register' = 'login';

  const userInput = el('input', { class: 'text-input', placeholder: '用户名（2-20 位）', maxlength: '20', autocomplete: 'username' }) as HTMLInputElement;
  const passInput = el('input', { class: 'text-input', placeholder: '密码（至少 6 位）', type: 'password', maxlength: '64', autocomplete: 'current-password' }) as HTMLInputElement;

  const tabLogin = el('button', { class: 'active', onclick: () => switchMode('login') }, '登 录');
  const tabRegister = el('button', { onclick: () => switchMode('register') }, '注 册');

  function switchMode(m: 'login' | 'register'): void {
    mode = m;
    err.textContent = '';
    tabLogin.classList.toggle('active', m === 'login');
    tabRegister.classList.toggle('active', m === 'register');
    submitBtn.textContent = m === 'login' ? '进入战场' : '创建角色';
  }

  const offlineNote = el('div', {
    class: 'auth-offline',
    style: isOffline() ? 'display:block' : 'display:none',
  }, '⚠ 后端服务未连接 — 已进入离线试玩模式，进度保存在本机');

  const submitBtn = el('button', { class: 'btn primary auth-submit', onclick: submit }, '进入战场');

  async function submit(): Promise<void> {
    const username = userInput.value.trim();
    const password = passInput.value;
    err.textContent = '';
    if (!username || !password) { err.textContent = '请输入用户名与密码'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? '连接中…' : '创建中…';
    try {
      const resp = mode === 'login'
        ? await api.login(username, password)
        : await api.register(username, password);
      onAuthed(resp);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : '网络错误，请重试';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? '进入战场' : '创建角色';
    }
  }

  const box = el('div', { class: 'auth-box' },
    el('div', { class: 'auth-logo' },
      el('div', { class: 'l1' }, '枪战', el('b', {}, '突击')),
      el('div', { class: 'l2' }, 'COMBAT STRIKE · PHOENIX'),
    ),
    el('div', { class: 'auth-tabs' }, tabLogin, tabRegister),
    el('div', { class: 'auth-fields' }, userInput, passInput),
    err,
    submitBtn,
    offlineNote,
    el('div', { class: 'auth-note' }, '账号数据由服务端保存 · 支持金币商城 / 军械库 / 战役进度'),
  );

  const screen = el('div', { class: 'screen auth-screen' },
    el('div', { class: 'screen-bg' }),
    box,
  );

  screen.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  parent.appendChild(screen);
  userInput.focus();
}
