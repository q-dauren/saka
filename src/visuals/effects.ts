import type Phaser from 'phaser';

const FONT = 'system-ui, Arial, sans-serif';

/** Облачко пыли в точке удара. */
export function dustBurst(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 30;
    const p = scene.add.circle(x, y, 2 + Math.random() * 3, i % 3 ? 0xe0d5c1 : 0x8b8672, 0.85).setDepth(50);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      scale: 0.3,
      duration: 380 + Math.random() * 220,
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    });
  }
}

/** Короткая тряска камеры. */
export function screenShake(scene: Phaser.Scene): void {
  scene.cameras.main.shake(180, 0.006);
}

/** Всплывающий текст комбо («×1.5», «×2»). */
export function comboText(scene: Phaser.Scene, x: number, y: number, multiplier: number): void {
  const t = scene.add
    .text(x, y, `×${multiplier}`, {
      fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#EDB57C', stroke: '#85150F', strokeThickness: 6,
    })
    .setOrigin(0.5)
    .setDepth(60)
    .setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1.25, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: t, y: y - 70, alpha: 0, delay: 350, duration: 650, ease: 'Sine.easeIn',
    onComplete: () => t.destroy(),
  });
}

/** Быстрая вспышка объекта (попадание). */
export function hitFlash(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): void {
  const t = target as any;
  t.setTintFill?.(0xe4edb0);
  scene.tweens.add({
    targets: target, alpha: 0.35, yoyo: true, repeat: 2, duration: 70,
    onComplete: () => { t.alpha = 1; t.clearTint?.(); },
  });
}