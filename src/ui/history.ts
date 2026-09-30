import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { DIFF_NAMES, MODE_NAMES, h, openModal, starsText } from './common';

export async function openHistoryScreen(): Promise<void> {
  const m = openModal('История', { test: true });
  const tabs = h('div', 'sk-tabs');
  const tH = h('button', 'sk-tab on', 'Мои результаты');
  const tL = h('button', 'sk-tab', 'Лидеры');
  tH.type = 'button'; tL.type = 'button';
  tabs.append(tH, tL);
  const box = h('div');
  m.body.append(tabs, box);

  async function showHistory() {
    tH.classList.add('on'); tL.classList.remove('on');
    box.textContent = '';
    box.append(h('p', 'sk-muted', 'Загрузка…'));
    try {
      const rows = await api.getHistory(30);
      if (!m.root.isConnected || !tH.classList.contains('on')) return;
      box.textContent = '';
      if (!rows.length) { box.append(h('p', 'sk-muted', 'Пока пусто: сыграйте первый раунд, и он появится здесь.')); return; }
      const list = h('div', 'sk-list');
      for (const r of rows) {
        const date = new Date(r.finishedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const row = h('div', 'sk-item');
        const l = h('div');
        l.append(h('div', '', `${DIFF_NAMES[r.difficulty]} · испытание ${r.levelIndex + 1}`),
          h('div', 'sk-muted', `${date} · ${MODE_NAMES[r.mode] ?? r.mode}`));
        const rt = h('div');
        rt.style.textAlign = 'right';
        rt.append(h('div', '', `${r.score} очк.`), h('div', 'sk-star', starsText(r.stars)),
          h('div', r.won ? 'w' : 'l', r.won ? 'Победа' : 'Поражение'));
        row.append(l, rt);
        list.append(row);
      }
      box.append(list);
    } catch (e) {
      box.textContent = '';
      box.append(h('p', 'sk-err', (e as Error).message));
    }
  }

  async function showBoard() {
    tL.classList.add('on'); tH.classList.remove('on');
    box.textContent = '';
    if (!supabase) { box.append(h('p', 'sk-muted', 'Таблица лидеров появится после подключения сервера.')); return; }
    box.append(h('p', 'sk-muted', 'Загрузка…'));
    try {
      const { data, error } = await supabase.rpc('leaderboard');
      if (error) throw error;
      if (!m.root.isConnected || !tL.classList.contains('on')) return;
      box.textContent = '';
      const rows = (data ?? []) as { nickname: string; total: number }[];
      if (!rows.length) { box.append(h('p', 'sk-muted', 'Пока никого нет. Войдите в аккаунт и сыграйте первым!')); return; }
      const list = h('div', 'sk-list');
      rows.forEach((r, i) => {
        const row = h('div', 'sk-item');
        row.append(h('span', '', `${i + 1}. ${r.nickname}`), h('b', '', `${r.total} очк.`));
        list.append(row);
      });
      box.append(h('p', 'sk-muted', 'Сумма лучших очков по всем испытаниям'), list);
    } catch {
      box.textContent = '';
      box.append(h('p', 'sk-err', 'Не удалось загрузить таблицу лидеров. Проверьте интернет'));
    }
  }

  tH.onclick = () => void showHistory();
  tL.onclick = () => void showBoard();
  await showHistory();
}
