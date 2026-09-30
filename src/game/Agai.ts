import Phaser from 'phaser';
import { theme as T } from '../theme';
import { KON, mulberry32 } from '../core/const';
import { Body } from '../core/matter';
import { txt } from '../core/widgets';

type Threats = () => MatterJS.BodyType[];

const MAX_SPEED = 5;       // макс. скорость охраны (px/кадр)
const GUARD_R = 4;         // радиус охраны относительно границы кона

export class Agai {
  body: MatterJS.BodyType;
  container: Phaser.GameObjects.Container;
  stamina = 1;
  escaping = false;
  screaming = false;
  held = false;
  private rng: () => number;
  private escapeUntil = 0;
  private nextScream = 0; private screamUntil = 0;
  private inited = false;
  private face = 0;
  private ring: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Text;
  private threats: Threats | null = null;
  private orbitAngle = 0;
  private dir = 1;
  private nextDrunk = 0; private drunkUntil = 0;
  private drunkX = 360; private drunkY = 700;

  constructor(private scene: Phaser.Scene, seed: number) {
    this.rng = mulberry32(seed * 7919 + 13);
    this.dir = this.rng() < 0.5 ? 1 : -1;
    this.body = scene.matter.add.circle(120, 700, 28, {
  frictionAir: 0, friction: 0, restitution: 0.6, density: 0.2, inertia: Infinity, label: 'agai',
} as any) as MatterJS.BodyType;

    const g = scene.add.graphics();
    g.fillStyle(T.black, 0.3).fillEllipse(3, 6, 60, 36);
    g.fillStyle(T.crimson, 1).fillEllipse(0, 4, 54, 30);
    g.fillStyle(T.peach, 1).fillCircle(0, 0, 13);
    g.fillStyle(T.ink, 1).fillCircle(0, -3, 9);
    g.fillStyle(T.peach, 1).fillCircle(26, -6, 5);
    g.fillStyle(T.fern, 1).fillRoundedRect(22, -26, 9, 22, 3);
    g.fillStyle(T.lime, 1).fillRect(24, -32, 5, 8);
    this.ring = scene.add.graphics();
    this.ring.lineStyle(5, T.peach, 1).strokeCircle(0, 0, 40).setVisible(false);
    this.container = scene.add.container(120, 700, [this.ring, g]).setDepth(12);
    this.bubble = txt(scene, 0, 0, '!!', 44, T.orange, { bold: true, stroke: T.ink }).setDepth(30).setVisible(false);
  }

  /** Сцена передаёт функцию, возвращающую тела асыков (для охраны границы). */
  setThreats(fn: Threats): void { this.threats = fn; }

  nearKon(): boolean {
    return Math.hypot(this.body.position.x - KON.x, this.body.position.y - KON.y) < KON.r + 70;
  }

  update(time: number, delta: number, wantHold: boolean): void {
    const dt = delta / 1000;
    if (!this.inited) {
      this.inited = true;
      this.nextScream = time + 4000 + this.rng() * 3000;
      this.nextDrunk = time + 4000 + this.rng() * 3000;
    }

    // удержание и шкала силы
    this.held = false;
    if (this.escaping) {
      if (time >= this.escapeUntil) this.escaping = false;
    } else if (wantHold && this.stamina > 0.05) {
      this.held = true;
      this.stamina = Math.max(0, this.stamina - dt / 3.5);
      if (this.stamina <= 0) { this.escaping = true; this.escapeUntil = time + 2000; this.held = false; }
    }
    if (!this.held && !this.escaping) this.stamina = Math.min(1, this.stamina + dt / 6);

    // крик
    if (time >= this.nextScream) { this.screamUntil = time + 1000; this.nextScream = time + 5000 + this.rng() * 4000; }
    this.screaming = time < this.screamUntil;

    // «пьяный заход»: раз в несколько секунд Агай на секунду отвлекается — у игрока есть окно для броска
    if (time >= this.nextDrunk) {
      this.drunkUntil = time + 900 + this.rng() * 500;
      this.nextDrunk = this.drunkUntil + 5000 + this.rng() * 3500;
      this.drunkX = 60 + this.rng() * 600;
      this.drunkY = 320 + this.rng() * 640;
      this.dir = this.rng() < 0.5 ? 1 : -1;
    }

    const p = this.body.position;
    const cx = KON.x, cy = KON.y, R = KON.r;
    let tx: number, ty: number;

    if (time < this.drunkUntil) {
      tx = this.drunkX; ty = this.drunkY;
    } else {
      // самый опасный асык: ближе всего к выходу и катится наружу
      let best: MatterJS.BodyType | null = null;
      let bestScore = -Infinity;
      for (const b of this.threats?.() ?? []) {
        const rx = b.position.x - cx, ry = b.position.y - cy, d = Math.hypot(rx, ry) || 1;
        if (d > R + 8) continue; // уже вышел
        const out = (b.velocity.x * rx + b.velocity.y * ry) / d;
        const score = d + Math.max(0, out) * 25;
        if (score > bestScore) { bestScore = score; best = b; }
      }
      if (best && bestScore > R * 0.45) {
        const px = best.position.x + best.velocity.x * 10;
        const py = best.position.y + best.velocity.y * 10;
        const a = Math.atan2(py - cy, px - cx);
        this.orbitAngle = a;
        const rad = Math.min(R + GUARD_R, Math.hypot(px - cx, py - cy) + 38);
        tx = cx + Math.cos(a) * rad; ty = cy + Math.sin(a) * rad;
      } else {
        // угроз нет — бежим по кругу вдоль границы
        this.orbitAngle += this.dir * dt * 1.6;
        tx = cx + Math.cos(this.orbitAngle) * (R + GUARD_R);
        ty = cy + Math.sin(this.orbitAngle) * (R + GUARD_R);
      }
    }

    // движение: никогда не стоит на месте (тангенциальное «покачивание»)
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(MAX_SPEED, d * 0.3);
    let vx = (dx / d) * sp, vy = (dy / d) * sp;
    const rx = p.x - cx, ry = p.y - cy, rl = Math.hypot(rx, ry) || 1;
    const tw = Math.sin(time / 240) * 1.6 + this.dir * 0.8;
    vx += (-ry / rl) * tw; vy += (rx / rl) * tw;

    const factor = this.held ? 0.2 : this.escaping ? 1.4 : 1;
    Body.setVelocity(this.body, { x: vx * factor, y: vy * factor });

    this.face = Math.atan2(vy, vx) + Math.PI / 2;
    this.container.setPosition(p.x, p.y);
    this.container.rotation = this.face + Math.sin(time / 170) * 0.14;
    this.ring.setVisible(this.held);
    this.bubble.setVisible(this.screaming).setPosition(p.x, p.y - 62);
  }

  destroy(): void {
    this.container.destroy(); this.bubble.destroy();
    try { this.scene.matter.world.remove(this.body); } catch { /* сцена уже закрыта */ }
  }
}