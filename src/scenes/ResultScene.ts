import Phaser from 'phaser';
import type { RoundResult } from '../types';
import { api } from '../services/api';
import { theme as T } from '../theme';
import { txt, button } from '../core/widgets';
import type { GameInit } from './GameScene';

interface ResultData { result: RoundResult; opp: number; retry: GameInit | null; next: GameInit | null }

export class ResultScene extends Phaser.Scene {
  private d!: ResultData;
  constructor() { super('Result'); }
  init(data: ResultData): void { this.d = data; }

  create(): void {
    const { result: r, opp, retry, next } = this.d;
    this.add.rectangle(360, 640, 720, 1280, T.ink);
    this.add.circle(360, 300, 340, T.crimson, 0.25);

    let title: string;
    if (r.mode === 'solo') title = r.won ? 'Победа!' : 'Бросков не осталось';
    else if (r.score === opp) title = 'Ничья';
    else if (r.mode === 'local2') title = r.score > opp ? 'Победил игрок 1' : 'Победил игрок 2';
    else title = r.won ? 'Ты победил!' : 'Победил соперник';
    txt(this, 360, 170, title, 60, T.beige, { bold: true, stroke: T.crimson, w: 660 });

    if (r.mode === 'solo') {
      txt(this, 360, 330, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), 120, r.stars ? T.orange : T.stone);
    }
    txt(this, 360, 490, r.mode === 'local2' ? `Игрок 1: ${r.score}   Игрок 2: ${opp}` : r.mode === 'online' ? `Ты: ${r.score}   Соперник: ${opp}` : `Очки: ${r.score}`, 56, T.peach, { bold: true, w: 680 });
    txt(this, 360, 570, `Выбито ${r.asykOut} из ${r.asykTotal}`, 36, T.beige);
    const rec = txt(this, 360, 640, '', 40, T.lime, { bold: true });

    void (async () => {
      let isRecord = false;
      try {
        if (r.mode === 'solo' && r.won) {
          const best = await api.getBest();
          isRecord = r.score > (best[`${r.difficulty}:${r.levelIndex}`] ?? 0);
        }
        await api.saveResult(r);
      } catch (e) { console.error(e); }
      if (isRecord && this.sys.isActive()) rec.setText('Новый рекорд!');
    })();

    let y = 790;
    if (retry) { button(this, 360, y, 460, 96, 'Ещё раз', () => this.scene.start('Game', retry), { size: 40 }); y += 120; }
    if (next) { button(this, 360, y, 460, 96, 'Дальше', () => this.scene.start('Game', next), { size: 40, fill: T.forest }); y += 120; }
    button(this, 360, y, 460, 96, 'В меню', () => this.scene.start('Menu'), { size: 40, fill: T.stone });
  }
}
