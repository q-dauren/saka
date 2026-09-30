/**
 * Процедурные текстуры «Сақа» (без внешних картинок). Вызывать ДО создания спрайтов.
 *
 * КЛЮЧИ ТЕКСТУР:
 *  'asyk'            — асык выбранного скина (48x32, смотрит вдоль оси X)
 *  'asyk_classic' | 'asyk_silver' | 'asyk_gold' | 'asyk_ornament' | 'asyk_glow' — все 5 скинов (для профиля/магазина)
 *  'asyk_glow_0'..'asyk_glow_3' — кадры свечения; анимация 'asyk_glow' (sprite.play('asyk_glow'))
 *  'saka'            — битка, тяжёлая (64x44)
 *  'kon'             — круг-кон с орнаментом қошқар мүйіз (560x560, диаметр = 560)
 *  'bg_summer_yard' | 'bg_jailau' | 'bg_night_almaty' | 'bg_winter_yard' — фоны 720x1280 (масштабировать cover)
 *  'takia_classic' | 'takia_festive' | 'takia_gold' | 'takia_modern' — иконки тақий (64x64)
 *  'player'          — игрок сверху с тақией выбранного вида (72x72)
 *  'kid_happy' | 'kid_sad' | 'kid_idle' — дети (48x64)
 *  'agai'            — Алкаш Агай с бутылкой (72x88)
 *  'car'             — машина сверху, нос вправо (120x64)
 * Палитра — строго из контракта.
 */
import type Phaser from 'phaser';
import type { AsykSkinId, LocationId, TakiaId } from '../types';

type G = Phaser.GameObjects.Graphics;

const P = {
  crimson: 0x85150f, orange: 0xcb6325, beige: 0xe0d5c1, stone: 0x8b8672, black: 0x000000,
  ink: 0x190406, navy: 0x21263a, teal: 0x274558, sage: 0x8f9a7e, peach: 0xedb57c, coral: 0xe5805b,
  forestDark: 0x1b2a19, forest: 0x2d5128, fern: 0x537b2f, moss: 0x8da750, lime: 0xe4edb0,
};
const PI = Math.PI;

function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false) as G;
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/* ───────── Асыки и сақа ───────── */

const SKINS: Record<AsykSkinId, { base: number; edge: number; hi: number }> = {
  classic: { base: P.beige, edge: P.stone, hi: P.lime },
  silver: { base: P.stone, edge: P.ink, hi: P.beige },
  gold: { base: P.peach, edge: P.orange, hi: P.lime },
  ornament: { base: P.beige, edge: P.crimson, hi: P.lime },
  glow: { base: P.teal, edge: P.navy, hi: P.lime },
};

function drawAsyk(g: G, skin: AsykSkinId, halo = 0): void {
  const s = SKINS[skin];
  const cx = 24, cy = 16;
  if (skin === 'glow') {
    g.fillStyle(P.lime, 0.16 + halo * 0.22); g.fillEllipse(cx, cy, 46, 30);
    g.fillStyle(P.moss, 0.24 + halo * 0.3); g.fillEllipse(cx, cy, 40, 25);
  }
  g.fillStyle(s.edge, 1);
  g.fillCircle(cx - 16, cy, 7.5); g.fillCircle(cx + 16, cy, 7.5);
  g.fillEllipse(cx, cy, 36, 22);
  g.fillStyle(s.base, 1);
  g.fillCircle(cx - 16, cy, 6); g.fillCircle(cx + 16, cy, 6);
  g.fillEllipse(cx, cy, 33, 19);
  g.lineStyle(2, s.edge, 0.9); g.lineBetween(cx - 12, cy, cx + 12, cy);
  g.fillStyle(s.edge, 0.9); g.fillCircle(cx - 6, cy - 4, 1.6); g.fillCircle(cx + 6, cy + 4, 1.6);
  g.fillStyle(s.hi, 0.45); g.fillEllipse(cx - 3, cy - 5, 16, 5);
  if (skin === 'ornament') {
    g.fillStyle(P.crimson, 1);
    for (let k = -2; k <= 2; k++) {
      const x = cx + k * 6.5;
      g.fillTriangle(x, cy - 5, x + 2.6, cy - 1.5, x - 2.6, cy - 1.5);
      g.fillTriangle(x, cy + 5, x + 2.6, cy + 1.5, x - 2.6, cy + 1.5);
    }
  }
}

