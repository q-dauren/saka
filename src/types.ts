export type Difficulty = 'easy'|'medium'|'hard';
export type LocationId = 'summer_yard'|'jailau'|'night_almaty'|'winter_yard';
export type AsykSkinId = 'classic'|'silver'|'gold'|'ornament'|'glow';
export type TakiaId = 'classic'|'festive'|'gold'|'modern';
export type GameMode = 'solo'|'local2'|'online';
export interface BodyState { id: string; x: number; y: number; angle: number; isOut: boolean }
export interface RoundResult {
  mode: GameMode; difficulty: Difficulty; levelIndex: number; // 0..2 внутри сложности
  location: LocationId; score: number; stars: 0|1|2|3; throwsUsed: number;
  asykOut: number; asykTotal: number; won: boolean; durationSec: number; finishedAt: string; // ISO
}
export interface Profile { id: string; nickname: string; takia: TakiaId; asykSkin: AsykSkinId; location: LocationId; isPro: boolean; tutorialDone: boolean }
export interface PlayStatus { locked: boolean; secondsLeft: number; lockedUntil: string|null; isPro: boolean }
