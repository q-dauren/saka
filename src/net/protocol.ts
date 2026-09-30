import type { AsykSkinId, BodyState, Difficulty, LocationId, TakiaId } from '../types';

export type Role = 'host' | 'guest';

/** Профиль игрока: обмен по presence и broadcast при подключении. */
export interface HelloMsg {
  playerId: string;
  nickname: string;
  takia: TakiaId;
  asykSkin: AsykSkinId;
}

/** Отправляет хост. Обе стороны стартуют GameScene с одним seed. */
export interface StartMsg {
  difficulty: Difficulty;
  levelIndex: number;
  location: LocationId;
  seed: number;
  firstTurn: Role;
}

/** Бросающий шлёт сразу при броске. */
export interface ThrowMsg {
  angle: number;
  power: number;
  turnNo: number;
}

/** Итог броска. Авторитет — бросающий клиент. scores — с точки зрения ОТПРАВИТЕЛЯ. */
export interface SettledMsg {
  snapshot: BodyState[];
  scoreDelta: number;
  turnPassed: boolean;
  turnNo: number;
  scores: { me: number; opponent: number };
}

export interface TurnRef {
  turnNo: number;
}

export type Empty = Record<string, never>;

export interface ProtocolMap {
  hello: HelloMsg;
  start: StartMsg;
  throw: ThrowMsg;
  settled: SettledMsg;
  resend: TurnRef; // запрос повтора 'settled' для turnNo
  rematch: Empty;
  leave: Empty;
}

export type MsgName = keyof ProtocolMap;

export const SETTLED_TIMEOUT_MS = 8000;
export const MAX_RESEND = 3;