function drawSaka(g: G): void {
  const cx = 32, cy = 22;
  g.fillStyle(P.ink, 1);
  g.fillCircle(10, cy, 10); g.fillCircle(54, cy, 10); g.fillEllipse(cx, cy, 56, 34);
  g.fillStyle(P.crimson, 1);
  g.fillCircle(10, cy, 8.3); g.fillCircle(54, cy, 8.3); g.fillEllipse(cx, cy, 52, 30);
  g.lineStyle(3, P.orange, 1); g.strokeEllipse(cx, cy, 40, 22);
  g.fillStyle(P.peach, 1); g.fillCircle(cx, cy, 7);
  g.fillStyle(P.black, 1); g.fillCircle(cx, cy, 2.5);
  g.fillStyle(P.coral, 0.5); g.fillEllipse(cx - 6, cy - 8, 22, 6);
}

/* ───────── Кон с орнаментом қошқар мүйіз ───────── */

function horn(g: G, cx: number, cy: number, ang: number, size: number, color: number): void {
  const cos = Math.cos(ang), sin = Math.sin(ang);
  g.lineStyle(2.4, color, 1);
  for (const dir of [-1, 1]) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * PI * 2.4;
      const r = size * (1 - (i / 24) * 0.8);
      const lx = dir * (size - r * Math.cos(th));
      const ly = -r * Math.sin(th);
      const x = cx + lx * cos - ly * sin;
      const y = cy + lx * sin + ly * cos;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }
}

function drawKon(g: G): void {
  const c = 280;
  g.fillStyle(P.stone, 1); g.fillCircle(c, c, 278);
  g.fillStyle(P.beige, 1); g.fillCircle(c, c, 270);
  g.lineStyle(3, P.crimson, 1); g.strokeCircle(c, c, 268); g.strokeCircle(c, c, 240);
  g.lineStyle(2, P.stone, 0.45); g.strokeCircle(c, c, 190); g.strokeCircle(c, c, 110);
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2;
    horn(g, c + Math.cos(a) * 254, c + Math.sin(a) * 254, a + PI / 2, 6, P.crimson);
    const m = a + PI / N;
    g.fillStyle(P.orange, 1); g.fillCircle(c + Math.cos(m) * 254, c + Math.sin(m) * 254, 2.2);
  }
  g.fillStyle(P.stone, 0.35); g.fillCircle(c, c, 5);
}

/* ───────── Фоны локаций 720x1280 ───────── */

const W = 720, H = 1280;

function house(g: G, x: number, y: number, w: number, wall: number, roof: number): void {
  g.fillStyle(wall, 1); g.fillRect(x, y, w, 110);
  g.fillStyle(roof, 1); g.fillTriangle(x - 8, y + 4, x + w + 8, y + 4, x + w / 2, y - 44);
  g.fillStyle(P.peach, 1); g.fillRect(x + 16, y + 34, 26, 26); g.fillRect(x + w - 42, y + 34, 26, 26);
  g.fillStyle(P.orange, 1); g.fillRect(x + w / 2 - 12, y + 50, 24, 60);
}

function tree(g: G, x: number, y: number, s = 1): void {
  g.fillStyle(P.ink, 1); g.fillRect(x - 6 * s, y, 12 * s, 40 * s);
  g.fillStyle(P.forestDark, 1); g.fillCircle(x + 4 * s, y - 6 * s, 62 * s);
  g.fillStyle(P.fern, 1); g.fillCircle(x, y - 10 * s, 56 * s);
  g.fillStyle(P.moss, 0.85); g.fillCircle(x - 14 * s, y - 24 * s, 32 * s);
}

