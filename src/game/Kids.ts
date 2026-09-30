import Phaser from 'phaser';
import { theme as T, hex } from '../theme';
import { W, FONT } from '../core/const';

type Mood = 'idle' | 'happy' | 'sad';
interface Kid { c: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; body: number; baseY: number; timer?: Phaser.Time.TimerEvent }

export class Kids {
  private kids: Kid[] = [];
  private car: Phaser.GameObjects.Container;
  private carMoving = false;

  constructor(private scene: Phaser.Scene, carColor: number) {
    const xs = [110, 260, 460, 610];
    const cols = [T.coral, T.peach, T.sage, T.orange];
    xs.forEach((x, i) => {
      const c = scene.add.container(x, 150).setDepth(5);
      const g = scene.add.graphics();
      const t = scene.add.text(0, -54, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: hex(T.beige) }).setOrigin(0.5).setResolution(2);
      c.add([g, t]);
      const k: Kid = { c, g, t, body: cols[i], baseY: 150 };
      this.kids.push(k);
      this.draw(k, 'idle');
    });

    const cg = scene.add.graphics();
    cg.fillStyle(T.black, 0.3).fillRoundedRect(-62, -22, 130, 56, 12);
    cg.fillStyle(carColor, 1).fillRoundedRect(-65, -28, 130, 56, 12);
    cg.fillStyle(T.navy, 1).fillRoundedRect(-8, -22, 34, 44, 6).fillRoundedRect(-52, -20, 22, 40, 5);
    cg.fillStyle(T.ink, 1).fillRect(-50, -32, 22, 6).fillRect(-50, 26, 22, 6).fillRect(28, -32, 22, 6).fillRect(28, 26, 22, 6);
    cg.fillStyle(T.peach, 1).fillRect(58, -22, 6, 10).fillRect(58, 12, 6, 10);
    this.car = scene.add.container(-200, 225, [cg]).setDepth(4);

    scene.time.addEvent({ delay: 9000, loop: true, callback: () => this.driveCar() });
  }

  private draw(k: Kid, mood: Mood): void {
    const g = k.g; g.clear();
    g.fillStyle(k.body, 1).fillRoundedRect(-13, -6, 26, 32, 8);
    const hy = mood === 'sad' ? -4 : -14;
    g.lineStyle(4, k.body, 1);
    if (mood === 'happy') { g.lineBetween(-13, 0, -22, -16); g.lineBetween(13, 0, 22, -16); }
    else { g.lineBetween(-13, 2, -18, 16); g.lineBetween(13, 2, 18, 16); }
    g.fillStyle(T.peach, 1).fillCircle(0, hy, 12);
    g.fillStyle(T.ink, 1).fillCircle(-4, hy - 1, 1.8).fillCircle(4, hy - 1, 1.8);
    g.lineStyle(2, T.ink, 1).beginPath();
    if (mood === 'happy') g.arc(0, hy + 2, 5, 0.2, Math.PI - 0.2);
    else if (mood === 'sad') g.arc(0, hy + 9, 5, Math.PI + 0.3, 2 * Math.PI - 0.3);
    else g.arc(0, hy + 3, 4, 0.3, Math.PI - 0.3);
    g.strokePath();
  }

  private set(k: Kid, mood: Mood, label: string): void {
    this.draw(k, mood); k.t.setText(label);
    k.timer?.remove();
    if (mood !== 'idle') k.timer = this.scene.time.delayedCall(1000, () => { this.draw(k, 'idle'); k.t.setText(''); });
  }

  cheer(): void {
    this.kids.forEach((k, i) => {
      this.set(k, 'happy', '!');
      this.scene.tweens.add({ targets: k.c, y: k.baseY - 26, duration: 150, yoyo: true, repeat: 1, delay: i * 60, onComplete: () => k.c.setY(k.baseY) });
    });
  }

  sad(): void {
    this.kids.forEach((k, i) => {
      this.set(k, 'sad', '…');
      this.scene.tweens.add({ targets: k.c, y: k.baseY + 8, duration: 250, yoyo: true, delay: i * 40, onComplete: () => k.c.setY(k.baseY) });
    });
  }

  driveCar(): void {
    if (this.carMoving) return;
    this.carMoving = true;
    this.car.x = -200;
    this.scene.tweens.add({ targets: this.car, x: W + 200, duration: 2600, onComplete: () => { this.carMoving = false; } });
  }
}
