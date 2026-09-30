import { api } from '../services/api';
import { h, testBanner, uiRoot } from './common';
import { openShopScreen } from './shop';

export function showLockScreen(secondsLeft: number, onUnlocked: () => void): void {
  const r = uiRoot();
  r.querySelectorAll('.sk-lock').forEach((n) => n.remove());

  const ov = h('div', 'sk-lock');
  const box = h('div', 'sk-lockbox');
  const scene = h('div', 'sk-scene');
  const car = h('div', 'sk-car');
  car.innerHTML = '<i class="b"></i><i class="c"></i><i class="w w1"></i><i class="w w2"></i>';
  scene.append(car);
  const count = h('div', 'sk-count', '--:--');
  const pro = h('button', 'sk-btn', 'Сақа Pro (тест)');
  pro.onclick = () => void openShopScreen('pro');
  box.append(
    h('h2', '', 'Машина проезжает…'),
    h('p', 'sk-muted', 'Во дворе едет машина: дети ждут, пока она проедет. Игра продолжится, когда дорога освободится.'),
    scene, count, h('p', 'sk-muted', 'До разблокировки'), pro, testBanner(),
  );
  ov.append(box);
  r.append(ov);

  let endAt = Date.now() + Math.max(0, secondsLeft) * 1000;
  let busy = false, finished = false, lastPoll = 0;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    ov.remove();
    onUnlocked();
  };
  const poll = async () => {
    if (busy || finished) return;
    busy = true;
    try {
      const s = await api.getPlayStatus();
      if (!s.locked) finish();
      else if (s.secondsLeft > 0) endAt = Date.now() + s.secondsLeft * 1000;
    } catch { /* нет сети: попробуем снова */ }
    finally { busy = false; lastPoll = Date.now(); }
  };
  const tick = () => {
    if (finished) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    count.textContent = fmt(left);
    if (Date.now() - lastPoll > (left === 0 ? 1500 : 4000)) void poll();
  };
  const timer = window.setInterval(tick, 500);
  tick();
}
