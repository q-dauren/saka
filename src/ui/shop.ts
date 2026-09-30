import { api, canUseSkin, canUseTakia } from '../services/api';
import type { Profile } from '../types';
import { SKINS, TAKIAS, h, openModal, proSvg, skinSvg, takiaSvg, toast } from './common';

export type ShopTab = 'skins' | 'takia' | 'pro';

export async function openShopScreen(initial: ShopTab = 'skins'): Promise<void> {
  const m = openModal('Магазин', { test: true });
  const tabs = h('div', 'sk-tabs');
  const box = h('div');
  m.body.append(tabs, box);

  let tab: ShopTab = initial;
  let profile: Profile | null = null;
  let inv: string[] = [];

  const names: [ShopTab, string][] = [['skins', 'Скины асыков'], ['takia', 'Тақия'], ['pro', 'Сақа Pro']];
  const btns = names.map(([id, label]) => {
    const b = h('button', 'sk-tab', label);
    b.type = 'button';
    b.onclick = () => { tab = id; render(); };
    tabs.append(b);
    return b;
  });

  async function load() {
    try { [profile, inv] = await Promise.all([api.getProfile(), api.getInventory()]); }
    catch (e) { toast((e as Error).message); }
  }

  function render() {
    if (!m.root.isConnected) return;
    btns.forEach((b, i) => b.classList.toggle('on', names[i][0] === tab));
    box.textContent = '';
    if (!profile) { box.append(h('p', 'sk-err', 'Не удалось загрузить данные')); return; }
    if (tab === 'pro') renderPro(profile); else renderItems(profile);
  }

  function renderItems(p: Profile) {
    type Item = { key: string; name: string; price: number; free: boolean; svg: string; selected: boolean; ok: boolean; patch: Partial<Profile> };
    const items: Item[] = tab === 'skins'
      ? SKINS.map((s) => ({ key: 'skin:' + s.id, name: s.name, price: s.price, free: s.free, svg: skinSvg(s.id),
          selected: p.asykSkin === s.id, ok: canUseSkin(s.id, inv, p.isPro), patch: { asykSkin: s.id } }))
      : TAKIAS.map((t) => ({ key: 'takia:' + t.id, name: t.name, price: t.price, free: t.free, svg: takiaSvg(t.id),
          selected: p.takia === t.id, ok: canUseTakia(t.id, inv, p.isPro), patch: { takia: t.id } }));

    const grid = h('div', 'sk-shop');
    for (const it of items) {
      const c = h('div', 'sk-prod');
      const pv = h('div', 'sk-pv');
      pv.innerHTML = it.svg;
      const via = it.free ? 'Бесплатно' : inv.includes(it.key) ? 'Куплено' : p.isPro ? 'Открыто Pro' : `${it.price} ₸ (тест)`;
      c.append(pv, h('div', '', it.name), h('div', 'sk-price', via));
      const b = h('button', 'sk-btn');
      if (!it.ok) {
        b.textContent = 'Купить (тест)';
        b.onclick = async () => {
          b.disabled = true;
          try { await api.purchase(it.key); toast('Куплено: ' + it.name); await load(); render(); }
          catch (e) { toast((e as Error).message); b.disabled = false; }
        };
      } else if (it.selected) {
        b.textContent = 'Выбрано';
        b.classList.add('alt');
        b.disabled = true;
      } else {
        b.textContent = 'Выбрать';
        b.onclick = async () => {
          try { await api.updateProfile(it.patch); await load(); render(); }
          catch (e) { toast((e as Error).message); }
        };
      }
      c.append(b);
      grid.append(c);
    }
    box.append(grid);
  }

  function renderPro(p: Profile) {
    const w = h('div', 'sk-pro');
    const pv = h('div', 'sk-pv');
    pv.innerHTML = proSvg();
    const ul = h('ul');
    ['Без лимита игрового времени: машина не мешает',
     'Эксклюзивные скины асыков: золото, орнамент, свечение',
     'Отметка Pro в профиле',
     'Только косметика: преимуществ в матче нет'].forEach((t) => ul.append(h('li', '', t)));
    w.append(pv, h('h3', 'sk-h3', 'Сақа Pro'), ul, h('div', 'sk-price', 'Цена-заглушка: 990 ₸/мес (тест)'));
    const b = h('button', 'sk-btn wide');
    if (p.isPro) {
      w.append(h('p', 'sk-h3', '✓ Pro активна'));
      b.textContent = 'Отключить (тест)';
      b.classList.add('alt');
      b.onclick = async () => {
        b.disabled = true;
        try { await api.setPro(false); toast('Pro отключена (тест)'); await load(); render(); }
        catch (e) { toast((e as Error).message); b.disabled = false; }
      };
    } else {
      b.textContent = 'Оформить Сақа Pro (тест)';
      b.onclick = async () => {
        b.disabled = true;
        try { await api.setPro(true); toast('Сақа Pro активна (тест)'); await load(); render(); }
        catch (e) { toast((e as Error).message); b.disabled = false; }
      };
    }
    w.append(b);
    box.append(w);
  }

  box.append(h('p', 'sk-muted', 'Загрузка…'));
  await load();
  render();
}