function bgSummer(g: G): void {
  const r = rng(7);
  g.fillStyle(P.forest, 1); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    g.fillStyle(r() < 0.5 ? P.fern : P.forestDark, 0.35);
    g.fillEllipse(r() * W, r() * H, 60 + r() * 120, 30 + r() * 60);
  }
  g.fillStyle(P.moss, 0.5);
  for (let i = 0; i < 140; i++) g.fillRect(r() * W, r() * H, 2, 7);
  [10, 190, 390, 560].forEach((x, i) => house(g, x, 34, 140, P.beige, i % 2 ? P.crimson : P.orange));
  g.lineStyle(4, P.stone, 0.8); g.lineBetween(0, 168, W, 168);
  for (let x = 6; x < W; x += 36) g.lineBetween(x, 150, x, 176);
  [[40, 430, 1], [690, 520, 1.1], [56, 880, 1.1], [684, 930, 1], [24, 660, 0.9]].forEach(([x, y, s]) => tree(g, x, y, s));
  g.fillStyle(P.stone, 0.22); g.fillRect(0, 1040, W, 240);
}

function yurt(g: G, x: number, y: number, s: number): void {
  g.fillStyle(P.beige, 1); g.fillRect(x - 40 * s, y - 20 * s, 80 * s, 32 * s);
  g.beginPath(); g.slice(x, y - 20 * s, 42 * s, PI, PI * 2); g.fillPath();
  g.fillStyle(P.orange, 1); g.fillRect(x - 40 * s, y - 12 * s, 80 * s, 4 * s);
  g.fillStyle(P.crimson, 1); g.fillRect(x - 8 * s, y - 18 * s, 16 * s, 30 * s);
  g.fillStyle(P.teal, 1); g.fillCircle(x, y - 60 * s, 4 * s);
  g.lineStyle(2, P.stone, 0.6); g.lineBetween(x - 40 * s, y - 20 * s, x + 40 * s, y - 20 * s);
}

function bgJailau(g: G): void {
  const r = rng(11);
  g.fillStyle(P.lime, 1); g.fillRect(0, 0, W, 380);
  g.fillStyle(P.peach, 0.5); g.fillCircle(600, 110, 74);
  g.fillStyle(P.orange, 0.9); g.fillCircle(600, 110, 46);
  [[-60, 380, 190, 150, 440, 380], [300, 380, 540, 170, 800, 380], [140, 380, 330, 240, 520, 380]].forEach(([a, b, c, d, e, f], i) => {
    g.fillStyle(i === 2 ? P.stone : P.sage, 1); g.fillTriangle(a, b, c, d, e, f);
    g.fillStyle(P.beige, 1); g.fillTriangle(c - 34, d + 48, c, d, c + 34, d + 48);
  });
  g.fillStyle(P.moss, 1); g.fillRect(0, 360, W, H - 360);
  [[180, 470, 700, 200], [560, 640, 780, 240], [120, 880, 820, 260], [600, 1100, 900, 300]].forEach(([x, y, w, h]) => {
    g.fillStyle(P.fern, 0.45); g.fillEllipse(x, y, w, h);
  });
  for (let i = 0; i < 90; i++) {
    g.fillStyle([P.orange, P.coral, P.peach, P.beige][Math.floor(r() * 4)], 0.9);
    g.fillCircle(r() * W, 400 + r() * (H - 400), 2.4);
  }
  yurt(g, 110, 300, 1.1); yurt(g, 570, 290, 1); yurt(g, 350, 330, 0.8);
}

