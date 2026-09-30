import Phaser from 'phaser';

// Прямой доступ к Matter.Body (setVelocity, setPosition, ...)
export const Body: any = (Phaser.Physics.Matter as any).Matter.Body;
