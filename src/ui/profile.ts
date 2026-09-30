import { api, canUseSkin, canUseTakia } from '../services/api';
import type { Difficulty, Profile } from '../types';
import {
  DIFF_NAMES, LOCATIONS, SKINS, TAKIAS, h, openModal, skinSvg, starsText, takiaSvg, tile, toast,
} from './common';
import { openAuthScreen } from './auth';
import { openShopScreen } from './shop';

export async function openProfileScreen(): Promise<void> {
  const m = openModal('Профиль', { test: true });
  m.body.append(h('p', 'sk-muted', 'Загрузка…'));

  let data;
  try {
    data = await Promise.all([api.getProfile(), api.getInventory(), api.getUser(), api.getBest(), api.getHistory(200)]);
  } catch (e) {
    m.body.textContent = '';
    m.body.append(h('p', 'sk-err', (e as Error).message));
    return;
  }
  if (!m.root.isConnected) return;
  const [p0, inv, user, best, hist] = data;
  let p: Profile = p0;
  m.body.textContent = '';

  // шапка
  const top = h('div', 'sk-row');
  const who = h('div');
  who.append(h('div', '', user ? user.email : 'Гость'),
    h('div', 'sk-muted', user ? 'Аккаунт' : 'Прогресс хранится на этом устройстве'));
  top.append(who);
  if (p.isPro) top.append(h('span', 'sk-price', '★ PRO'));
  m.body.append(top);
  if (!user) {
    const b = h('button', 'sk-btn alt wide', 'Войти / Регистрация');
    b.onclick = () => openAuthScreen();
    m.body.append(b);
  }

  // ник
  const nickRow = h('div', 'sk-row');
  nickRow.style.marginTop = '12px';
  const nick = h('input', 'sk-input');
  nick.value = p.nickname;
  nick.maxLength = 20;
  nick.style.cssText = 'flex:1;margin:0;width:auto';
  const save = h('button', 'sk-btn', 'Сохранить');
  save.onclick = async () => {
    try { p = await api.updateProfile({ nickname: nick.value }); nick.value = p.nickname; toast('Ник сохранён'); }
    catch (e) { toast((e as Error).message); }
  };
  nickRow.append(nick, save);
  m.body.append(nickRow);

  // выбор косметики
  const choices = h('div');
  m.body.append(choices);

  async function pick(patch: Partial<Profile>) {
    try { p = await api.updateProfile(patch); renderChoices(); }
    catch (e) { toast((e as Error).message); }
  }
  function lockedHint(tab: 'skins' | 'takia') {
    toast('Доступно после покупки или с Сақа Pro');
    void openShopScreen(tab);
  }
  function renderChoices() {
    choices.textContent = '';
    const sec = (title: string, tiles: HTMLElement[]) => {
      const s = h('section', 'sk-sec');
      const g = h('div', 'sk-grid');
      g.append(...tiles);
      s.append(h('h3', 'sk-h3', title), g);
      choices.append(s);
    };
    sec('Тақия', TAKIAS.map((t) => {
      const okk = canUseTakia(t.id, inv, p.isPro);
      const b = tile(t.name, takiaSvg(t.id), p.takia === t.id, !okk);
      b.onclick = () => (okk ? pick({ takia: t.id }) : lockedHint('takia'));
      return b;
    }));
    sec('Скин асыков', SKINS.map((s) => {
      const okk = canUseSkin(s.id, inv, p.isPro);
      const b = tile(s.name, skinSvg(s.id), p.asykSkin === s.id, !okk);
      b.onclick = () => (okk ? pick({ asykSkin: s.id }) : lockedHint('skins'));
      return b;
    }));
    sec('Локация', LOCATIONS.map((l) => {
      const b = tile(l.name, `<div class="sk-loc" style="background:${l.grad}"></div>`, p.location === l.id, false);
      b.onclick = () => pick({ location: l.id });
      return b;
    }));
  }
  renderChoices();

  // рекорды
  const rec = h('section', 'sk-sec');
  rec.append(h('h3', 'sk-h3', 'Лучшие результаты'));
  const list = h('div', 'sk-list');
  (['easy', 'medium', 'hard'] as Difficulty[]).forEach((d) => {
    const row = h('div', 'sk-item');
    row.append(h('b', '', DIFF_NAMES[d]));
    const cells = h('div');
    cells.style.cssText = 'display:flex;gap:14px';
    for (let i = 0; i < 3; i++) {
      const sc = best[`${d}:${i}`];
      const xs = hist.filter((r) => r.difficulty === d && r.levelIndex === i);
      const st = xs.length ? Math.max(...xs.map((r) => r.stars)) : 0;
      const c = h('div');
      c.style.textAlign = 'center';
      c.append(h('div', '', sc === undefined ? '—' : String(sc)),
        h('div', 'sk-star', sc === undefined ? '☆☆☆' : starsText(st)));
      cells.append(c);
    }
    row.append(cells);
    list.append(row);
  });
  rec.append(list);
  m.body.append(rec);

  if (user) {
    const out = h('button', 'sk-btn alt wide', 'Выйти');
    out.onclick = async () => {
      try { await api.signOut(); toast('Вы вышли'); m.close(); }
      catch (e) { toast((e as Error).message); }
    };
    m.body.append(out);
  }
}
