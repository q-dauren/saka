import Phaser from 'phaser';
import type { Difficulty, GameMode, LocationId } from '../types';
import { api } from '../services/api';
import { theme as T } from '../theme';
import { settings, refreshProfile, ensureTextures } from '../core/settings';
import { txt, button } from '../core/widgets';
import { LEVELS } from '../levels/levels';
import { LOCATIONS } from '../game/locations';
import { openLobby } from '../net/multiplayer';
import { openAuth, openProfile, openHistory, openShop, showLockOverlay } from '../ui';

const LOCS: LocationId[] = ['summer_yard', 'jailau', 'night_almaty', 'winter_yard'];
const LOC_LABEL: Record<LocationId, string> = { summer_yard: 'Летний\nдвор', jailau: 'Жайлау', night_almaty: 'Ночной\nАлматы', winter_yard: 'Зимний\nдвор' };

export class MenuScene extends Phaser.Scene {
  private view!: Phaser.GameObjects.Container;
  private best: Record<string, number> = {};
  private stars: Record<string, number> = {};
  private guest = true;
  private busy = false;

  constructor() { super('Menu'); }

  create(): void {
    this.busy = false;
    this.add.rectangle(360, 640, 720, 1280, T.ink);
    this.add.circle(-40, 1300, 420, T.crimson, 0.25);
    this.add.circle(760, -40, 320, T.navy, 0.6);
    this.view = this.add.container(0, 0);
    this.renderMain();
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const p = await refreshProfile();
      if (!this.sys.isActive()) return;
      ensureTextures(this);
      if (!p.tutorialDone && !settings.tutorialAsked) { settings.tutorialAsked = true; this.scene.start('Tutorial'); return; }
      const [best, hist, user] = await Promise.all([api.getBest(), api.getHistory(200), api.getUser()]);
      if (!this.sys.isActive()) return;
      this.best = best; this.guest = !user;
      this.stars = {};
      for (const r of hist) {
        const k = `${r.difficulty}:${r.levelIndex}`;
        if (r.mode === 'solo') this.stars[k] = Math.max(this.stars[k] ?? 0, r.stars);
      }
      this.renderMain();
    } catch (e) { console.error(e); }
  }

  private renderMain(): void {
    this.view.removeAll(true);
    const v = this.view;
    v.add(txt(this, 360, 150, 'Сақа', 130, T.beige, { bold: true, stroke: T.crimson }));
    v.add(txt(this, 360, 250, 'асық ату', 36, T.peach));
    v.add(txt(this, 360, 325, 'Локация', 26, T.stone));
    LOCS.forEach((id, i) => {
      v.add(button(this, 90 + i * 180, 395, 164, 84, LOC_LABEL[id], () => this.setLocation(id), {
        size: 22, fill: id === settings.location ? T.orange : T.navy, active: id === settings.location,
      }));
    });
    v.add(button(this, 360, 540, 540, 110, 'Играть', () => this.renderLevels('solo'), { size: 50 }));
    v.add(button(this, 360, 670, 540, 90, 'Вдвоём на одном устройстве', () => this.renderLevels('local2'), { size: 28, fill: T.teal }));
    v.add(button(this, 360, 780, 540, 90, 'Онлайн с другом', () => openLobby(), { size: 32, fill: T.teal }));
    v.add(button(this, 360, 890, 540, 80, 'Обучение', () => this.scene.start('Tutorial'), { size: 30, fill: T.navy }));
    v.add(button(this, 90, 1010, 164, 76, 'Профиль', () => openProfile(), { size: 24, fill: T.forest }));
    v.add(button(this, 270, 1010, 164, 76, 'История', () => openHistory(), { size: 24, fill: T.forest }));
    v.add(button(this, 450, 1010, 164, 76, 'Магазин', () => openShop(), { size: 24, fill: T.forest }));
    v.add(button(this, 630, 1010, 164, 76, this.guest ? 'Вход' : 'Аккаунт', () => openAuth(), { size: 24, fill: T.forest }));
    v.add(txt(this, 360, 1200, 'Выбей асыки за круг — и не дай Агаю помешать', 24, T.stone, { w: 640 }));
  }

  private renderLevels(mode: GameMode): void {
    this.view.removeAll(true);
    const v = this.view;
    v.add(txt(this, 360, 80, mode === 'solo' ? 'Выбери испытание' : 'Вдвоём: выбери расстановку', 44, T.beige, { bold: true, w: 680 }));
    const diffs: [Difficulty, string, string][] = [
      ['easy', 'Лёгкая', '8 бросков · полная подсказка'],
      ['medium', 'Средняя', '6 бросков · подсказка короче'],
      ['hard', 'Сложная', '5 бросков · Алкаш Агай'],
    ];
    diffs.forEach(([d, label, sub], row) => {
      const y0 = 170 + row * 330;
      v.add(txt(this, 360, y0, label, 38, T.peach, { bold: true }));
      v.add(txt(this, 360, y0 + 40, sub, 24, T.stone));
      for (let i = 0; i < 3; i++) {
        const k = `${d}:${i}`;
        const st = this.stars[k] ?? 0;
        const stars = '★'.repeat(st) + '☆'.repeat(3 - st);
        const b = this.best[k];
        const lbl = mode === 'solo' ? `${LEVELS[d][i].name}\n${stars}\n${b ? 'Рекорд ' + b : '—'}` : `${LEVELS[d][i].name}`;
        v.add(button(this, 125 + i * 235, y0 + 165, 215, 170, lbl, () => void this.start({ mode, difficulty: d, levelIndex: i }), {
          size: 24, fill: d === 'hard' ? T.crimson : d === 'medium' ? T.orange : T.forest,
        }));
      }
    });
    v.add(button(this, 360, 1200, 300, 76, 'Назад', () => this.renderMain(), { size: 30, fill: T.stone }));
  }

  private async setLocation(id: LocationId): Promise<void> {
    settings.location = id;
    this.renderMain();
    try { await api.updateProfile({ location: id }); } catch (e) { console.error(e); }
  }

  private async start(d: { mode: GameMode; difficulty: Difficulty; levelIndex: number }): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await refreshProfile();
      ensureTextures(this);
      const st = await api.getPlayStatus();
      if (st.locked) { showLockOverlay(st.secondsLeft, () => {}); this.busy = false; return; }
    } catch (e) { console.error(e); }
    settings.difficulty = d.difficulty;
    this.scene.start('Game', { ...d, location: settings.location });
  }
}
