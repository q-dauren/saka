import { api } from '../services/api';
import { h, openModal, toast } from './common';

function field(type: string, ph: string, ac: string): HTMLInputElement {
  const i = h('input', 'sk-input');
  i.type = type;
  i.placeholder = ph;
  i.setAttribute('autocomplete', ac);
  return i;
}

export function openAuthScreen(): void {
  const m = openModal('Сақа: вход');
  let mode: 'in' | 'up' = 'in';

  const tabs = h('div', 'sk-tabs');
  const tIn = h('button', 'sk-tab on', 'Вход');
  const tUp = h('button', 'sk-tab', 'Регистрация');
  tIn.type = 'button'; tUp.type = 'button';
  tabs.append(tIn, tUp);

  const form = h('form');
  const email = field('email', 'Email', 'email');
  const pass = field('password', 'Пароль (от 6 символов)', 'current-password');
  const nick = field('text', 'Ник в игре (2–20 символов)', 'nickname');
  nick.maxLength = 20;
  nick.style.display = 'none';
  const err = h('div', 'sk-err');
  const go = h('button', 'sk-btn wide', 'Войти');
  go.type = 'submit';
  form.append(email, pass, nick, err, go);

  const google = h('button', 'sk-btn alt wide', 'Войти через Google');
  google.type = 'button';
  const guest = h('button', 'sk-btn alt wide', 'Продолжить как гость');
  guest.type = 'button';
  m.body.append(tabs, form, google, guest);

  function setMode(v: 'in' | 'up') {
    mode = v;
    tIn.classList.toggle('on', v === 'in');
    tUp.classList.toggle('on', v === 'up');
    nick.style.display = v === 'up' ? '' : 'none';
    go.textContent = v === 'in' ? 'Войти' : 'Создать аккаунт';
    pass.setAttribute('autocomplete', v === 'in' ? 'current-password' : 'new-password');
    err.textContent = '';
  }
  tIn.onclick = () => setMode('in');
  tUp.onclick = () => setMode('up');

  const setBusy = (b: boolean) => { go.disabled = b; google.disabled = b; };
  const fail = (t: string) => { err.textContent = t; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const em = email.value.trim(), pw = pass.value, nk = nick.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return fail('Введите корректный email');
    if (pw.length < 6) return fail('Пароль: минимум 6 символов');
    if (mode === 'up' && (nk.length < 2 || nk.length > 20)) return fail('Ник: от 2 до 20 символов');
    setBusy(true);
    try {
      if (mode === 'in') await api.signIn(em, pw); else await api.signUp(em, pw, nk);
      let name = nk || em.split('@')[0];
      try { name = (await api.getProfile()).nickname || name; } catch { /* оставим введённый */ }
      m.close();
      toast(`Привет, ${name}!`);
    } catch (ex) {
      fail((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  google.onclick = async () => {
    err.textContent = '';
    setBusy(true);
    try { await api.signInGoogle(); }
    catch (ex) { fail((ex as Error).message); setBusy(false); }
  };
  guest.onclick = () => m.close();
}
