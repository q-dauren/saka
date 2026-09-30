import Phaser from 'phaser';
import { theme as T, hex } from '../theme';
import { FONT } from './const';

export function txt(
  scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: number = T.beige,
  o: { bold?: boolean; w?: number; stroke?: number; align?: string } = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, s, {
    fontFamily: FONT, fontSize: size + 'px', color: hex(color),
    fontStyle: o.bold ? 'bold' : 'normal', align: (o.align ?? 'center') as any,
    wordWrap: o.w ? { width: o.w } : undefined,
    stroke: o.stroke !== undefined ? hex(o.stroke) : undefined,
    strokeThickness: o.stroke !== undefined ? Math.max(2, Math.round(size / 10)) : 0,
  }).setOrigin(0.5).setResolution(2);
}

export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  o: { fill?: number; color?: number; size?: number; stroke?: number; active?: boolean } = {},
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(T.black, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 16);
  g.fillStyle(o.fill ?? T.crimson, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
  g.lineStyle(o.active ? 6 : 3, o.active ? T.peach : (o.stroke ?? T.orange), 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
  const t = txt(scene, 0, 0, label, o.size ?? 30, o.color ?? T.beige, { bold: true, w: w - 16 });
  const hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
  c.add([g, t, hit]);
  hit.on('pointerdown', () => c.setScale(0.96));
  hit.on('pointerout', () => c.setScale(1));
  hit.on('pointerup', () => { c.setScale(1); onClick(); });
  return c;
}
