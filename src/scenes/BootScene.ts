import Phaser from 'phaser';
import { loadSettings, ensureTextures } from '../core/settings';
import { txt } from '../core/widgets';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    txt(this, 360, 640, 'Загрузка…', 40);
    loadSettings()
      .catch(console.error)
      .finally(() => { ensureTextures(this); this.scene.start('Menu'); });
  }
}