function bgNight(g: G): void {
  const r = rng(21);
  g.fillStyle(P.navy, 1); g.fillRect(0, 0, W, H);
  g.fillStyle(P.teal, 0.3); g.fillRect(0, 380, W, 500);
  g.fillStyle(P.beige, 0.9);
  for (let i = 0; i < 90; i++) g.fillCircle(r() * W, r() * 300, r() < 0.15 ? 2 : 1);
  g.fillStyle(P.peach, 1); g.fillCircle(590, 130, 38);
  g.fillStyle(P.navy, 1); g.fillCircle(608, 120, 34);
  [[-80, 400, 140, 170, 360, 400], [240, 400, 470, 130, 760, 400]].forEach(([a, b, c, d, e, f]) => {
    g.fillStyle(P.teal, 1); g.fillTriangle(a, b, c, d, e, f);
    g.fillStyle(P.beige, 0.8); g.fillTriangle(c - 30, d + 44, c, d, c + 30, d + 44);
  });
  g.fillStyle(P.ink, 1); g.fillTriangle(-40, 440, 200, 260, 520, 440); g.fillTriangle(380, 440, 600, 290, 820, 440);
  g.fillStyle(P.ink, 1); g.fillRect(0, 430, W, H - 430);
  for (let i = 0; i < 16; i++) {
    const x = i * 48, h = 60 + r() * 120;
    g.fillStyle(P.ink, 1); g.fillRect(x, 430 - h, 44, h + 10);
    g.fillStyle(P.peach, 0.9);
    for (let yy = 430 - h + 10; yy < 420; yy += 22) if (r() < 0.6) g.fillRect(x + 8, yy, 8, 10);
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle(P.peach, 0.35 + r() * 0.5);
    g.fillCircle(r() * W, 470 + r() * (H - 470), 1.6 + r() * 1.6);
  }
  [[60, 600], [660, 760], [80, 980], [650, 1120]].forEach(([x, y]) => {
    g.fillStyle(P.peach, 0.14); g.fillCircle(x, y, 70);
    g.fillStyle(P.peach, 0.3); g.fillCircle(x, y, 28);
    g.fillStyle(P.peach, 1); g.fillCircle(x, y, 7);
  });
}

function bgWinter(g: G): void {
  const r = rng(33);
  g.fillStyle(P.beige, 1); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) {
    g.fillStyle(r() < 0.5 ? P.sage : P.stone, 0.18);
    g.fillEllipse(r() * W, r() * H, 80 + r() * 160, 30 + r() * 70);
  }
  [[100, 1040], [560, 1120], [360, 240], [620, 700], [90, 560]].forEach(([x, y]) => {
    g.fillStyle(P.sage, 0.4); g.fillEllipse(x, y, 180, 60);
    g.lineStyle(2, P.lime, 0.6); g.lineBetween(x - 60, y - 6, x + 30, y - 12);
  });
  [16, 196, 396, 566].forEach((x) => {
    house(g, x, 34, 138, P.stone, P.sage);
    g.fillStyle(P.beige, 1); g.fillRect(x - 10, y0(), 158, 8);
  });
  g.lineStyle(4, P.ink, 1);
  [[60, 480], [670, 600], [50, 860], [680, 980]].forEach(([x, y]) => {
    g.lineBetween(x, y + 80, x, y - 40);
    g.lineBetween(x, y, x - 30, y - 34); g.lineBetween(x, y - 10, x + 34, y - 40); g.lineBetween(x, y + 30, x - 24, y + 6);
    g.fillStyle(P.beige, 1); g.fillCircle(x - 30, y - 36, 4); g.fillCircle(x + 34, y - 42, 4);
    g.fillStyle(P.stone, 0.3); g.fillEllipse(x, y + 82, 50, 12);
  });
  g.fillStyle(P.stone, 0.35);
  for (let i = 0; i < 30; i++) g.fillCircle(330 + r() * 60, 1040 + i * 7, 2);
}
const y0 = () => 136;

/* ───────── Тақия ───────── */

const TK: Record<TakiaId, { dome: number; band: number; acc: number; bead: number }> = {
  classic: { dome: P.navy, band: P.beige, acc: P.crimson, bead: P.beige },
  festive: { dome: P.crimson, band: P.peach, acc: P.orange, bead: P.lime },
  gold: { dome: P.peach, band: P.orange, acc: P.crimson, bead: P.beige },
  modern: { dome: P.teal, band: P.stone, acc: P.beige, bead: P.coral },
};

function drawTakiaSide(g: G, id: TakiaId): void {
  const t = TK[id];
  g.fillStyle(t.dome, 1); g.beginPath(); g.slice(32, 44, 26, PI, PI * 2); g.fillPath();
  g.fillStyle(t.band, 1); g.fillRoundedRect(6, 42, 52, 14, 4);
  g.lineStyle(2, t.acc, 1); g.beginPath(); g.moveTo(9, 49);
  for (let i = 1; i <= 12; i++) g.lineTo(9 + i * 3.9, i % 2 ? 45 : 53);
  g.strokePath();
  g.fillStyle(t.acc, 1);
  g.fillTriangle(32, 24, 37, 33, 27, 33); g.fillTriangle(17, 34, 21, 40, 13, 40); g.fillTriangle(47, 34, 51, 40, 43, 40);
  g.fillStyle(t.bead, 1); g.fillCircle(32, 16, 4);
  g.lineStyle(1.5, P.ink, 0.6); g.strokeCircle(32, 16, 4);
}

