import Phaser from 'phaser';
import type { LocationId } from '../types';
import { theme as T } from '../theme';
import { W, H, KON, SAKA_START, mulberry32 } from '../core/const';

export interface LocationDef {
  id: LocationId; name: string; bg: number; top: number; ground: number; border: number; orn: number;
  road: number; roadLine: number; frictionAir: number; carColor: number;
  decor: (g: Phaser.GameObjects.Graphics) => void;
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  summer_yard: {
    id: 'summer_yard', name: 'Летний двор', bg: T.forest, top: T.forestDark, ground: T.beige, border: T.crimson, orn: T.crimson,
    road: T.stone, roadLine: T.beige, frictionAir: 0.045, carColor: T.orange,
    decor: (g) => {
      for (let y = 280; y < H; y += 80) { g.fillStyle(T.fern, 0.35).fillRect(0, y, W, 40); }
      for (let x = 40; x < W; x += 120) { g.fillStyle(T.fern, 1).fillCircle(x, 60, 38); g.fillStyle(T.moss, 0.6).fillCircle(x - 10, 50, 16); }
    },
  },
  jailau: {
    id: 'jailau', name: 'Жайлау', bg: T.moss, top: T.lime, ground: T.lime, border: T.orange, orn: T.orange,
    road: T.stone, roadLine: T.lime, frictionAir: 0.04, carColor: T.crimson,
    decor: (g) => {
      for (let x = 0; x <= W; x += 240) { g.fillStyle(T.moss, 0.9).fillEllipse(x + 60, 190, 300, 150); }
      const r = mulberry32(5);
      for (let i = 0; i < 70; i++) { g.fillStyle(i % 2 ? T.orange : T.beige, 0.85).fillCircle(r() * W, 290 + r() * (H - 300), 4); }
    },
  },
  night_almaty: {
    id: 'night_almaty', name: 'Ночной Алматы', bg: T.navy, top: T.teal, ground: T.teal, border: T.peach, orn: T.peach,
    road: T.ink, roadLine: T.peach, frictionAir: 0.045, carColor: T.coral,
    decor: (g) => {
      for (let i = 0; i < 6; i++) { g.fillStyle(T.navy, 0.9).fillTriangle(i * 150 - 40, 190, i * 150 + 75, 60, i * 150 + 190, 190); }
      const r = mulberry32(9);
      for (let i = 0; i < 16; i++) { g.fillStyle(T.peach, 0.9).fillRect(20 + r() * 680, 120 + r() * 60, 6, 8); }
      g.fillStyle(T.peach, 0.10).fillCircle(60, 320, 200).fillCircle(660, 1150, 220);
    },
  },
  winter_yard: {
    id: 'winter_yard', name: 'Зимний двор', bg: T.sage, top: T.stone, ground: T.beige, border: T.stone, orn: T.stone,
    road: T.beige, roadLine: T.stone, frictionAir: 0.012, carColor: T.teal,
    decor: (g) => {
      const r = mulberry32(3);
      for (let i = 0; i < 90; i++) { g.fillStyle(T.beige, 0.55).fillCircle(r() * W, r() * H, 2 + r() * 3); }
      for (let x = 30; x < W; x += 130) { g.fillStyle(T.beige, 1).fillTriangle(x, 150, x + 45, 40, x + 90, 150); }
    },
  },
};

export function drawLocation(scene: Phaser.Scene, loc: LocationDef): void {
  const g = scene.add.graphics().setDepth(-10);
  g.fillStyle(loc.bg, 1).fillRect(0, 0, W, H);
  g.fillStyle(loc.top, 1).fillRect(0, 0, W, 190);
  loc.decor(g);
  g.fillStyle(loc.road, 1).fillRect(0, 195, W, 60);
  g.fillStyle(loc.roadLine, 1);
  for (let x = 10; x < W; x += 70) g.fillRect(x, 223, 36, 5);

  g.fillStyle(T.black, 0.25).fillCircle(KON.x + 6, KON.y + 8, KON.r + 6);
  g.fillStyle(loc.ground, 1).fillCircle(KON.x, KON.y, KON.r);
  g.lineStyle(10, loc.border, 1).strokeCircle(KON.x, KON.y, KON.r);
  g.lineStyle(2, loc.border, 0.5).strokeCircle(KON.x, KON.y, KON.r - 16);

  // орнамент «қошқар мүйіз» по краю кона
  g.lineStyle(3, loc.orn, 1);
  const n = 32;
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const px = KON.x + Math.cos(a) * (KON.r + 24);
    const py = KON.y + Math.sin(a) * (KON.r + 24);
    g.beginPath(); g.arc(px, py, 9, a + Math.PI * 0.6, a + Math.PI * 1.95); g.strokePath();
    g.beginPath(); g.arc(px, py, 4, a + Math.PI * 0.6, a + Math.PI * 1.7); g.strokePath();
  }

  // линия броска
  g.lineStyle(4, loc.border, 0.9);
  for (let x = 40; x < W - 40; x += 34) g.lineBetween(x, SAKA_START.y, x + 18, SAKA_START.y);
}
