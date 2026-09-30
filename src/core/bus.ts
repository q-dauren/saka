import Phaser from 'phaser';

// События: 'round:start' (mode, difficulty, levelIndex), 'throw:start' (angle, power),
// 'throw:settled' (BodyState[], scoreDelta, turnPassed), 'round:end' (RoundResult),
// 'asyk:out' (id), 'agai:hit'
export const bus = new Phaser.Events.EventEmitter();