function drawPlayer(g: G, id: TakiaId): void {
  const t = TK[id];
  g.fillStyle(P.ink, 1); g.fillEllipse(36, 56, 62, 30);
  g.fillStyle(P.teal, 1); g.fillEllipse(36, 55, 58, 26);
  g.lineStyle(2, P.beige, 0.6); g.lineBetween(36, 44, 36, 68);
  g.fillStyle(P.peach, 1); g.fillCircle(8, 52, 5); g.fillCircle(64, 52, 5);
  g.fillStyle(P.peach, 1); g.fillCircle(36, 34, 15);
  g.fillStyle(t.dome, 1); g.fillCircle(36, 32, 14);
  g.lineStyle(4, t.band, 1); g.strokeCircle(36, 32, 10.5);
  g.fillStyle(t.acc, 1);
  for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; g.fillCircle(36 + Math.cos(a) * 5.5, 32 + Math.sin(a) * 5.5, 1.6); }
  g.fillStyle(t.bead, 1); g.fillCircle(36, 32, 3);
}

/* ───────── Дети, Агай, машина ───────── */

function drawKid(g: G, mood: 'happy' | 'sad' | 'idle'): void {
  g.lineStyle(5, P.coral, 1);
  if (mood === 'happy') { g.lineBetween(14, 36, 6, 18); g.lineBetween(34, 36, 42, 18); }
  else { g.lineBetween(14, 38, 8, 54); g.lineBetween(34, 38, 40, 54); }
  g.fillStyle(P.peach, 1);
  if (mood === 'happy') { g.fillCircle(6, 17, 3.2); g.fillCircle(42, 17, 3.2); }
  else { g.fillCircle(8, 55, 3.2); g.fillCircle(40, 55, 3.2); }
  g.fillStyle(P.navy, 1); g.fillRect(16, 54, 7, 10); g.fillRect(25, 54, 7, 10);
  g.fillStyle(P.coral, 1); g.fillRoundedRect(12, 32, 24, 26, 7);
  g.fillStyle(P.peach, 1); g.fillCircle(24, 22, 13);
  g.fillStyle(P.ink, 1); g.beginPath(); g.slice(24, 21, 13.5, PI, PI * 2); g.fillPath();
  g.fillStyle(P.black, 1); g.fillCircle(19, 23, 1.8); g.fillCircle(29, 23, 1.8);
  g.lineStyle(2, P.crimson, 1); g.beginPath();
  if (mood === 'happy') g.arc(24, 26, 5, 0.15 * PI, 0.85 * PI);
  else if (mood === 'sad') g.arc(24, 33, 5, 1.15 * PI, 1.85 * PI);
  else { g.moveTo(20, 29); g.lineTo(28, 29); }
  g.strokePath();
  if (mood === 'sad') { g.fillStyle(P.teal, 1); g.fillCircle(18, 29, 1.6); g.fillCircle(30, 29, 1.6); }
}

function drawAgai(g: G): void {
  g.fillStyle(P.ink, 1); g.fillRect(18, 72, 12, 14); g.fillRect(36, 72, 12, 14);
  g.fillStyle(P.crimson, 1); g.fillRoundedRect(14, 40, 38, 36, 10);
  g.fillStyle(P.orange, 1); g.fillRect(14, 58, 38, 4);
  g.lineStyle(6, P.crimson, 1); g.lineBetween(50, 50, 62, 38);
  g.fillStyle(P.peach, 1); g.fillCircle(63, 37, 4);
  g.fillStyle(P.teal, 1); g.fillRect(58, 14, 10, 22); g.fillRect(61, 6, 4, 10);
  g.fillStyle(P.beige, 1); g.fillRect(58, 22, 10, 8);
  g.fillStyle(P.peach, 1); g.fillCircle(33, 28, 15);
  g.fillStyle(P.sage, 1); g.beginPath(); g.slice(33, 24, 16, PI, PI * 2); g.fillPath(); g.fillRect(33, 21, 20, 4);
  g.fillStyle(P.coral, 1); g.fillCircle(41, 31, 4.2);
  g.lineStyle(2, P.ink, 1);
  g.lineBetween(23, 25, 29, 31); g.lineBetween(29, 25, 23, 31);
  g.lineBetween(36, 25, 41, 29);
  g.fillStyle(P.ink, 1); g.fillEllipse(32, 39, 9, 5);
  g.fillStyle(P.stone, 0.7);
  for (let i = 0; i < 7; i++) g.fillCircle(22 + i * 3, 37 + (i % 2) * 3, 0.9);
}

