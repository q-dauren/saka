import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { TutorialScene } from './scenes/TutorialScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { api } from './services/api';

window.addEventListener('contextmenu', (e) => e.preventDefault());

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 1280,
  backgroundColor: '#190406',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3, touch: { capture: true } },
  physics: {
    default: 'matter',
    matter: { gravity: { x: 0, y: 0 }, debug: false, runner: { isFixed: true, fps: 60 } } as any,
  },
  render: { antialias: true },
  scene: [BootScene, MenuScene, TutorialScene, GameScene, ResultScene],
};

api.init().catch(console.error).finally(() => { new Phaser.Game(config); });
