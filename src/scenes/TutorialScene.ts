import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { TUTORIAL_LEVEL } from '../levels/levels';
import { settings } from '../core/settings';
import { api } from '../services/api';
import { theme as T } from '../theme';
import { SAKA_START } from '../core/const';
import { txt, button } from '../core/widgets';

const STEPS = ['Зажми и потяни назад', 'Отпусти — бросок', 'Выбей асык за круг'];

export class TutorialScene extends GameScene {
  private step = 0;
  private title!: Phaser.GameObjects.Text;
  private bodyT!: Phaser.GameObjects.Text;
  private hl!: Phaser.GameObjects.Graphics;
  private doneBtn?: Phaser.GameObjects.Container;

  constructor() { super('Tutorial'); }

  init(): void {
    super.init({ mode: 'solo', difficulty: 'easy', levelIndex: 0, location: settings.location, seed: 7, customLevel: TUTORIAL_LEVEL, tutorial: true });
  }

  create(): void {
    this.step = 0; this.doneBtn = undefined;
    super.create();
    const panel = this.add.container(360, 150).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(T.ink, 0.92).fillRoundedRect(-320, -80, 640, 160, 20);
    g.lineStyle(4, T.orange, 1).strokeRoundedRect(-320, -80, 640, 160, 20);
    this.title = txt(this, 0, -38, '', 26, T.peach, { bold: true });
    this.bodyT = txt(this, 0, 18, '', 40, T.beige, { bold: true, w: 600 });
    panel.add([g, this.title, this.bodyT]);
    this.hl = this.add.graphics().setDepth(19);
    this.tweens.add({ targets: this.hl, alpha: { from: 1, to: 0.25 }, duration: 600, yoyo: true, repeat: -1 });
    button(this, 110, 1235, 190, 56, 'Пропустить', () => this.finish(), { size: 24, fill: T.stone }).setDepth(50);
    this.show();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    if (this.step === 2) this.drawHl();
  }

  private go(s: number): void {
    if (s <= this.step && s !== 0) return;
    this.step = s; this.show();
  }

  private show(): void {
    if (this.step < 3) {
      this.title.setText(`Шаг ${this.step + 1} из 3`);
      this.bodyT.setText(STEPS[this.step]);
      this.drawHl();
    } else {
      this.title.setText('Готово!');
      this.bodyT.setText('Ты готов к игре');
      this.hl.clear();
      if (!this.doneBtn) this.doneBtn = button(this, 360, 1000, 360, 90, 'Играть', () => this.finish(), { size: 38 }).setDepth(50);
    }
  }

  private drawHl(): void {
    const g = this.hl; g.clear();
    if (this.step <= 1) {
      g.lineStyle(6, T.peach, 1).strokeCircle(SAKA_START.x, SAKA_START.y, 52);
      if (this.step === 0) g.fillStyle(T.peach, 1).fillTriangle(SAKA_START.x - 22, SAKA_START.y + 70, SAKA_START.x + 22, SAKA_START.y + 70, SAKA_START.x, SAKA_START.y + 104);
    } else if (this.step === 2) {
      g.lineStyle(5, T.peach, 1);
      this.asyks.filter((a) => !a.isOut).forEach((a) => g.strokeCircle(a.body.position.x, a.body.position.y, 34));
    }
  }

  private finish(): void {
    settings.tutorialAsked = true;
    api.updateProfile({ tutorialDone: true }).catch(console.error);
    this.scene.start('Menu');
  }

  protected onPull(p: number): void { if (this.step === 0 && p >= 0.3) this.go(1); }
  protected onLaunched(): void { if (this.step <= 1) this.go(2); }
  protected onAimCancel(): void { if (this.step === 1) this.go(0); }
  protected onAsykOut(): void { if (this.step === 2) this.go(3); }
}