function drawCar(g: G): void {
  g.fillStyle(P.black, 1);
  g.fillRect(16, 2, 24, 9); g.fillRect(80, 2, 24, 9); g.fillRect(16, 53, 24, 9); g.fillRect(80, 53, 24, 9);
  g.fillStyle(P.orange, 1); g.fillRoundedRect(4, 10, 112, 44, 10);
  g.fillStyle(P.crimson, 1); g.fillRoundedRect(34, 14, 44, 36, 6);
  g.fillStyle(P.teal, 1); g.fillRect(74, 16, 8, 32); g.fillRect(30, 16, 6, 32);
  g.fillStyle(P.navy, 1); g.fillRoundedRect(40, 18, 30, 28, 4);
  g.fillStyle(P.peach, 1); g.fillRect(108, 14, 6, 9); g.fillRect(108, 41, 6, 9);
  g.fillStyle(P.coral, 1); g.fillRect(4, 14, 4, 9); g.fillRect(4, 41, 4, 9);
  g.fillStyle(P.beige, 0.35); g.fillEllipse(58, 24, 36, 6);
}

/* ───────── Точка входа ───────── */

export function createTextures(
  scene: Phaser.Scene,
  opts: { asykSkin: AsykSkinId; takia: TakiaId; location: LocationId },
): void {
  const sig = JSON.stringify([opts.asykSkin, opts.takia]);
  const reg = scene.game.registry;
  if (reg.get('sakaTexSig') === sig && scene.textures.exists('kon')) return; // уже нарисовано

  (Object.keys(SKINS) as AsykSkinId[]).forEach((id) => tex(scene, `asyk_${id}`, 48, 32, (g) => drawAsyk(g, id)));
  tex(scene, 'asyk', 48, 32, (g) => drawAsyk(g, opts.asykSkin));
  [0, 0.5, 1, 0.5].forEach((h, i) => tex(scene, `asyk_glow_${i}`, 48, 32, (g) => drawAsyk(g, 'glow', h)));
  if (scene.anims.exists('asyk_glow')) scene.anims.remove('asyk_glow');
  scene.anims.create({
    key: 'asyk_glow',
    frames: [0, 1, 2, 3, 2, 1].map((i) => ({ key: `asyk_glow_${i}` })),
    frameRate: 8,
    repeat: -1,
  });

  tex(scene, 'saka', 64, 44, drawSaka);
  tex(scene, 'kon', 560, 560, drawKon);
  tex(scene, 'bg_summer_yard', W, H, bgSummer);
  tex(scene, 'bg_jailau', W, H, bgJailau);
  tex(scene, 'bg_night_almaty', W, H, bgNight);
  tex(scene, 'bg_winter_yard', W, H, bgWinter);
  (Object.keys(TK) as TakiaId[]).forEach((id) => tex(scene, `takia_${id}`, 64, 64, (g) => drawTakiaSide(g, id)));
  tex(scene, 'player', 72, 72, (g) => drawPlayer(g, opts.takia));
  tex(scene, 'kid_happy', 48, 64, (g) => drawKid(g, 'happy'));
  tex(scene, 'kid_sad', 48, 64, (g) => drawKid(g, 'sad'));
  tex(scene, 'kid_idle', 48, 64, (g) => drawKid(g, 'idle'));
  tex(scene, 'agai', 72, 88, drawAgai);
  tex(scene, 'car', 120, 64, drawCar);
  reg.set('sakaTexSig', sig);
}